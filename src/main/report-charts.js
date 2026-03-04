/**
 * Report Charts — SVG (PDF-safe)
 * Centralized chart helpers to avoid duplicated declarations.
 * ESM module.
 */

function esc(s){ return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }
function num(n,d=0){ const x = Number(n); return Number.isFinite(x) ? x : d; }
function fmt(n, d=0){
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(d);
}

/**
 * Sparkline (trend) — returns a chart card (SVG) with min/max/last.
 * @param {string} title
 * @param {number[]} series
 * @param {string} unit
 */
export function sparklineSvg(title, series, unit=""){
  const data = (series||[]).map(x=>num(x,NaN)).filter(x=>Number.isFinite(x));
  if (!data.length) return "";
  const w = 360, h = 96, pad = 14;
  const minV = Math.min(...data);
  const maxV = Math.max(...data);
  const span = Math.max(1e-9, maxV - minV);
  const step = (w - pad*2) / Math.max(1, data.length-1);
  const points = data.map((v,i)=>{
    const x = pad + i*step;
    const y = pad + (h - pad*2) * (1 - ((v - minV)/span));
    return [x,y];
  });
  const d = points.map((pt,i)=> (i===0?`M ${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`:`L ${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`)).join(" ");
  const last = data[data.length-1];
  return `
    <div class="chartCard">
      <div class="chartTitle">${esc(title)}</div>
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
        <rect x="0" y="0" width="${w}" height="${h}" rx="16" ry="16" fill="#ffffff" stroke="#e5e7eb"/>
        <path d="${d}" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/>
        <circle cx="${points[points.length-1][0].toFixed(1)}" cy="${points[points.length-1][1].toFixed(1)}" r="4.5" fill="#2563eb"/>
      </svg>
      <div class="sparkNote">Dernière valeur: <b>${fmt(last,2)}${esc(unit)}</b> • min ${fmt(minV,2)} • max ${fmt(maxV,2)}</div>
    </div>
  `;
}

/**
 * Donut chart for scores.
 * @param {number} value
 * @param {string} label
 * @param {number} max
 */
export function donutSvg(value, label="Score", max=100){
  const v = Math.max(0, Math.min(max, num(value,0)));
  const pct = max ? (v/max) : 0;
  const size = 96;
  const r = 38;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  const gap = c - dash;
  return `
  <div class="donutWrap">
    <div class="donutTitle">${esc(label)}</div>
    <div class="donutInner">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="12"/>
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#2563eb" stroke-width="12"
          stroke-linecap="round" transform="rotate(-90 ${size/2} ${size/2})"
          stroke-dasharray="${dash} ${gap}"/>
        <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="20" font-weight="1000" fill="#0b0f14">${Math.round(v)}</text>
      </svg>
      <div>
        <div class="donutValue">${Math.round(v)}<span class="muted" style="font-size:14px;font-weight:900"> / ${max}</span></div>
        <div class="donutSub">Lecture: ${v>=80?"fiable":(v>=60?"à fiabiliser":"risque élevé")}</div>
      </div>
    </div>
  </div>`;
}

/**
 * Radar / spider chart SVG — 5-axis pillar scores.
 * @param {string} title
 * @param {{label:string,value:number,max?:number}[]} items
 */
export function radarSvg(title, items){
  const safe = (items||[]).map(it=>({
    label: String(it.label||""),
    value: Math.max(0, Math.min(Number(it.max||100)||100, Number(it.value)||0)),
    max: Number(it.max||100)||100,
  }));
  if (!safe.length) return "";
  const w=280, h=280, cx=w/2, cy=h/2, r=96;
  const n=safe.length;
  const angles=safe.map((_,i)=>(2*Math.PI*i/n)-Math.PI/2);
  const circles=[0.25,0.5,0.75,1].map(f=>{
    const cr=r*f;
    return `<circle cx="${cx}" cy="${cy}" r="${cr}" fill="none" stroke="#e5e7eb" stroke-width="1"/>`;
  }).join("");
  const axes=angles.map(a=>{
    const x2=cx+r*Math.cos(a), y2=cy+r*Math.sin(a);
    return `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#d1d5db" stroke-width="1"/>`;
  }).join("");
  const dataPoints=safe.map((it,i)=>{
    const pct=it.value/it.max;
    return [cx+r*pct*Math.cos(angles[i]), cy+r*pct*Math.sin(angles[i])];
  });
  const polyPts=dataPoints.map(p=>`${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const polygon=`<polygon points="${polyPts}" fill="rgba(37,99,235,0.18)" stroke="#2563eb" stroke-width="2" stroke-linejoin="round"/>`;
  const dots=dataPoints.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="#2563eb" stroke="#fff" stroke-width="1.5"/>`).join("");
  const labels=safe.map((it,i)=>{
    const la=angles[i];
    const lx=cx+(r+20)*Math.cos(la), ly=cy+(r+20)*Math.sin(la);
    const anchor=lx<cx-5?"end":(lx>cx+5?"start":"middle");
    return `<text x="${lx.toFixed(1)}" y="${(ly-5).toFixed(1)}" text-anchor="${anchor}" font-size="10" font-weight="700" fill="#374151">${esc(it.label)}</text>`
          +`<text x="${lx.toFixed(1)}" y="${(ly+7).toFixed(1)}" text-anchor="${anchor}" font-size="9" fill="#6b7280">${Math.round(it.value)}/100</text>`;
  }).join("");
  return `
  <div class="chartCard">
    <div class="chartTitle">${esc(title)}</div>
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
      <rect x="0" y="0" width="${w}" height="${h}" rx="16" ry="16" fill="#ffffff" stroke="#e5e7eb"/>
      ${circles}${axes}${polygon}${dots}${labels}
    </svg>
  </div>`;
}

