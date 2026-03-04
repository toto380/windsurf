/**
 * Strengths Section Builder — "Ce qui est bien"
 *
 * Surfaces the positive findings from all available modules:
 *   - Points forts (what's working well)
 *   - À protéger (what must not be broken)
 *   - Opportunités rapides (low-effort, high-impact quick wins)
 *
 * This section works for any profile (public or private).
 */

function safeNum(x) {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build the "Ce qui est bien" (Strengths & Opportunities) section.
 *
 * @param {object} auditResults
 * @param {object} profile
 * @param {object} scores
 * @returns {object} section model
 */
export function buildStrengthsSection(auditResults, profile, scores) {
  const meta = auditResults.meta || {};
  const lh = auditResults.modules?.lighthouse || {};
  const trk = auditResults.modules?.tracking || {};
  const seo = auditResults.modules?.seo || {};
  const sec = auditResults.modules?.security || {};
  const secH = auditResults.modules?.securityHeaders || {};
  const robots = auditResults.modules?.robots || {};
  const schema = auditResults.modules?.schema || {};
  const ga4 = auditResults.modules?.privateGoogle?.ga4 || {};
  const adsGoogle = auditResults.modules?.adsGoogle || {};
  const adsMeta = auditResults.modules?.adsMeta || {};

  const globalScore = safeNum(scores?.global) ?? 0;
  const trkScore = safeNum(scores?.tracking) ?? 0;
  const seoScore = safeNum(scores?.seo) ?? 0;
  const perfScore = safeNum(scores?.performance) ?? 0;
  const secScore = safeNum(scores?.security) ?? 0;

  const strengths = [];       // What's working well (with proof)
  const toProtect = [];       // What must not be broken
  const quickWins = [];       // Low-effort, high-impact opportunities

  // ── Performance ────────────────────────────────────────────────────────────
  const lcp = safeNum(lh.largestContentfulPaint);
  const fcp = safeNum(lh.firstContentfulPaint);
  const cls = safeNum(lh.cumulativeLayoutShift);
  const tbt = safeNum(lh.totalBlockingTime);

  if (perfScore >= 80) {
    strengths.push({
      title: "Performance web excellente",
      proof: `Score Lighthouse Performance : ${perfScore}/100${lcp !== null ? ` — LCP ${lcp}s` : ""}${fcp !== null ? `, FCP ${fcp}s` : ""}`,
      source: "Lighthouse",
      icon: "🚀",
    });
    toProtect.push("Score performance Lighthouse ≥ 80/100 — ne pas alourdir le site sans mesurer l'impact CWV");
  } else if (perfScore >= 60) {
    quickWins.push({
      title: "Améliorer la performance web (LCP / TBT)",
      why: `Performance ${perfScore}/100 — en dessous du seuil idéal (80+). LCP : ${lcp !== null ? lcp + "s" : "—"}, TBT : ${tbt !== null ? tbt + "ms" : "—"}.`,
      effort: "M",
      impact: "Réduction du taux de rebond, meilleur score SEO, meilleur ROAS landing pages",
      action: "Optimiser images (WebP), réduire JS bloquant, activer CDN / cache.",
    });
  }

  // ── SEO ────────────────────────────────────────────────────────────────────
  if (seoScore >= 75) {
    strengths.push({
      title: "SEO technique solide",
      proof: `Score SEO : ${seoScore}/100`,
      source: "Crawl + Lighthouse SEO",
      icon: "🔍",
    });
    toProtect.push("Architecture SEO actuelle — ne pas modifier la structure d'URL sans redirections 301");
  }

  if (robots.allowed === true) {
    strengths.push({
      title: "Robots.txt correctement configuré",
      proof: "Site indexable — robots.txt autorise les crawlers",
      source: "Analyse robots.txt",
      icon: "🤖",
    });
  }

  if (robots.sitemap) {
    strengths.push({
      title: "Sitemap XML présent",
      proof: `Sitemap déclaré : ${robots.sitemap}`,
      source: "Analyse robots.txt / sitemap",
      icon: "🗺️",
    });
    toProtect.push("Sitemap XML — maintenir à jour lors de tout changement de structure URL");
  }

  // ── Tracking ───────────────────────────────────────────────────────────────
  if (trk.ga4 === true) {
    strengths.push({
      title: "GA4 installé",
      proof: "Balise GA4 détectée sur le site",
      source: "Audit tracking",
      icon: "📊",
    });
    toProtect.push("Balise GA4 — ne pas supprimer ou changer le Measurement ID sans validation");
  }

  if (trk.gtm === true) {
    strengths.push({
      title: "Google Tag Manager déployé",
      proof: "GTM détecté — flexibilité de déploiement des tags sans déploiement dev",
      source: "Audit tracking",
      icon: "🏷️",
    });
    toProtect.push("Container GTM — documenter toutes les règles de déclenchement avant toute modification");
  }

  if (trkScore >= 70) {
    toProtect.push(`Score tracking ${trkScore}/100 — maintenir la configuration GTM + GA4 lors des évolutions site`);
  }

  // ── Security ───────────────────────────────────────────────────────────────
  if (sec.spf) {
    strengths.push({
      title: "SPF configuré (anti-spoofing email)",
      proof: `SPF : ${String(sec.spf).substring(0, 60)}`,
      source: "Audit DNS / sécurité",
      icon: "🛡️",
    });
  }

  if (sec.dmarc) {
    strengths.push({
      title: "DMARC configuré",
      proof: `DMARC : ${String(sec.dmarc).substring(0, 60)}`,
      source: "Audit DNS / sécurité",
      icon: "🛡️",
    });
    toProtect.push("Configuration DMARC — ne pas modifier sans tester l'impact sur la délivrabilité email");
  }

  if (secH.xfo === true) {
    strengths.push({
      title: "En-tête X-Frame-Options présent (anti-clickjacking)",
      proof: "Header X-Frame-Options détecté — protection contre le clickjacking",
      source: "Audit en-têtes HTTP",
      icon: "🛡️",
    });
  }

  // ── Schema ─────────────────────────────────────────────────────────────────
  const schemaTypes = schema.types || [];
  if (schemaTypes.length > 0) {
    strengths.push({
      title: `Schema.org implémenté (${schemaTypes.join(", ")})`,
      proof: `${schemaTypes.length} type(s) de markup détecté(s) : ${schemaTypes.join(", ")}`,
      source: "Analyse schema.org",
      icon: "🧩",
    });
    toProtect.push("Markup Schema.org — maintenir lors des évolutions CMS/template");
  }

  // ── GA4 / Ads data (private only) ─────────────────────────────────────────
  if (ga4.ok) {
    const totals = ga4.totals || {};
    const totalConversions = safeNum(totals.conversions) ?? 0;
    if (totalConversions > 0) {
      strengths.push({
        title: "Conversions GA4 actives et mesurées",
        proof: `${totalConversions} conversions trackées sur la période`,
        source: "GA4 — données propriétaires",
        icon: "🎯",
      });
      toProtect.push("Événements de conversion GA4 — ne pas renommer ou supprimer sans migration");
    }
  }

  if (adsGoogle.ok) {
    const gTotals = adsGoogle.totals30d || adsGoogle.totals || {};
    const gRoas = safeNum(gTotals.value) && safeNum(gTotals.cost) && gTotals.cost > 0
      ? (gTotals.value / gTotals.cost).toFixed(2)
      : null;
    if (gRoas !== null && Number(gRoas) >= 2.0) {
      strengths.push({
        title: `Google Ads rentable — ROAS ${gRoas}x`,
        proof: `Revenue ${Number(gTotals.value).toLocaleString("fr-FR")} € / Spend ${Number(gTotals.cost).toLocaleString("fr-FR")} € = ROAS ${gRoas}x`,
        source: "Export Google Ads",
        icon: "📣",
      });
      toProtect.push(`Campagnes Google Ads avec ROAS ≥ 2x — ne pas pauser sans test A/B préalable`);
    }
  }

  if (adsMeta.ok) {
    const mTotals = adsMeta.totals30d || adsMeta.totals || {};
    const mRoas = safeNum(mTotals.value) && safeNum(mTotals.cost) && mTotals.cost > 0
      ? (mTotals.value / mTotals.cost).toFixed(2)
      : null;
    if (mRoas !== null && Number(mRoas) >= 2.0) {
      strengths.push({
        title: `Meta Ads rentable — ROAS ${mRoas}x`,
        proof: `Revenue ${Number(mTotals.value).toLocaleString("fr-FR")} € / Spend ${Number(mTotals.cost).toLocaleString("fr-FR")} € = ROAS ${mRoas}x`,
        source: "Export Meta Ads",
        icon: "📱",
      });
    }
  }

  // ── Quick wins fallback ────────────────────────────────────────────────────
  if (!secH.hsts) {
    quickWins.push({
      title: "Activer HSTS (Strict-Transport-Security)",
      why: "En-tête HSTS absent — risque man-in-the-middle, pénalité SEO potential.",
      effort: "S",
      impact: "Amélioration sécurité + signal positif pour le SEO",
      action: "Ajouter le header Strict-Transport-Security: max-age=31536000; includeSubDomains dans la config serveur.",
    });
  }

  if (!secH.csp) {
    quickWins.push({
      title: "Déployer une Content Security Policy (CSP)",
      why: "CSP absente — vecteur d'attaque XSS non mitigé.",
      effort: "M",
      impact: "Protection XSS + trust signal pour les partenaires",
      action: "Définir une CSP stricte via GTM ou header serveur.",
    });
  }

  if (!trk.consent) {
    quickWins.push({
      title: "Implémenter Consent Mode v2 (obligation RGPD/CMP)",
      why: "Consent Mode absent — risque RGPD, perte de signal de conversion post-consentement.",
      effort: "S",
      impact: "Conformité RGPD + récupération 15-30% des conversions modélisées par Google",
      action: "Implémenter Consent Mode v2 via CMP compatible (Cookiebot, Axeptio, Didomi).",
    });
  }

  if (schemaTypes.length === 0) {
    quickWins.push({
      title: "Ajouter des markups Schema.org (FAQ, Product, LocalBusiness…)",
      why: "Aucun markup schema détecté — opportunité de rich snippets manquée.",
      effort: "S",
      impact: "Rich snippets = CTR organique +10-30%",
      action: "Implémenter les types Schema.org pertinents via JSON-LD dans le <head>.",
    });
  }

  // ── Build findings for section model ─────────────────────────────────────
  const findings = strengths.map(s => ({
    observation: `${s.icon || "✅"} ${s.title} — ${s.proof}`,
    source: s.source,
    importance: "Point fort à maintenir et protéger.",
    status: "ok",
  }));

  // ── Tables ────────────────────────────────────────────────────────────────
  const strengthsTable = strengths.length > 0 ? {
    id: "strengths-table",
    title: "Points forts identifiés",
    headers: ["✅ Point fort", "Preuve", "Source"],
    rows: strengths.map(s => [`${s.icon || "✅"} ${s.title}`, s.proof, s.source]),
  } : null;

  const protectTable = toProtect.length > 0 ? {
    id: "to-protect-table",
    title: "À protéger — ne pas dégrader",
    headers: ["🛡️ Ce qu'il ne faut pas casser", "Raison"],
    rows: toProtect.map(p => [p, "Risque de régression si modifié sans précaution"]),
  } : null;

  const quickWinsTable = quickWins.length > 0 ? {
    id: "quick-wins-opportunities",
    title: "Opportunités rapides (Quick Wins)",
    headers: ["⚡ Action", "Pourquoi", "Effort", "Impact"],
    rows: quickWins.map(q => [q.title, q.why, q.effort, q.impact]),
  } : null;

  const tables = [strengthsTable, protectTable, quickWinsTable].filter(Boolean);

  const summary = [
    `${strengths.length} point(s) fort(s) identifié(s)`,
    `${toProtect.length} élément(s) à protéger`,
    `${quickWins.length} opportunité(s) rapide(s) à saisir`,
    globalScore >= 70
      ? `✅ Score global ${globalScore}/100 — dispositif globalement sain`
      : `⚠️ Score global ${globalScore}/100 — des améliorations prioritaires existent`,
  ];

  const actions = quickWins.map(q => ({
    title: q.title,
    why: q.why,
    evidence: `Score global : ${globalScore}/100`,
    impact: q.impact,
    effort: q.effort,
    risk: "low",
    owner: "StratAds",
    deadline: q.effort === "S" ? "7j" : "30j",
    action: q.action,
  }));

  return {
    id: "strengths",
    title: "Ce qui est bien — Points forts & Opportunités",
    intro: "Inventaire des points forts du dispositif digital, des éléments à protéger et des opportunités rapides (Quick Wins).",
    summary,
    findings,
    actions,
    charts: [],
    tables,
    evidence: [],
    riskLevel: "Faible",
  };
}
