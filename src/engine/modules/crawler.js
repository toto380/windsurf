import axios from 'axios';
import * as cheerio from 'cheerio';

function absUrl(base, maybe) {
  try { return new URL(maybe, base).toString(); } catch { return null; }
}

export async function scanCrawler(url) {
  try {
    const res = await axios.get(url, {
      timeout: 20000,
      headers: { 'User-Agent': 'StratAdsBot/1.0' },
      validateStatus: (s) => s >= 200 && s < 400
    });

    const html = res.data || '';
    const $ = cheerio.load(html);

    const title = ($('title').first().text() || '').trim();
    const metaDesc = ($('meta[name="description"]').attr('content') || '').trim();
    const robots = ($('meta[name="robots"]').attr('content') || '').trim();
    const canonical = ($('link[rel="canonical"]').attr('href') || '').trim();
    const canonicalAbs = canonical ? (absUrl(url, canonical) || canonical) : '';

    const h1Count = $('h1').length;
    const h1Texts = $('h1').slice(0, 3).map((_, el) => $(el).text().trim()).get();

    const imagesTotal = $('img').length;
    const imagesNoAlt = $('img:not([alt])').length;
    const imagesEmptyAlt = $('img[alt=""]').length;

    const ogTitle = ($('meta[property="og:title"]').attr('content') || '').trim();
    const ogDesc = ($('meta[property="og:description"]').attr('content') || '').trim();
    const ogImage = ($('meta[property="og:image"]').attr('content') || '').trim();
    const twitterCard = ($('meta[name="twitter:card"]').attr('content') || '').trim();

    const hreflangs = $('link[rel="alternate"][hreflang]').slice(0, 20).map((_, el) => ({
      hreflang: $(el).attr('hreflang'),
      href: $(el).attr('href')
    })).get();

    const linksTotal = $('a[href]').length;
    const internalLinks = [];
    const externalLinks = [];
    $('a[href]').slice(0, 500).each((_, a) => {
      const href = $(a).attr('href');
      const abs = absUrl(url, href);
      if (!abs) return;
      try {
        const h = new URL(abs).hostname;
        const baseHost = new URL(url).hostname;
        const rel = ($(a).attr('rel') || '').toLowerCase();
        const item = { href: abs, rel };
        if (h === baseHost) internalLinks.push(item);
        else externalLinks.push(item);
      } catch {}
    });

    // Text stats (rough)
    const text = ($('body').text() || '').replace(/\s+/g, ' ').trim();
    const wordCount = text ? text.split(' ').length : 0;

    // Structured data
    const jsonLdCount = $('script[type="application/ld+json"]').length;

    // Very light tech hints
    const generator = ($('meta[name="generator"]').attr('content') || '').trim();
    const poweredBy = (res.headers['x-powered-by'] || '').trim();

    // Score
    let score = 100;
    const reasons = [];

    if (!title) { score -= 15; reasons.push('Title manquant'); }
    if (title && title.length < 10) { score -= 5; reasons.push('Title très court'); }
    if (!metaDesc) { score -= 15; reasons.push('Meta description manquante'); }
    if (metaDesc && metaDesc.length < 50) { score -= 5; reasons.push('Meta description très courte'); }
    if (h1Count === 0) { score -= 15; reasons.push('Aucun H1'); }
    if (imagesNoAlt > 0) { score -= 10; reasons.push('Images sans ALT'); }
    if (!canonicalAbs) { score -= 10; reasons.push('Canonical manquante'); }
    if (robots && /noindex/i.test(robots)) { score -= 30; reasons.push('Robots contient NOINDEX'); }
    if (wordCount < 150) { score -= 5; reasons.push('Contenu texte faible'); }

    score = Math.max(0, score);

    return {
      score,
      reasons,
      http: {
        status: res.status,
        contentType: res.headers['content-type'] || '',
        server: res.headers['server'] || '',
        poweredBy: poweredBy || 'Inconnu'
      },
      onPage: {
        title,
        metaDescription: metaDesc || 'Manquante',
        robots: robots || 'Non défini',
        canonical: canonicalAbs || 'Manquant',
        h1Count,
        h1Sample: h1Texts,
        imagesTotal,
        imagesNoAlt,
        imagesEmptyAlt,
        linksTotal,
        internalLinksCount: internalLinks.length,
        externalLinksCount: externalLinks.length,
        externalNofollowCount: externalLinks.filter(l => (l.rel || '').includes('nofollow')).length,
        wordCount,
        jsonLdCount,
        og: { ogTitle, ogDesc, ogImage },
        twitterCard: twitterCard || 'Non défini',
        hreflangCount: hreflangs.length,
        hreflangSample: hreflangs
      },
      tech: {
        generator: generator || 'Non détecté'
      }
    };
  } catch (e) {
    return { score: 0, error: e.message };
  }
}
