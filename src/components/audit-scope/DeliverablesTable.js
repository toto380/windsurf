/**
 * DeliverablesTable — Deliverables comparison table across all tiers
 *
 * Renders an HTML table comparing what deliverables are provided
 * in each of the 4 audit tiers (FAST / PUBLIC / GROWTH / 360).
 *
 * @module DeliverablesTable
 */

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/** Cell value constants */
const YES     = "yes";
const NO      = "no";
const PARTIAL = "partial";

/**
 * Default deliverables matrix.
 * Each row: { label, fast, public, growth, tier360 }
 */
export const DEFAULT_DELIVERABLES = [
  { label: "Rapport HTML interactif",                  fast: YES, public: YES, growth: YES,     tier360: YES },
  { label: "Export PDF haute définition",               fast: YES, public: YES, growth: YES,     tier360: YES },
  { label: "Présentation PPTX direction",               fast: YES, public: YES, growth: YES,     tier360: YES },
  { label: "Résumé exécutif (1 page)",                  fast: YES, public: YES, growth: YES,     tier360: YES },
  { label: "Executive Summary — Vue graphique",         fast: NO,  public: YES, growth: PARTIAL, tier360: YES },
  { label: "Quick Wins priorisés (Top 5)",              fast: YES, public: YES, growth: YES,     tier360: YES },
  { label: "Registre des risques",                      fast: YES, public: YES, growth: YES,     tier360: YES },
  { label: "Roadmap 30/60/90 jours",                    fast: YES, public: YES, growth: YES,     tier360: YES },
  { label: "Scores détaillés par pilier (6 axes)",      fast: NO,  public: YES, growth: NO,      tier360: YES },
  { label: "Audit Performance + CWV Distribution",      fast: NO,  public: YES, growth: NO,      tier360: YES },
  { label: "Rapport SEO Technique complet",             fast: NO,  public: YES, growth: NO,      tier360: YES },
  { label: "Audit DNS & Infrastructure",                fast: NO,  public: YES, growth: NO,      tier360: YES },
  { label: "Audit Sécurité & Headers HTTP",             fast: NO,  public: YES, growth: NO,      tier360: YES },
  { label: "Audit Consentement RGPD",                   fast: NO,  public: YES, growth: YES,     tier360: YES },
  { label: "Event Map & Conversion Map",                fast: NO,  public: NO,  growth: YES,     tier360: YES },
  { label: "Checklist Qualité Data GA4/GTM",            fast: NO,  public: NO,  growth: YES,     tier360: YES },
  { label: "Backlog & Matrice Impact-Effort",           fast: NO,  public: YES, growth: NO,      tier360: YES },
  { label: "Checklist Conformité",                      fast: NO,  public: YES, growth: NO,      tier360: YES },
  { label: "Rapport Human Summary (En clair)",          fast: NO,  public: NO,  growth: NO,      tier360: YES },
  { label: "Annexes & Données brutes",                  fast: NO,  public: NO,  growth: NO,      tier360: YES },
];

const CELL_CONFIG = {
  yes:     { icon: "✓", cls: "yes",     title: "Inclus" },
  no:      { icon: "—", cls: "no",      title: "Non inclus" },
  partial: { icon: "◐", cls: "partial", title: "Partiel" },
};

/**
 * Render a single deliverable check cell.
 */
function renderCell(value) {
  const cfg = CELL_CONFIG[value] || CELL_CONFIG.no;
  return `<td><span class="scope-deliverable-check ${esc(cfg.cls)}" title="${esc(cfg.title)}">${esc(cfg.icon)}</span></td>`;
}

/**
 * Render the deliverables comparison table.
 *
 * @param {Array<object>} [deliverables] - Custom deliverables array. Defaults to DEFAULT_DELIVERABLES.
 * @param {object} [opts]
 * @param {string} [opts.title]    - Override table title
 * @param {string} [opts.subtitle] - Override table subtitle
 * @returns {string} HTML string
 */
export function renderDeliverablesTable(deliverables = DEFAULT_DELIVERABLES, opts = {}) {
  const title    = opts.title    || "Livrables inclus par formule";
  const subtitle = opts.subtitle || "Ce que vous recevez à la fin de l'audit";

  const rows = deliverables.map(row => `
    <tr>
      <td>${esc(row.label)}</td>
      ${renderCell(row.fast)}
      ${renderCell(row.public)}
      ${renderCell(row.growth)}
      ${renderCell(row.tier360)}
    </tr>
  `).join("");

  return `
    <div class="scope-deliverables-wrapper">
      <div class="scope-deliverables-header">
        <div class="scope-deliverables-title">${esc(title)}</div>
        <div class="scope-deliverables-subtitle">${esc(subtitle)}</div>
      </div>
      <table class="scope-deliverables-table">
        <thead>
          <tr>
            <th>Livrable</th>
            <th class="col-fast">FAST</th>
            <th class="col-public">PUBLIC 360</th>
            <th class="col-growth">GROWTH</th>
            <th class="col-360">360°</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}
