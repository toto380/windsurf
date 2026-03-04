/**
 * Tests for src/core/quality-gate.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateModuleOutput,
  checkPrivatePreconditions,
  validateAllModules,
} from '../src/core/quality-gate.js';

// ── Minimal valid output ──────────────────────────────────────────────────────

function makeValid(overrides = {}) {
  return {
    module_id: 'test_module',
    version: '1.0.0',
    inputs: { url: 'https://example.com' },
    observations: [{ type: 'test', value: 'ok' }],
    issues: [],
    metrics: {},
    score_contrib: { weight: 0.15, score: 80 },
    recommendations: [],
    ...overrides,
  };
}

// ── validateModuleOutput ──────────────────────────────────────────────────────

test('validateModuleOutput passes for valid output', () => {
  const result = validateModuleOutput(makeValid());
  assert.equal(result.valid, true, `Errors: ${result.errors.join(', ')}`);
});

test('validateModuleOutput fails for null input', () => {
  const result = validateModuleOutput(null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('validateModuleOutput fails when module_id missing', () => {
  const output = makeValid();
  delete output.module_id;
  const result = validateModuleOutput(output);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('module_id')));
});

test('validateModuleOutput fails when version has invalid format', () => {
  const result = validateModuleOutput(makeValid({ version: '1.0' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('version')));
});

test('validateModuleOutput fails when score_contrib.score out of range', () => {
  const result = validateModuleOutput(makeValid({ score_contrib: { weight: 0.1, score: 150 } }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('score')));
});

test('validateModuleOutput fails when score_contrib.weight out of range', () => {
  const result = validateModuleOutput(makeValid({ score_contrib: { weight: 1.5, score: 80 } }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('weight')));
});

test('validateModuleOutput warns when no observations', () => {
  const result = validateModuleOutput(makeValid({ observations: [] }));
  assert.ok(result.warnings.some(w => w.includes('observations') || w.includes('evidence')));
});

test('validateModuleOutput warns on duplicate issue ids', () => {
  const output = makeValid({
    observations: [{ type: 'test', value: 'x' }],
    issues: [
      { id: 'dup_id', title: 'A', severity: 'high' },
      { id: 'dup_id', title: 'B', severity: 'medium' },
    ],
  });
  const result = validateModuleOutput(output);
  assert.ok(result.warnings.some(w => w.includes('dup_id')));
});

test('validateModuleOutput detects private key leakage', () => {
  const output = makeValid({
    metrics: {
      private_key: '-----BEGIN RSA PRIVATE KEY-----\nfakekeydata\n-----END RSA PRIVATE KEY-----',
    },
  });
  const result = validateModuleOutput(output);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.toLowerCase().includes('secret') || e.toLowerCase().includes('private')));
});

test('validateModuleOutput passes for skipped module', () => {
  const result = validateModuleOutput(makeValid({ skipped: true, score_contrib: { weight: 0.15, score: 0, skipped: true } }));
  assert.equal(result.valid, true);
});

// ── checkPrivatePreconditions ─────────────────────────────────────────────────

test('checkPrivatePreconditions allows public mode without private params', () => {
  const result = checkPrivatePreconditions({ reportModules: { publicFull: true } }, 'public_full');
  assert.equal(result.allowed, true);
  assert.equal(result.missing.length, 0);
});

test('checkPrivatePreconditions blocks private_only without service account', () => {
  const result = checkPrivatePreconditions(
    { reportModules: { privateGoogle: true }, ga4PropertyId: '123' },
    'private_only'
  );
  assert.equal(result.allowed, false);
  assert.ok(result.missing.some(m => m.includes('serviceAccountJsonPath')));
});

test('checkPrivatePreconditions allows private with service account + property', () => {
  const result = checkPrivatePreconditions(
    {
      reportModules: { privateGoogle: true },
      serviceAccountJsonPath: '/path/to/sa.json',
      ga4PropertyId: '123456789',
    },
    'private_only'
  );
  assert.equal(result.allowed, true);
});

test('checkPrivatePreconditions blocks private_ads without export files', () => {
  const result = checkPrivatePreconditions(
    { reportModules: { privateAds: true }, adsExportPaths: [], metaAdsExportPaths: [] },
    'private_only'
  );
  assert.equal(result.allowed, false);
  assert.ok(result.missing.some(m => m.includes('adsExportPaths')));
});

test('checkPrivatePreconditions allows private_ads with google files', () => {
  const result = checkPrivatePreconditions(
    { reportModules: { privateAds: true }, adsExportPaths: ['/file.csv'] },
    'private_only'
  );
  assert.equal(result.allowed, true);
});

// ── validateAllModules ────────────────────────────────────────────────────────

test('validateAllModules marks skipped modules as valid', () => {
  const auditResults = {
    modules: {
      tracking: { skipped: true },
      ga4Audit: { skipped: true },
    },
  };
  const result = validateAllModules(auditResults);
  assert.equal(result.moduleResults.tracking.skipped, true);
  assert.equal(result.moduleResults.tracking.valid, true);
});

test('validateAllModules marks legacy modules (no module_id) as valid', () => {
  const auditResults = {
    modules: {
      lighthouse: { performance: 0.85, skipped: false },
    },
  };
  const result = validateAllModules(auditResults);
  assert.equal(result.moduleResults.lighthouse.legacy, true);
  assert.equal(result.moduleResults.lighthouse.valid, true);
});

test('validateAllModules validates data-contract modules', () => {
  const validOutput = makeValid();
  const auditResults = { modules: { testModule: validOutput } };
  const result = validateAllModules(auditResults);
  assert.equal(result.moduleResults.testModule.valid, true);
});

test('validateAllModules returns valid=false when any module fails', () => {
  const badOutput = makeValid({ version: 'bad' });
  const auditResults = { modules: { badModule: badOutput } };
  const result = validateAllModules(auditResults);
  assert.equal(result.valid, false);
  assert.equal(result.moduleResults.badModule.valid, false);
});
