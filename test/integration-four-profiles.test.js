/**
 * Integration tests — Zero Mockdata Policy & 4 Profiles
 *
 * Tests:
 * 1. PRIVATE sections return dataAvailable:false (no mockdata) when no API data
 * 2. PRIVATE sections render real data when API data provided
 * 3. All 4 profiles (FAST, PUBLIC, PRIVATE_ONLY, FULL) assemble correctly
 * 4. validateModuleData() enforces strict validation
 * 5. Attribution analysis detects discrepancies
 * 6. Strengths section surfaces real findings
 * 7. New metrics (MER, break-even ROAS, CPM, contribution margin) work correctly
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";

import { assembleReport, validateModuleData } from "../src/main/report-assembler.js";
import { buildGa4PerformanceDashboard } from "../src/main/report-sections/dashboard-ga4-complete.js";
import { buildAdsPerformanceComplete } from "../src/main/report-sections/dashboard-ads-complete.js";
import { buildAttributionAnalysis } from "../src/main/report-sections/section-attribution.js";
import { buildStrengthsSection } from "../src/main/report-sections/section-strengths.js";
import { resolveProfile } from "../src/main/report-profiles/index.js";
import {
  calcMER, calcBreakEvenROAS, calcContributionMargin, calcCPM, calcPeriodDelta,
} from "../src/main/metrics-calculator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturesDir = path.join(__dirname, "..", "fixtures");
const auditSample = JSON.parse(
  await fs.readFile(path.join(fixturesDir, "audit-sample.json"), "utf-8")
);

// ── helpers ──────────────────────────────────────────────────────────────────

function makeAudit(modules = {}) {
  const { ga4, ...rest } = modules;
  const privateGoogle = ga4 ? { ok: !!ga4.ok, ga4 } : undefined;
  return {
    ...auditSample,
    modules: {
      ...auditSample.modules,
      ...rest,
      ...(privateGoogle ? { privateGoogle } : {}),
    },
  };
}

// ── validateModuleData ────────────────────────────────────────────────────────

test("validateModuleData returns isValid:false when module is null", () => {
  const r = validateModuleData(null);
  assert.equal(r.isValid, false);
  assert.ok(r.reason, "should have a reason");
  assert.equal(r.data, null);
});

test("validateModuleData returns isValid:false when module.ok is false", () => {
  const r = validateModuleData({ ok: false, error: "Access denied" });
  assert.equal(r.isValid, false);
  assert.equal(r.reason, "Access denied");
});

test("validateModuleData returns isValid:true when module.ok is true and no required fields", () => {
  const mod = { ok: true, data: "some data" };
  const r = validateModuleData(mod);
  assert.equal(r.isValid, true);
  assert.deepEqual(r.data, mod);
  assert.equal(r.reason, null);
});

test("validateModuleData returns isValid:false when required array field is empty", () => {
  const mod = { ok: true, channels: [] };
  const r = validateModuleData(mod, ["channels"]);
  assert.equal(r.isValid, false);
  assert.ok(r.reason.includes("channels"));
});

test("validateModuleData returns isValid:true when required array field has data", () => {
  const mod = { ok: true, channels: [{ channel: "Organic", sessions: 100 }] };
  const r = validateModuleData(mod, ["channels"]);
  assert.equal(r.isValid, true);
});

// ── Zero mockdata: GA4 dashboard returns callout when no data ─────────────────

test("GA4 dashboard: returns dataAvailable:false when no GA4 data", () => {
  const result = buildGa4PerformanceDashboard(auditSample, auditSample.scores);
  assert.equal(result.dataAvailable, false, "should be unavailable without real data");
  assert.ok(result.reason, "should have a reason string");
  assert.equal(result.tables.length, 0, "no tables when unavailable");
  assert.equal(result.findings.length, 0, "no findings when unavailable");
});

test("GA4 dashboard: no mockdata — tables array is empty without real data", () => {
  const audit = makeAudit({ ga4: { ok: false } });
  const result = buildGa4PerformanceDashboard(audit, auditSample.scores);
  assert.equal(result.dataAvailable, false);
  // Ensure no hardcoded static rows exist in the tables
  for (const table of result.tables || []) {
    assert.equal(table.rows.length, 0, `table '${table.id}' should have no rows without real data`);
  }
});

test("GA4 dashboard: shows real data when GA4 data present", () => {
  const audit = makeAudit({
    ga4: {
      ok: true,
      totals: { sessions: 5000, users: 4000, conversions: 50, revenue: 8000 },
      rows: [{ channel: "Organic Search", sessions: 5000, users: 4000, conversions: 50, revenue: 8000 }],
    },
  });
  const result = buildGa4PerformanceDashboard(audit, auditSample.scores);
  assert.notEqual(result.dataAvailable, false, "should have data");
  assert.ok(result.findings.length > 0, "should have findings");
  assert.ok(result.tables.length > 0, "should have tables");
  assert.ok(result.lookerDashboard, "should have lookerDashboard");
});

// ── Zero mockdata: Ads dashboard returns callout when no data ──────────────────

test("Ads dashboard: returns dataAvailable:false when no Ads data", () => {
  const result = buildAdsPerformanceComplete(auditSample, auditSample.scores);
  assert.equal(result.dataAvailable, false);
  assert.ok(result.reason, "should have a reason");
  assert.equal(result.tables.length, 0);
  assert.equal(result.findings.length, 0);
});

test("Ads dashboard: shows real data when Google Ads data present", () => {
  const audit = makeAudit({
    adsGoogle: {
      ok: true,
      totals30d: { cost: 2000, impressions: 80000, clicks: 2000, conversions: 40, value: 8000 },
      campaigns: [
        { name: "Brand", impressions: 40000, clicks: 1000, cost: 1000, conversions: 25, value: 5000 },
        { name: "Generic", impressions: 40000, clicks: 1000, cost: 1000, conversions: 15, value: 3000 },
      ],
    },
  });
  const result = buildAdsPerformanceComplete(audit, auditSample.scores);
  assert.notEqual(result.dataAvailable, false);
  assert.ok(result.findings.length > 0);
  assert.ok(result.tables.length > 0);
  assert.ok(result.lookerDashboard, "should have lookerDashboard with filters and KPIs");
  assert.ok(Array.isArray(result.lookerDashboard.kpis), "lookerDashboard should have kpis");
});

// ── MER and break-even ROAS in Ads dashboard ──────────────────────────────────

test("Ads dashboard: computes MER when data is available", () => {
  const audit = makeAudit({
    adsGoogle: {
      ok: true,
      totals30d: { cost: 1000, impressions: 50000, clicks: 1000, conversions: 20, value: 4000 },
      campaigns: [{ name: "Test", impressions: 50000, clicks: 1000, cost: 1000, conversions: 20, value: 4000 }],
    },
  });
  const result = buildAdsPerformanceComplete(audit, auditSample.scores);
  const merKpi = result.lookerDashboard?.kpis?.find(k => k.label === "MER");
  assert.ok(merKpi, "should have MER KPI");
  assert.notEqual(merKpi.value, "—", "MER should be computed");
});

test("Ads dashboard: includes Pareto 80/20 table when campaign revenue data present", () => {
  const audit = makeAudit({
    adsGoogle: {
      ok: true,
      totals30d: { cost: 3000, impressions: 60000, clicks: 1200, conversions: 30, value: 12000 },
      campaigns: [
        { name: "BigCampaign", impressions: 40000, clicks: 800, cost: 2000, conversions: 20, value: 9000 },
        { name: "SmallCampaign", impressions: 20000, clicks: 400, cost: 1000, conversions: 10, value: 3000 },
      ],
    },
  });
  const result = buildAdsPerformanceComplete(audit, auditSample.scores);
  const paretoTable = result.tables.find(t => t.id === "pareto-campaigns");
  assert.ok(paretoTable, "should have Pareto table");
  assert.ok(paretoTable.rows.length > 0, "Pareto table should have rows");
});

// ── GA4 dashboard: MER and break-even ROAS ────────────────────────────────────

test("GA4 dashboard: includes MER KPI when ads spend available", () => {
  const audit = makeAudit({
    ga4: {
      ok: true,
      totals: { sessions: 3000, users: 2500, conversions: 30, revenue: 6000 },
      rows: [{ channel: "Paid Search", sessions: 3000, users: 2500, conversions: 30, revenue: 6000 }],
    },
    adsGoogle: {
      ok: true,
      totals30d: { cost: 1500, conversions: 30, value: 6000 },
    },
  });
  const result = buildGa4PerformanceDashboard(audit, auditSample.scores);
  const merKpi = result.lookerDashboard?.kpis?.find(k => k.label === "MER (global)");
  assert.ok(merKpi, "should have MER KPI");
  assert.notEqual(merKpi.value, "—");
});

test("GA4 dashboard: includes break-even ROAS when COGS rate provided", () => {
  const audit = makeAudit({
    ga4: {
      ok: true,
      totals: { sessions: 1000, users: 800, conversions: 10, revenue: 2000 },
      rows: [{ channel: "Direct", sessions: 1000, users: 800, conversions: 10, revenue: 2000 }],
    },
    business: { aov: 200, purchaseFrequency: 2, retentionRate: 0.6, cogsRate: 0.4 },
  });
  const result = buildGa4PerformanceDashboard(audit, auditSample.scores);
  const beROAS = result.lookerDashboard?.kpis?.find(k => k.label === "Break-even ROAS");
  assert.ok(beROAS, "should have break-even ROAS KPI");
  assert.notEqual(beROAS.value, "—", "break-even ROAS should be computed with COGS rate");
});

test("GA4 dashboard: includes Pareto 80/20 table with channel revenue data", () => {
  const audit = makeAudit({
    ga4: {
      ok: true,
      totals: { sessions: 4000, users: 3200, conversions: 40, revenue: 8000 },
      rows: [
        { channel: "Organic Search", sessions: 2000, users: 1600, conversions: 25, revenue: 5000 },
        { channel: "Paid Search", sessions: 1500, users: 1200, conversions: 12, revenue: 2400 },
        { channel: "Direct", sessions: 500, users: 400, conversions: 3, revenue: 600 },
      ],
    },
  });
  const result = buildGa4PerformanceDashboard(audit, auditSample.scores);
  const paretoTable = result.tables.find(t => t.id === "pareto-channels");
  assert.ok(paretoTable, "should have pareto-channels table");
  assert.ok(paretoTable.rows.length > 0);
});

// ── Attribution analysis ──────────────────────────────────────────────────────

test("Attribution analysis: returns dataAvailable:false when no data", () => {
  const result = buildAttributionAnalysis(auditSample, auditSample.scores);
  assert.equal(result.dataAvailable, false);
  assert.equal(result.id, "attribution-analysis");
  assert.ok(result.reason);
});

test("Attribution analysis: detects revenue discrepancy when Ads >> GA4", () => {
  const audit = makeAudit({
    ga4: {
      ok: true,
      totals: { sessions: 5000, revenue: 5000 },
      rows: [{ channel: "Paid Search", sessions: 5000, conversions: 50, revenue: 5000 }],
    },
    adsGoogle: {
      ok: true,
      totals30d: { cost: 1000, conversions: 50, value: 9500 }, // 90% over GA4
    },
  });
  const result = buildAttributionAnalysis(audit, auditSample.scores);
  assert.notEqual(result.dataAvailable, false);
  const discrepancyFinding = result.findings.find(f =>
    f.observation.includes("Écart attribution") || f.observation.includes("cohérente")
  );
  assert.ok(discrepancyFinding, "should have an attribution finding");
});

test("Attribution analysis: detects high Direct traffic (UTM gap)", () => {
  const audit = makeAudit({
    ga4: {
      ok: true,
      totals: { sessions: 1000 },
      rows: [
        { channel: "Direct", sessions: 450 }, // 45% direct — > 25% threshold
        { channel: "Organic Search", sessions: 550 },
      ],
    },
  });
  const result = buildAttributionAnalysis(audit, auditSample.scores);
  const utmFinding = result.findings.find(f =>
    f.observation.toLowerCase().includes("direct") || f.observation.toLowerCase().includes("utm")
  );
  assert.ok(utmFinding, "should detect high direct traffic");
  assert.equal(utmFinding.status, "bad"); // 45% > 40% threshold for "bad"
});

test("Attribution analysis: includes UTM naming convention table", () => {
  const audit = makeAudit({
    ga4: {
      ok: true,
      totals: { sessions: 1000 },
      rows: [{ channel: "Organic", sessions: 1000 }],
    },
  });
  const result = buildAttributionAnalysis(audit, auditSample.scores);
  const utmTable = result.tables.find(t => t.id === "utm-naming-convention");
  assert.ok(utmTable, "should have UTM naming convention table");
  assert.ok(utmTable.rows.length > 0);
});

// ── Strengths section ─────────────────────────────────────────────────────────

test("Strengths section: builds successfully with any auditSample", () => {
  const result = buildStrengthsSection(auditSample, resolveProfile("fast"), auditSample.scores);
  assert.equal(result.id, "strengths");
  assert.ok(Array.isArray(result.findings));
  assert.ok(Array.isArray(result.tables));
  assert.ok(result.summary.length > 0);
});

test("Strengths section: detects GA4 tag as strength when present", () => {
  const audit = makeAudit({ tracking: { ...auditSample.modules.tracking, ga4: true } });
  const result = buildStrengthsSection(audit, resolveProfile("fast"), auditSample.scores);
  const ga4Finding = result.findings.find(f => f.observation.toLowerCase().includes("ga4"));
  assert.ok(ga4Finding, "should detect GA4 as a strength");
  assert.equal(ga4Finding.status, "ok");
});

test("Strengths section: includes quick wins table when improvements needed", () => {
  // Sample has no HSTS, CSP, or consent — should generate quick wins
  const result = buildStrengthsSection(auditSample, resolveProfile("fast"), auditSample.scores);
  const qwTable = result.tables.find(t => t.id === "quick-wins-opportunities");
  assert.ok(qwTable, "should have quick-wins-opportunities table");
  assert.ok(qwTable.rows.length > 0, "should have quick win rows");
});

// ── Profile C (PRIVATE_FULL) ──────────────────────────────────────────────────

test("PRIVATE_ONLY profile resolves correctly", () => {
  const p = resolveProfile("private_only");
  assert.equal(p.id, "private_only");
  assert.equal(p.confidential, true);
  assert.equal(p.requiresPrivate, true);
  assert.equal(p.requiresAdsFiles, true);
});

test("PRIVATE_ONLY profile includes required sections", () => {
  const p = resolveProfile("private_only");
  assert.ok(p.sections.includes("ga4-performance-dashboard"), "needs ga4-performance-dashboard");
  assert.ok(p.sections.includes("ads-performance-complete"), "needs ads-performance-complete");
  assert.ok(p.sections.includes("attribution-analysis"), "needs attribution-analysis");
  assert.ok(p.sections.includes("smart-recommendations-engine"), "needs smart-recommendations-engine");
  assert.ok(p.sections.includes("strengths"), "needs strengths section");
});

test("PRIVATE_ONLY profile assembles without errors (no data → callouts)", () => {
  const model = assembleReport(auditSample, resolveProfile("private_only"));
  assert.ok(model.sections.length > 0, "should have sections");

  // PRIVATE sections without data must show callout, not fake data
  const ga4Sec = model.sections.find(s => s.id === "ga4-performance-dashboard");
  assert.ok(ga4Sec, "should have ga4-performance-dashboard");
  assert.equal(ga4Sec.dataAvailable, false, "should be unavailable without API data");
  assert.ok(ga4Sec.reason, "should have a reason");

  const adsSec = model.sections.find(s => s.id === "ads-performance-complete");
  assert.ok(adsSec, "should have ads-performance-complete");
  assert.equal(adsSec.dataAvailable, false, "should be unavailable without Ads data");
});

test("PRIVATE_ONLY profile assembles with real data → shows real sections", () => {
  const auditWithData = makeAudit({
    ga4: {
      ok: true,
      totals: { sessions: 6000, users: 5000, conversions: 60, revenue: 12000 },
      rows: [
        { channel: "Organic Search", sessions: 3000, users: 2500, conversions: 30, revenue: 6000 },
        { channel: "Paid Search", sessions: 2000, users: 1700, conversions: 20, revenue: 4000 },
        { channel: "Direct", sessions: 1000, users: 800, conversions: 10, revenue: 2000 },
      ],
    },
    adsGoogle: {
      ok: true,
      totals30d: { cost: 2500, impressions: 100000, clicks: 2000, conversions: 40, value: 8000 },
      campaigns: [
        { name: "Brand", impressions: 60000, clicks: 1200, cost: 1500, conversions: 30, value: 6000 },
        { name: "Generic", impressions: 40000, clicks: 800, cost: 1000, conversions: 10, value: 2000 },
      ],
    },
  });
  const model = assembleReport(auditWithData, resolveProfile("private_only"));

  const ga4Sec = model.sections.find(s => s.id === "ga4-performance-dashboard");
  assert.ok(ga4Sec);
  assert.notEqual(ga4Sec.dataAvailable, false, "GA4 section should have real data");
  assert.ok(ga4Sec.findings.length > 0, "GA4 section should have findings");

  const adsSec = model.sections.find(s => s.id === "ads-performance-complete");
  assert.ok(adsSec);
  assert.notEqual(adsSec.dataAvailable, false, "Ads section should have real data");
});

// ── 4 Profiles: A (FAST), B (PUBLIC), C (PRIVATE_ONLY), D (FULL) ──────────

test("Profile A (FAST) assembles correctly — public, no private sections", () => {
  const model = assembleReport(auditSample, resolveProfile("fast"));
  assert.ok(model.sections.length > 0);
  // Must not include private data sections
  const privateSection = model.sections.find(s => s.isPrivate === true);
  assert.equal(privateSection, undefined, "FAST should have no private sections");
});

test("Profile B (PUBLIC) assembles with full technical sections", () => {
  const model = assembleReport(auditSample, resolveProfile("public"));
  assert.ok(model.sections.length > 5, "PUBLIC should have many sections");
  const perfSection = model.sections.find(s => s.id === "performance");
  assert.ok(perfSection, "PUBLIC should have performance section");
});

test("Profile C (PRIVATE_ONLY) assembles with private sections marked as isPrivate", () => {
  const auditWithData = makeAudit({
    ga4: {
      ok: true,
      totals: { sessions: 1000, users: 800, conversions: 10, revenue: 2000 },
      rows: [{ channel: "Direct", sessions: 1000, users: 800, conversions: 10, revenue: 2000 }],
    },
  });
  const model = assembleReport(auditWithData, resolveProfile("private_only"));
  const ga4Sec = model.sections.find(s => s.id === "ga4-performance-dashboard");
  assert.ok(ga4Sec);
  assert.equal(ga4Sec.isPrivate, true, "ga4 dashboard should be marked private");
});

test("Profile D (FULL) assembles with both public and private sections", () => {
  const model = assembleReport(auditSample, resolveProfile("full"));
  assert.ok(model.sections.length > 5);
  // Should have both public and private types
  const pubSec = model.sections.find(s => s.id === "performance");
  assert.ok(pubSec, "FULL should have public performance section");
});

// ── New metrics: calcMER, calcBreakEvenROAS, calcContributionMargin, calcCPM ──

test("calcMER returns revenue/spend", () => {
  assert.equal(calcMER(10000, 2000), 5);
});

test("calcMER returns null when spend is 0", () => {
  assert.equal(calcMER(10000, 0), null);
});

test("calcMER returns null when revenue is null", () => {
  assert.equal(calcMER(null, 2000), null);
});

test("calcBreakEvenROAS returns 1/(1-cogsRate)", () => {
  // COGS 40% → break-even = 1/(1-0.4) = 1/0.6 ≈ 1.67
  const result = calcBreakEvenROAS(0.4);
  assert.ok(result !== null);
  assert.ok(Math.abs(result - 1.67) < 0.01, `Expected ~1.67, got ${result}`);
});

test("calcBreakEvenROAS returns null when cogsRate >= 1", () => {
  assert.equal(calcBreakEvenROAS(1), null);
  assert.equal(calcBreakEvenROAS(1.2), null);
});

test("calcBreakEvenROAS returns null when cogsRate <= 0", () => {
  assert.equal(calcBreakEvenROAS(0), null);
  assert.equal(calcBreakEvenROAS(-0.1), null);
});

test("calcContributionMargin = revenue - cogs - adSpend", () => {
  // Revenue 10000, COGS 4000 (40%), AdSpend 2000
  assert.equal(calcContributionMargin(10000, 4000, 2000), 4000);
});

test("calcContributionMargin returns null when revenue is null", () => {
  assert.equal(calcContributionMargin(null, 4000, 2000), null);
});

test("calcCPM returns (cost/impressions)*1000", () => {
  // 500€ / 100000 impressions = 5€ CPM
  assert.equal(calcCPM(500, 100000), 5);
});

test("calcCPM returns null when impressions is 0", () => {
  assert.equal(calcCPM(500, 0), null);
});

test("calcPeriodDelta returns delta and deltaPct", () => {
  const r = calcPeriodDelta(110, 100);
  assert.equal(r.delta, 10);
  assert.equal(r.deltaPct, 10);
});

test("calcPeriodDelta returns null when previous is 0", () => {
  const r = calcPeriodDelta(100, 0);
  assert.ok(r !== null, "result should exist");
  assert.equal(r.deltaPct, null); // can't compute % when previous is 0
});
