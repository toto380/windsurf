/**
 * Tests for dashboard-ga4-complete.js and dashboard-ads-complete.js section builders.
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";

import { buildGa4PerformanceDashboard } from "../src/main/report-sections/dashboard-ga4-complete.js";
import { buildAdsPerformanceComplete } from "../src/main/report-sections/dashboard-ads-complete.js";
import { assembleReport } from "../src/main/report-assembler.js";
import { resolveProfile } from "../src/main/report-profiles/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturesDir = path.join(__dirname, "..", "fixtures");
const auditSample = JSON.parse(
  await fs.readFile(path.join(fixturesDir, "audit-sample.json"), "utf-8")
);

// ── buildGa4PerformanceDashboard ─────────────────────────────────────────────

test("buildGa4PerformanceDashboard returns dataAvailable:false when no GA4 data", () => {
  const result = buildGa4PerformanceDashboard(auditSample, auditSample.scores);
  assert.equal(result.id, "ga4-performance-dashboard");
  assert.equal(result.dataAvailable, false);
  assert.ok(result.reason, "should have a reason");
});

test("buildGa4PerformanceDashboard builds section when GA4 data present", () => {
  const auditWithGA4 = {
    ...auditSample,
    modules: {
      ...auditSample.modules,
      privateGoogle: {
        ok: true,
        ga4: {
          ok: true,
          totals: { sessions: 12450, users: 9800, conversions: 87, revenue: 14200.50 },
          rows: [
            { channel: "Organic Search", sessions: 4200, users: 3500, conversions: 31, revenue: 5100 },
            { channel: "Paid Search", sessions: 3100, users: 2600, conversions: 28, revenue: 4800 },
            { channel: "Direct", sessions: 2400, users: 1900, conversions: 15, revenue: 2500 },
          ],
        },
      },
    },
  };
  const result = buildGa4PerformanceDashboard(auditWithGA4, auditSample.scores);
  assert.equal(result.id, "ga4-performance-dashboard");
  assert.notEqual(result.dataAvailable, false);
  assert.ok(result.findings.length > 0, "should have findings");
  assert.ok(result.actions.length > 0, "should have actions");
  assert.ok(result.tables.length > 0, "should have tables");
  assert.ok(result.lookerDashboard, "should have lookerDashboard");
});

test("buildGa4PerformanceDashboard lookerDashboard has kpis array", () => {
  const auditWithGA4 = {
    ...auditSample,
    modules: {
      ...auditSample.modules,
      privateGoogle: {
        ok: true,
        ga4: {
          ok: true,
          totals: { sessions: 1000, users: 800, conversions: 10, revenue: 2000 },
          rows: [{ channel: "Direct", sessions: 1000, users: 800, conversions: 10, revenue: 2000 }],
        },
      },
    },
  };
  const result = buildGa4PerformanceDashboard(auditWithGA4, auditSample.scores);
  assert.ok(Array.isArray(result.lookerDashboard.kpis), "kpis should be array");
  assert.ok(result.lookerDashboard.kpis.length >= 4, "should have at least 4 KPI cards");
});

test("buildGa4PerformanceDashboard computes LTV when business data provided", () => {
  const audit = {
    ...auditSample,
    modules: {
      ...auditSample.modules,
      privateGoogle: {
        ok: true,
        ga4: {
          ok: true,
          totals: { sessions: 1000, users: 800, conversions: 10, revenue: 2000 },
          rows: [{ channel: "Direct", sessions: 1000, users: 800, conversions: 10, revenue: 2000 }],
        },
      },
      business: { aov: 230, purchaseFrequency: 2.1, retentionRate: 0.65 },
    },
  };
  const result = buildGa4PerformanceDashboard(audit, auditSample.scores);
  const ltvSummary = result.summary.find(s => s.includes("LTV"));
  assert.ok(ltvSummary, "summary should mention LTV");
});

test("buildGa4PerformanceDashboard includes smartRecommendations", () => {
  const auditWithGA4 = {
    ...auditSample,
    modules: {
      ...auditSample.modules,
      privateGoogle: {
        ok: true,
        ga4: {
          ok: true,
          totals: { sessions: 1000, users: 800, conversions: 5, revenue: 500 },
          rows: [{ channel: "Direct", sessions: 1000, users: 800, conversions: 5, revenue: 500 }],
        },
      },
    },
  };
  const result = buildGa4PerformanceDashboard(auditWithGA4, auditSample.scores);
  assert.ok(Array.isArray(result.smartRecommendations), "should have smartRecommendations array");
});

// ── buildAdsPerformanceComplete ──────────────────────────────────────────────

test("buildAdsPerformanceComplete returns dataAvailable:false when no Ads data", () => {
  const result = buildAdsPerformanceComplete(auditSample, auditSample.scores);
  assert.equal(result.id, "ads-performance-complete");
  assert.equal(result.dataAvailable, false);
  assert.ok(result.reason, "should have a reason");
});

test("buildAdsPerformanceComplete builds section when Google Ads data present", () => {
  const auditWithAds = {
    ...auditSample,
    modules: {
      ...auditSample.modules,
      adsGoogle: {
        ok: true,
        totals30d: { cost: 5000, impressions: 100000, clicks: 3000, conversions: 60, value: 18000 },
        campaigns: [
          { name: "Brand", impressions: 50000, clicks: 1500, cost: 1500, conversions: 30, value: 9000 },
          { name: "Non-Brand", impressions: 50000, clicks: 1500, cost: 3500, conversions: 30, value: 9000 },
        ],
      },
    },
  };
  const result = buildAdsPerformanceComplete(auditWithAds, auditSample.scores);
  assert.equal(result.id, "ads-performance-complete");
  assert.notEqual(result.dataAvailable, false);
  assert.ok(result.findings.length > 0, "should have findings");
  assert.ok(result.tables.length > 0, "should have tables");
});

test("buildAdsPerformanceComplete assigns SCALE badge to high ROAS campaign", () => {
  const auditWithAds = {
    ...auditSample,
    modules: {
      ...auditSample.modules,
      adsGoogle: {
        ok: true,
        totals30d: { cost: 1000, impressions: 50000, clicks: 1000, conversions: 20, value: 6000 },
        campaigns: [
          { name: "HighROAS", impressions: 50000, clicks: 1000, cost: 1000, conversions: 20, value: 6000 },
        ],
      },
    },
  };
  const result = buildAdsPerformanceComplete(auditWithAds, auditSample.scores);
  // The ROAS is 6, so should be SCALE — verify table row contains SCALE
  const googleTable = result.tables.find(t => t.id === "google-campaigns");
  assert.ok(googleTable, "should have google-campaigns table");
  const scaleCampaign = googleTable.rows.find(r => r.some(cell => String(cell).includes("SCALE")));
  assert.ok(scaleCampaign, "should have at least one SCALE row");
});

test("buildAdsPerformanceComplete includes smartRecommendations", () => {
  const auditWithAds = {
    ...auditSample,
    modules: {
      ...auditSample.modules,
      adsGoogle: {
        ok: true,
        totals30d: { cost: 1000, impressions: 10000, clicks: 200, conversions: 2, value: 500 },
        campaigns: [
          { name: "BadCampaign", impressions: 10000, clicks: 200, cost: 1000, conversions: 2, value: 500 },
        ],
      },
    },
  };
  const result = buildAdsPerformanceComplete(auditWithAds, auditSample.scores);
  assert.ok(Array.isArray(result.smartRecommendations), "should have smartRecommendations");
  assert.ok(result.smartRecommendations.length > 0, "should have at least one recommendation");
});

test("buildAdsPerformanceComplete includes budget-allocation-optimization table", () => {
  const auditWithAds = {
    ...auditSample,
    modules: {
      ...auditSample.modules,
      adsGoogle: {
        ok: true,
        totals30d: { cost: 3000, impressions: 50000, clicks: 1000, conversions: 30, value: 10000 },
        campaigns: [
          { name: "A", impressions: 30000, clicks: 600, cost: 2000, conversions: 25, value: 8000 },
          { name: "B", impressions: 20000, clicks: 400, cost: 1000, conversions: 5, value: 2000 },
        ],
      },
    },
  };
  const result = buildAdsPerformanceComplete(auditWithAds, auditSample.scores);
  const budgetTable = result.tables.find(t => t.id === "budget-allocation-optimization");
  assert.ok(budgetTable, "should include budget-allocation-optimization table");
});

// ── Integration: assembleReport with private_only profile ─────────────────────────

test("assembleReport with private_only profile includes ga4-performance-dashboard section", () => {
  const model = assembleReport(auditSample, resolveProfile("private_only"));
  const section = model.sections.find(s => s.id === "ga4-performance-dashboard");
  assert.ok(section, "private_only profile should include ga4-performance-dashboard");
});

test("assembleReport with private_only profile includes ads-performance-complete section", () => {
  const model = assembleReport(auditSample, resolveProfile("private_only"));
  const section = model.sections.find(s => s.id === "ads-performance-complete");
  assert.ok(section, "private_only profile should include ads-performance-complete");
});

test("assembleReport with private_only profile includes smart-recommendations-engine section", () => {
  const model = assembleReport(auditSample, resolveProfile("private_only"));
  const section = model.sections.find(s => s.id === "smart-recommendations-engine");
  assert.ok(section, "private_only profile should include smart-recommendations-engine");
});

test("assembleReport with private_only profile includes ads-performance-complete", () => {
  const model = assembleReport(auditSample, resolveProfile("private_only"));
  const section = model.sections.find(s => s.id === "ads-performance-complete");
  assert.ok(section, "private_only profile should include ads-performance-complete");
});
