import fs from "fs";

/**
 * Google Ads export loader — adaptive & locale-friendly
 *
 * Supports:
 * - CSV with , or ; separators (auto-detect per line)
 * - Quoted values
 * - FR/EN headers (fuzzy match) + currency suffixes
 * - Date formats: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY
 *
 * Output:
 * {
 *   ok: true,
 *   files: [{ path, detected:{...}, totals30d, prev30d, rowsUsed }],
 *   totals30d, prev30d,
 *   detectedAny: { date:boolean, cost:boolean, conversions:boolean, value:boolean }
 * }
 *
 * If no parsable metrics found, returns { ok:false, reason }.
 */

function stripAccents(s){
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normHeader(s){
  return stripAccents(s)
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")          // remove parenthesis content like (EUR)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeNumberCell(s){
  const t = String(s || "").trim();
  return /[0-9]/.test(t);
}

function toNumber(v){
  if (v == null) return 0;
  let s = String(v).trim();
  // remove currency and spaces
  s = s.replace(/\s/g, "");
  // allow 1 234,56 or 1,234.56
  // heuristic: if there is exactly one comma and no dot => comma decimal
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  // remove thousands separators like 1,234.56 (after decimal normalization)
  s = s.replace(/,(?=\d{3}(\D|$))/g, "");
  s = s.replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseDateCell(v){
  const s = String(v || "").trim();
  if (!s) return null;

  // ISO
  const iso = s.match(/^(\d{4})[-\/](\d{2})[-\/](\d{2})$/);
  if (iso){
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : d;
  }

  // DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (dmy){
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const y = Number(dmy[3]);

    // Heuristic:
    // - if first > 12 => it's DD/MM
    // - else if second > 12 => it's MM/DD
    // - else default DD/MM (common in FR exports)
    let day = a, month = b;
    if (a <= 12 && b > 12){
      month = a; day = b;
    } else if (a <= 12 && b <= 12){
      day = a; month = b;
    }
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const d = new Date(`${y}-${mm}-${dd}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback: native Date parse
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function detectDelimiter(line){
  // simple heuristic: choose delimiter that yields more columns
  const comma = (line.match(/,/g) || []).length;
  const semi  = (line.match(/;/g) || []).length;
  const tab   = (line.match(/\t/g) || []).length;
  if (tab > comma && tab > semi) return "\t";
  if (semi > comma) return ";";
  return ",";
}

function parseDelimited(text){
  const lines = text.split(/\n/);
  const rows = [];
  for (let rawLine of lines){
    rawLine = rawLine.replace(/\r/g, "");
    if (!rawLine.trim()) continue;

    const delim = detectDelimiter(rawLine);

    let row = [];
    let cur = "";
    let inQuotes = false;

    for (let i=0;i<rawLine.length;i++){
      const ch = rawLine[i];
      if (ch === '"'){
        if (inQuotes && rawLine[i+1] === '"'){ cur += '"'; i++; }
        else inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && ch === delim){
        row.push(cur); cur=""; continue;
      }
      // tab delimiter can be multi char in JS string, but we only use \t here; ch is actual tab
      if (!inQuotes && delim === "\t" && ch === "\t"){
        row.push(cur); cur=""; continue;
      }
      cur += ch;
    }
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function findIdx(headersNorm, tokens){
  // exact token
  for (let i=0;i<headersNorm.length;i++){
    const h = headersNorm[i];
    for (const t of tokens){
      if (h === t) return i;
    }
  }
  // contains token
  for (let i=0;i<headersNorm.length;i++){
    const h = headersNorm[i];
    for (const t of tokens){
      if (h.includes(t)) return i;
    }
  }
  return -1;
}

function buildHeaderMap(headers){
  const hn = headers.map(normHeader);

  // tokens list are normalized already
  const idxDate = findIdx(hn, ["day", "date", "jour", "date du jour"]);
  const idxCost = findIdx(hn, ["cost", "cout", "coût", "depenses", "depense", "spend", "amount spent", "cost eur", "cout eur"]);
  const idxConv = findIdx(hn, ["conversions", "conversion", "conv", "all conv", "toutes les conversions", "conversions (par conv)", "conversions par conv"]);
  const idxValue= findIdx(hn, ["conv value", "conversion value", "valeur de conv", "valeur de conversion", "valeur conv", "value"]);
  const idxClicks= findIdx(hn, ["clicks", "clics", "clic"]);
  const idxImpr  = findIdx(hn, ["impressions", "impr", "imp"]);

  // Sometimes value column named "Conversion value" but could be absent (leadgen)
  return { idxDate, idxCost, idxConv, idxValue, idxClicks, idxImpr, headersNorm: hn };
}

function sumRow(r, map){
  const cost = map.idxCost >= 0 ? toNumber(r[map.idxCost]) : 0;
  const conv = map.idxConv >= 0 ? toNumber(r[map.idxConv]) : 0;
  const value = map.idxValue >= 0 ? toNumber(r[map.idxValue]) : 0;
  const clicks = map.idxClicks >= 0 ? toNumber(r[map.idxClicks]) : 0;
  const impr = map.idxImpr >= 0 ? toNumber(r[map.idxImpr]) : 0;
  return { cost, conv, value, clicks, impr };
}

function addAgg(agg, x){
  agg.cost += x.cost;
  agg.conversions += x.conv;
  agg.value += x.value;
  agg.clicks += x.clicks;
  agg.impressions += x.impr;
  return agg;
}

function newAgg(){
  return { cost:0, conversions:0, value:0, clicks:0, impressions:0, rowsUsed:0 };
}

function dayKey(d){
  // d is Date in UTC (00:00Z)
  return d.toISOString().slice(0,10);
}
function newDailyAgg(){ return { cost:0, conversions:0, value:0, clicks:0, impressions:0, rowsUsed:0 }; }
function addDaily(map, d, metrics){
  const k = dayKey(d);
  const cur = map.get(k) || newDailyAgg();
  cur.cost += metrics.cost;
  cur.conversions += metrics.conv;
  cur.value += metrics.value;
  cur.clicks += metrics.clicks;
  cur.impressions += metrics.impr;
  cur.rowsUsed += 1;
  map.set(k, cur);
}
function mapToSeries(map){
  const keys = Array.from(map.keys()).sort();
  return keys.map(k => ({ date:k, ...map.get(k) }));
}

export async function loadGoogleAdsExports(filePaths){
  const paths = Array.isArray(filePaths) ? filePaths.filter(Boolean) : [];
  if (!paths.length) return { ok:false, skipped:true, reason:"no files" };

  const files = [];
  const totals30d = newAgg();
  const prev30d = newAgg();
  const daily30dMap = new Map();
  const dailyPrev30dMap = new Map();
  const detectedAny = { date:false, cost:false, conversions:false, value:false };

  for (const p of paths){
    let txt;
    try{
      txt = await fs.promises.readFile(p, "utf8");
    }catch(e){
      files.push({ path:p, ok:false, reason:`read failed: ${e.message}` });
      continue;
    }

    const rows = parseDelimited(txt);
    if (!rows.length){
      files.push({ path:p, ok:false, reason:"empty" });
      continue;
    }

    // find first non-empty header row
    let headerRow = rows[0];
    for (let i=0;i<Math.min(10, rows.length); i++){
      const candidate = rows[i];
      if (candidate && candidate.some(c => String(c||"").trim().length)){
        headerRow = candidate;
        break;
      }
    }

    const headers = headerRow.map(h => String(h||"").trim());
    const map = buildHeaderMap(headers);

    const hasAnyMetric = (map.idxCost>=0) || (map.idxConv>=0) || (map.idxValue>=0);
    if (!hasAnyMetric){
      files.push({ path:p, ok:false, detected: map, reason:"no recognized metric columns" });
      continue;
    }

    detectedAny.cost = detectedAny.cost || (map.idxCost>=0);
    detectedAny.conversions = detectedAny.conversions || (map.idxConv>=0);
    detectedAny.value = detectedAny.value || (map.idxValue>=0);
    detectedAny.date = detectedAny.date || (map.idxDate>=0);

    // Determine date windows if date is present and parsable
    let lastDate = null;
    if (map.idxDate >= 0){
      for (const r of rows.slice(1)){
        const d = parseDateCell(r[map.idxDate]);
        if (d && (!lastDate || d > lastDate)) lastDate = d;
      }
    }

    const fileAgg30 = newAgg();
    const fileAggPrev = newAgg();
    const fileDaily30dMap = new Map();
    const fileDailyPrev30dMap = new Map();

    const cutoff30Start = lastDate ? new Date(lastDate.getTime() - 29*24*3600*1000) : null;
    const cutoffPrevStart = lastDate ? new Date(lastDate.getTime() - 59*24*3600*1000) : null;
    const cutoffPrevEnd = lastDate ? new Date(lastDate.getTime() - 30*24*3600*1000) : null;

    for (const r of rows.slice(1)){
      // skip fully empty rows
      if (!r || !r.length) continue;
      if (!r.some(looksLikeNumberCell)) continue;

      const metrics = sumRow(r, map);

      if (map.idxDate >= 0 && lastDate){
        const d = parseDateCell(r[map.idxDate]);
        if (!d) continue;

        if (d >= cutoff30Start && d <= lastDate){
          addAgg(fileAgg30, metrics);
          fileAgg30.rowsUsed++;
          addDaily(fileDaily30dMap, d, metrics);
          addDaily(daily30dMap, d, metrics);
        } else if (d >= cutoffPrevStart && d < cutoffPrevEnd){
          addAgg(fileAggPrev, metrics);
          fileAggPrev.rowsUsed++;
          addDaily(fileDailyPrev30dMap, d, metrics);
          addDaily(dailyPrev30dMap, d, metrics);
        }
      } else {
        // No date: best-effort treat everything as 30d aggregate
        addAgg(fileAgg30, metrics);
        fileAgg30.rowsUsed++;
      }
    }

    addAgg(totals30d, fileAgg30); totals30d.rowsUsed += fileAgg30.rowsUsed;
    addAgg(prev30d, fileAggPrev); prev30d.rowsUsed += fileAggPrev.rowsUsed;

    files.push({
      path: p,
      ok: true,
      detected: {
        idxDate: map.idxDate,
        idxCost: map.idxCost,
        idxConv: map.idxConv,
        idxValue: map.idxValue,
        idxClicks: map.idxClicks,
        idxImpr: map.idxImpr,
        hasDate: map.idxDate >= 0 && !!lastDate,
        lastDate: lastDate ? lastDate.toISOString().slice(0,10) : null,
        headers: headers.slice(0, 40),
      },
      totals30d: fileAgg30,
      prev30d: fileAggPrev,
      daily30d: mapToSeries(fileDaily30dMap),
      dailyPrev30d: mapToSeries(fileDailyPrev30dMap),
      rowsUsed: { last30: fileAgg30.rowsUsed, prev30: fileAggPrev.rowsUsed }
    });
  }

  const okFiles = files.filter(f => f.ok);
  if (!okFiles.length){
    return { ok:false, reason:"no parsable ads exports", files };
  }

  return { ok:true, files, totals30d, prev30d, daily30d: mapToSeries(daily30dMap), dailyPrev30d: mapToSeries(dailyPrev30dMap), detectedAny };
}
