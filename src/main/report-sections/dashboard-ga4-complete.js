/**
 * Dashboard GA4 Complete — Section Builder
 * Builds a comprehensive GA4 performance dashboard section with all metrics.
 */

import {
  calcCPA, calcROAS, calcConvRate, calcLTV, calcCAC, calcLTVCACRatio,
  calcPaybackPeriod, calcChannelMix, enrichChannel, calcMER, calcBreakEvenROAS,
  calcContributionMargin, calcPeriodDelta,
} from "../metrics-calculator.js";
import { buildSmartRecommendations } from "../smart-recommendations.js";

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

function roasBadge(roas) {
  if (roas === null) return "—";
  if (roas >= 3.0) return `${fmt(roas, 1)}x ✅`;
  if (roas >= 2.0) return `${fmt(roas, 1)}x ⚠️`;
  if (roas >= 1.0) return `${fmt(roas, 1)}x 🟡`;
  return `${fmt(roas, 1)}x ❌`;
}

function ltvCACBadge(ratio) {
  if (ratio === null) return "—";
  if (ratio >= 10) return `${fmt(ratio, 1)}x ✅ Excellent`;
  if (ratio >= 3) return `${fmt(ratio, 1)}x ✅ Bon`;
  if (ratio >= 1) return `${fmt(ratio, 1)}x ⚠️ Faible`;
  return `${fmt(ratio, 1)}x ❌ Négatif`;
}

/**
 * Build the complete GA4 performance dashboard section.
 *
 * @param {object} auditResults - raw audit results from orchestrator
 * @param {object} scores - computed scores
 * @returns {object} section model
 */
