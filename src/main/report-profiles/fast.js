/**
 * FAST Profile — Quick diagnostic (Public Light)
 * Target: non-technical decision-maker.
 * Max pages: 6.
 * Tone: clear, direct, business-oriented.
 */
export const FAST = {
  id: "fast",
  name: "FAST",
  target: "Décisionnaire non-tech",
  tone: "simple",
  lang: "fr",
  maxPages: 6,
  confidential: false,
  requiresPrivate: false,
  sections: [
    "executive-summary",
    "quick-wins",
    "risks",
    "tracking-lite",
    "roadmap",
    "stratads-recommendation",
  ],
  depth: "lite",
  tableTypes: ["quick-wins", "risk-register", "roadmap"],
  chartTypes: ["score-donut", "pillar-bars"],
  stratasdOffer: "fast",
  annexes: false,
  pptxSlides: ["cover", "executive-summary", "quick-wins", "roadmap", "stratads"],
};
