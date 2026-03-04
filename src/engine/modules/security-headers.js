function safeUrl(u){ try{ return new URL(u).toString(); }catch{ return null; } }
function get(h, k){ return h.get(k) || h.get(k.toLowerCase()) || null; }

export async function scanSecurityHeaders(url){
  const u = safeUrl(url);
  if (!u) return { error:"Invalid URL" };

  const res = await fetch(u, { method:"GET", redirect:"follow" });
  const h = res.headers;

  const headers = {
    "strict-transport-security": get(h,"strict-transport-security"),
    "content-security-policy": get(h,"content-security-policy"),
    "x-frame-options": get(h,"x-frame-options"),
    "x-content-type-options": get(h,"x-content-type-options"),
    "referrer-policy": get(h,"referrer-policy"),
    "permissions-policy": get(h,"permissions-policy"),
    "cross-origin-opener-policy": get(h,"cross-origin-opener-policy"),
    "cross-origin-resource-policy": get(h,"cross-origin-resource-policy"),
    "cross-origin-embedder-policy": get(h,"cross-origin-embedder-policy"),
  };

  const missing = Object.entries(headers).filter(([,v])=>!v).map(([k])=>k);

  // Simple scoring
  let score = 100;
  if (!headers["strict-transport-security"]) score -= 20;
  if (!headers["content-security-policy"]) score -= 20;
  if (!headers["x-frame-options"]) score -= 10;
  if (!headers["x-content-type-options"]) score -= 10;
  if (!headers["referrer-policy"]) score -= 5;
  if (!headers["permissions-policy"]) score -= 5;
  score = Math.max(0, Math.min(100, score));

  return { status: res.status, finalUrl: res.url, headers, missing, score };
}
