/**
 * AuditTierCardPremium — Premium tier card component
 *
 * Renders a SaaS-style tier card with gradient header, badge,
 * target audience description, section list and depth badge.
 *
 * @module AuditTierCardPremium
 */

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Tier definitions for FAST / PUBLIC / AUDIT 360.
 * Each tier includes its display metadata and list of key sections.
 */
export const AUDIT_TIERS = {
  fast: {
    id: "fast",
    key: "fast",
    name: "FAST",
    subtitle: "Diagnostic rapide — Décisionnaire non-tech",
    badge: "FAST",
    target: "Décisionnaire non-tech — 8 à 10 pages",
    pages: "8 – 10 pages",
    depth: "lite",
    depthLabel: "Analyse Légère",
    recommended: false,
    icon: "⚡",
    sections: [
      "Executive Summary & Scores",
      "Quick Wins",
      "Registre des Risques",
      "Performance (Core Web Vitals)",
      "SEO Essentiels",
      "Tracking GA4 (Lite)",
      "Roadmap prioritaire",
    ],
  },
  public: {
    id: "public",
    key: "public",
    name: "PUBLIC",
    subtitle: "Diagnostic technique complet — Données publiques",
    badge: "PUBLIC",
    target: "Équipe marketing/ops + direction — 25 à 35 pages",
    pages: "25 – 35 pages",
    depth: "deep",
    depthLabel: "Analyse Approfondie",
    recommended: false,
    icon: "🔍",
    sections: [
      "Executive Summary & Scores",
      "Performance + CWV Distribution",
      "SEO Complet + Crawler",
      "DNS & Infrastructure",
      "Sécurité & Headers",
      "Robots, Sitemap, Schémas",
      "Consentement RGPD",
      "Backlog & Impact-Effort",
      "Roadmap priorisée",
    ],
  },
  tier360: {
    id: "360",
    key: "tier360",
    name: "AUDIT 360",
    subtitle: "Full Technique & Performance — Vue complète",
    badge: "AUDIT 360",
    target: "Direction + équipes tech/marketing — 30 à 60 pages",
    pages: "30 – 60 pages",
    depth: "full",
    depthLabel: "Analyse Complète",
    recommended: true,
    icon: "🏆",
    sections: [
      "Executive Summary & Scores",
      "Quick Wins & Risques",
      "Performance + CWV complet",
      "SEO Technique approfondi",
      "Tracking GA4/GTM avancé",
      "DNS, Sécurité, Infrastructure",
      "Backlog & Compliance",
      "Annexes & Données brutes",
      "Roadmap 90 jours",
    ],
  },
};

/**
 * Render a single tier card.
 *
 * @param {object} tier - Tier definition object (from AUDIT_TIERS or custom)
 * @returns {string} HTML string
 */
export function renderAuditTierCard(tier) {
  if (!tier) return "";

  const isRecommended = !!tier.recommended;
  const cardClass = `scope-tier-card${isRecommended ? " recommended" : ""}`;
  const headerClass = `scope-tier-header ${esc(tier.key)}`;

  const sectionListHtml = (tier.sections || [])
    .map(s => `<li>${esc(s)}</li>`)
    .join("");

  const recommendedBanner = isRecommended
    ? `<div style="background:linear-gradient(90deg,#f59e0b,#fbbf24);color:#fff;text-align:center;font-size:10px;font-weight:800;letter-spacing:.10em;text-transform:uppercase;padding:6px 0;">⭐ RECOMMANDÉ</div>`
    : "";

  return `
    <div class="${cardClass}">
      ${recommendedBanner}
      <div class="${headerClass}">
        <div class="scope-tier-badge">${esc(tier.icon)} ${esc(tier.badge)}</div>
        <div class="scope-tier-name">${esc(tier.name)}</div>
        <div class="scope-tier-subtitle">${esc(tier.subtitle)}</div>
        <div class="scope-tier-pages">📄 ${esc(tier.pages)}</div>
      </div>
      <div class="scope-tier-body">
        <div class="scope-tier-target">${esc(tier.target)}</div>
        <ul class="scope-tier-section-list">${sectionListHtml}</ul>
        <div>
          <span class="scope-tier-depth-badge ${esc(tier.depth)}">${esc(tier.depthLabel)}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render tier cards in a grid row.
 *
 * @param {string[]} [tierIds] - Subset of tier ids to render. Defaults to [fast, public, tier360].
 * @returns {string} HTML string
 */
export function renderTierCardsRow(tierIds = ["fast", "public", "tier360"]) {
  const tiers = tierIds.map(id => AUDIT_TIERS[id]).filter(Boolean);
  if (!tiers.length) return "";
  return `<div class="scope-tiers-row">${tiers.map(renderAuditTierCard).join("")}</div>`;
}
