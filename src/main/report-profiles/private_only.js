/**
 * PRIVATE_ONLY Profile — Private Data Only
 * Private Analytics (GA4 + GSC via service account) + Ads Exports (CSV/XLSX, no OAuth)
 *
 * Target: direction + équipe acquisition / data (accès confidentiel).
 * Pages: 35-55.
 * Combines:
 *   - GA4 Performance Dashboard (service account API)
 *   - Google Ads + Meta Ads via CSV exports
 *   - Attribution analysis & UTM coherence
 *   - Smart recommendations engine
 * Looker Studio-style dashboard integrated.
 */
export const PRIVATE_ONLY = {
  id: "private_only",
  name: "PRIVATE ONLY — Analytics API + Ads Exports (Confidentiel)",
  target: "Direction acquisition + équipe data/media (accès confidentiel)",
  tone: "business",
  lang: "fr",
  maxPages: 55,
  confidential: true,
  requiresPrivate: true,
  requiresAdsFiles: true,
  allowPrivateSections: true,
  sections: [
    // --- Synthèse executive ---
    "executive-summary",
    "scorecards",
    // --- Ce qui est bien ---
    "strengths",
    // --- Performance publique ---
    "performance",
    "tracking-lite",
    // --- Dashboard privé GA4 ---
    "ga4-performance-dashboard",
    // --- Dashboard privé Ads ---
    "ads-performance-complete",
    // --- Attribution & cohérence ---
    "attribution-analysis",
    // --- Smart Recommendations ---
    "smart-recommendations-engine",
    // --- Priorisation ---
    "quick-wins",
    "risks",
    "roadmap",
    // --- Synthèse globale ---
    "global-summary",
    "stratads-recommendation",
  ],
  privateSections: [
    "ga4-performance-dashboard",
    "ads-performance-complete",
    "attribution-analysis",
    "smart-recommendations-engine",
  ],
  depth: "deep",
  tableTypes: [
    "quick-wins",
    "risk-register",
    "roadmap",
    "ga4-channel-metrics",
    "ltv-cac-by-channel",
    "campaigns-table",
    "adgroups-table",
    "budget-allocation-optimization",
    "attribution-windows",
    "utm-naming-convention",
    "revenue-reconciliation",
    "strengths-table",
    "to-protect-table",
    "quick-wins-opportunities",
    "smart-recs-table",
  ],
  chartTypes: [
    "score-donut",
    "pillar-bars",
    "channel-bars",
    "spend-value-bars",
    "campaign-performance-bars",
    "session-trend",
    "roas-trend",
    "pareto-campaigns",
    "funnel",
  ],
  dashboardFilters: [
    "dateRange",
    "channel",
    "campaign",
    "adset",
    "country",
    "device",
    "placement",
    "objective",
  ],
  stratadsOffer: "private_only",
  annexes: true,
  humanSummaries: true,
};
