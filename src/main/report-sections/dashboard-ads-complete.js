/**
 * Dashboard Ads Complete — Section Builder
 * Builds a comprehensive Ads performance section for Google Ads, Meta Ads, and Microsoft Ads.
 *
 * Computes ROAS, CPA, CTR, CPC, ROI and generates campaign-level recommendations
 * (SCALE / TEST / PAUSE / KILL badges).
 */

import {
  calcROAS, calcCPA, calcCTR, calcCPC, calcROI, calcConvRate, calcBudgetAllocation,
  enrichCampaign, calcMER, calcBreakEvenROAS, calcContributionMargin, calcCPM, calcPeriodDelta,
} from "../metrics-calculator.js";
import { buildSmartRecommendations } from "../smart-recommendations.js";

function safeNum(x) {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function fmt(n, d = 2, fallback = "—") {
  if (n === null || !Number.isFinite(Number(n))) return fallback;
  return Number(n).toFixed(d);
}

function fmtEur(n, fallback = "—") {
  if (n === null || !Number.isFinite(Number(n))) return fallback;
  return `€${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function badgeLabel(badge) {
  const map = {
    SCALE: "✅ SCALE",
    TEST: "⚠️ TEST",
    PAUSE: "🟡 PAUSE",
    KILL: "❌ KILL",
  };
  return badge ? (map[badge] || badge) : "—";
}

/**
 * Aggregate platform-level totals from campaign rows.
 */
function aggregateCampaigns(campaigns) {
  return campaigns.reduce((acc, c) => ({
    impressions: (acc.impressions || 0) + (safeNum(c.impressions) ?? 0),
    clicks: (acc.clicks || 0) + (safeNum(c.clicks) ?? 0),
    cost: (acc.cost || 0) + (safeNum(c.cost) ?? 0),
    conversions: (acc.conversions || 0) + (safeNum(c.conversions) ?? 0),
    revenue: (acc.revenue || 0) + (safeNum(c.revenue ?? c.value) ?? 0),
  }), { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 });
}

/**
 * Build a platform section (Google, Meta, or Microsoft).
 */
function buildPlatformSection(platformKey, platformLabel, platformData) {
  if (!platformData || !platformData.ok) {
    return {
      label: platformLabel,
      available: false,
      reason: platformData?.reason || "Données non disponibles ou non importées.",
      totals: null,
      campaigns: [],
      budgetAllocation: [],
      metrics: null,
      tableRows: [],
    };
  }

  // Normalize campaigns from various input shapes
  const rawCampaigns = platformData.campaigns
    || platformData.rows
    || [];
  const enriched = rawCampaigns.map(c => enrichCampaign({
    ...c,
    revenue: safeNum(c.value ?? c.revenue ?? c.conversionValue ?? null),
  }));

  // Platform totals: prefer explicit totals, fallback to aggregation
  const rawTotals = platformData.totals30d || platformData.totals || aggregateCampaigns(enriched);
  const totalCost = safeNum(rawTotals.cost ?? rawTotals.spend) ?? 0;
  const totalRevenue = safeNum(rawTotals.value ?? rawTotals.revenue) ?? 0;
  const totalConversions = safeNum(rawTotals.conversions ?? rawTotals.results) ?? 0;
  const totalClicks = safeNum(rawTotals.clicks) ?? 0;
  const totalImpressions = safeNum(rawTotals.impressions) ?? 0;

  const roas = calcROAS(totalRevenue, totalCost);
  const cpa = calcCPA(totalCost, totalConversions);
  const ctr = calcCTR(totalClicks, totalImpressions);
  const cpc = calcCPC(totalCost, totalClicks);
  const roi = calcROI(totalRevenue, totalCost);
  const convRate = calcConvRate(totalConversions, totalClicks);

  // Campaign table rows
  const totalBudget = enriched.reduce((s, c) => s + (safeNum(c.cost) ?? 0), 0);
  const tableRows = enriched.map(c => {
    const budgetPct = totalBudget > 0 ? Math.round(((safeNum(c.cost) ?? 0) / totalBudget) * 100) : null;
    return [
      c.name || "—",
      (safeNum(c.impressions) ?? 0).toLocaleString("fr-FR"),
      (safeNum(c.clicks) ?? 0).toLocaleString("fr-FR"),
      c.metrics.ctr !== null ? `${fmt(c.metrics.ctr, 1)}%` : "—",
      fmtEur(safeNum(c.cost)),
      String(safeNum(c.conversions) ?? "—"),
      c.metrics.cpa !== null ? fmtEur(c.metrics.cpa) : "—",
      c.metrics.roas !== null ? `${fmt(c.metrics.roas, 1)}x` : "—",
      budgetPct !== null ? `${budgetPct}%` : "—",
      badgeLabel(c.badge),
    ];
  });

  // Budget allocation
  const withSpend = enriched.map(c => ({
    ...c,
    adSpend: safeNum(c.cost),
    metrics: { ...c.metrics, roas: c.metrics.roas },
  }));
  const budgetAlloc = calcBudgetAllocation(withSpend, totalBudget);

  return {
    label: platformLabel,
    available: true,
    totals: { cost: totalCost, revenue: totalRevenue, conversions: totalConversions, clicks: totalClicks, impressions: totalImpressions },
    campaigns: enriched,
    budgetAllocation: budgetAlloc,
    metrics: { roas, cpa, ctr, cpc, roi, convRate },
    tableRows,
  };
}

/**
 * Build the complete Ads performance section.
 *
 * @param {object} auditResults - raw audit results from orchestrator
 * @param {object} scores - computed scores
 * @returns {object} section model
 */
export function buildAdsPerformanceComplete(auditResults, scores) {
  const adsGoogle = auditResults.modules?.adsGoogle || {};
  const adsMeta = auditResults.modules?.adsMeta || {};
  const adsMicrosoft = auditResults.modules?.adsMicrosoft || {};
  const business = auditResults.modules?.business || {};
  const trkScore = safeNum(scores.tracking) ?? 0;

  // Also support legacy adsImport shape with nested platforms
  const adsImport = auditResults.modules?.adsImport || {};
  const googleData = adsGoogle.ok ? adsGoogle : (adsImport.google || { ok: false });
  const metaData = adsMeta.ok ? adsMeta : (adsImport.meta || { ok: false });
  const msData = adsMicrosoft.ok ? adsMicrosoft : { ok: false };

  const google = buildPlatformSection("google", "Google Ads", googleData);
  const meta = buildPlatformSection("meta", "Meta Ads", metaData);
  const microsoft = buildPlatformSection("microsoft", "Microsoft Ads", msData);

  const anyAvailable = google.available || meta.available || microsoft.available;

  if (!anyAvailable) {
    return {
      id: "ads-performance-complete",
      title: "Ads Performance — Google / Meta / Microsoft (CONFIDENTIEL)",
      dataAvailable: false,
      reason: "Aucune donnée Ads importée. Exportez vos campagnes depuis Google Ads / Meta Ads / Microsoft Ads et importez-les dans l'outil.",
      intro: "Importez vos exports CSV Ads pour afficher l'analyse complète de performance et les recommandations SCALE/PAUSE/KILL.",
      summary: ["⚠️ Données Ads non disponibles"],
      findings: [],
      actions: [],
      charts: [],
      tables: [],
      evidence: [],
      isPrivate: true,
      riskLevel: "Élevé",
    };
  }

  // ── Cross-platform totals ─────────────────────────────────────────────────
  const allCampaigns = [
    ...google.campaigns.map(c => ({ ...c, platform: "Google" })),
    ...meta.campaigns.map(c => ({ ...c, platform: "Meta" })),
    ...microsoft.campaigns.map(c => ({ ...c, platform: "Microsoft" })),
  ];
  const totalSpend = [google, meta, microsoft]
    .filter(p => p.available)
    .reduce((s, p) => s + (p.totals?.cost ?? 0), 0);
  const totalRevenue = [google, meta, microsoft]
    .filter(p => p.available)
    .reduce((s, p) => s + (p.totals?.revenue ?? 0), 0);
  const totalConversions = [google, meta, microsoft]
    .filter(p => p.available)
    .reduce((s, p) => s + (p.totals?.conversions ?? 0), 0);
  const totalImpressions = [google, meta, microsoft]
    .filter(p => p.available)
    .reduce((s, p) => s + (p.totals?.impressions ?? 0), 0);

  const overallROAS = calcROAS(totalRevenue, totalSpend);
  const overallCPA = calcCPA(totalSpend, totalConversions);
  const overallROI = calcROI(totalRevenue, totalSpend);

  // ── Advanced metrics ──────────────────────────────────────────────────────
  const cogsRate = safeNum(business.cogsRate) ?? null;
  const mer = calcMER(totalRevenue, totalSpend);
  const breakEvenROAS = calcBreakEvenROAS(cogsRate);
  const cogsCost = cogsRate !== null ? cogsRate * totalRevenue : null;
  const contributionMargin = calcContributionMargin(totalRevenue, cogsCost, totalSpend);

  // CPM per platform
  const googleCPM = google.available
    ? calcCPM(google.totals?.cost, google.totals?.impressions)
    : null;
  const metaCPM = meta.available
    ? calcCPM(meta.totals?.cost, meta.totals?.impressions)
    : null;

  // Period-over-period comparison (if previous period data available)
  const prevGoogle = googleData.previousPeriod || googleData.prev || null;
  const prevMeta = metaData.previousPeriod || metaData.prev || null;
  const prevSpend = (safeNum(prevGoogle?.totals30d?.cost ?? prevGoogle?.totals?.cost) ?? 0) +
    (safeNum(prevMeta?.totals30d?.cost ?? prevMeta?.totals?.cost) ?? 0);
  const prevRevenue = (safeNum(prevGoogle?.totals30d?.value ?? prevGoogle?.totals?.value) ?? 0) +
    (safeNum(prevMeta?.totals30d?.value ?? prevMeta?.totals?.value) ?? 0);
  const hasPrevPeriod = prevSpend > 0 || prevRevenue > 0;

  const periodDeltaSpend = hasPrevPeriod ? calcPeriodDelta(totalSpend, prevSpend) : null;
  const periodDeltaRevenue = hasPrevPeriod ? calcPeriodDelta(totalRevenue, prevRevenue) : null;

  // ── Pareto 80/20 on campaigns ─────────────────────────────────────────────
  const sortedCampaignsByRevenue = [...allCampaigns]
    .filter(c => (safeNum(c.revenue ?? c.value) ?? 0) > 0)
    .sort((a, b) => (safeNum(b.revenue ?? b.value) ?? 0) - (safeNum(a.revenue ?? a.value) ?? 0));
  let runningRev = 0;
  const paretoRows = sortedCampaignsByRevenue.map(c => {
    const rev = safeNum(c.revenue ?? c.value) ?? 0;
    runningRev += rev;
    const cumPct = totalRevenue > 0 ? Math.round((runningRev / totalRevenue) * 100) : 0;
    return [
      c.name || "—",
      c.platform || "—",
      fmtEur(rev),
      c.metrics?.roas !== null ? `${fmt(c.metrics.roas, 1)}x` : "—",
      `${cumPct}%`,
      cumPct <= 80 ? "✅ Top 80%" : "—",
    ];
  });

  // ── Smart recommendations ─────────────────────────────────────────────────
  const smartCtx = {
    roas: overallROAS,
    cpa: overallCPA,
    cacTarget: safeNum(business.industryBenchmark?.cpa) ?? null,
    campaigns: allCampaigns,
    ga4DataAvailable: !!(auditResults.modules?.privateGoogle?.ga4?.ok ?? false),
    adsDataAvailable: true,
  };
  const smartRecs = buildSmartRecommendations(smartCtx);

  // ── Findings ──────────────────────────────────────────────────────────────
  const findings = [];

  if (anyAvailable) {
    findings.push({
      observation: `Budget Ads total : ${fmtEur(totalSpend)} — ROAS global : ${overallROAS !== null ? fmt(overallROAS, 1) + "x" : "—"} — ROI : ${overallROI !== null ? fmt(overallROI, 0) + "%" : "—"}`,
      source: "Import CSV Google Ads / Meta Ads",
      importance: "ROAS > 3.5x recommandé pour une rentabilité après COGS. ROI > 200% pour e-commerce.",
      status: overallROAS !== null ? (overallROAS >= 3.5 ? "ok" : overallROAS >= 2.0 ? "warn" : "bad") : "info",
    });
  }

  if (mer !== null) {
    findings.push({
      observation: `MER (Marketing Efficiency Ratio) : ${fmt(mer, 2)}x — vision holistique de l'efficacité media`,
      source: "Calcul : Revenue total / Total Ad Spend",
      importance: mer >= 3.0 ? "MER excellent — rentabilité globale media confirmée." : mer >= 2.0 ? "MER correct — marge d'amélioration possible." : "MER faible — revoir l'allocation budget media.",
      status: mer >= 3.0 ? "ok" : mer >= 2.0 ? "warn" : "bad",
    });
  }

  if (breakEvenROAS !== null) {
    findings.push({
      observation: `Break-even ROAS : ${fmt(breakEvenROAS, 2)}x (COGS ${Math.round((cogsRate ?? 0) * 100)}%) — seuil minimum de rentabilité`,
      source: "Calcul : 1 / (1 - COGS%)",
      importance: `Toute campagne avec ROAS < ${fmt(breakEvenROAS, 2)}x est en perte nette après marge brute.`,
      status: "info",
    });
  }

  const killCampaigns = allCampaigns.filter(c => c.badge === "KILL");
  if (killCampaigns.length > 0) {
    const wastedBudget = killCampaigns.reduce((s, c) => s + (safeNum(c.cost) ?? 0), 0);
    findings.push({
      observation: `${killCampaigns.length} campagne(s) ROAS < 1 à couper — budget gaspillé : ${fmtEur(wastedBudget)}/mois`,
      source: `Campagnes : ${killCampaigns.slice(0, 3).map(c => c.name).join(", ")}`,
      importance: "Ces campagnes coûtent plus qu'elles ne rapportent. Pause immédiate recommandée.",
      status: "bad",
    });
  }

  const scaleCampaigns = allCampaigns.filter(c => c.badge === "SCALE");
  if (scaleCampaigns.length > 0) {
    findings.push({
      observation: `${scaleCampaigns.length} campagne(s) à scaler (ROAS ≥ 3x) — sous-investies`,
      source: `Campagnes : ${scaleCampaigns.slice(0, 3).map(c => c.name).join(", ")}`,
      importance: "Ces campagnes performent bien et méritent plus de budget pour maximiser le retour.",
      status: "ok",
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  const actions = [];

  if (killCampaigns.length > 0) {
    const wastedBudget = killCampaigns.reduce((s, c) => s + (safeNum(c.cost) ?? 0), 0);
    actions.push({
      title: `Pauser ${killCampaigns.length} campagne(s) KILL (ROAS < 1)`,
      why: `${fmtEur(wastedBudget)}/mois de budget gaspillé sur ${killCampaigns.map(c => c.name).join(", ")}.`,
      evidence: `ROAS : ${killCampaigns.map(c => c.metrics?.roas !== null ? fmt(c.metrics.roas, 1) + "x" : "—").join(", ")}`,
      impact: `Récupération de ${fmtEur(wastedBudget)}/mois à réallouer aux campagnes SCALE.`,
      effort: "S",
      risk: "low",
      owner: "client",
      deadline: "7j",
      action: "Pauser les campagnes identifiées dans le dashboard Ads. Réallouer le budget aux campagnes SCALE.",
    });
  }

  if (scaleCampaigns.length > 0 && (killCampaigns.length > 0 || totalSpend > 0)) {
    actions.push({
      title: `Augmenter le budget des campagnes SCALE (${scaleCampaigns.length} campagne(s))`,
      why: `Ces campagnes ont un ROAS ≥ 3x — chaque € supplémentaire génère ≥ 3x de retour.`,
      evidence: `ROAS : ${scaleCampaigns.slice(0, 3).map(c => c.metrics?.roas !== null ? fmt(c.metrics.roas, 1) + "x" : "—").join(", ")}`,
      impact: "Maximisation du ROAS global sans augmenter le budget total.",
      effort: "S",
      risk: "low",
      owner: "client",
      deadline: "7j",
      action: "Augmenter les enchères / budgets journaliers des campagnes SCALE. Dupliquer les meilleures annonces.",
    });
  }

  actions.push({
    title: "Activer Smart Bidding (tCPA / tROAS) sur les campagnes avec historique",
    why: "Les enchères automatiques Google/Meta optimisent en temps réel sur vos données de conversion.",
    evidence: "Recommandation Google Ads — nécessite ≥ 30 conversions/30j par campagne.",
    impact: "+12-20% d'efficacité ROAS estimé en 4-8 semaines d'apprentissage.",
    effort: "S",
    risk: "low",
    owner: "StratAds",
    deadline: "30j",
    action: "Dans Google Ads : Campagne → Paramètres → Stratégie d'enchères → cible-ROAS.",
  });

  // ── Tables ────────────────────────────────────────────────────────────────
  const tables = [];

  const platformHeaders = ["Plateforme", "Budget", "Impressions", "Clics", "CTR", "Conv.", "CPA", "Revenue", "ROAS", "ROI", "CPM"];
  const platformRows = [
    ...(google.available ? [[
      google.label,
      fmtEur(google.totals?.cost),
      (google.totals?.impressions ?? 0).toLocaleString("fr-FR"),
      (google.totals?.clicks ?? 0).toLocaleString("fr-FR"),
      google.metrics?.ctr !== null ? `${fmt(google.metrics.ctr, 1)}%` : "—",
      String(google.totals?.conversions ?? "—"),
      google.metrics?.cpa !== null ? fmtEur(google.metrics.cpa) : "—",
      fmtEur(google.totals?.revenue),
      google.metrics?.roas !== null ? `${fmt(google.metrics.roas, 1)}x` : "—",
      google.metrics?.roi !== null ? `${fmt(google.metrics.roi, 0)}%` : "—",
      googleCPM !== null ? fmtEur(googleCPM) : "—",
    ]] : []),
    ...(meta.available ? [[
      meta.label,
      fmtEur(meta.totals?.cost),
      (meta.totals?.impressions ?? 0).toLocaleString("fr-FR"),
      (meta.totals?.clicks ?? 0).toLocaleString("fr-FR"),
      meta.metrics?.ctr !== null ? `${fmt(meta.metrics.ctr, 1)}%` : "—",
      String(meta.totals?.conversions ?? "—"),
      meta.metrics?.cpa !== null ? fmtEur(meta.metrics.cpa) : "—",
      fmtEur(meta.totals?.revenue),
      meta.metrics?.roas !== null ? `${fmt(meta.metrics.roas, 1)}x` : "—",
      meta.metrics?.roi !== null ? `${fmt(meta.metrics.roi, 0)}%` : "—",
      metaCPM !== null ? fmtEur(metaCPM) : "—",
    ]] : []),
    ...(microsoft.available ? [[
      microsoft.label,
      fmtEur(microsoft.totals?.cost),
      (microsoft.totals?.impressions ?? 0).toLocaleString("fr-FR"),
      (microsoft.totals?.clicks ?? 0).toLocaleString("fr-FR"),
      microsoft.metrics?.ctr !== null ? `${fmt(microsoft.metrics.ctr, 1)}%` : "—",
      String(microsoft.totals?.conversions ?? "—"),
      microsoft.metrics?.cpa !== null ? fmtEur(microsoft.metrics.cpa) : "—",
      fmtEur(microsoft.totals?.revenue),
      microsoft.metrics?.roas !== null ? `${fmt(microsoft.metrics.roas, 1)}x` : "—",
      microsoft.metrics?.roi !== null ? `${fmt(microsoft.metrics.roi, 0)}%` : "—",
      "—",
    ]] : []),
  ];

  if (platformRows.length > 0) {
    tables.push({
      id: "ads-platform-summary",
      title: "Synthèse par plateforme",
      headers: platformHeaders,
      rows: platformRows,
    });
  }

  // Period comparison table
  if (hasPrevPeriod) {
    tables.push({
      id: "ads-period-comparison",
      title: "Comparaison période N vs N-1",
      headers: ["Métrique", "Période actuelle", "Période précédente", "Delta", "Δ%"],
      rows: [
        [
          "Budget total",
          fmtEur(totalSpend),
          fmtEur(prevSpend),
          periodDeltaSpend ? (periodDeltaSpend.delta >= 0 ? `+${fmtEur(periodDeltaSpend.delta)}` : fmtEur(periodDeltaSpend.delta)) : "—",
          periodDeltaSpend?.deltaPct !== null ? `${periodDeltaSpend.deltaPct > 0 ? "+" : ""}${periodDeltaSpend.deltaPct}%` : "—",
        ],
        [
          "Revenue total",
          fmtEur(totalRevenue),
          fmtEur(prevRevenue),
          periodDeltaRevenue ? (periodDeltaRevenue.delta >= 0 ? `+${fmtEur(periodDeltaRevenue.delta)}` : fmtEur(periodDeltaRevenue.delta)) : "—",
          periodDeltaRevenue?.deltaPct !== null ? `${periodDeltaRevenue.deltaPct > 0 ? "+" : ""}${periodDeltaRevenue.deltaPct}%` : "—",
        ],
      ],
    });
  }

  const campaignHeaders = ["Campagne", "Impressions", "Clics", "CTR", "Coût", "Conv.", "CPA", "ROAS", "Budget %", "Action"];

  if (google.available && google.tableRows.length > 0) {
    tables.push({
      id: "google-campaigns",
      title: "Google Ads — Campagnes",
      headers: campaignHeaders,
      rows: google.tableRows,
    });
  }

  if (meta.available && meta.tableRows.length > 0) {
    tables.push({
      id: "meta-campaigns",
      title: "Meta Ads — Campagnes",
      headers: campaignHeaders,
      rows: meta.tableRows,
    });
  }

  if (microsoft.available && microsoft.tableRows.length > 0) {
    tables.push({
      id: "microsoft-campaigns",
      title: "Microsoft Ads — Campagnes",
      headers: campaignHeaders,
      rows: microsoft.tableRows,
    });
  }

  // Pareto 80/20 table
  if (paretoRows.length > 0) {
    tables.push({
      id: "pareto-campaigns",
      title: "Pareto 80/20 — Campagnes par revenue (triées)",
      headers: ["Campagne", "Plateforme", "Revenue", "ROAS", "Cumul", "Pareto"],
      rows: paretoRows,
    });
  }

  // Budget allocation optimization table
  const allWithAlloc = [
    ...google.budgetAllocation.map(c => ({ ...c, platform: "Google" })),
    ...meta.budgetAllocation.map(c => ({ ...c, platform: "Meta" })),
    ...microsoft.budgetAllocation.map(c => ({ ...c, platform: "Microsoft" })),
  ].filter(c => c.adSpend > 0 || c.optimalBudget !== null);

  if (allWithAlloc.length > 0) {
    tables.push({
      id: "budget-allocation-optimization",
      title: "Optimisation allocation budget",
      headers: ["Campagne", "Plateforme", "Budget actuel", "ROAS actuel", "Budget optimal", "Delta"],
      rows: allWithAlloc.map(c => [
        c.name || "—",
        c.platform,
        fmtEur(c.adSpend),
        c.metrics?.roas !== null ? `${fmt(c.metrics.roas, 1)}x` : "—",
        c.optimalBudget !== null ? fmtEur(c.optimalBudget) : "—",
        c.budgetDelta !== null ? (c.budgetDelta >= 0 ? `+${fmtEur(c.budgetDelta)}` : fmtEur(c.budgetDelta)) : "—",
      ]),
    });
  }

  // ── Charts ────────────────────────────────────────────────────────────────
  const charts = [];
  const availPlatforms = [google, meta, microsoft].filter(p => p.available);
  if (availPlatforms.length > 1) {
    charts.push({
      type: "spend-value-bars",
      title: "Budget vs Revenue par plateforme",
      data: {
        items: availPlatforms.flatMap(p => [
          { label: `${p.label} — Budget`, value: p.totals?.cost ?? 0 },
          { label: `${p.label} — Revenue`, value: p.totals?.revenue ?? 0 },
        ]),
      },
    });
  }

  if (paretoRows.length > 0) {
    charts.push({
      type: "pareto-campaigns",
      title: "Pareto 80/20 — Revenue par campagne",
      data: {
        items: sortedCampaignsByRevenue.slice(0, 10).map(c => ({
          label: c.name || "—",
          value: safeNum(c.revenue ?? c.value) ?? 0,
        })),
      },
    });
  }

  // ── Looker-style dashboard metadata ──────────────────────────────────────
  const lookerDashboard = {
    title: "Ads Performance Dashboard",
    dateRange: "30 derniers jours",
    filters: {
      channels: availPlatforms.map(p => p.label),
      campaigns: allCampaigns.map(c => c.name).filter(Boolean),
      platforms: availPlatforms.map(p => p.label),
    },
    kpis: [
      { label: "Budget total", value: fmtEur(totalSpend), delta: periodDeltaSpend ? `${periodDeltaSpend.deltaPct !== null ? (periodDeltaSpend.deltaPct > 0 ? "+" : "") + periodDeltaSpend.deltaPct + "%" : "—"} vs N-1` : null, trendUp: periodDeltaSpend?.deltaPct != null ? periodDeltaSpend.deltaPct <= 0 : null },
      { label: "Revenue total", value: fmtEur(totalRevenue), delta: periodDeltaRevenue ? `${periodDeltaRevenue.deltaPct !== null ? (periodDeltaRevenue.deltaPct > 0 ? "+" : "") + periodDeltaRevenue.deltaPct + "%" : "—"} vs N-1` : null, trendUp: periodDeltaRevenue?.deltaPct != null ? periodDeltaRevenue.deltaPct >= 0 : null },
      { label: "ROAS global", value: overallROAS !== null ? `${fmt(overallROAS, 2)}x` : "—" },
      { label: "CPA moyen", value: overallCPA !== null ? fmtEur(overallCPA) : "—" },
      { label: "ROI", value: overallROI !== null ? `${fmt(overallROI, 0)}%` : "—" },
      { label: "MER", value: mer !== null ? `${fmt(mer, 2)}x` : "—" },
      { label: "Break-even ROAS", value: breakEvenROAS !== null ? `${fmt(breakEvenROAS, 2)}x` : "—", trend: cogsRate !== null ? `COGS ${Math.round(cogsRate * 100)}%` : null },
      { label: "Contribution Margin", value: contributionMargin !== null ? fmtEur(contributionMargin) : "—" },
      { label: "Conversions", value: String(totalConversions) },
    ],
  };

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary = [
    `Budget Ads total : ${fmtEur(totalSpend)} — ROAS global : ${overallROAS !== null ? fmt(overallROAS, 1) + "x" : "—"}`,
    `${allCampaigns.filter(c => c.badge === "SCALE").length} campagne(s) à SCALE, ${allCampaigns.filter(c => c.badge === "KILL").length} à KILL`,
    overallCPA !== null ? `CPA moyen : ${fmtEur(overallCPA)}` : "CPA : données insuffisantes",
    mer !== null ? `MER : ${fmt(mer, 2)}x` : "",
    smartRecs.filter(r => r.priority === "CRITICAL").length > 0
      ? `⚠️ ${smartRecs.filter(r => r.priority === "CRITICAL").length} alerte(s) CRITIQUE(S) détectée(s)`
      : "✅ Aucune alerte critique",
  ].filter(Boolean);

  return {
    id: "ads-performance-complete",
    title: "Ads Performance — Google / Meta / Microsoft (CONFIDENTIEL)",
    intro: "Analyse complète des campagnes Ads : ROAS, CPA, CTR, ROI, MER, break-even ROAS, Pareto 80/20 par plateforme et par campagne. Recommandations SCALE/TEST/PAUSE/KILL basées sur les données réelles.",
    summary,
    findings,
    actions,
    charts,
    tables,
    evidence: [],
    isPrivate: true,
    lookerDashboard,
    smartRecommendations: smartRecs,
    platformSummary: { google, meta, microsoft },
    riskLevel: killCampaigns.length > 0 ? "Élevé" : overallROAS !== null && overallROAS < 2 ? "Moyen" : "Faible",
  };
}
