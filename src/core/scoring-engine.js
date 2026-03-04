/**
 * StratAds Scoring Engine
 * Single scoring system used by both public and private modes.
 *
 * 8 weighted criteria (total = 1.0):
 *   Infrastructure      15%
 *   GA4                 15%
 *   E-commerce          15%
 *   GTM                 10%
 *   Server-side         15%
 *   Ads                 15%
 *   Data Quality        10%
 *   Business Reliability 5%
 */

export const CRITERIA_WEIGHTS = {
  infrastructure:       0.15,
  ga4:                  0.15,
  ecommerce:            0.15,
  gtm:                  0.10,
  server_side:          0.15,
  ads:                  0.15,
  data_quality:         0.10,
  business_reliability: 0.05,
};

/**
 * Score severity → point deduction mapping.
 * Applied to a base of 100 reduced by issue severity.
 */
const SEVERITY_DEDUCTION = {
  critical: 25,
  high:     15,
  medium:    8,
  low:       3,
  info:      0,
};

/**
 * Compute the score (0–100) for a single criterion from its module output.
 *
 * @param {object} moduleOutput - Module output following the data contract
 * @returns {number} score 0–100
 */
export function computeCriterionScore(moduleOutput) {
  if (!moduleOutput || moduleOutput.skipped) return null;

  // If the module explicitly provides a score_contrib.score, use it.
  if (typeof moduleOutput.score_contrib?.score === 'number') {
    return Math.max(0, Math.min(100, moduleOutput.score_contrib.score));
  }

  // Fall back to legacy `.score` field used by older modules.
  if (typeof moduleOutput.score === 'number') {
    return Math.max(0, Math.min(100, moduleOutput.score));
  }

  // Derive from issues if present.
  const issues = Array.isArray(moduleOutput.issues) ? moduleOutput.issues : [];
  let score = 100;
  for (const issue of issues) {
    const deduction = SEVERITY_DEDUCTION[issue.severity] ?? 0;
    const confidence = typeof issue.confidence === 'number' ? issue.confidence : 1;
    score -= deduction * confidence;
  }
  return Math.max(0, Math.round(score));
}

/**
 * Map module keys from the audit results to scoring criteria.
 * Returns a map { criterionKey → moduleKey[] }
 */
const CRITERION_MODULE_MAP = {
  infrastructure:       ['trackingInfrastructure', 'security', 'securityHeaders', 'robots', 'dns'],
  ga4:                  ['ga4Audit', 'tracking', 'privateGoogle'],
  ecommerce:            ['ga4Audit', 'dataQuality'],
  gtm:                  ['gtmWebAudit', 'gtmAudit'],
  server_side:          ['serverSideAudit'],
  ads:                  ['adsAudit', 'adsIntelligence', 'adsImport', 'adsGoogle'],
  data_quality:         ['dataQuality'],
  business_reliability: ['lighthouse', 'seo', 'schema'],
};

/**
 * Resolve the best available score for a criterion from the modules map.
 * Uses the first non-null score found in the module priority list.
 *
 * @param {string} criterion
 * @param {object} modules - Key-value map of module outputs
 * @returns {number|null}
 */
export function resolveCriterionScore(criterion, modules) {
  const keys = CRITERION_MODULE_MAP[criterion] || [];
  for (const key of keys) {
    const mod = modules[key];
    if (!mod || mod.skipped) continue;
    const s = computeCriterionScore(mod);
    if (s !== null) return s;
  }
  return null;
}

/**
 * Compute the global weighted score from audit results.
 *
 * @param {object} auditResults - Full audit results ({ modules, scores? })
 * @param {object} [overrides] - Optional per-criterion score overrides
 * @returns {{ global: number, criteria: object, breakdown: object[] }}
 */
export function computeGlobalScore(auditResults, overrides = {}) {
  const modules = auditResults?.modules || {};
  const breakdown = [];
  let weightedSum = 0;
  let totalActiveWeight = 0;

  for (const [criterion, weight] of Object.entries(CRITERIA_WEIGHTS)) {
    const override = overrides[criterion];
    const score = override !== undefined ? override : resolveCriterionScore(criterion, modules);

    if (score === null) {
      // Criterion not measured — skip (redistribute weight)
      breakdown.push({ criterion, weight, score: null, skipped: true, contribution: 0 });
      continue;
    }

    const contribution = score * weight;
    weightedSum += contribution;
    totalActiveWeight += weight;

    breakdown.push({ criterion, weight, score, skipped: false, contribution });
  }

  // Normalize by active weights so skipped modules don't penalize the score.
  const normalizer = totalActiveWeight > 0 ? 1 / totalActiveWeight : 1;
  const global = Math.round(weightedSum * normalizer);

  const criteria = {};
  for (const item of breakdown) {
    criteria[item.criterion] = item.score;
  }

  return {
    global: Math.max(0, Math.min(100, global)),
    criteria,
    breakdown,
  };
}

/**
 * Produce a human-readable scoring report.
 *
 * @param {{ global: number, criteria: object, breakdown: object[] }} result
 * @returns {string}
 */
export function formatScoringReport(result) {
  const lines = [
    `Global Score: ${result.global}/100`,
    '',
    'Criteria breakdown:',
  ];
  for (const item of result.breakdown) {
    const scoreStr = item.skipped ? 'N/A' : `${item.score}/100`;
    const pct = Math.round(item.weight * 100);
    lines.push(`  ${item.criterion.padEnd(22)} ${scoreStr.padStart(7)} (weight ${pct}%)`);
  }
  return lines.join('\n');
}

/**
 * Estimate the monetary impact of issues in EUR.
 * Uses heuristic: critical = 5000€, high = 2000€, medium = 500€, low = 100€
 *
 * @param {object[]} issues
 * @returns {number}
 */
export function estimateImpactEuro(issues) {
  const BASE = { critical: 5000, high: 2000, medium: 500, low: 100, info: 0 };
  return (issues || []).reduce((sum, issue) => {
    if (typeof issue.impact_euro === 'number') return sum + issue.impact_euro;
    return sum + (BASE[issue.severity] ?? 0);
  }, 0);
}
