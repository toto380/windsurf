/**
 * HumanSummary component — "En clair" box renderer
 *
 * Renders a human-friendly "En clair" summary box for major findings.
 * Used in MINI and FULL profiles.
 *
 * Format:
 * 📌 En clair :
 * Ce que ça signifie concrètement pour vous :
 * - Simple explanation
 * - What it changes
 * - What to do
 * - Business impact
 */

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Render a human-readable "En clair" summary box.
 *
 * @param {object} humanSummary
 * @param {string} humanSummary.explanation  - Simple explanation of the finding
 * @param {string} [humanSummary.whatChanges] - What it changes for the business
 * @param {string} [humanSummary.whatToDo]   - Concrete next step
 * @param {string} [humanSummary.impact]     - Business impact
 * @returns {string} HTML string
 */
export function renderHumanSummary(humanSummary) {
  if (!humanSummary) return "";

  const { explanation, whatChanges, whatToDo, impact } = humanSummary;
  if (!explanation) return "";

  const items = [
    explanation,
    whatChanges ? `Ce qui change : ${whatChanges}` : null,
    whatToDo ? `À faire : ${whatToDo}` : null,
    impact ? `Impact business : ${impact}` : null,
  ].filter(Boolean);

  const listItems = items.map(item => `<li>${esc(item)}</li>`).join("");

  return `
    <div class="en-clair">
      <div class="en-clair-title">📌 En clair :</div>
      <div class="en-clair-subtitle">Ce que ça signifie concrètement pour vous :</div>
      <ul class="en-clair-list">${listItems}</ul>
    </div>
  `;
}

/**
 * Build a humanSummary object from section data.
 * Provides a plain-language explanation of the section's key findings.
 *
 * @param {object} section - Section from reportModel
 * @returns {object|null} humanSummary object or null
 */
export function buildHumanSummaryFromSection(section) {
  if (!section) return null;
  const findings = section.findings || [];
  const badFindings = findings.filter(f => f.status === "bad");
  const warnFindings = findings.filter(f => f.status === "warn");
  const okFindings = findings.filter(f => f.status === "ok");
  const actions = section.actions || [];

  if (findings.length === 0 && actions.length === 0) return null;

  let explanation = "";
  let whatChanges = "";
  let whatToDo = "";
  let impact = "";

  if (badFindings.length > 0) {
    explanation = `${badFindings.length} problème(s) critique(s) détecté(s) sur cette section.`;
    whatChanges = badFindings[0].observation;
  } else if (warnFindings.length > 0) {
    explanation = `${warnFindings.length} point(s) à améliorer sur cette section.`;
    whatChanges = warnFindings[0].observation;
  } else if (okFindings.length > 0) {
    explanation = `Cette section est globalement en bon état (${okFindings.length} point(s) validé(s)).`;
    whatChanges = okFindings[0].observation;
  }

  if (actions.length > 0) {
    const topAction = actions[0];
    whatToDo = topAction.action || topAction.title;
    impact = topAction.impact;
  }

  return { explanation, whatChanges, whatToDo, impact };
}
