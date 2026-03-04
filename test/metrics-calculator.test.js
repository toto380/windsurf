/**
 * Tests for metrics-calculator.js and smart-recommendations.js
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  calcCPA, calcCPL, calcROAS, calcCAC, calcLTV, calcROI, calcPaybackPeriod,
  calcLTVCACRatio, calcConvRate, calcCPC, calcCTR, calcChannelMix,
  enrichCampaign, enrichChannel, calcBudgetAllocation,
} from "../src/main/metrics-calculator.js";

import { buildSmartRecommendations, PRIORITY } from "../src/main/smart-recommendations.js";

// ── metrics-calculator ──────────────────────────────────────────────────────

test("calcROAS returns revenue/spend", () => {
  assert.equal(calcROAS(250, 100), 2.5);
});

test("calcROAS returns null when spend is 0", () => {
  assert.equal(calcROAS(250, 0), null);
});

test("calcROAS returns null when revenue is null", () => {
  assert.equal(calcROAS(null, 100), null);
});

test("calcCPA returns cost/conversions", () => {
  assert.equal(calcCPA(500, 10), 50);
});

test("calcCPA returns null when conversions is 0", () => {
  assert.equal(calcCPA(500, 0), null);
});

test("calcCPL returns cost/leads", () => {
  assert.equal(calcCPL(300, 6), 50);
});

test("calcCAC returns totalMarketingCost/newCustomers", () => {
  assert.equal(calcCAC(1000, 20), 50);
});

test("calcLTV returns AOV × freq × (1/churn)", () => {
  // LTV = 230 × 2.1 × (1/0.35) = 1380
  const ltv = calcLTV(230, 2.1, 0.65);
  assert.ok(typeof ltv === "number", "LTV should be a number");
  assert.ok(ltv > 1300 && ltv < 1400, `LTV should be ~1380, got ${ltv}`);
});

test("calcLTV returns null when retentionRate is 0", () => {
  assert.equal(calcLTV(230, 2.1, 0), null);
});

test("calcLTV returns null when retentionRate is 1", () => {
  assert.equal(calcLTV(230, 2.1, 1), null);
});

test("calcROI returns ((revenue - cost) / cost) * 100", () => {
  assert.equal(calcROI(300, 100), 200);
});

test("calcROI returns negative for loss", () => {
  assert.equal(calcROI(50, 100), -50);
});

test("calcROI returns null when cost is 0", () => {
  assert.equal(calcROI(100, 0), null);
});

test("calcPaybackPeriod returns CAC/monthlyRevenue", () => {
  assert.equal(calcPaybackPeriod(120, 80), 1.5);
});

test("calcLTVCACRatio returns LTV/CAC", () => {
  assert.equal(calcLTVCACRatio(1200, 100), 12);
});

test("calcConvRate returns (conversions/sessions)*100", () => {
  assert.equal(calcConvRate(12, 1000), 1.2);
});

test("calcConvRate returns null when sessions is 0", () => {
  assert.equal(calcConvRate(12, 0), null);
});

test("calcCPC returns cost/clicks", () => {
  assert.equal(calcCPC(500, 100), 5);
});

test("calcCTR returns (clicks/impressions)*100", () => {
  assert.equal(calcCTR(50, 1000), 5);
});

test("calcChannelMix computes share percentages", () => {
  const channels = [
    { channel: "Organic", sessions: 600 },
    { channel: "Paid", sessions: 400 },
  ];
  const result = calcChannelMix(channels);
  assert.equal(result[0].sharePct, 60);
  assert.equal(result[1].sharePct, 40);
});

test("calcChannelMix handles empty array", () => {
  assert.deepEqual(calcChannelMix([]), []);
});

test("enrichCampaign adds SCALE badge for high ROAS", () => {
  const c = enrichCampaign({ name: "A", impressions: 10000, clicks: 500, cost: 1000, conversions: 50, revenue: 5000 });
  assert.equal(c.badge, "SCALE");
  assert.equal(c.metrics.roas, 5);
});

test("enrichCampaign adds KILL badge for ROAS < 1", () => {
  const c = enrichCampaign({ name: "B", impressions: 10000, clicks: 500, cost: 1000, conversions: 5, revenue: 500 });
  assert.equal(c.badge, "KILL");
});

test("enrichCampaign adds PAUSE badge for 1 <= ROAS < 2", () => {
  const c = enrichCampaign({ name: "C", impressions: 5000, clicks: 200, cost: 500, conversions: 10, revenue: 700 });
  assert.equal(c.badge, "PAUSE");
});

test("enrichCampaign adds TEST badge for 2 <= ROAS < 3", () => {
  const c = enrichCampaign({ name: "D", impressions: 5000, clicks: 200, cost: 500, conversions: 20, revenue: 1200 });
  assert.equal(c.badge, "TEST");
});

test("enrichCampaign has null badge when no revenue", () => {
  const c = enrichCampaign({ name: "E", impressions: 5000, clicks: 200, cost: 500, conversions: 10 });
  assert.equal(c.badge, null);
  assert.equal(c.metrics.roas, null);
});

test("enrichChannel adds convRate metric", () => {
  const ch = enrichChannel({ channel: "Organic", sessions: 1000, conversions: 20, revenue: 5000 });
  assert.equal(ch.metrics.convRate, 2);
});

test("enrichChannel computes ROAS when adSpend provided", () => {
  const ch = enrichChannel({ channel: "Paid", sessions: 500, conversions: 10, revenue: 3000 }, 1000);
  assert.equal(ch.metrics.roas, 3);
  assert.equal(ch.metrics.cac, 100);
});

test("calcBudgetAllocation assigns 0 to negative ROAS channels", () => {
  const channels = [
    { channel: "A", metrics: { roas: 4.0 } },
    { channel: "B", metrics: { roas: -0.5 } },
  ];
  const result = calcBudgetAllocation(channels, 10000);
  const b = result.find(c => c.channel === "B");
  assert.equal(b.optimalBudgetPct, 0);
});

// ── smart-recommendations ───────────────────────────────────────────────────

test("buildSmartRecommendations returns sorted array", () => {
  const recs = buildSmartRecommendations({
    roas: 0.8,
    convRate: 0.5,
    ltvCACRatio: 1.5,
    ga4DataAvailable: true,
    adsDataAvailable: true,
  });
  assert.ok(Array.isArray(recs), "should return array");
  assert.ok(recs.length > 0, "should return at least one recommendation");
  // CRITICAL should come first
  assert.equal(recs[0].priority, PRIORITY.CRITICAL);
});

test("buildSmartRecommendations flags ROAS < 1 as CRITICAL", () => {
  const recs = buildSmartRecommendations({ roas: 0.5, ga4DataAvailable: true, adsDataAvailable: true });
  assert.ok(recs.some(r => r.id === "roas_negative" && r.priority === PRIORITY.CRITICAL));
});

test("buildSmartRecommendations flags LTV/CAC < 3 as CRITICAL", () => {
  const recs = buildSmartRecommendations({ ltvCACRatio: 2.0, ga4DataAvailable: true, adsDataAvailable: true });
  assert.ok(recs.some(r => r.id === "ltv_cac_low" && r.priority === PRIORITY.CRITICAL));
});

test("buildSmartRecommendations flags attribution gap > 25% as CRITICAL", () => {
  const recs = buildSmartRecommendations({ pctConvMissingAttribution: 35, ga4DataAvailable: true, adsDataAvailable: true });
  assert.ok(recs.some(r => r.id === "attribution_incomplete" && r.priority === PRIORITY.CRITICAL));
});

test("buildSmartRecommendations flags no Ads data as HIGH", () => {
  const recs = buildSmartRecommendations({ ga4DataAvailable: true, adsDataAvailable: false });
  assert.ok(recs.some(r => r.id === "no_ads_data" && r.priority === PRIORITY.HIGH));
});

test("buildSmartRecommendations handles empty context", () => {
  const recs = buildSmartRecommendations({});
  assert.ok(Array.isArray(recs));
});

test("buildSmartRecommendations flags kill campaigns with cost", () => {
  const campaigns = [
    { name: "Bad Campaign", badge: "KILL", cost: 2000 },
  ];
  const recs = buildSmartRecommendations({ campaigns, ga4DataAvailable: true, adsDataAvailable: true });
  assert.ok(recs.some(r => r.id === "campaigns_kill"));
});
