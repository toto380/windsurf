/**
 * Report Validate — Quality Gate + Justification Enforcement
 *
 * Validates a reportModel before rendering:
 * - Each finding must have: observation, source, importance, status
 * - Each action must have: title, why, evidence, impact, effort, risk, owner, deadline, action
 * - Actions without evidence are marked as "Hypothèse" with a visible warning
 * - Profiles requiring private data are checked
 *
 * Returns { valid: boolean, warnings: string[], errors: string[], reportModel }
 * The reportModel is mutated in place (warnings added, missing evidence flagged).
 */

const REQUIRED_FINDING_FIELDS = ["observation", "source", "importance", "status"];
const REQUIRED_ACTION_FIELDS = ["title", "why", "evidence", "impact", "effort", "risk", "owner", "deadline", "action"];
const VALID_STATUSES = ["ok", "warn", "bad", "info"];
const VALID_EFFORTS = ["S", "M", "L"];
const VALID_RISKS = ["low", "medium", "high"];
const VALID_OWNERS = ["client", "StratAds"];
const VALID_DEADLINES = ["7j", "30j", "90j"];

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === "" || String(v).trim() === "—";
}

/**
 * Validate a single finding. Returns list of issues.
 * @param {object} finding
 * @param {string} sectionId
 * @param {number} idx
 * @returns {string[]}
 */
function validateFinding(finding, sectionId, idx) {
  const issues = [];
  for (const field of REQUIRED_FINDING_FIELDS) {
    if (isBlank(finding[field])) {
      issues.push(`Section "${sectionId}" finding[${idx}]: missing "${field}"`);
    }
  }
  if (finding.status && !VALID_STATUSES.includes(finding.status)) {
    issues.push(`Section "${sectionId}" finding[${idx}]: invalid status "${finding.status}" (expected: ${VALID_STATUSES.join("|")})`);
  }
  return issues;
}

/**
 * Validate a single action. Returns list of issues and may mutate action.
 * @param {object} action
 * @param {string} sectionId
 * @param {number} idx
 * @returns {{ issues: string[], warnings: string[] }}
 */
function validateAction(action, sectionId, idx) {
  const issues = [];
  const warnings = [];

  for (const field of REQUIRED_ACTION_FIELDS) {
    if (isBlank(action[field])) {
      if (field === "evidence") {
        // Evidence missing: mark as hypothesis, add warning
        action._hypothesis = true;
        action._hypothesisWarning = `Action "${action.title || idx}" : preuve manquante — marquée comme Hypothèse (quality gate).`;
        warnings.push(`Section "${sectionId}" action[${idx}] "${action.title || ""}": missing evidence — marked as Hypothèse.`);
      } else {
        issues.push(`Section "${sectionId}" action[${idx}] "${action.title || ""}": missing required field "${field}"`);
      }
    }
  }

  if (action.effort && !VALID_EFFORTS.includes(action.effort)) {
    warnings.push(`Section "${sectionId}" action[${idx}]: effort "${action.effort}" is non-standard (expected S|M|L)`);
  }
  if (action.risk && !VALID_RISKS.includes(action.risk)) {
    warnings.push(`Section "${sectionId}" action[${idx}]: risk "${action.risk}" is non-standard (expected low|medium|high)`);
  }

  return { issues, warnings };
}

/**
 * Validate a reportModel. Mutates in place (marks hypotheses).
 * @param {object} reportModel
 * @returns {{ valid: boolean, warnings: string[], errors: string[], reportModel: object }}
 */
