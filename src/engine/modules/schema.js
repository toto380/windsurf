function safeUrl(u){ try{ return new URL(u).toString(); }catch{ return null; } }

function extractJsonLd(html){
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while((m = re.exec(html)) !== null){
    const raw = m[1].trim();
    if (!raw) continue;
    try{
      const parsed = JSON.parse(raw);
      out.push(parsed);
    }catch{
      // attempt to fix common issues (multiple JSON blocks)
      try{
        const fixed = raw.replace(/\n/g," ").trim();
        out.push(JSON.parse(fixed));
      }catch{}
    }
    if (out.length >= 20) break;
  }
  return out;
}

export async function scanSchema(url){
  const u = safeUrl(url);
  if (!u) return { error:"Invalid URL" };
  const res = await fetch(u, { method:"GET", redirect:"follow" });
  const html = await res.text().catch(()=> "");
  const jsonld = extractJsonLd(html);

  const types = new Map();
  for (const j of jsonld){
    const t = j?.['@type'];
    if (Array.isArray(t)) for (const x of t) types.set(String(x), (types.get(String(x))||0)+1);
    else if (t) types.set(String(t), (types.get(String(t))||0)+1);
  }

  // score: presence of JSON-LD is a plus
  let score = 70;
  if (jsonld.length) score += 20;
  if (types.size) score += 10;
  score = Math.min(100, score);

  return { count: jsonld.length, types: [...types.entries()].sort((a,b)=>b[1]-a[1]), score };
}