export function buildGa4PerformanceDashboard(auditResults, scores) {
  const ga4 = auditResults.modules?.privateGoogle?.ga4 || {};
  const business = auditResults.modules?.business || {};
  const adsGoogle = auditResults.modules?.adsGoogle || {};
  const adsMeta = auditResults.modules?.adsMeta || {};
  const trkScore = safeNum(scores.tracking) ?? 0;

  const rawChannels = ga4.channels || ga4.rows || [];
  const totals = ga4.totals || {};
  const topPages = (ga4.topPages || []).slice(0, 10);
  const conversions = ga4.conversions || [];

  // Strict validation: require ok:true AND real data rows — never render on stale/failed data
  const ga4Available = !!ga4.ok && (rawChannels.length > 0 || !!totals.sessions);

  if (!ga4Available) {
    return {
      id: "ga4-performance-dashboard",
      title: "GA4 Performance Dashboard (CONFIDENTIEL)",
      dataAvailable: false,
      reason: "Données GA4 indisponibles — accès API (service account) requis pour cette section.",
      intro: "Configurez l'accès GA4 via service account pour activer ce dashboard complet.",
      summary: ["⚠️ Données GA4 non disponibles"],
      findings: [],
      actions: [],
      charts: [],
      tables: [],
      evidence: [],
      isPrivate: true,
      riskLevel: "Élevé",
    };
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalSessions = safeNum(totals.sessions) ?? rawChannels.reduce((s, c) => s + (safeNum(c.sessions) ?? 0), 0);
  const totalUsers = safeNum(totals.users) ?? rawChannels.reduce((s, c) => s + (safeNum(c.users) ?? 0), 0);
  const totalConversions = safeNum(totals.conversions) ?? rawChannels.reduce((s, c) => s + (safeNum(c.conversions) ?? 0), 0);
  const totalRevenue = safeNum(totals.revenue) ?? rawChannels.reduce((s, c) => s + (safeNum(c.revenue) ?? 0), 0);

  // ── Business params ───────────────────────────────────────────────────────
  const aov = safeNum(business.aov) ?? (totalConversions > 0 ? totalRevenue / totalConversions : null);
  const purchaseFreq = safeNum(business.purchaseFrequency) ?? 2.0;
  const retentionRate = safeNum(business.retentionRate) ?? 0.6;
  const convRateBenchmark = safeNum(business.industryBenchmark?.convRate) ?? 0.025;

  // ── Key metrics ───────────────────────────────────────────────────────────
  const overallConvRate = calcConvRate(totalConversions, totalSessions);
  const ltv = calcLTV(aov, purchaseFreq, retentionRate);

  // ── Channel enrichment ────────────────────────────────────────────────────
  const adsSpendByChannel = {};
  if (adsGoogle.ok) {
    const gAdsTotals = adsGoogle.totals30d || {};
    adsSpendByChannel["Paid Search"] = safeNum(gAdsTotals.cost) ?? 0;
  }
  if (adsMeta.ok) {
    const mAdsTotals = adsMeta.totals30d || {};
    adsSpendByChannel["Social"] = safeNum(mAdsTotals.cost) ?? 0;
  }

  const channelsMixed = calcChannelMix(rawChannels);
  const enrichedChannels = channelsMixed.map(c => {
    const spend = adsSpendByChannel[c.channel] ?? null;
    return enrichChannel(c, spend);
  });

  // ── LTV/CAC by channel ────────────────────────────────────────────────────
  const channelRows = enrichedChannels.map(c => {
    const cac = c.metrics?.cac;
    const roas = c.metrics?.roas;
    const ltvCacRatio = ltv !== null && cac !== null ? calcLTVCACRatio(ltv, cac) : null;
    const payback = ltv !== null && cac !== null && totalConversions > 0
      ? calcPaybackPeriod(cac, aov !== null ? aov * purchaseFreq / 12 : null)
      : null;

    return [
      c.channel,
      (safeNum(c.sessions) ?? 0).toLocaleString("fr-FR"),
      (safeNum(c.users) ?? 0).toLocaleString("fr-FR"),
      String(safeNum(c.conversions) ?? "—"),
      overallConvRate !== null ? `${fmt(c.metrics?.convRate ?? calcConvRate(safeNum(c.conversions), safeNum(c.sessions)), 1)}%` : "—",
      totalRevenue > 0 ? fmtEur(safeNum(c.revenue)) : "—",
      cac !== null ? fmtEur(cac) : "—",
      roasBadge(roas),
      ltvCacRatio !== null ? ltvCACBadge(ltvCacRatio) : "—",
      `${safeNum(c.sharePct) ?? "—"}%`,
    ];
  });

  // ── Smart recommendations context ─────────────────────────────────────────
  const smartCtx = {
    convRate: overallConvRate,
    convRateBenchmark: convRateBenchmark * 100,
    ga4DataAvailable: true,
    adsDataAvailable: !!(adsGoogle.ok || adsMeta.ok),
  };
  const smartRecs = buildSmartRecommendations(smartCtx);

  // ── Advanced business metrics ─────────────────────────────────────────────
  // Total ad spend across platforms (for MER calculation)
  const totalAdSpend = Object.values(adsSpendByChannel).reduce((s, v) => s + (v ?? 0), 0);
  const mer = totalAdSpend > 0 ? calcMER(totalRevenue, totalAdSpend) : null;

  // Break-even ROAS (requires COGS rate from business data)
  const cogsRate = safeNum(business.cogsRate) ?? null;
  const breakEvenROAS = calcBreakEvenROAS(cogsRate);

  // Contribution margin (Revenue - COGS - AdSpend)
  const cogsCost = cogsRate !== null ? (cogsRate * totalRevenue) : null;
  const contributionMargin = calcContributionMargin(
    totalRevenue,
    cogsCost,
    totalAdSpend > 0 ? totalAdSpend : null
  );

  // Period-over-period delta (if previous period data available)
  const prevTotals = ga4.previousPeriod || ga4.prev || null;
  const periodDeltaSessions = prevTotals ? calcPeriodDelta(totalSessions, safeNum(prevTotals.sessions)) : null;
  const periodDeltaRevenue = prevTotals ? calcPeriodDelta(totalRevenue, safeNum(prevTotals.revenue)) : null;
  const periodDeltaConversions = prevTotals ? calcPeriodDelta(totalConversions, safeNum(prevTotals.conversions)) : null;

  // ── Pareto 80/20 analysis ─────────────────────────────────────────────────
  // Sort channels by revenue desc, find which ones contribute 80% of revenue
  const sortedByRevenue = [...enrichedChannels]
    .filter(c => (safeNum(c.revenue) ?? 0) > 0)
    .sort((a, b) => (safeNum(b.revenue) ?? 0) - (safeNum(a.revenue) ?? 0));
  const paretoCutoff80 = totalRevenue > 0 ? totalRevenue * 0.8 : 0;
  let runningRevenue = 0;
  const paretoRows = sortedByRevenue.map((c, i) => {
    runningRevenue += safeNum(c.revenue) ?? 0;
    const cumPct = totalRevenue > 0 ? Math.round((runningRevenue / totalRevenue) * 100) : 0;
    const is80 = cumPct <= 80 || runningRevenue - (safeNum(c.revenue) ?? 0) < paretoCutoff80;
    return [
      c.channel,
      fmtEur(safeNum(c.revenue)),
      `${safeNum(c.sharePct) ?? "—"}%`,
      `${cumPct}%`,
      is80 ? "✅ Top 80%" : "—",
    ];
  });

  // ── Funnel data (if available in GA4 data) ────────────────────────────────
  const funnelSteps = ga4.funnel || [];
  const hasFunnel = Array.isArray(funnelSteps) && funnelSteps.length > 0;

  // ── Looker Dashboard ──────────────────────────────────────────────────────
  const lookerDashboard = {
    title: "GA4 Performance Dashboard",
    dateRange: ga4.range
      ? `${ga4.range.startDate} → ${ga4.range.endDate}`
      : "30 derniers jours",
    // Available filter dimensions for the dashboard
    filters: {
      dateRange: ga4.range || null,
      channels: enrichedChannels.map(c => c.channel),
      countries: ga4.countries || [],
      devices: ga4.devices || [],
    },
    kpis: [
      {
        label: "Sessions totales",
        value: totalSessions.toLocaleString("fr-FR"),
        delta: periodDeltaSessions ? `${periodDeltaSessions.deltaPct !== null ? (periodDeltaSessions.deltaPct > 0 ? "+" : "") + periodDeltaSessions.deltaPct + "%" : "—"} vs période préc.` : null,
        trendUp: periodDeltaSessions?.deltaPct != null ? periodDeltaSessions.deltaPct >= 0 : null,
      },
      {
        label: "Utilisateurs uniques",
        value: totalUsers.toLocaleString("fr-FR"),
      },
      {
        label: "Conversions totales",
        value: String(totalConversions),
        delta: periodDeltaConversions ? `${periodDeltaConversions.deltaPct !== null ? (periodDeltaConversions.deltaPct > 0 ? "+" : "") + periodDeltaConversions.deltaPct + "%" : "—"} vs période préc.` : null,
        trendUp: periodDeltaConversions?.deltaPct != null ? periodDeltaConversions.deltaPct >= 0 : null,
      },
      {
        label: "Revenue total",
        value: totalRevenue > 0 ? fmtEur(totalRevenue) : "—",
        delta: periodDeltaRevenue ? `${periodDeltaRevenue.deltaPct !== null ? (periodDeltaRevenue.deltaPct > 0 ? "+" : "") + periodDeltaRevenue.deltaPct + "%" : "—"} vs période préc.` : null,
        trendUp: periodDeltaRevenue?.deltaPct != null ? periodDeltaRevenue.deltaPct >= 0 : null,
      },
      {
        label: "Conv. Rate moyen",
        value: overallConvRate !== null ? `${fmt(overallConvRate, 1)}%` : "—",
        trend: convRateBenchmark ? `Benchmark: ${fmt(convRateBenchmark * 100, 1)}%` : null,
        trendUp: overallConvRate !== null ? overallConvRate >= convRateBenchmark * 100 : null,
      },
      { label: "LTV estimée", value: ltv !== null ? fmtEur(ltv) : "—" },
      { label: "MER (global)", value: mer !== null ? `${fmt(mer, 2)}x` : "—" },
      {
        label: "Break-even ROAS",
        value: breakEvenROAS !== null ? `${fmt(breakEvenROAS, 2)}x` : "—",
        trend: cogsRate !== null ? `COGS ${Math.round(cogsRate * 100)}%` : null,
      },
      {
        label: "Contribution Margin",
        value: contributionMargin !== null ? fmtEur(contributionMargin) : "—",
      },
    ],
    channelTable: {
      title: "Performance par canal d'acquisition",
      headers: ["Canal", "Sessions", "Users", "Conv.", "Conv.%", "Revenue", "CAC", "ROAS", "LTV/CAC", "Part"],
      rows: enrichedChannels.map(c => ({
        channel: c.channel,
        sessions: safeNum(c.sessions) ?? 0,
        share: `${safeNum(c.sharePct) ?? "—"}%`,
        convRate: c.metrics?.convRate ?? null,
        revenue: safeNum(c.revenue) ?? 0,
      })),
    },
    conversionTable: conversions.length > 0 ? {
      title: "Événements de conversion",
      headers: ["Événement", "Occurrences", "Valeur totale", "Taux"],
      rows: conversions.map(c => ({
        name: c.name,
        count: c.count ?? 0,
        value: c.value ?? 0,
        rate: c.rate ?? null,
      })),
    } : null,
    // Pareto 80/20 data for charting
    paretoData: paretoRows.length > 0 ? {
      title: "Pareto 80/20 — canaux par revenue",
      items: sortedByRevenue.map(c => ({ label: c.channel, value: safeNum(c.revenue) ?? 0 })),
    } : null,
    // Funnel data if available
    funnelData: hasFunnel ? {
      title: "Entonnoir de conversion",
      steps: funnelSteps,
    } : null,
    // Period comparison
    periodComparison: prevTotals ? {
      current: { sessions: totalSessions, revenue: totalRevenue, conversions: totalConversions },
      previous: prevTotals,
      deltas: {
        sessions: periodDeltaSessions,
        revenue: periodDeltaRevenue,
        conversions: periodDeltaConversions,
      },
    } : null,
  };

  // ── Findings ──────────────────────────────────────────────────────────────
  const findings = [];

  findings.push({
    observation: `${totalConversions} conversions — Conv. Rate : ${overallConvRate !== null ? fmt(overallConvRate, 1) + "%" : "—"} (benchmark : ${fmt(convRateBenchmark * 100, 1)}%)`,
    source: "GA4 — données propriétaires",
    importance: overallConvRate !== null && overallConvRate < convRateBenchmark * 100
      ? `En dessous du benchmark (${fmt(convRateBenchmark * 100, 1)}%) — opportunité de ${fmtEur((convRateBenchmark * 100 - overallConvRate) * totalSessions / 100)} revenus additionnels`
      : "Conv. rate dans les normes secteur.",
    status: overallConvRate !== null && overallConvRate >= convRateBenchmark * 100 ? "ok" : "warn",
  });

  if (mer !== null) {
    findings.push({
      observation: `MER (Marketing Efficiency Ratio) : ${fmt(mer, 2)}x — ${fmtEur(totalRevenue)} revenue / ${fmtEur(totalAdSpend)} ad spend`,
      source: "GA4 Revenue + exports Ads",
      importance: mer >= 3.0 ? "MER excellent — rentabilité globale media confirmée." : mer >= 2.0 ? "MER correct — marge d'amélioration possible." : "MER faible — revoir l'allocation budget media.",
      status: mer >= 3.0 ? "ok" : mer >= 2.0 ? "warn" : "bad",
    });
  }

  if (breakEvenROAS !== null) {
    findings.push({
      observation: `Break-even ROAS : ${fmt(breakEvenROAS, 2)}x (COGS ${Math.round((cogsRate ?? 0) * 100)}%) — seuil de rentabilité ad spend`,
      source: "Calcul : 1 / (1 - COGS%)",
      importance: `Toute campagne avec ROAS < ${fmt(breakEvenROAS, 2)}x est en perte nette après COGS.`,
      status: "info",
    });
  }

  if (ltv !== null) {
    findings.push({
      observation: `LTV estimée : ${fmtEur(ltv)} (AOV ${fmtEur(aov)}, fréquence ${purchaseFreq}x/an, rétention ${Math.round(retentionRate * 100)}%)`,
      source: "Calcul LTV = AOV × Fréquence × (1 / Churn)",
      importance: "La LTV est le plafond maximal pour le CAC. LTV/CAC > 3x requis pour une acquisition rentable à long terme.",
      status: "info",
    });
  }

  const topChannel = [...enrichedChannels].sort((a, b) => (safeNum(b.revenue) ?? 0) - (safeNum(a.revenue) ?? 0))[0];
  if (topChannel) {
    findings.push({
      observation: `Canal top-revenue : ${topChannel.channel} — ${fmtEur(safeNum(topChannel.revenue))} (${safeNum(topChannel.sharePct)}% du trafic)`,
      source: "GA4 — rapport canaux d'acquisition",
      importance: "Canal prioritaire pour les investissements media. Protéger et scaler en priorité.",
      status: "ok",
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  const actions = [];

  if (overallConvRate !== null && overallConvRate < convRateBenchmark * 100) {
    actions.push({
      title: `Optimiser le taux de conversion (${fmt(overallConvRate, 1)}% → ${fmt(convRateBenchmark * 100, 1)}%)`,
      why: `Conv. Rate ${fmt(overallConvRate, 1)}% vs benchmark ${fmt(convRateBenchmark * 100, 1)}% — potentiel d'amélioration.`,
      evidence: `GA4 : ${totalSessions.toLocaleString("fr-FR")} sessions, ${totalConversions} conversions`,
      impact: `+${fmt(convRateBenchmark * 100 - overallConvRate, 1)}% conv rate = +${fmtEur(Math.round((convRateBenchmark * 100 - overallConvRate) / 100 * totalSessions * (totalRevenue / totalConversions || 0)))} revenus/mois`,
      effort: "M",
      risk: "medium",
      owner: "client",
      deadline: "30j",
      action: "Audit UX landing pages, simplification checkout, tests A/B CTA.",
    });
  }

  actions.push({
    title: "Activer GA4 Enhanced Conversions pour améliorer la précision",
    why: "Les Enhanced Conversions augmentent le taux de comptage de +15–30% (first-party data).",
    evidence: "GA4 — rapport conversions",
    impact: "Meilleure allocation budget, ROAS plus précis, ciblage amélioré",
    effort: "S",
    risk: "low",
    owner: "StratAds",
    deadline: "7j",
    action: "Configurer Enhanced Conversions dans GA4 et Google Ads via GTM.",
  });

  // ── LTV/CAC table ─────────────────────────────────────────────────────────
  const ltvCacRows = enrichedChannels
    .filter(c => c.metrics?.cac !== null)
    .map(c => {
      const cac = c.metrics.cac;
      const ltvCacRatio = ltv !== null ? calcLTVCACRatio(ltv, cac) : null;
      const paybackMonths = ltv !== null && cac !== null && aov !== null
        ? calcPaybackPeriod(cac, aov * purchaseFreq / 12)
        : null;
      return [
        c.channel,
        fmtEur(cac),
        ltv !== null ? fmtEur(ltv) : "—",
        ltvCacRatio !== null ? ltvCACBadge(ltvCacRatio) : "—",
        paybackMonths !== null ? `${fmt(paybackMonths, 1)} mois` : "—",
      ];
    });

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary = [
    `${enrichedChannels.length} canaux analysés — ${totalSessions.toLocaleString("fr-FR")} sessions`,
    `Conv. Rate : ${overallConvRate !== null ? fmt(overallConvRate, 1) + "%" : "—"} (benchmark : ${fmt(convRateBenchmark * 100, 1)}%)`,
    ltv !== null ? `LTV estimée : ${fmtEur(ltv)}` : "LTV : données insuffisantes",
    mer !== null ? `MER : ${fmt(mer, 2)}x` : "",
    smartRecs.filter(r => r.priority === "CRITICAL").length > 0
      ? `⚠️ ${smartRecs.filter(r => r.priority === "CRITICAL").length} recommandation(s) CRITIQUE(S)`
      : "✅ Pas d'alerte critique sur les données GA4",
  ].filter(Boolean);

  return {
    id: "ga4-performance-dashboard",
    title: "GA4 Performance Dashboard (CONFIDENTIEL)",
    intro: "Dashboard complet : canaux d'acquisition, métriques business (ROAS, CPA, CAC, LTV, MER, break-even ROAS), conv. rate par canal, Pareto 80/20 et recommandations smart.",
    summary,
    findings,
    actions,
    charts: [
      {
        type: "channel-bars",
        title: "Sessions par canal d'acquisition",
        data: { items: enrichedChannels.map(c => ({ label: c.channel, value: safeNum(c.sessions) ?? 0 })) },
      },
      ...(paretoRows.length > 0 ? [{
        type: "pareto-campaigns",
        title: "Pareto 80/20 — Revenue par canal",
        data: { items: sortedByRevenue.map(c => ({ label: c.channel, value: safeNum(c.revenue) ?? 0 })) },
      }] : []),
      ...(hasFunnel ? [{
        type: "funnel",
        title: "Entonnoir de conversion",
        data: { steps: funnelSteps },
      }] : []),
    ],
    tables: [
      {
        id: "ga4-channel-metrics",
        title: "Performance par canal — Métriques complètes",
        headers: ["Canal", "Sessions", "Users", "Conv.", "Conv.%", "Revenue", "CAC", "ROAS", "LTV/CAC", "Part"],
        rows: channelRows,
      },
      ...(ltvCacRows.length > 0 ? [{
        id: "ltv-cac-by-channel",
        title: "LTV / CAC par canal",
        headers: ["Canal", "CAC", "LTV", "LTV/CAC", "Payback"],
        rows: ltvCacRows,
      }] : []),
      ...(paretoRows.length > 0 ? [{
        id: "pareto-channels",
        title: "Pareto 80/20 — Canaux par revenue (triés)",
        headers: ["Canal", "Revenue", "Part", "Cumul", "Pareto"],
        rows: paretoRows,
      }] : []),
      ...(conversions.length > 0 ? [{
        id: "ga4-conversions-detail",
        title: "Événements de conversion",
        headers: ["Événement", "Occurrences", "Valeur totale (€)", "Taux"],
        rows: conversions.map(c => [c.name, c.count, c.value ? `€${c.value}` : "—", c.rate ? `${c.rate}%` : "—"]),
      }] : []),
      ...(topPages.length > 0 ? [{
        id: "top-landing-pages",
        title: "Top pages de destination",
        headers: ["Page", "Sessions", "Taux rebond", "Temps moyen"],
        rows: topPages.map(p => [p.page, p.sessions, `${p.bounceRate}%`, p.avgTime]),
      }] : []),
    ],
    evidence: [],
    isPrivate: true,
    lookerDashboard,
    smartRecommendations: smartRecs,
    riskLevel: trkScore < 50 ? "Élevé" : trkScore < 70 ? "Moyen" : "Faible",
  };
}