/**
 * Risk heatmap SVG — probability × severity matrix.
 * @param {string} title
 * @param {{label:string,probability:string,severity:string}[]} risks
 */
export function heatmapSvg(title, risks){
  const lvl=v=>{const m={"faible":0,"low":0,"moyenne":1,"modérée":1,"medium":1,"moyen":1,"haute":2,"élevée":2,"high":2,"critique":2,"elevée":2};return m[String(v||"").toLowerCase()]??1;};
  const safe=(risks||[]).map(r=>({label:String(r.label||r.risk||""),prob:lvl(r.probability),sev:lvl(r.severity)}));
  const cW=72,cH=52,padL=58,padB=44,padT=32,padR=12;
  const w=padL+cW*3+padR, h=padT+cH*3+padB;
  const bg=[["#dcfce7","#fef9c3","#fef3c7"],["#fef9c3","#fef3c7","fee2e2"],["#fef3c7","#fee2e2","#fee2e2"]];
  const cells=[];
  for(let row=0;row<3;row++)for(let col=0;col<3;col++){
    const x=padL+col*cW,y=padT+row*cH;
    cells.push(`<rect x="${x}" y="${y}" width="${cW}" height="${cH}" fill="${bg[2-row][col]}" stroke="#e5e7eb" stroke-width="1"/>`);
  }
  const map={};
  for(const r of safe){const k=`${r.sev}_${r.prob}`;(map[k]=map[k]||[]).push(r);}
  const dots=[];
  for(const[k,items]of Object.entries(map)){
    const[s,p]=k.split("_").map(Number);
    const dx=padL+s*cW+cW/2,dy=padT+(2-p)*cH+cH/2,cnt=items.length;
    dots.push(`<circle cx="${dx}" cy="${dy}" r="${cnt>1?15:10}" fill="#1e40af" opacity="0.80"/>`,
              `<text x="${dx}" y="${dy}" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="900" fill="#fff">${cnt}</text>`);
    if(cnt===1){const lbl=items[0].label.slice(0,16)+(items[0].label.length>16?"…":"");
      dots.push(`<text x="${dx}" y="${dy+20}" text-anchor="middle" font-size="7.5" fill="#1e3a8a">${esc(lbl)}</text>`);
    }
  }
  const pLbls=["Faible","Moy.","Élevée"],sLbls=["Faible","Moy.","Élevée"];
  const yLbls=pLbls.map((l,i)=>`<text x="${padL-5}" y="${padT+(2-i)*cH+cH/2}" text-anchor="end" dominant-baseline="central" font-size="9" fill="#6b7280">${esc(l)}</text>`).join("");
  const xLbls=sLbls.map((l,i)=>`<text x="${padL+i*cW+cW/2}" y="${padT+3*cH+14}" text-anchor="middle" font-size="9" fill="#6b7280">${esc(l)}</text>`).join("");
  const axLbls=`<text x="${padL+cW*1.5}" y="${h-2}" text-anchor="middle" font-size="9" font-weight="700" fill="#374151">Sévérité →</text>`
    +`<text x="7" y="${padT+cH*1.5}" text-anchor="middle" font-size="9" font-weight="700" fill="#374151" transform="rotate(-90,7,${(padT+cH*1.5).toFixed(0)})">Probabilité →</text>`;
  return `
  <div class="chartCard">
    <div class="chartTitle">${esc(title)}</div>
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
      <rect x="0" y="0" width="${w}" height="${h}" rx="12" ry="12" fill="#ffffff" stroke="#e5e7eb"/>
      ${cells.join("")}${dots.join("")}${yLbls}${xLbls}${axLbls}
    </svg>
  </div>`;
}

/**
 * Simple compare bars chart (SVG) — relative scale.
 * @param {string} title
 * @param {{label:string,value:number}[]} items
 */
export function compareBarsSvg(title, items){
  const safe = (items||[]).map(it=>({ label:String(it.label||""), value:num(it.value,0) }));
  const m = Math.max(1, ...safe.map(x=>x.value));
  const w = 360, h = 96, pad = 12;
  const bw = Math.floor((w - pad*2) / Math.max(1, safe.length)) - 10;
  const baseY = h - 26;
  const bars = safe.map((it,i)=>{
    const x = pad + i * (bw + 10);
    const bh = Math.max(0, Math.round((it.value / m) * (h-44)));
    const y = baseY - bh;
    return `
      <rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="8" ry="8" fill="#2563eb" opacity="${0.55 + (i*0.15)}"></rect>
      <text x="${x + bw/2}" y="${h-10}" text-anchor="middle" font-size="10" fill="#475569">${esc(it.label)}</text>
    `;
  }).join("");

  const vals = safe.map((it,i)=>{
    const x = pad + i * (bw + 10);
    return `<text x="${x + bw/2}" y="${baseY-6}" text-anchor="middle" font-size="10" font-weight="900" fill="#0b0f14">${fmt(it.value, it.value>=1000?0:2)}</text>`;
  }).join("");

  return `
    <div class="chartCard">
      <div class="chartTitle">${esc(title)}</div>
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
        <rect x="0" y="0" width="${w}" height="${h}" rx="16" ry="16" fill="#ffffff" stroke="#e5e7eb"/>
        <line x1="${pad}" y1="${baseY}" x2="${w-pad}" y2="${baseY}" stroke="#e5e7eb"/>
        ${bars}
        ${vals}
      </svg>
      <div class="sparkNote">Échelle relative (max = ${fmt(m, m>=1000?0:2)}).</div>
    </div>
  `;
}
