/**
 * Tests for src/core/scoring-engine.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CRITERIA_WEIGHTS,
  computeCriterionScore,
  resolveCriterionScore,
  computeGlobalScore,
  formatScoringReport,
  estimateImpactEuro,
} from '../src/core/scoring-engine.js';

// ── CRITERIA_WEIGHTS ──────────────────────────────────────────────────────────

test('CRITERIA_WEIGHTS has 8 criteria', () => {
  assert.equal(Object.keys(CRITERIA_WEIGHTS).length, 8);
});

test('CRITERIA_WEIGHTS sum to 1.0', () => {
  const sum = Object.values(CRITERIA_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1.0) < 0.001, `Sum is ${sum}, expected 1.0`);
});

test('CRITERIA_WEIGHTS infrastructure is 0.15', () => {
  assert.equal(CRITERIA_WEIGHTS.infrastructure, 0.15);
});

test('CRITERIA_WEIGHTS ga4 is 0.15', () => {
  assert.equal(CRITERIA_WEIGHTS.ga4, 0.15);
});

test('CRITERIA_WEIGHTS business_reliability is 0.05', () => {
  assert.equal(CRITERIA_WEIGHTS.business_reliability, 0.05);
});

// ── computeCriterionScore ─────────────────────────────────────────────────────

test('computeCriterionScore returns null for skipped module', () => {
  const score = computeCriterionScore({ skipped: true });
  assert.equal(score, null);
});

test('computeCriterionScore uses score_contrib.score when present', () => {
  const score = computeCriterionScore({ score_contrib: { score: 75 } });
  assert.equal(score, 75);
});

test('computeCriterionScore falls back to legacy .score field', () => {
  const score = computeCriterionScore({ score: 60 });
  assert.equal(score, 60);
});

test('computeCriterionScore derives from issues (no critical issues = 100)', () => {
  const score = computeCriterionScore({ issues: [] });
  assert.equal(score, 100);
});

test('computeCriterionScore deducts 25 points per critical issue', () => {
  const score = computeCriterionScore({
    issues: [{ severity: 'critical', confidence: 1 }],
  });
  assert.equal(score, 75);
});

test('computeCriterionScore uses confidence as multiplier', () => {
  const score = computeCriterionScore({
    issues: [{ severity: 'critical', confidence: 0.5 }],
  });
  // 100 - (25 * 0.5) = 87.5 → rounded to 88
  assert.equal(score, 88);
});

test('computeCriterionScore clamps score at 0', () => {
  const score = computeCriterionScore({
    issues: [
      { severity: 'critical', confidence: 1 },
      { severity: 'critical', confidence: 1 },
      { severity: 'critical', confidence: 1 },
      { severity: 'critical', confidence: 1 },
      { severity: 'critical', confidence: 1 },
    ],
  });
  assert.equal(score, 0);
});

test('computeCriterionScore clamps at 100 max', () => {
  const score = computeCriterionScore({ score_contrib: { score: 150 } });
  assert.equal(score, 100);
});

// ── resolveCriterionScore ─────────────────────────────────────────────────────

test('resolveCriterionScore returns null when no relevant modules', () => {
  const score = resolveCriterionScore('infrastructure', {});
  assert.equal(score, null);
});

test('resolveCriterionScore picks trackingInfrastructure for infrastructure criterion', () => {
  const modules = {
    trackingInfrastructure: { score_contrib: { score: 72 } },
  };
  const score = resolveCriterionScore('infrastructure', modules);
  assert.equal(score, 72);
});

test('resolveCriterionScore skips skipped modules', () => {
  const modules = {
    trackingInfrastructure: { skipped: true },
    security: { score: 85 },
  };
  const score = resolveCriterionScore('infrastructure', modules);
  assert.equal(score, 85);
});

// ── computeGlobalScore ────────────────────────────────────────────────────────

test('computeGlobalScore returns global in [0,100]', () => {
  const result = computeGlobalScore({ modules: {} });
  assert.ok(result.global >= 0 && result.global <= 100);
});

test('computeGlobalScore with overrides uses override values', () => {
  const result = computeGlobalScore({ modules: {} }, {
    infrastructure: 100,
    ga4: 100,
    ecommerce: 100,
    gtm: 100,
    server_side: 100,
    ads: 100,
    data_quality: 100,
    business_reliability: 100,
  });
  assert.equal(result.global, 100);
});

test('computeGlobalScore returns 0 when all criteria score 0', () => {
  const result = computeGlobalScore({ modules: {} }, {
    infrastructure: 0,
    ga4: 0,
    ecommerce: 0,
    gtm: 0,
    server_side: 0,
    ads: 0,
    data_quality: 0,
    business_reliability: 0,
  });
  assert.equal(result.global, 0);
});

test('computeGlobalScore includes breakdown array', () => {
  const result = computeGlobalScore({ modules: {} });
  assert.ok(Array.isArray(result.breakdown));
  assert.equal(result.breakdown.length, 8);
});

test('computeGlobalScore normalizes when some criteria are skipped', () => {
  // Only infrastructure provided (non-null) = should return that score
  const result = computeGlobalScore({ modules: {} }, { infrastructure: 60 });
  // Only 1 criterion active (weight=0.15), normalized: 60 * (0.15/0.15) = 60
  assert.equal(result.global, 60);
});

test('computeGlobalScore criteria map contains all 8 keys', () => {
  const result = computeGlobalScore({ modules: {} }, { infrastructure: 80 });
  const criteriaKeys = Object.keys(result.criteria);
  assert.ok(criteriaKeys.includes('infrastructure'));
  assert.ok(criteriaKeys.includes('ga4'));
  assert.ok(criteriaKeys.includes('ecommerce'));
  assert.ok(criteriaKeys.includes('gtm'));
  assert.ok(criteriaKeys.includes('server_side'));
  assert.ok(criteriaKeys.includes('ads'));
  assert.ok(criteriaKeys.includes('data_quality'));
  assert.ok(criteriaKeys.includes('business_reliability'));
});

// ── formatScoringReport ───────────────────────────────────────────────────────

test('formatScoringReport returns a string with Global Score', () => {
  const result = computeGlobalScore({ modules: {} }, { infrastructure: 80, ga4: 70 });
  const report = formatScoringReport(result);
  assert.ok(typeof report === 'string');
  assert.ok(report.includes('Global Score'));
  assert.ok(report.includes('infrastructure'));
});

// ── estimateImpactEuro ────────────────────────────────────────────────────────

test('estimateImpactEuro returns 0 for empty issues', () => {
  assert.equal(estimateImpactEuro([]), 0);
});

test('estimateImpactEuro uses heuristic for critical issue', () => {
  const impact = estimateImpactEuro([{ severity: 'critical' }]);
  assert.equal(impact, 5000);
});

test('estimateImpactEuro uses explicit impact_euro when present', () => {
  const impact = estimateImpactEuro([{ severity: 'critical', impact_euro: 12000 }]);
  assert.equal(impact, 12000);
});

test('estimateImpactEuro sums multiple issues', () => {
  const impact = estimateImpactEuro([
    { severity: 'critical' },
    { severity: 'high' },
    { severity: 'medium' },
  ]);
  assert.equal(impact, 5000 + 2000 + 500);
});
