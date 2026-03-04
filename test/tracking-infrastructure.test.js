/**
 * Tests for tracking-infrastructure.js module
 * (unit tests using mock data; no network calls)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { auditGA4 } from '../src/engine/modules/ga4-audit.js';
import { auditGTMWeb } from '../src/engine/modules/gtm-web-audit.js';
import { auditAds } from '../src/engine/modules/ads-audit.js';
import { auditDataQuality } from '../src/engine/modules/data-quality.js';

// ── auditGA4 ──────────────────────────────────────────────────────────────────

test('auditGA4 returns skipped output when no GA4 data', () => {
  const result = auditGA4({});
  assert.equal(result.module_id, 'ga4_audit');
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(i => i.id === 'ga4_data_unavailable'));
});

test('auditGA4 builds metrics from GA4 totals', () => {
  const ga4Data = {
    ok: true,
    ga4Totals: {
      ok: true,
      totals: { sessions: 1000, users: 800, conversions: 50, revenue: 5000 },
      events: [
        { eventName: 'view_item', count: 500 },
        { eventName: 'add_to_cart', count: 200 },
        { eventName: 'begin_checkout', count: 100 },
        { eventName: 'purchase', count: 50, revenue: 5000 },
      ],
    },
  };
  const result = auditGA4(ga4Data);
  assert.equal(result.ok, true);
  assert.equal(result.metrics.sessions, 1000);
  assert.equal(result.metrics.conversions, 50);
  assert.ok(result.score_contrib.score > 0);
});

test('auditGA4 detects missing ecommerce events', () => {
  const ga4Data = {
    ok: true,
    ga4Totals: {
      ok: true,
      totals: { sessions: 500, users: 400, conversions: 10, revenue: 1000 },
      events: [], // no ecommerce events
    },
  };
  const result = auditGA4(ga4Data);
  assert.ok(result.issues.some(i => i.id === 'ga4_ecom_events_missing'));
});

test('auditGA4 detects zero sessions as critical', () => {
  const ga4Data = {
    ok: true,
    ga4Totals: {
      ok: true,
      totals: { sessions: 0, users: 0, conversions: 0, revenue: 0 },
      events: [],
    },
  };
  const result = auditGA4(ga4Data);
  assert.ok(result.issues.some(i => i.id === 'ga4_zero_sessions' && i.severity === 'critical'));
});

test('auditGA4 score_contrib has weight 0.15', () => {
  const result = auditGA4({});
  assert.equal(result.score_contrib.weight, 0.15);
});

test('auditGA4 follows data contract structure', () => {
  const result = auditGA4({});
  assert.ok(result.module_id, 'has module_id');
  assert.ok(result.version, 'has version');
  assert.ok(result.inputs, 'has inputs');
  assert.ok(Array.isArray(result.observations), 'has observations array');
  assert.ok(Array.isArray(result.issues), 'has issues array');
  assert.ok(result.metrics !== undefined, 'has metrics');
  assert.ok(result.score_contrib, 'has score_contrib');
  assert.ok(Array.isArray(result.recommendations), 'has recommendations array');
});

// ── auditGTMWeb ───────────────────────────────────────────────────────────────

test('auditGTMWeb returns skipped when no GTM data', () => {
  const result = auditGTMWeb({});
  assert.equal(result.module_id, 'gtm_web_audit');
  assert.equal(result.ok, false);
  assert.ok(result.score_contrib.skipped);
});

test('auditGTMWeb detects duplicate GA4 tags', () => {
  const result = auditGTMWeb({
    ok: true,
    tags: [
      { name: 'GA4 Config 1', type: 'googanalytics_ga4_config' },
      { name: 'GA4 Config 2', type: 'googanalytics_ga4_config' },
    ],
    triggers: [],
    variables: [],
  });
  assert.ok(result.issues.some(i => i.id.includes('duplicate')));
});

test('auditGTMWeb detects missing GA4 tag', () => {
  const result = auditGTMWeb({
    ok: true,
    tags: [
      { name: 'Custom HTML', type: 'custom_html' },
    ],
    triggers: [],
    variables: [],
  });
  assert.ok(result.issues.some(i => i.id === 'gtm_no_ga4_tag'));
});

test('auditGTMWeb score_contrib weight is 0.10', () => {
  const result = auditGTMWeb({});
  assert.equal(result.score_contrib.weight, 0.10);
});

test('auditGTMWeb follows data contract structure', () => {
  const result = auditGTMWeb({});
  assert.ok(result.module_id);
  assert.ok(result.version);
  assert.ok(result.inputs);
  assert.ok(Array.isArray(result.observations));
  assert.ok(Array.isArray(result.issues));
  assert.ok(result.metrics !== undefined);
  assert.ok(result.score_contrib);
  assert.ok(Array.isArray(result.recommendations));
});

// ── auditAds ──────────────────────────────────────────────────────────────────

test('auditAds returns no-data output when both sources empty', () => {
  const result = auditAds({}, {}, {});
  assert.equal(result.module_id, 'ads_audit');
  assert.equal(result.ok, false);
  assert.ok(result.score_contrib.skipped);
});

test('auditAds computes ROAS correctly and flags negative ROAS', () => {
  const googleData = {
    ok: true,
    totals30d: { cost: 1000, conversions: 10, value: 500 }, // ROAS = 0.5
  };
  const result = auditAds(googleData, { ok: false }, {});
  assert.equal(result.ok, true);
  assert.ok(result.issues.some(i => i.id === 'google_roas_negative'));
});

test('auditAds does not flag negative ROAS when ROAS > 1', () => {
  const googleData = {
    ok: true,
    totals30d: { cost: 1000, conversions: 10, value: 3000 }, // ROAS = 3
  };
  const result = auditAds(googleData, { ok: false }, {});
  assert.ok(!result.issues.some(i => i.id === 'google_roas_negative'));
});

test('auditAds score_contrib weight is 0.15', () => {
  const result = auditAds({}, {}, {});
  assert.equal(result.score_contrib.weight, 0.15);
});

test('auditAds follows data contract structure', () => {
  const result = auditAds({}, {}, {});
  assert.ok(result.module_id);
  assert.ok(result.version);
  assert.ok(result.inputs);
  assert.ok(Array.isArray(result.observations));
  assert.ok(Array.isArray(result.issues));
  assert.ok(result.metrics !== undefined);
  assert.ok(result.score_contrib);
  assert.ok(Array.isArray(result.recommendations));
});

// ── auditDataQuality ──────────────────────────────────────────────────────────

test('auditDataQuality returns skipped when no GA4 data', () => {
  const result = auditDataQuality({}, {}, 'https://example.com');
  assert.equal(result.module_id, 'data_quality');
  assert.ok(result.score_contrib.skipped);
});

test('auditDataQuality detects self-referrals', () => {
  const ga4Data = {
    ok: true,
    totals: { sessions: 500, users: 400, conversions: 10, revenue: 1000 },
    rows: [
      { source: 'example.com', sessions: 50 },
      { source: 'google', sessions: 450 },
    ],
  };
  const result = auditDataQuality(ga4Data, {}, 'https://example.com');
  assert.ok(result.issues.some(i => i.id === 'dq_self_referrals'));
});

test('auditDataQuality does not flag self-referrals when source is external', () => {
  const ga4Data = {
    ok: true,
    totals: { sessions: 500, users: 400 },
    rows: [
      { source: 'google', sessions: 300 },
      { source: 'facebook.com', sessions: 200 },
    ],
  };
  const result = auditDataQuality(ga4Data, {}, 'https://example.com');
  assert.ok(!result.issues.some(i => i.id === 'dq_self_referrals'));
});

test('auditDataQuality detects page_view inflation', () => {
  const ga4Data = {
    ok: true,
    totals: { sessions: 100, screenPageViews: 6000 }, // 60 pages/session → inflation
    rows: [],
  };
  const result = auditDataQuality(ga4Data, {}, 'https://example.com');
  assert.ok(result.issues.some(i => i.id === 'dq_page_view_inflation'));
});

test('auditDataQuality score_contrib weight is 0.10', () => {
  const result = auditDataQuality({}, {}, 'https://example.com');
  assert.equal(result.score_contrib.weight, 0.10);
});

test('auditDataQuality follows data contract structure', () => {
  const result = auditDataQuality({}, {}, 'https://example.com');
  assert.ok(result.module_id);
  assert.ok(result.version);
  assert.ok(result.inputs);
  assert.ok(Array.isArray(result.observations));
  assert.ok(Array.isArray(result.issues));
  assert.ok(result.metrics !== undefined);
  assert.ok(result.score_contrib);
  assert.ok(Array.isArray(result.recommendations));
});
