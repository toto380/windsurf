/**
 * Attribution Analysis Section Builder
 *
 * Detects attribution discrepancies between ad platform reports and analytics:
 *   - Revenue Ads ≠ Revenue Analytics
 *   - Attribution window mismatches
 *   - Missing / malformed UTMs
 *   - Duplicate conversion counting
 *   - Naming convention gaps
 *
 * Returns dataAvailable: false when no data is available — never injects mockdata.
 */

function safeNum(x) {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function fmt(n, d = 0, fallback = "—") {
  if (n === null || !Number.isFinite(Number(n))) return fallback;
  return Number(n).toFixed(d);
}

function fmtEur(n, fallback = "—") {
  if (n === null || !Number.isFinite(Number(n))) return fallback;
  return `€${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(a, b) {
  const na = safeNum(a), nb = safeNum(b);
  if (na === null || nb === null || nb === 0) return null;
  return Math.round(((na - nb) / Math.abs(nb)) * 100);
}

/**
 * Build attribution analysis section.
 *
 * @param {object} auditResults
 * @param {object} scores
 * @returns {object} section model
 */
export function buildAttributionAnalysis(auditResults, scores) {
  const ga4 = auditResults.modules?.privateGoogle?.ga4 || {};
  const adsGoogle = auditResults.modules?.adsGoogle || {};
  const adsMeta = auditResults.modules?.adsMeta || {};
  const adsImport = auditResults.modules?.adsImport || {};
  const trkScore = safeNum(scores?.tracking) ?? 0;

  const ga4Available = ga4.ok && (
    (Array.isArray(ga4.rows) && ga4.rows.length > 0) ||
    (Array.isArray(ga4.channels) && ga4.channels.length > 0) ||
    !!ga4.totals?.sessions
  );
  const adsAvailable = adsGoogle.ok || adsMeta.ok || adsImport.ok;

  if (!ga4Available && !adsAvailable) {
    return {
      id: "attribution-analysis",
      title: "Attribution & Tracking — Analyse de cohérence (CONFIDENTIEL)",
      dataAvailable: false,
      reason: "Données GA4 et Ads non disponibles — configurez l'accès API et importez les exports Ads.",
      intro: "Cette section nécessite les données GA4 (service account) et les exports Ads (CSV).",
      summary: ["⚠️ Données insuffisantes pour l'analyse d'attribution"],
      findings: [],
      actions: [],
      charts: [],
      tables: [],
      evidence: [],
      isPrivate: true,
      riskLevel: "Élevé",
    };
  }

  const findings = [];
  const actions = [];
  const tables = [];

  // ── Revenue discrepancy: Ads vs Analytics ────────────────────────────────
  const ga4Totals = ga4.totals || {};
  const ga4Revenue = safeNum(ga4Totals.revenue) ?? 0;

  const googleRevenue = safeNum(
    (adsGoogle.totals30d || adsGoogle.totals || {}).value ??
    (adsGoogle.totals30d || adsGoogle.totals || {}).revenue ?? null
  ) ?? 0;
  const metaRevenue = safeNum(
    (adsMeta.totals30d || adsMeta.totals || {}).value ??
    (adsMeta.totals30d || adsMeta.totals || {}).revenue ?? null
  ) ?? 0;
  const adsImportGoogle = (adsImport.google || {});
  const adsImportMeta = (adsImport.meta || {});
  const googleImportRevenue = safeNum((adsImportGoogle.totals30d || {}).value ?? null) ?? 0;
  const metaImportRevenue = safeNum((adsImportMeta.totals30d || {}).value ?? null) ?? 0;

  const totalAdsRevenue = googleRevenue + metaRevenue + googleImportRevenue + metaImportRevenue;

  const discrepancyPct = ga4Revenue > 0 && totalAdsRevenue > 0
    ? pct(totalAdsRevenue, ga4Revenue)
    : null;

  if (discrepancyPct !== null && Math.abs(discrepancyPct) > 15) {
    const direction = totalAdsRevenue > ga4Revenue ? "surestimé" : "sous-estimé";
    findings.push({
      observation: `Écart attribution : Ads déclare ${fmtEur(totalAdsRevenue)} vs GA4 ${fmtEur(ga4Revenue)} (${discrepancyPct > 0 ? "+" : ""}${discrepancyPct}%)`,
      source: "Comparaison GA4 Revenue vs exports Ads",
      importance: `Revenue Ads ${direction} de ${Math.abs(discrepancyPct)}% vs analytics — risque de sur-allocation ou sous-optimisation budget.`,
      status: Math.abs(discrepancyPct) > 30 ? "bad" : "warn",
    });
    actions.push({
      title: "Réconcilier les revenus Ads vs GA4",
      why: `Écart de ${Math.abs(discrepancyPct)}% entre revenus rapportés par les plateformes Ads et GA4.`,
      evidence: `Ads total : ${fmtEur(totalAdsRevenue)} / GA4 : ${fmtEur(ga4Revenue)}`,
      impact: "Meilleure précision des décisions d'allocation budget, évite les erreurs ROAS",
      effort: "M",
      risk: Math.abs(discrepancyPct) > 30 ? "high" : "medium",
      owner: "StratAds",
      deadline: "30j",
      action: "Aligner les fenêtres d'attribution (GA4 data-driven vs Google Ads 7j click / Meta 7j click+1j view). Vérifier les conversions dupliquées.",
    });
  } else if (ga4Revenue > 0 && totalAdsRevenue > 0) {
    findings.push({
      observation: `Attribution cohérente : écart Ads vs GA4 de ${discrepancyPct !== null ? Math.abs(discrepancyPct) + "%" : "—"} (seuil acceptable < 15%)`,
      source: "Comparaison GA4 Revenue vs exports Ads",
      importance: "Cohérence des données d'attribution — bon signal de tracking fiable.",
      status: "ok",
    });
  }

  // ── UTM coverage (check ga4 channels for direct/no-source) ───────────────
  const allChannels = ga4.channels || ga4.rows || [];
  const directChannel = allChannels.find(c =>
    String(c.channel || "").toLowerCase().includes("direct") ||
    String(c.channel || "").toLowerCase().includes("(none)")
  );
  const totalSessions = safeNum(ga4Totals.sessions) ??
    allChannels.reduce((s, c) => s + (safeNum(c.sessions) ?? 0), 0);
  const directSessions = safeNum(directChannel?.sessions) ?? 0;
  const directPct = totalSessions > 0 ? Math.round((directSessions / totalSessions) * 100) : null;

  if (directPct !== null && directPct > 25) {
    findings.push({
      observation: `Trafic "Direct/None" élevé : ${directPct}% des sessions (${directSessions.toLocaleString("fr-FR")} / ${totalSessions.toLocaleString("fr-FR")})`,
      source: "GA4 — rapport canaux d'acquisition",
      importance: `Un taux Direct > 25% indique des UTMs manquantes sur vos campagnes Ads, emails ou réseaux sociaux. Conversions mal attribuées.`,
      status: directPct > 40 ? "bad" : "warn",
    });
    actions.push({
      title: `Déployer les UTMs sur toutes les campagnes (trafic Direct : ${directPct}%)`,
      why: "UTMs absentes = conversions attribuées à 'Direct' = budget mal optimisé.",
      evidence: `${directPct}% du trafic sans source/medium identifiable (GA4)`,
      impact: "Récupération de l'attribution correcte sur ~" + directPct + "% du trafic",
      effort: "S",
      risk: "medium",
      owner: "StratAds",
      deadline: "7j",
      action: "Appliquer la convention UTM StratAds : utm_source / utm_medium / utm_campaign / utm_content / utm_term sur toutes les URLs Ads, emails, et liens bio.",
    });
  } else if (directPct !== null) {
    findings.push({
      observation: `UTM coverage correcte : trafic Direct/None à ${directPct}% (seuil d'alerte : > 25%)`,
      source: "GA4 — rapport canaux",
      importance: "Bonne couverture UTM — l'attribution est fiable.",
      status: "ok",
    });
  }

  // ── Tracking score ────────────────────────────────────────────────────────
  if (trkScore < 60) {
    findings.push({
      observation: `Score tracking : ${trkScore}/100 — configuration incomplète`,
      source: "Audit tracking (GTM + GA4 events)",
      importance: "Un tracking incomplet rend toutes les décisions d'attribution non fiables.",
      status: trkScore < 40 ? "bad" : "warn",
    });
    actions.push({
      title: `Corriger le tracking (score : ${trkScore}/100 → cible : ≥ 80/100)`,
      why: "Tracking insuffisant = données d'attribution non fiables = décisions budgétaires risquées.",
      evidence: `Score tracking actuel : ${trkScore}/100`,
      impact: "Attribution précise = ROAS réel connu = budget mieux alloué (+10-20% efficacité)",
      effort: "M",
      risk: "high",
      owner: "StratAds",
      deadline: "30j",
      action: "Plan de tracking : GA4 Enhanced Conversions + GTM event map complet + Server-Side si applicable.",
    });
  }

  // ── Attribution window recommendations ───────────────────────────────────
  const attrWindowRows = [];
  if (adsGoogle.ok || adsImportGoogle.ok) {
    attrWindowRows.push([
      "Google Ads",
      "7 jours clic / 1 jour vue (défaut)",
      "Data-driven (GA4)",
      discrepancyPct !== null && Math.abs(discrepancyPct) > 15 ? "⚠️ Écart détecté" : "✅ OK",
    ]);
  }
  if (adsMeta.ok || adsImportMeta.ok) {
    attrWindowRows.push([
      "Meta Ads",
      "7 jours clic / 1 jour vue",
      "Data-driven (GA4)",
      "⚠️ À vérifier — fenêtres différentes",
    ]);
  }
  if (ga4Available) {
    attrWindowRows.push([
      "GA4",
      "Data-driven (cross-channel)",
      "Data-driven",
      "✅ Référence",
    ]);
  }

  if (attrWindowRows.length > 0) {
    tables.push({
      id: "attribution-windows",
      title: "Fenêtres d'attribution par plateforme",
      headers: ["Plateforme", "Fenêtre déclarée", "Modèle recommandé", "Statut"],
      rows: attrWindowRows,
    });
  }

  // ── UTM naming convention table ───────────────────────────────────────────
  tables.push({
    id: "utm-naming-convention",
    title: "Convention UTM recommandée StratAds",
    headers: ["Paramètre", "Valeur recommandée", "Exemple"],
    rows: [
      ["utm_source", "plateforme (google, meta, newsletter…)", "google"],
      ["utm_medium", "type de media (cpc, social, email, organic)", "cpc"],
      ["utm_campaign", "nom campagne normalisé (snake_case)", "brand_exact_fr"],
      ["utm_content", "identifiant créatif / adset", "visuel_promo_v2"],
      ["utm_term", "mot-clé (SEA) ou segment (Social)", "chaussures+running"],
    ],
  });

  // ── Revenue reconciliation table ─────────────────────────────────────────
  if (ga4Revenue > 0 || totalAdsRevenue > 0) {
    tables.push({
      id: "revenue-reconciliation",
      title: "Réconciliation Revenue : Ads vs Analytics",
      headers: ["Source", "Revenue déclaré", "Delta vs GA4", "Statut"],
      rows: [
        ["GA4 (référence)", fmtEur(ga4Revenue), "—", "✅ Référence"],
        ...(googleRevenue > 0 || googleImportRevenue > 0 ? [[
          "Google Ads (export)",
          fmtEur(googleRevenue + googleImportRevenue),
          pct(googleRevenue + googleImportRevenue, ga4Revenue) !== null
            ? `${pct(googleRevenue + googleImportRevenue, ga4Revenue) > 0 ? "+" : ""}${pct(googleRevenue + googleImportRevenue, ga4Revenue)}%`
            : "—",
          Math.abs(pct(googleRevenue + googleImportRevenue, ga4Revenue) ?? 0) > 15 ? "⚠️ Écart" : "✅ OK",
        ]] : []),
        ...(metaRevenue > 0 || metaImportRevenue > 0 ? [[
          "Meta Ads (export)",
          fmtEur(metaRevenue + metaImportRevenue),
          pct(metaRevenue + metaImportRevenue, ga4Revenue) !== null
            ? `${pct(metaRevenue + metaImportRevenue, ga4Revenue) > 0 ? "+" : ""}${pct(metaRevenue + metaImportRevenue, ga4Revenue)}%`
            : "—",
          Math.abs(pct(metaRevenue + metaImportRevenue, ga4Revenue) ?? 0) > 15 ? "⚠️ Écart" : "✅ OK",
        ]] : []),
      ],
    });
  }

  const summary = [
    ga4Available ? `✅ GA4 disponible — ${totalSessions.toLocaleString("fr-FR")} sessions analysées` : "⚠️ GA4 non disponible",
    adsAvailable ? "✅ Données Ads disponibles" : "⚠️ Données Ads non disponibles",
    discrepancyPct !== null ? `Écart Ads/GA4 : ${discrepancyPct > 0 ? "+" : ""}${discrepancyPct}%` : "—",
    directPct !== null ? `Trafic Direct/None : ${directPct}%` : "UTM coverage : non mesurable",
  ];

  return {
    id: "attribution-analysis",
    title: "Attribution & Tracking — Analyse de cohérence (CONFIDENTIEL)",
    intro: "Analyse de la fiabilité de l'attribution : cohérence entre plateformes Ads et analytics, couverture UTM, fenêtres d'attribution et recommandations de normalisation.",
    summary,
    findings,
    actions,
    charts: [],
    tables,
    evidence: [],
    isPrivate: true,
    riskLevel: findings.some(f => f.status === "bad") ? "Élevé"
      : findings.some(f => f.status === "warn") ? "Moyen" : "Faible",
  };
}
