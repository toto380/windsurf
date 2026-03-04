function join(a,b){ return a.replace(/\/$/,"") + "/" + b.replace(/^\//,""); }
function safeUrl(u){ try{ return new URL(u).toString(); }catch{ return null; } }

async function fetchText(u){
  const res = await fetch(u, { method:"GET", redirect:"follow" });
  if (!res.ok) return { ok:false, status: res.status, text: "" };
  const text = await res.text().catch(()=> "");
  return { ok:true, status: res.status, text };
}

function parseSitemaps(robotsTxt){
  const lines = String(robotsTxt||"").split(/\r?\n/);
  const sm = [];
  for (const l of lines){
    const m = l.match(/^\s*Sitemap\s*:\s*(.+)$/i);
    if (m) sm.push(m[1].trim());
  }
  return [...new Set(sm)];
}

export async function scanRobotsAndSitemap(url){
  const u = safeUrl(url);
  if (!u) return { error:"Invalid URL" };
  const base = new URL(u).origin;

  const robotsUrl = join(base, "/robots.txt");
  const r = await fetchText(robotsUrl);
  const sitemaps = r.ok ? parseSitemaps(r.text) : [];

  // common fallbacks
  const candidates = [...sitemaps];
  if (!candidates.length){
    candidates.push(join(base,"/sitemap.xml"));
    candidates.push(join(base,"/sitemap_index.xml"));
  }

  const sitemapChecks = [];
  for (const sm of candidates.slice(0,3)){
    const x = await fetchText(sm);
    sitemapChecks.push({ url: sm, ok: x.ok, status: x.status, size: x.text.length });
  }

  // scoring
  let score = 100;
  if (!r.ok) score -= 20;
  if (!sitemapChecks.some(x=>x.ok)) score -= 20;

  return { robotsUrl, robots: { ok:r.ok, status:r.status, size:r.text.length }, sitemapsDeclared: sitemaps, sitemapChecks, score };
}
