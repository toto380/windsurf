/**
 * ScopeGrid — 15 domains × 4 tiers comparison matrix
 *
 * Renders an HTML comparison grid showing which audit domains
 * are included (✓), excluded (—), or covered at an advanced
 * level (⭐) in each of the 4 audit tiers.
 *
 * @module ScopeGrid
 */

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Status values for each cell in the grid.
 * - "included" : domain is covered in this tier
 * - "excluded" : domain is not covered in this tier
 * - "advanced" : domain is covered with extra depth (e.g. tracking-advanced)
 * - "private"  : domain requires private data access
 */
const INCLUDED  = "included";
const EXCLUDED  = "excluded";
const ADVANCED  = "advanced";
const PRIVATE   = "private";

/**
 * The 15 audit domains with their status across the 4 tiers.
 * Columns: fast | public | growth | tier360
 */
export const SCOPE_DOMAINS = [
  {
    icon: "🎯",
    label: "Executive Summary & Scores",
    fast: INCLUDED, public: INCLUDED, growth: INCLUDED, tier360: INCLUDED,
  },
  {
    icon: "⚡",
    label: "Quick Wins",
    fast: INCLUDED, public: INCLUDED, growth: INCLUDED, tier360: INCLUDED,
  },
  {
    icon: "🔴",
    label: "Registre des Risques",
    fast: INCLUDED, public: INCLUDED, growth: INCLUDED, tier360: INCLUDED,
  },
  {
    icon: "🗺️",
    label: "Roadmap Priorisée",
    fast: INCLUDED, public: INCLUDED, growth: INCLUDED, tier360: INCLUDED,
  },
  {
    icon: "🚀",
    label: "Performance & Core Web Vitals",
    fast: INCLUDED, public: INCLUDED, growth: EXCLUDED, tier360: INCLUDED,
  },
  {
    icon: "🔍",
    label: "SEO Essentiels",
    fast: INCLUDED, public: INCLUDED, growth: EXCLUDED, tier360: INCLUDED,
  },
  {
    icon: "🏷️",
    label: "Tracking GA4 / GTM",
    fast: INCLUDED, public: INCLUDED, growth: ADVANCED, tier360: ADVANCED,
  },
  {
    icon: "🌐",
    label: "DNS & Infrastructure",
    fast: EXCLUDED, public: INCLUDED, growth: EXCLUDED, tier360: INCLUDED,
  },
  {
    icon: "🛡️",
    label: "Sécurité & Headers HTTP",
    fast: EXCLUDED, public: INCLUDED, growth: EXCLUDED, tier360: INCLUDED,
  },
  {
    icon: "🤖",
    label: "Robots, Sitemap & Crawler",
    fast: EXCLUDED, public: INCLUDED, growth: EXCLUDED, tier360: INCLUDED,
  },
  {
    icon: "🧩",
    label: "Schema / Données Structurées",
    fast: EXCLUDED, public: INCLUDED, growth: EXCLUDED, tier360: INCLUDED,
  },
  {
    icon: "🧱",
    label: "Tech Stack & CMS",
    fast: EXCLUDED, public: INCLUDED, growth: EXCLUDED, tier360: INCLUDED,
  },
  {
    icon: "✅",
    label: "Consentement RGPD",
    fast: EXCLUDED, public: INCLUDED, growth: INCLUDED, tier360: INCLUDED,
  },
  {
    icon: "📝",
    label: "Backlog & Impact-Effort",
    fast: EXCLUDED, public: INCLUDED, growth: EXCLUDED, tier360: INCLUDED,
  },
  {
    icon: "📋",
    label: "Données Privées (Ads / Analytics)",
    fast: EXCLUDED, public: EXCLUDED, growth: PRIVATE, tier360: PRIVATE,
  },
];

const STATUS_ICONS = {
  included: { icon: "✓", label: "Inclus" },
  excluded: { icon: "—", label: "Non inclus" },
  advanced: { icon: "⭐", label: "Avancé" },
  private:  { icon: "🔒", label: "Données privées" },
};

/**
 * Render the scope grid comparison matrix.
 *
 * @param {Array<object>} [domains] - Custom domains array. Defaults to SCOPE_DOMAINS.
 * @param {object} [opts]
 * @param {string} [opts.title] - Override grid title
 * @returns {string} HTML string
 */
export function renderScopeGrid(domains = SCOPE_DOMAINS, opts = {}) {
  const title = opts.title || "Périmètre d'audit par formule — 15 domaines";
  const tiers = [
    { key: "fast",   label: "FAST",      thClass: "tier-col-fast" },
    { key: "public", label: "PUBLIC 360", thClass: "tier-col-public" },
    { key: "growth", label: "GROWTH",    thClass: "tier-col-growth" },
    { key: "tier360",label: "360°",      thClass: "tier-col-360" },
  ];

  const headerCells = tiers.map(t =>
    `<th class="${esc(t.thClass)}">${esc(t.label)}</th>`
  ).join("");

  const rows = domains.map(domain => {
    const cells = tiers.map(t => {
      const status = domain[t.key] || EXCLUDED;
      const si = STATUS_ICONS[status] || STATUS_ICONS.excluded;
      return `<td><span class="scope-status-icon ${esc(status)}" title="${esc(si.label)}">${esc(si.icon)}</span></td>`;
    }).join("");

    return `
      <tr>
        <td class="domain-name">
          <span class="scope-domain-icon">${esc(domain.icon)}</span>
          ${esc(domain.label)}
        </td>
        ${cells}
      </tr>
    `;
  }).join("");

  return `
    <div class="scope-grid-wrapper">
      <div class="scope-grid-header">
        <div class="scope-grid-title">${esc(title)}</div>
        <div class="scope-grid-legend">
          <div class="scope-legend-item">
            <div class="scope-legend-dot included"></div> Inclus
          </div>
          <div class="scope-legend-item">
            <div class="scope-legend-dot advanced"></div> Avancé
          </div>
          <div class="scope-legend-item">
            <div class="scope-legend-dot private"></div> Données privées
          </div>
          <div class="scope-legend-item">
            <div class="scope-legend-dot excluded"></div> Non inclus
          </div>
        </div>
      </div>
      <table class="scope-grid-table">
        <thead>
          <tr>
            <th class="domain-col">Domaine</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}
