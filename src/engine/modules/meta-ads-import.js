import fs from "node:fs";
import path from "node:path";

function stripAccents(s){
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normHeader(s){
  return stripAccents(s)
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(v){
  if (v == null) return 0;
  let s = String(v).trim();
  s = s.replace(/\s/g, "");
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  s = s.replace(/,(?=\d{3}(\D|$))/g, "");
  s = s.replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseDateCell(v){
  const s = String(v || "").trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})[-\/](\d{2})[-\/](\d{2})$/);
  if (iso){
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : d;
  }
  const dmy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (dmy){
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const y = Number(dmy[3]);
    let day = a, month = b;
    if (a <= 12 && b > 12){ month = a; day = b; }
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const d = new Date(`${y}-${mm}-${dd}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function detectDelimiter(line){
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
  for (let i=0;i<headersNorm.length;i++){
    const h = headersNorm[i];
    for (const t of tokens){
      if (h === t) return i;
    }
  }
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

  const idxDate = findIdx(hn, ["date", "day"]);
  const idxSpend = findIdx(hn, ["amount spent", "spend", "cost", "depenses", "dépenses"]);
  const idxImpr = findIdx(hn, ["impressions", "impr"]);
  const idxClicks = findIdx(hn, ["clicks", "all clicks", "clics"]);
  const idxLinkClicks = findIdx(hn, ["link clicks", "clics sur le lien"]);
  const idxResults = findIdx(hn, ["results", "conversions", "purchases", "leads"]);
  const idxValue = findIdx(hn, ["purchase conversion value", "conversion value", "value", "revenue", "purchase value"]);

  const idxCampaign = findIdx(hn, ["campaign name", "campaign", "nom de la campagne"]);
  const idxAdset = findIdx(hn, ["ad set name", "adset name", "ad set", "ensemble de publicites", "ensemble de publicités"]);
  const idxAd = findIdx(hn, ["ad name", "ad", "annonce"]);

  return { idxDate, idxSpend, idxImpr, idxClicks, idxLinkClicks, idxResults, idxValue, idxCampaign, idxAdset, idxAd, headersNorm: hn };
}

function newAgg(){ return { spend:0, impressions:0, clicks:0, linkClicks:0, results:0, value:0, rowsUsed:0 }; }
function dayKey(d){ return d.toISOString().slice(0,10); }
function newDailyAgg(){ return { spend:0, impressions:0, clicks:0, linkClicks:0, results:0, value:0, rowsUsed:0 }; }
function addDaily(map, d, x){
  const k = dayKey(d);
  const cur = map.get(k) || newDailyAgg();
  cur.spend += x.spend;
  cur.impressions += x.impressions;
  cur.clicks += x.clicks;
  cur.linkClicks += x.linkClicks;
  cur.results += x.results;
  cur.value += x.value;
  cur.rowsUsed += 1;
  map.set(k, cur);
}
function mapToSeries(map){
  const keys = Array.from(map.keys()).sort();
  return keys.map(k => ({ date:k, ...map.get(k) }));
}
function addAgg(agg, x){
  agg.spend += x.spend;
  agg.impressions += x.impressions;
  agg.clicks += x.clicks;
  agg.linkClicks += x.linkClicks;
  agg.results += x.results;
  agg.value += x.value;
  agg.rowsUsed += 1;
  return agg;
}

function sumRow(r, map){
  return {
    spend: map.idxSpend>=0 ? toNumber(r[map.idxSpend]) : 0,
    impressions: map.idxImpr>=0 ? toNumber(r[map.idxImpr]) : 0,
    clicks: map.idxClicks>=0 ? toNumber(r[map.idxClicks]) : 0,
    linkClicks: map.idxLinkClicks>=0 ? toNumber(r[map.idxLinkClicks]) : 0,
    results: map.idxResults>=0 ? toNumber(r[map.idxResults]) : 0,
    value: map.idxValue>=0 ? toNumber(r[map.idxValue]) : 0,
  };
}

async function readXlsxRows(p){
  const xlsx = await import("xlsx");
  const buf = await fs.promises.readFile(p);
  const wb = xlsx.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  return rows;
}

export async function loadMetaAdsExports(filePaths){
  const paths = Array.isArray(filePaths) ? filePaths.filter(Boolean) : [];
  if (!paths.length) return { ok:false, skipped:true, reason:"no files" };

  const files = [];
  const totals30d = newAgg();
  const prev30d = newAgg();
  const daily30dMap = new Map();
  const dailyPrev30dMap = new Map();
  const detectedAny = { date:false, spend:false, results:false, value:false };

  for (const p of paths){
    let rows = null;
    try{
      const ext = path.extname(p).toLowerCase();
      if (ext === ".xlsx"){
        rows = await readXlsxRows(p);
      } else {
        const txt = await fs.promises.readFile(p, "utf8");
        rows = parseDelimited(txt);
      }
    }catch(e){
      files.push({ path:p, ok:false, reason:`read failed: ${e.message}` });
      continue;
    }

    if (!rows || !rows.length){
      files.push({ path:p, ok:false, reason:"empty" });
      continue;
    }

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

    const hasAnyMetric = (map.idxSpend>=0) || (map.idxResults>=0) || (map.idxValue>=0);
    if (!hasAnyMetric){
      files.push({ path:p, ok:false, detected: map, reason:"no recognized metric columns" });
      continue;
    }

    detectedAny.spend = detectedAny.spend || (map.idxSpend>=0);
    detectedAny.results = detectedAny.results || (map.idxResults>=0);
    detectedAny.value = detectedAny.value || (map.idxValue>=0);
    detectedAny.date = detectedAny.date || (map.idxDate>=0);

    let lastDate = null;
    if (map.idxDate>=0){
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
      if (!r || !r.length) continue;
      const x = sumRow(r, map);

      if (map.idxDate>=0 && lastDate){
        const d = parseDateCell(r[map.idxDate]);
        if (!d) continue;

        if (d >= cutoff30Start && d <= lastDate){
          addAgg(fileAgg30, x);
          addDaily(fileDaily30dMap, d, x);
          addDaily(daily30dMap, d, x);
        } else if (d >= cutoffPrevStart && d < cutoffPrevEnd){
          addAgg(fileAggPrev, x);
          addDaily(fileDailyPrev30dMap, d, x);
          addDaily(dailyPrev30dMap, d, x);
        }
      } else {
        addAgg(fileAgg30, x);
      }
    }

    // merge
    totals30d.spend += fileAgg30.spend;
    totals30d.impressions += fileAgg30.impressions;
    totals30d.clicks += fileAgg30.clicks;
    totals30d.linkClicks += fileAgg30.linkClicks;
    totals30d.results += fileAgg30.results;
    totals30d.value += fileAgg30.value;
    totals30d.rowsUsed += fileAgg30.rowsUsed;

    prev30d.spend += fileAggPrev.spend;
    prev30d.impressions += fileAggPrev.impressions;
    prev30d.clicks += fileAggPrev.clicks;
    prev30d.linkClicks += fileAggPrev.linkClicks;
    prev30d.results += fileAggPrev.results;
    prev30d.value += fileAggPrev.value;
    prev30d.rowsUsed += fileAggPrev.rowsUsed;

    files.push({
      path: p,
      ok: true,
      detected: map,
      lastDate: lastDate ? lastDate.toISOString().slice(0,10) : null,
      totals30d: fileAgg30,
      prev30d: fileAggPrev,
      daily30d: mapToSeries(fileDaily30dMap),
      dailyPrev30d: mapToSeries(fileDailyPrev30dMap),
      rowsUsed: fileAgg30.rowsUsed,
    });
  }

  const anyOk = files.some(f => f.ok);
  if (!anyOk){
    return { ok:false, skipped:true, reason:"no parsable files", files, detectedAny };
  }

  return { ok:true, files, totals30d, prev30d, daily30d: mapToSeries(daily30dMap), dailyPrev30d: mapToSeries(dailyPrev30dMap), detectedAny };
}
