/**
 * Metrics Calculator
 * Computes acquisition, conversion, and performance metrics from raw data.
 *
 * All functions are pure: they return null when inputs are missing/invalid
 * instead of inventing values.
 *
 * Supported metrics:
 *   CPA, CPL, ROAS, CAC, LTV, ROI, Payback Period,
 *   Conversion Rate, CPC, Channel Mix, LTV/CAC Ratio
 */

// ---------------------------------------------------------------------------
// Safe arithmetic helpers
// ---------------------------------------------------------------------------

function safeNum(x) {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function div(a, b) {
  const na = safeNum(a);
  const nb = safeNum(b);
  if (na === null || nb === null || nb === 0) return null;
  return na / nb;
}

function round(n, d = 2) {
  if (n === null || !Number.isFinite(n)) return null;
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

// ---------------------------------------------------------------------------
// Acquisition Metrics
// ---------------------------------------------------------------------------

/**
 * CPA — Cost Per Acquisition
 * = totalCost / totalConversions
 */
export function calcCPA(totalCost, totalConversions) {
  return round(div(totalCost, totalConversions));
}

/**
 * CPL — Cost Per Lead
 * = totalCost / totalLeads
 */
export function calcCPL(totalCost, totalLeads) {
  return round(div(totalCost, totalLeads));
}

/**
 * ROAS — Return On Ad Spend
 * = revenue / adSpend
 */
export function calcROAS(revenue, adSpend) {
  return round(div(revenue, adSpend));
}

/**
 * CAC — Customer Acquisition Cost
 * = totalMarketingCost / newCustomers
 */
export function calcCAC(totalMarketingCost, newCustomers) {
  return round(div(totalMarketingCost, newCustomers));
}

/**
 * LTV — Lifetime Value
 * = averageOrderValue × purchaseFrequency × (1 / churnRate)
 * where churnRate = 1 - retentionRate
 */
export function calcLTV(aov, purchaseFrequency, retentionRate) {
  const na = safeNum(aov);
  const nf = safeNum(purchaseFrequency);
  const nr = safeNum(retentionRate);
  if (na === null || nf === null || nr === null) return null;
  if (nr <= 0 || nr >= 1) return null;
  const churn = 1 - nr;
  return round(na * nf * (1 / churn));
}

/**
 * ROI — Return On Investment
 * = ((revenue - cost) / cost) × 100   (as percentage points)
 */
export function calcROI(revenue, cost) {
  const nr = safeNum(revenue);
  const nc = safeNum(cost);
  if (nr === null || nc === null || nc === 0) return null;
  return round(((nr - nc) / nc) * 100);
}

/**
 * Payback Period (months)
 * = CAC / monthlyRevenuePerCustomer
 */
export function calcPaybackPeriod(cac, monthlyRevenuePerCustomer) {
  return round(div(cac, monthlyRevenuePerCustomer));
}

/**
 * LTV/CAC Ratio
 * = ltv / cac
 * Target: > 3
 */
export function calcLTVCACRatio(ltv, cac) {
  return round(div(ltv, cac));
}

// ---------------------------------------------------------------------------
// Conversion Metrics
// ---------------------------------------------------------------------------

/**
 * Conversion Rate (%)
 * = (conversions / sessions) × 100
 */
export function calcConvRate(conversions, sessions) {
  const r = div(conversions, sessions);
  return r === null ? null : round(r * 100);
}

/**
 * CPC — Cost Per Click
 * = totalCost / totalClicks
 */
export function calcCPC(totalCost, totalClicks) {
  return round(div(totalCost, totalClicks));
}

/**
 * CTR — Click-Through Rate (%)
 * = (clicks / impressions) × 100
 */
export function calcCTR(clicks, impressions) {
  const r = div(clicks, impressions);
  return r === null ? null : round(r * 100);
}

// ---------------------------------------------------------------------------
// Channel Mix
// ---------------------------------------------------------------------------

/**
 * Compute channel mix percentages from a list of channels.
 * Each channel is expected to have a `sessions` (or `spend`) property.
 *
 * @param {object[]} channels - array of { channel, sessions }
 * @returns {object[]} channels enriched with `sharePct`
 */
export function calcChannelMix(channels) {
  if (!Array.isArray(channels) || channels.length === 0) return [];
  const total = channels.reduce((s, c) => s + (safeNum(c.sessions) ?? 0), 0);
  if (total === 0) return channels.map(c => ({ ...c, sharePct: null }));
  return channels.map(c => ({
    ...c,
    sharePct: round(((safeNum(c.sessions) ?? 0) / total) * 100),
  }));
}

// ---------------------------------------------------------------------------
// Campaign-level metrics enrichment
// ---------------------------------------------------------------------------

/**
 * Enrich a campaign object with computed metrics.
 * Expected input: { name, impressions, clicks, cost, conversions, revenue? }
 */
export function enrichCampaign(campaign) {
  const { impressions, clicks, cost, conversions } = campaign;
  const revenue = safeNum(campaign.revenue ?? campaign.value ?? null);
  const roas = calcROAS(revenue, safeNum(cost));
  const cpa = calcCPA(safeNum(cost), safeNum(conversions));
  const ctr = calcCTR(safeNum(clicks), safeNum(impressions));
  const cpc = calcCPC(safeNum(cost), safeNum(clicks));
  const convRate = calcConvRate(safeNum(conversions), safeNum(clicks));

  // Recommendation badge based on ROAS
  let badge = null;
  if (roas !== null) {
    if (roas >= 3.0) badge = "SCALE";
    else if (roas >= 2.0) badge = "TEST";
    else if (roas >= 1.0) badge = "PAUSE";
    else badge = "KILL";
  }

  return {
    ...campaign,
    metrics: { roas, cpa, ctr, cpc, convRate },
    badge,
  };
}

// ---------------------------------------------------------------------------
// Channel-level metrics enrichment (including CAC, ROAS)
// ---------------------------------------------------------------------------

/**
 * Enrich a GA4 channel object with computed acquisition metrics.
 * Expected input: { channel, sessions, users, conversions, revenue, convRate? }
 * Optional: adSpend per channel
 */
export function enrichChannel(channel, adSpend = null) {
  const sessions = safeNum(channel.sessions);
  const conversions = safeNum(channel.conversions);
  const revenue = safeNum(channel.revenue);
  const spend = safeNum(adSpend);

  const convRate = calcConvRate(conversions, sessions);
  const roas = revenue !== null && spend !== null ? calcROAS(revenue, spend) : null;
  const cac = spend !== null && conversions !== null ? calcCAC(spend, conversions) : null;

  return {
    ...channel,
    metrics: { convRate, roas, cac },
  };
}

// ---------------------------------------------------------------------------
// Media & Margin Metrics
// ---------------------------------------------------------------------------

/**
 * MER — Marketing Efficiency Ratio
 * = totalRevenue / totalAdSpend  (all channels combined)
 * Unlike ROAS (per platform), MER reflects the holistic media efficiency.
 */
export function calcMER(totalRevenue, totalAdSpend) {
  return round(div(totalRevenue, totalAdSpend));
}

/**
 * Break-even ROAS
 * = 1 / (1 - cogsRate)   where cogsRate = COGS / Revenue  (e.g. 0.40 for 40% COGS)
 * Minimum ROAS needed to cover cost of goods sold.
 */
export function calcBreakEvenROAS(cogsRate) {
  const r = safeNum(cogsRate);
  if (r === null || r <= 0 || r >= 1) return null;
  return round(1 / (1 - r));
}

/**
 * Contribution Margin (€)
 * = Revenue - COGS - Ad Spend
 */
export function calcContributionMargin(revenue, cogs, adSpend) {
  const nr = safeNum(revenue);
  const nc = safeNum(cogs);
  const na = safeNum(adSpend);
  if (nr === null) return null;
  return round(nr - (nc ?? 0) - (na ?? 0));
}

/**
 * CPM — Cost Per Mille (cost per 1 000 impressions)
 * = (cost / impressions) × 1000
 */
export function calcCPM(cost, impressions) {
  const r = div(cost, impressions);
  return r === null ? null : round(r * 1000);
}

/**
 * Period-over-period delta (absolute + relative %)
 * Returns { delta, deltaPct } or null when inputs are invalid.
 */
export function calcPeriodDelta(current, previous) {
  const nc = safeNum(current);
  const np = safeNum(previous);
  if (nc === null || np === null) return null;
  const delta = round(nc - np);
  const deltaPct = np !== 0 ? round(((nc - np) / Math.abs(np)) * 100) : null;
  return { delta, deltaPct };
}

// ---------------------------------------------------------------------------
// Budget Allocation Optimization
// ---------------------------------------------------------------------------

/**
 * Compute budget allocation efficiency.
 * For each channel: compare actual vs ideal allocation based on ROAS.
 *
 * @param {object[]} channels - enriched channels with metrics.roas
 * @param {number} totalBudget
 * @returns {object[]} channels with optimalBudgetPct and delta
 */
export function calcBudgetAllocation(channels, totalBudget) {
  if (!Array.isArray(channels) || channels.length === 0) return [];
  const nb = safeNum(totalBudget);

  // Only channels with positive ROAS get budget
  const positiveROAS = channels.filter(c => c.metrics?.roas !== null && c.metrics.roas > 0);
  const totalROAS = positiveROAS.reduce((s, c) => s + c.metrics.roas, 0);

  return channels.map(c => {
    const roas = c.metrics?.roas ?? null;
    const optimalPct = totalROAS > 0 && roas !== null && roas > 0
      ? round((roas / totalROAS) * 100)
      : 0;
    const optimalBudget = nb !== null ? round((optimalPct / 100) * nb) : null;
    const currentBudget = safeNum(c.adSpend ?? null);
    const delta = optimalBudget !== null && currentBudget !== null
      ? round(optimalBudget - currentBudget)
      : null;

    return { ...c, optimalBudgetPct: optimalPct, optimalBudget, budgetDelta: delta };
  });
}
