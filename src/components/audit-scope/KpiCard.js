/**
 * KpiCard — KPI metric card component
 *
 * Renders a SaaS-style KPI card with icon, metric value,
 * sublabel and optional variation indicator.
 *
 * @module KpiCard
 */

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Render a single KPI card.
 *
 * @param {object} opts
 * @param {string}  opts.icon           - Emoji or text icon
 * @param {string}  opts.label          - Uppercase label (e.g. "DOMAINES COUVERTS")
 * @param {string|number} opts.value    - Main metric value (e.g. "15", "72%")
 * @param {string}  [opts.sublabel]     - Secondary description line
 * @param {string}  [opts.variation]    - Variation text (e.g. "+3 vs FAST")
 * @param {string}  [opts.variationType]- "up" | "down" | "neutral" (default: "neutral")
 * @param {string}  [opts.accentColor]  - CSS color for accent bar (overrides --kpi-accent)
 * @param {string}  [opts.iconBg]       - CSS color for icon background
 * @param {string}  [opts.valueColor]   - CSS color for value text
 * @returns {string} HTML string
 */
export function renderKpiCard({
  icon,
  label,
  value,
  sublabel,
  variation,
  variationType = "neutral",
  accentColor,
  iconBg,
  valueColor,
} = {}) {
  const styleVars = [
    accentColor ? `--kpi-accent:${esc(accentColor)}` : "",
    iconBg ? `--kpi-icon-bg:${esc(iconBg)}` : "",
    valueColor ? `--kpi-value-color:${esc(valueColor)}` : "",
  ].filter(Boolean).join(";");

  const variationHtml = variation
    ? `<div class="scope-kpi-variation ${esc(variationType)}">${esc(variation)}</div>`
    : "";

  const sublabelHtml = sublabel
    ? `<div class="scope-kpi-sublabel">${esc(sublabel)}</div>`
    : "";

  return `
    <div class="scope-kpi-card"${styleVars ? ` style="${styleVars}"` : ""}>
      ${icon ? `<div class="scope-kpi-icon">${esc(icon)}</div>` : ""}
      <div class="scope-kpi-value">${esc(String(value ?? "—"))}</div>
      <div class="scope-kpi-label">${esc(label)}</div>
      ${sublabelHtml}
      ${variationHtml}
    </div>
  `;
}

/**
 * Render a row of KPI cards inside a grid wrapper.
 *
 * @param {Array<object>} cards - Array of KPI card option objects
 * @returns {string} HTML string
 */
export function renderKpiRow(cards = []) {
  if (!cards.length) return "";
  return `<div class="scope-kpi-row">${cards.map(renderKpiCard).join("")}</div>`;
}
