/**
 * PUBLIC Profile — Complete Technical Diagnosis (Public Data Only)
 * Target: marketing/ops team + management.
 * Pages: 25-35.
 * Observable data only — no GA4/GSC/Ads private data.
 * 7 major sections: executive, performance, SEO, tracking, security, prioritization, roadmap.
 * Includes detailed tables, charts, and impact/effort matrix.
 */
export const PUBLIC = {
  id: "public",
  name: "PUBLIC — Diagnostic Technique Complet",
  target: "Équipe marketing/ops + direction",
  tone: "business",
  lang: "fr",
  maxPages: 35,
  confidential: false,
  requiresPrivate: false,
  allowPrivateSections: false,
  sections: [
    "executive-summary",
    "scorecards",
    "performance",
    "seo-basics",
    "tracking-lite",
    "security-headers",
    "dns-infra",
    "robots-sitemap",
    "schema",
    "techstack",
    "crawler",
    "consent",
    "quick-wins",
    "risks",
    "backlog",
    "impact-effort-matrix",
    "compliance-checklist",
    "roadmap",
    "global-summary",
    "stratads-recommendation",
  ],
  depth: "deep",
  tableTypes: [
    "quick-wins",
    "risk-register",
    "roadmap",
    "backlog",
    "impact-effort-matrix",
    "compliance-checklist",
    "page-comparison",
    "error-top",
  ],
  chartTypes: [
    "score-donut",
    "pillar-bars",
    "cwv-bars",
    "cwv-distribution",
    "crawl-errors-bar",
    "tech-histogram",
  ],
  stratadsOffer: "public",
  annexes: true,
  humanSummaries: false,
};
