/**
 * RiskHeader — Risk status counters in anomalies style
 *
 * Renders a compact risk counter bar showing critical / high /
 * medium / low anomaly counts, styled as pill-shaped badges.
 *
 * @module RiskHeader
 */

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Render the risk counter header.
 *
 * @param {object} opts
 * @param {number}  opts.critical  - Number of critical anomalies
 * @param {number}  opts.high      - Number of high anomalies
 * @param {number}  opts.medium    - Number of medium anomalies
 * @param {number}  opts.low       - Number of low anomalies
 * @param {string}  [opts.title]   - Override header label text
 * @param {boolean} [opts.showTotal] - Whether to show total (default: true)
 * @returns {string} HTML string
 */
export function renderRiskHeader({
  critical = 0,
  high = 0,
  medium = 0,
  low = 0,
  title = "Anomalies détectées",
  showTotal = true,
} = {}) {
  const total = Number(critical) + Number(high) + Number(medium) + Number(low);

  function counter(cls, icon, count, label) {
    if (count === 0) return "";
    return `
      <div class="scope-risk-counter ${esc(cls)}">
        <span class="scope-risk-counter-value">${esc(String(count))}</span>
        <span class="scope-risk-counter-label">${esc(icon)} ${esc(label)}</span>
      </div>
    `;
  }

  const totalHtml = showTotal && total > 0
    ? `<div class="scope-risk-total">${esc(String(total))} total</div>`
    : "";

  return `
    <div class="scope-risk-header">
      <div class="scope-risk-header-title">${esc(title)}</div>
      ${counter("critical", "🔴", Number(critical), "Critique")}
      ${counter("high",     "🟠", Number(high),     "Élevé")}
      ${counter("medium",   "🟡", Number(medium),   "Moyen")}
      ${counter("low",      "🟢", Number(low),      "Faible")}
      ${totalHtml}
    </div>
  `;
}

/**
 * Build risk counters from a reportModel's sections.
 *
 * Counts all findings with status "bad" as high risk,
 * "warn" as medium risk, and "ok" as low risk.
 *
 * @param {object} reportModel - Report model from assembler
 * @returns {{ critical: number, high: number, medium: number, low: number }}
 */
export function buildRiskCountsFromModel(reportModel) {
  if (!reportModel || !Array.isArray(reportModel.sections)) {
    return { critical: 0, high: 0, medium: 0, low: 0 };
  }

  let critical = 0, high = 0, medium = 0, low = 0;

  for (const section of reportModel.sections) {
    for (const finding of (section.findings || [])) {
      if (finding.status === "bad") high++;
      else if (finding.status === "warn") medium++;
      else if (finding.status === "ok") low++;
    }
    // Actions with high risk count as critical
    for (const action of (section.actions || [])) {
      if (action.risk === "high") critical++;
    }
  }

  return { critical, high, medium, low };
}