export function validateReport(reportModel) {
  const errors = [];
  const warnings = [];

  if (!reportModel || typeof reportModel !== "object") {
    return { valid: false, errors: ["reportModel is null or not an object"], warnings, reportModel };
  }

  // --- Validate reportMeta ---
  const meta = reportModel.reportMeta || {};
  if (!meta.client || meta.client === "—") warnings.push("reportMeta.client is missing");
  if (!meta.url || meta.url === "—") warnings.push("reportMeta.url is missing");
  if (!meta.profile) errors.push("reportMeta.profile is required");
  if (!meta.date) warnings.push("reportMeta.date is missing");

  // --- Validate scores ---
  const scores = reportModel.scores || {};
  const scoreFields = ["global", "tracking", "seo", "performance", "security"];
  for (const f of scoreFields) {
    if (scores[f] === undefined || scores[f] === null) {
      warnings.push(`scores.${f} is missing`);
    } else if (typeof scores[f] !== "number" || scores[f] < 0 || scores[f] > 100) {
      warnings.push(`scores.${f} = ${scores[f]} is out of range [0-100]`);
    }
  }

  // --- Validate sections ---
  if (!Array.isArray(reportModel.sections)) {
    errors.push("reportModel.sections must be an array");
  } else if (reportModel.sections.length === 0) {
    warnings.push("reportModel.sections is empty");
  } else {
    for (const section of reportModel.sections) {
      if (!section.id) errors.push("A section is missing its 'id'");
      if (!section.title) warnings.push(`Section "${section.id}": missing title`);

      // Validate findings
      for (let i = 0; i < (section.findings || []).length; i++) {
        const fIssues = validateFinding(section.findings[i], section.id, i);
        errors.push(...fIssues);
      }

      // Validate actions
      for (let i = 0; i < (section.actions || []).length; i++) {
        const { issues, warnings: aWarnings } = validateAction(section.actions[i], section.id, i);
        errors.push(...issues);
        warnings.push(...aWarnings);
      }
    }
  }

  // --- Check required sections by profile ---
  const sectionIds = (reportModel.sections || []).map(s => s.id);
  const criticalSections = ["executive-summary"];
  for (const req of criticalSections) {
    if (!sectionIds.includes(req)) {
      errors.push(`Required section "${req}" is missing from the report`);
    }
  }

  // --- Check that at least one table exists ---
  const allTables = (reportModel.sections || []).flatMap(s => s.tables || []);
  if (allTables.length === 0) {
    warnings.push("No tables found in report — at least one table is required");
  }

  // --- Check that a prioritization table exists (quick-wins, roadmap, or impact-effort-matrix) ---
  const PRIORITIZATION_TABLE_IDS = ["quick-wins", "roadmap", "impact-effort-matrix", "backlog", "top10-actions", "situation-opportunities"];
  const hasPrioritizationTable = allTables.some(t => PRIORITIZATION_TABLE_IDS.includes(t.id));
  if (!hasPrioritizationTable) {
    errors.push("No prioritization table found (quick-wins, roadmap, or impact-effort-matrix required) — quality gate failed");
  }

  // --- Check that at least one chart exists ---
  const allCharts = (reportModel.sections || []).flatMap(s => s.charts || []);
  if (allCharts.length === 0) {
    warnings.push("No charts found in report — at least one chart is recommended");
  }

  // --- Check that a global-summary-like section or globalSummary object exists ---
  const hasGlobalSummary = sectionIds.includes("global-summary") || !!reportModel.globalSummary;
  if (!hasGlobalSummary) {
    warnings.push("No global summary found in report — a global summary is recommended");
  }

  // --- Profile-specific quality gates ---
  const profileId = meta.profile;

  if (profileId === "mini") {
    // MINI: max 15 pages, no private sections
    const privateSections = (reportModel.sections || []).filter(s => s.isPrivate);
    if (privateSections.length > 0) {
      errors.push(`MINI profile must not contain private sections (found: ${privateSections.map(s => s.id).join(", ")})`);
    }
    if ((reportModel.sections || []).length > 15) {
      warnings.push(`MINI profile should have at most 15 sections (found: ${reportModel.sections.length})`);
    }
  }

  if (profileId === "public_360") {
    // PUBLIC 360: no private data sections
    const privateSections = (reportModel.sections || []).filter(s => s.isPrivate);
    if (privateSections.length > 0) {
      errors.push(`PUBLIC 360 profile must not contain private data sections (found: ${privateSections.map(s => s.id).join(", ")})`);
    }
  }

  if (profileId === "full") {
    // FULL: visual separation required (privateSections array defined on profile)
    const hasPrivateSections = (reportModel.sections || []).some(s => s.isPrivate);
    if (!hasPrivateSections) {
      warnings.push("FULL profile should include private sections (ga4-detailed, acquisition-channels, etc.) for visual separation");
    }
  }

  const valid = errors.length === 0;
  return { valid, errors, warnings, reportModel };
}
