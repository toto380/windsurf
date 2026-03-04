/**
 * Tests for src/main/report-gen-html.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'fs-extra';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

import { generateHtmlReport, generateAllHtmlReports } from '../src/main/report-gen-html.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAuditResults(overrides = {}) {
  return {
    meta: {
      company: 'Test Corp',
      url: 'https://example.com',
      timestampIso: '2025-01-01T12:00:00.000Z',
      reportModules: { publicLight: true, publicFull: false, privateAds: false, privateGoogle: false },
      accessMode: 'public',
      auditMode: 'fast',
      lang: 'fr',
      privateErrors: [],
      ...overrides.meta,
    },
    scores: {
      global: 68,
      tracking: 55,
      seo: 72,
      performance: 80,
      security: 60,
      headers: 65,
      robots: 90,
      schema: 50,
      ...overrides.scores,
    },
    modules: {
      tracking: { score: 55, issues: [] },
      seo: { score: 72, issues: [] },
      security: { score: 60, issues: [] },
      securityHeaders: { score: 65, issues: [] },
      lighthouse: { skipped: false, performance: 0.80, accessibility: 0.92, bestPractices: 0.88, seo: 0.91 },
      ...overrides.modules,
    },
  };
}

// ── generateHtmlReport ────────────────────────────────────────────────────────

test('generateHtmlReport creates an HTML file', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stratads-test-'));
  try {
    const results = makeAuditResults();
    const { htmlPath, mode } = await generateHtmlReport(results, tmpDir, 'test');
    assert.ok(await fs.pathExists(htmlPath), `HTML file should exist at ${htmlPath}`);
    assert.ok(typeof mode === 'string', 'mode should be a string');
    const content = await fs.readFile(htmlPath, 'utf-8');
    assert.ok(content.includes('<!DOCTYPE html>'), 'should have DOCTYPE');
    assert.ok(content.length > 500, 'should have non-trivial content');
  } finally {
    await fs.remove(tmpDir);
  }
});

test('generateHtmlReport prospection mode produces compact output', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stratads-test-'));
  try {
    const results = makeAuditResults({
      meta: { reportModules: { publicLight: true } },
    });
    const { mode, htmlPath } = await generateHtmlReport(results, tmpDir, 'test');
    assert.equal(mode, 'prospection');
    const content = await fs.readFile(htmlPath, 'utf-8');
    assert.ok(content.includes('Prospection'), 'should mention Prospection');
    assert.ok(content.includes('Quick Wins'), 'should have Quick Wins');
  } finally {
    await fs.remove(tmpDir);
  }
});

test('generateHtmlReport public_full mode produces full report', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stratads-test-'));
  try {
    const results = makeAuditResults({
      meta: { reportModules: { publicFull: true }, accessMode: 'public' },
    });
    const { mode, htmlPath } = await generateHtmlReport(results, tmpDir, 'test');
    assert.equal(mode, 'public_full');
    const content = await fs.readFile(htmlPath, 'utf-8');
    assert.ok(content.includes("Plan d'action"), 'should have plan d action (roadmap)');
    assert.ok(content.includes('Infrastructure Tracking'), 'should have tracking section');
  } finally {
    await fs.remove(tmpDir);
  }
});

test('generateHtmlReport private_only mode includes CONFIDENTIEL banner', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stratads-test-'));
  try {
    const results = makeAuditResults({
      meta: { reportModules: { privateAds: true, privateGoogle: true }, accessMode: 'private' },
    });
    const { mode, htmlPath } = await generateHtmlReport(results, tmpDir, 'test');
    assert.equal(mode, 'private_only');
    const content = await fs.readFile(htmlPath, 'utf-8');
    assert.ok(content.includes('CONFIDENTIEL'), 'private report should have CONFIDENTIEL banner');
  } finally {
    await fs.remove(tmpDir);
  }
});

test('generateHtmlReport public_private mode shows 360 content', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stratads-test-'));
  try {
    const results = makeAuditResults({
      meta: {
        reportModules: { publicFull: true, privateAds: true, privateGoogle: true },
        accessMode: 'mixed',
      },
    });
    const { mode, htmlPath } = await generateHtmlReport(results, tmpDir, 'test');
    assert.equal(mode, 'public_private');
    const content = await fs.readFile(htmlPath, 'utf-8');
    assert.ok(content.includes('360'), 'should have 360 content');
    assert.ok(content.includes('CONFIDENTIEL'), 'should have CONFIDENTIEL banner');
  } finally {
    await fs.remove(tmpDir);
  }
});

test('generateHtmlReport embeds company name in title', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stratads-test-'));
  try {
    const results = makeAuditResults({ meta: { company: 'AcmeCorp' } });
    const { htmlPath } = await generateHtmlReport(results, tmpDir, 'test');
    const content = await fs.readFile(htmlPath, 'utf-8');
    assert.ok(content.includes('AcmeCorp'), 'should include company name');
  } finally {
    await fs.remove(tmpDir);
  }
});

test('generateHtmlReport includes global score in HTML', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stratads-test-'));
  try {
    const results = makeAuditResults({ scores: { global: 73 } });
    const { htmlPath } = await generateHtmlReport(results, tmpDir, 'test');
    const content = await fs.readFile(htmlPath, 'utf-8');
    assert.ok(content.includes('73'), 'should include global score 73');
  } finally {
    await fs.remove(tmpDir);
  }
});

test('generateHtmlReport includes issues in output', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stratads-test-'));
  try {
    const results = makeAuditResults({
      modules: {
        trackingInfrastructure: {
          module_id: 'tracking_infrastructure',
          version: '1.0.0',
          issues: [{ id: 'no_ga4', title: 'GA4 non détecté', severity: 'critical', confidence: 0.9 }],
          recommendations: [],
          observations: [],
          metrics: {},
          score_contrib: { weight: 0.15, score: 40 },
        },
      },
    });
    const { htmlPath } = await generateHtmlReport(results, tmpDir, 'test');
    const content = await fs.readFile(htmlPath, 'utf-8');
    assert.ok(content.includes('critical'), 'should include severity');
  } finally {
    await fs.remove(tmpDir);
  }
});

// ── generateAllHtmlReports ────────────────────────────────────────────────────

test('generateAllHtmlReports produces 4 HTML files', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stratads-test-'));
  try {
    const results = makeAuditResults();
    const outputs = await generateAllHtmlReports(results, tmpDir, 'test');
    assert.equal(outputs.length, 4);
    for (const output of outputs) {
      assert.ok(await fs.pathExists(output.htmlPath), `File should exist: ${output.htmlPath}`);
      assert.ok(['prospection', 'public_full', 'private_only', 'public_private'].includes(output.mode));
    }
  } finally {
    await fs.remove(tmpDir);
  }
});

test('generateAllHtmlReports all files are valid HTML', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stratads-test-'));
  try {
    const results = makeAuditResults();
    const outputs = await generateAllHtmlReports(results, tmpDir, 'test');
    for (const output of outputs) {
      const content = await fs.readFile(output.htmlPath, 'utf-8');
      assert.ok(content.includes('<!DOCTYPE html>'), `${output.mode}: should have DOCTYPE`);
      assert.ok(content.includes('</html>'), `${output.mode}: should have closing html tag`);
    }
  } finally {
    await fs.remove(tmpDir);
  }
});

test('generateAllHtmlReports prospection is shortest output', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stratads-test-'));
  try {
    const results = makeAuditResults();
    const outputs = await generateAllHtmlReports(results, tmpDir, 'test');
    const sizes = {};
    for (const output of outputs) {
      const content = await fs.readFile(output.htmlPath, 'utf-8');
      sizes[output.mode] = content.length;
    }
    // Prospection should be shorter than public_full and public_private
    assert.ok(sizes.prospection < sizes.public_full, 'prospection should be shorter than public_full');
    assert.ok(sizes.prospection < sizes.public_private, 'prospection should be shorter than public_private');
  } finally {
    await fs.remove(tmpDir);
  }
});
