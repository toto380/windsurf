function safeUrl(u){ try{ return new URL(u); }catch{ return null; } }

export function buildSerpPreview(seo){
  const on = seo?.onPage || seo || {};
  const title = String(on.title || "");
  const desc = String(on.metaDescription ?? on.metaDesc ?? on.description ?? "");
  const canonical = String(on.canonical || "");
  const lenTitle = title.length;
  const lenDesc = desc.length;

  // heuristics
  const titleOk = (lenTitle >= 30 && lenTitle <= 60);
  const descOk = (lenDesc >= 70 && lenDesc <= 160);

  let score = 100;
  if (!titleOk) score -= 15;
  if (!descOk) score -= 15;
  if (!canonical) score -= 10;
  score = Math.max(0, Math.min(100, score));

  return {
    title, desc, canonical,
    lenTitle, lenDesc,
    titleOk, descOk,
    score
  };
}
