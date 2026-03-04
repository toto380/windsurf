function safeUrl(u){ try{ return new URL(u).toString(); }catch{ return null; } }

function detect(html, headers){
  const h = (k)=> headers.get(k) || headers.get(k.toLowerCase()) || "";
  const stack = { cms:[], frameworks:[], cdn:[], analytics:[] };

  const server = h("server");
  const powered = h("x-powered-by");
  const cfRay = h("cf-ray");
  const vercel = h("x-vercel-id");
  const netlify = h("x-nf-request-id");

  if (cfRay) stack.cdn.push("Cloudflare");
  if (vercel) stack.cdn.push("Vercel");
  if (netlify) stack.cdn.push("Netlify");

  const s = (server + " " + powered + " " + html).toLowerCase();

  if (s.includes("wordpress")) stack.cms.push("WordPress");
  if (s.includes("shopify")) stack.cms.push("Shopify");
  if (s.includes("prestashop")) stack.cms.push("PrestaShop");
  if (s.includes("magento")) stack.cms.push("Magento");

  if (s.includes("next.js") || s.includes("_next/")) stack.frameworks.push("Next.js");
  if (s.includes("nuxt") || s.includes("_nuxt/")) stack.frameworks.push("Nuxt");
  if (s.includes("react")) stack.frameworks.push("React");
  if (s.includes("vue")) stack.frameworks.push("Vue");

  if (s.includes("gtm.js")) stack.analytics.push("Google Tag Manager");
  if (s.includes("google-analytics.com") || s.includes("gtag/js")) stack.analytics.push("Google Analytics");
  if (s.includes("connect.facebook.net")) stack.analytics.push("Meta Pixel");

  // unique
  for (const k of Object.keys(stack)){
    stack[k] = [...new Set(stack[k])];
  }
  return { server, powered, stack };
}

export async function scanTechStack(url){
  const u = safeUrl(url);
  if (!u) return { error:"Invalid URL" };
  const res = await fetch(u, { method:"GET", redirect:"follow" });
  const html = await res.text().catch(()=> "");
  const d = detect(html, res.headers);
  let score = 80;
  if (d.stack.cdn.length) score += 10;
  if (d.stack.analytics.length) score += 10;
  score = Math.min(100, score);
  return { ...d, score };
}
