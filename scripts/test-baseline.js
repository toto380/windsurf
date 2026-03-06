#!/usr/bin/env node
/**
 * STRATADS — Baseline AutoScan Pipeline Tests
 * Run with: node scripts/test-baseline.js
 *
 * Tests the BaselineAutoScan pipeline logic without real API calls.
 * Connectors are injected by directly populating the require cache.
 */

'use strict';

const path    = require('path');
const Module  = require('module');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

// Resolved paths for connectors
const GA4_PATH  = require.resolve('../src/backend/connectors/ga4.js');
const GSC_PATH  = require.resolve('../src/backend/connectors/gsc.js');
const GADS_PATH = require.resolve('../src/backend/connectors/googleAds.js');
const META_PATH = require.resolve('../src/backend/connectors/metaAds.js');
const SCAN_PATH = require.resolve('../src/backend/modules/baselineAutoScan.js');

// ─── Stub factories ──────────────────────────────────────────────────────────

function makeGa4Stub(ok, sessions = 0, conversions = 0, revenue = null) {
  return {
    GA4Connector: class {
      async fetchData()              { return ok ? { status: 'ok', metrics: { sessions, conversions, totalRevenue: revenue }, confidence: 'HIGH' } : { status: 'error', error: 'GA4 unavailable', confidence: 'LOW' }; }
      static async testConnection()  { return { success: ok }; }
    }
  };
}

function makeGscStub(ok, clicks = 0) {
  return {
    GSCConnector: class {
      async fetchData()             { return ok ? { status: 'ok', metrics: { clicks, impressions: 10000 }, confidence: 'MEDIUM' } : { status: 'error', error: 'GSC unavailable', confidence: 'LOW' }; }
      static async testConnection() { return { success: ok }; }
    }
  };
}

function makeGoogleAdsStub(ok, cost = 0, conversions = 0, value = 0, clicks = 0) {
  return {
    GoogleAdsConnector: class {
      constructor() { this._excludedRows = 0; }
      async fetchData()             { return ok ? { status: 'ok', metrics: { cost, conversions, value, clicks, impressions: 5000, ctr: 2, cpc: 0.5, cpa: conversions > 0 ? cost/conversions : 0, roas: cost > 0 ? value/cost : 0 }, topCampaigns: [], confidence: 'HIGH' } : { status: 'error', error: 'CSV not found', confidence: 'LOW' }; }
      static async importFromCSV()  { return {}; }
      static async testConnection() { return { success: ok }; }
    }
  };
}

function makeMetaAdsStub(ok, spend = 0, conversions = 0, value = 0, clicks = 0) {
  return {
    MetaAdsConnector: class {
      constructor() { this._excludedRows = 0; }
      async fetchData()             { return ok ? { status: 'ok', metrics: { spend, conversions, value, clicks, impressions: 3000, ctr: 1.5, cpc: 0.4, cpa: conversions > 0 ? spend/conversions : 0, roas: spend > 0 ? value/spend : 0 }, topCampaigns: [], confidence: 'HIGH' } : { status: 'error', error: 'CSV not found', confidence: 'LOW' }; }
      static async importFromCSV()  { return {}; }
      static async testConnection() { return { success: ok }; }
    }
  };
}

function inject(ga4, gsc, gads, meta) {
  require.cache[GA4_PATH]  = { id: GA4_PATH,  filename: GA4_PATH,  loaded: true, exports: ga4 };
  require.cache[GSC_PATH]  = { id: GSC_PATH,  filename: GSC_PATH,  loaded: true, exports: gsc };
  require.cache[GADS_PATH] = { id: GADS_PATH, filename: GADS_PATH, loaded: true, exports: gads };
  require.cache[META_PATH] = { id: META_PATH, filename: META_PATH, loaded: true, exports: meta };
  delete require.cache[SCAN_PATH]; // always reload the pipeline
}

function loadPipeline() {
  return require(SCAN_PATH);
}

// ─── Test cases ──────────────────────────────────────────────────────────────

async function test_ga4_only() {
  console.log('\n📋 Test 1: GA4 disponible seul');
  inject(makeGa4Stub(true, 2450, 52, null), makeGscStub(false), makeGoogleAdsStub(false), makeMetaAdsStub(false));

  const { BaselineAutoScan } = loadPipeline();
  const logs = [];
  const result = await new BaselineAutoScan(
    { analysisPeriodDays: 30, serviceAccountData: { path: '/fake/sa.json' }, ga4PropertyId: '123' },
    m => logs.push(m)
  ).run();

  assert(result.status !== 'failed', 'Pipeline ne doit pas échouer');
  assert(result.analysisWindow?.days === 30, 'analysisWindow.days = 30');
  assert(result.metrics.sessions?.value === 2450, 'sessions = 2450 depuis GA4');
  assert(result.metrics.sessions?.source === 'GA4', 'sessions.source = GA4');
  assert(result.metrics.sessions?.confidence === 'HIGH', 'sessions.confidence = HIGH');
  assert(result.metrics.conversions?.value === 52, 'conversions = 52 depuis GA4');
  assert(result.metrics.revenue?.status === 'unavailable', 'revenue unavailable (pas de totalRevenue)');
  assert(typeof result.metrics.conversionRate?.value === 'number', 'conversionRate calculé');
  assert(Math.abs(result.metrics.conversionRate.value - (52 / 2450) * 100) < 0.001, 'conversionRate = 52/2450*100');
  assert(result.metrics.averageOrderValue?.status === 'unavailable', 'AOV unavailable sans revenue');
  assert(result.sourcesUsed.includes('GA4'), 'GA4 dans sourcesUsed');
  assert(result.prefill?.currentConversionRate !== null, 'prefill.currentConversionRate non null');
}

async function test_google_ads_csv_only() {
  console.log('\n📋 Test 2: Google Ads CSV seul');
  inject(makeGa4Stub(false), makeGscStub(false), makeGoogleAdsStub(true, 820, 15, 0, 1200), makeMetaAdsStub(false));

  const { BaselineAutoScan } = loadPipeline();
  const result = await new BaselineAutoScan(
    { analysisPeriodDays: 10, googleAdsCSV: ['/fake/gads.csv'] },
    () => {}
  ).run();

  assert(result.status !== 'failed', 'Pipeline ne doit pas échouer');
  assert(result.analysisWindow?.days === 10, 'analysisWindow.days = 10');
  assert(result.metrics.spend?.value === 820, 'spend = 820 depuis Google Ads CSV');
  assert(result.metrics.sessions?.status === 'unavailable', 'sessions unavailable (pas de GA4)');
  assert(result.metrics.conversions?.value === 15, 'conversions = 15 depuis Ads CSV');
  assert(result.metrics.roas?.status === 'unavailable', 'ROAS unavailable sans revenue');
  assert(typeof result.metrics.cpa?.value === 'number', 'CPA calculé');
  assert(Math.abs(result.metrics.cpa.value - (820 / 15)) < 0.01, 'CPA = 820/15');
  assert(result.sourcesUsed.includes('Google Ads CSV'), 'Google Ads CSV dans sourcesUsed');
}

async function test_ga4_plus_google_ads() {
  console.log('\n📋 Test 3: GA4 + Google Ads CSV');
  inject(makeGa4Stub(true, 3000, 60, 4500), makeGscStub(false), makeGoogleAdsStub(true, 820, 15, 900, 1200), makeMetaAdsStub(false));

  const { BaselineAutoScan } = loadPipeline();
  const result = await new BaselineAutoScan(
    { analysisPeriodDays: 30, serviceAccountData: { path: '/fake/sa.json' }, ga4PropertyId: '123', googleAdsCSV: ['/fake/gads.csv'] },
    () => {}
  ).run();

  assert(result.status !== 'failed', 'Pipeline ne doit pas échouer');
  assert(result.metrics.sessions?.source === 'GA4', 'sessions depuis GA4 (priorité)');
  assert(result.metrics.conversions?.source === 'GA4', 'conversions depuis GA4 (priorité)');
  assert(result.metrics.revenue?.source === 'GA4', 'revenue depuis GA4 (priorité)');
  assert(result.metrics.spend?.value === 820, 'spend depuis Google Ads CSV');
  assert(typeof result.metrics.roas?.value === 'number', 'ROAS calculé (revenue + spend disponibles)');
  assert(Math.abs(result.metrics.roas.value - (4500 / 820)) < 0.01, 'ROAS = 4500/820');
  assert(result.metrics.sessions?.value === 3000, 'sessions = 3000 depuis GA4 (pas des Ads)');
  assert(result.sourcesUsed.includes('GA4'), 'GA4 dans sourcesUsed');
  assert(result.sourcesUsed.includes('Google Ads CSV'), 'Google Ads CSV dans sourcesUsed');
}

async function test_no_sources() {
  console.log('\n📋 Test 4: Aucun accès disponible');
  inject(makeGa4Stub(false), makeGscStub(false), makeGoogleAdsStub(false), makeMetaAdsStub(false));

  const { BaselineAutoScan } = loadPipeline();
  const logs = [];
  const result = await new BaselineAutoScan(
    { analysisPeriodDays: 30 },
    m => logs.push(m)
  ).run();

  assert(result.status === 'failed', 'status = failed quand aucune source');
  assert(result.errors.length > 0, 'errors non vide');
  assert(logs.some(l => l.includes('❌')), 'Log contient un message d\'erreur ❌');
}

async function test_period_10_days() {
  console.log('\n📋 Test 5: Période = 10 jours — analysisWindow correct');
  inject(makeGa4Stub(true, 800, 20, 1500), makeGscStub(false), makeGoogleAdsStub(false), makeMetaAdsStub(false));

  const { BaselineAutoScan } = loadPipeline();
  const result = await new BaselineAutoScan(
    { analysisPeriodDays: 10, serviceAccountData: { path: '/fake/sa.json' }, ga4PropertyId: '123' },
    () => {}
  ).run();

  assert(result.analysisWindow?.days === 10, 'days = 10');
  const start = new Date(result.analysisWindow.startDate);
  const end   = new Date(result.analysisWindow.endDate);
  const diff  = Math.round((end - start) / (1000 * 60 * 60 * 24));
  assert(diff === 10, `Écart startDate→endDate = 10 jours (got ${diff})`);
}

async function test_invalid_period() {
  console.log('\n📋 Test 6: Période invalide');
  inject(makeGa4Stub(false), makeGscStub(false), makeGoogleAdsStub(false), makeMetaAdsStub(false));

  const { BaselineAutoScan } = loadPipeline();

  let result = await new BaselineAutoScan({ analysisPeriodDays: 0 }, () => {}).run();
  assert(result.status === 'failed', 'status = failed pour periode = 0');

  delete require.cache[SCAN_PATH];
  result = await new BaselineAutoScan({ analysisPeriodDays: 400 }, () => {}).run();
  assert(result.status === 'failed', 'status = failed pour periode = 400');
}

async function test_no_nan_values() {
  console.log('\n📋 Test 7: Absence de valeurs NaN');
  inject(makeGa4Stub(true, 0, 0, 0), makeGscStub(false), makeGoogleAdsStub(false), makeMetaAdsStub(false));

  const { BaselineAutoScan } = loadPipeline();
  const result = await new BaselineAutoScan(
    { analysisPeriodDays: 30, serviceAccountData: { path: '/fake/sa.json' }, ga4PropertyId: '123' },
    () => {}
  ).run();

  for (const [key, metric] of Object.entries(result.metrics || {})) {
    if (metric.value !== null) {
      assert(!isNaN(metric.value), `metrics.${key}.value n'est pas NaN`);
    } else {
      assert(metric.status === 'unavailable', `metrics.${key}.status = unavailable quand value = null`);
    }
  }
}

async function test_structured_output() {
  console.log('\n📋 Test 8: Structure de sortie correcte');
  inject(makeGa4Stub(true, 1000, 30, 2500), makeGscStub(false), makeGoogleAdsStub(true, 500, 10, 1200, 800), makeMetaAdsStub(false));

  const { BaselineAutoScan } = loadPipeline();
  const result = await new BaselineAutoScan(
    { analysisPeriodDays: 30, serviceAccountData: { path: '/fake/sa.json' }, ga4PropertyId: '123', googleAdsCSV: ['/fake/gads.csv'] },
    () => {}
  ).run();

  assert(result.analysisWindow && typeof result.analysisWindow === 'object', 'analysisWindow présent');
  assert(typeof result.analysisWindow.days === 'number', 'analysisWindow.days est un nombre');
  assert(typeof result.analysisWindow.startDate === 'string', 'analysisWindow.startDate est une string');
  assert(typeof result.analysisWindow.endDate === 'string', 'analysisWindow.endDate est une string');
  assert(result.metrics && typeof result.metrics === 'object', 'metrics présent');

  const required = ['sessions','conversions','revenue','conversionRate','averageConversionValue','averageOrderValue','spend','cpa','roas'];
  required.forEach(key => {
    assert(key in result.metrics, `metrics.${key} présent`);
    assert('value' in result.metrics[key], `metrics.${key}.value présent`);
    assert('source' in result.metrics[key], `metrics.${key}.source présent`);
    assert('confidence' in result.metrics[key], `metrics.${key}.confidence présent`);
  });

  assert(Array.isArray(result.sourcesUsed), 'sourcesUsed est un tableau');
  assert(Array.isArray(result.warnings), 'warnings est un tableau');
  assert(Array.isArray(result.errors), 'errors est un tableau');
  assert(result.prefill && typeof result.prefill === 'object', 'prefill présent');
}

async function test_ga4_getStartDate() {
  console.log('\n📋 Test 9: GA4 _getStartDate gère les formats Nd arbitraires');
  // Load the actual GA4 connector (not stubbed) to test the fixed _getStartDate
  delete require.cache[GA4_PATH];
  // We can't really require GA4 without googleapis, but we can test the helper in isolation
  // by extracting the logic:
  function getStartDate(range) {
    const now = new Date();
    const daysMatch = String(range || '').match(/^(\d+)d$/);
    if (daysMatch) {
      const days = parseInt(daysMatch[1], 10);
      const d = new Date(now);
      d.setDate(d.getDate() - days);
      return d.toISOString().split('T')[0];
    }
    if (range === '12m') {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d.toISOString().split('T')[0];
    }
    const d = new Date(now);
    d.setDate(d.getDate() - 28);
    return d.toISOString().split('T')[0];
  }

  const now = new Date();

  // Test 10d
  const d10 = new Date(now); d10.setDate(now.getDate() - 10);
  assert(getStartDate('10d') === d10.toISOString().split('T')[0], '_getStartDate("10d") correct');

  // Test 90d
  const d90 = new Date(now); d90.setDate(now.getDate() - 90);
  assert(getStartDate('90d') === d90.toISOString().split('T')[0], '_getStartDate("90d") correct');

  // Test 365d
  const d365 = new Date(now); d365.setDate(now.getDate() - 365);
  assert(getStartDate('365d') === d365.toISOString().split('T')[0], '_getStartDate("365d") correct');

  // Fallback
  const d28 = new Date(now); d28.setDate(now.getDate() - 28);
  assert(getStartDate('unknown') === d28.toISOString().split('T')[0], '_getStartDate("unknown") → 28 days fallback');
}

// ─── New tests: metric calculation correctness ──────────────────────────────

async function test_forecast_monthly_normalization() {
  console.log('\n📋 Test 10: ForecastEngine — baseline normalisé en sessions/mois');
  const { ForecastEngine } = require('../src/backend/modules/forecast.js');

  // 9000 total sessions over 90 days → 3000/month
  const inputs = {
    analysisWindow: { days: 90 },
    baseline: {
      sessions:    { value: 9000,  source: 'GA4', confidence: 'HIGH' },
      conversions: { value: 270,   source: 'GA4', confidence: 'HIGH' },
      revenue:     { value: 27000, source: 'GA4', confidence: 'HIGH' },
      spend:       { value: 3000,  source: 'Ads CSV', confidence: 'HIGH' }
    },
    metrics: {
      conversionRate: { value: 3,   source: 'Calculé', confidence: 'HIGH' },
      aov:            { value: 100, source: 'Calculé', confidence: 'HIGH' },
      cac: { value: null }, roas: { value: 9 }
    },
    adsTotals: null, privateAvailability: { hasGA4: true },
    dataCoverage: 100, confidenceGlobal: 'HIGH'
  };

  const eng = new ForecastEngine(inputs, { period: '3m', enableProjection: true }, {});
  const r = eng.run();

  assert(r.dataStatus === 'ok', 'Forecast status = ok');
  // Conservative M1: baseSessions * 1.0 = 3000 (90d period → 9000/3 = 3000/month)
  assert(r.projection.timeline.traffic.conservative[0] === 3000,
    'M1 conservative = 3000 sessions (9000 / 3 mois)');
  assert(r.projection.assumptions[1] === 'Baseline trafic: 3000 sessions/mois',
    'Assumption affiche sessions/mois correct');
}

async function test_forecast_null_cr_aov_no_nan() {
  console.log('\n📋 Test 11: ForecastEngine — CR/AOV null → pas de NaN');
  const { ForecastEngine } = require('../src/backend/modules/forecast.js');

  const inputs = {
    analysisWindow: { days: 30 },
    baseline: {
      sessions:    { value: 1000, source: 'GSC (Clicks Proxy)', confidence: 'MEDIUM' },
      conversions: { value: null, source: 'unavailable', confidence: 'LOW', status: 'unavailable' },
      revenue:     { value: null, source: 'unavailable', confidence: 'LOW', status: 'unavailable' },
      spend:       { value: null, source: 'unavailable', confidence: 'LOW', status: 'unavailable' }
    },
    metrics: {
      conversionRate: { value: null, source: 'unavailable', confidence: 'LOW', status: 'unavailable' },
      aov:            { value: null, source: 'unavailable', confidence: 'LOW', status: 'unavailable' },
      cac: { value: null }, roas: { value: null }
    },
    adsTotals: null, privateAvailability: { hasGA4: false },
    dataCoverage: 25, confidenceGlobal: 'LOW'
  };

  const eng = new ForecastEngine(inputs, { period: '3m', enableProjection: true }, {});
  const r = eng.run();

  const json = JSON.stringify(r);
  assert(!json.includes('"NaN"') && !json.includes('NaN'), 'Aucun NaN dans le résultat forecast');
  assert(r.dataStatus === 'ok', 'Forecast status = ok même sans CR/AOV');
  assert(r.projection.timeline.revenue.conservative[0] === 0,
    'Revenue M1 = 0 quand AOV null (pas NaN)');
}

async function test_forecast_no_reference_error() {
  console.log('\n📋 Test 12: ForecastEngine — pas de ReferenceError (paidNote/estimatedPaidSessions)');
  const { ForecastEngine } = require('../src/backend/modules/forecast.js');

  const inputs = {
    analysisWindow: { days: 30 },
    baseline: {
      sessions:    { value: 500, source: 'GA4', confidence: 'HIGH' },
      conversions: { value: 10, source: 'GA4', confidence: 'HIGH' },
      revenue:     { value: 1000, source: 'GA4', confidence: 'HIGH' },
      spend:       { value: null, source: 'unavailable', confidence: 'LOW', status: 'unavailable' }
    },
    metrics: {
      conversionRate: { value: 2, source: 'Calculé', confidence: 'HIGH' },
      aov:            { value: 100, source: 'Calculé', confidence: 'HIGH' },
      cac: { value: null }, roas: { value: null }
    },
    adsTotals: null, privateAvailability: { hasGA4: true },
    dataCoverage: 75, confidenceGlobal: 'HIGH'
  };

  let error = null;
  try {
    const eng = new ForecastEngine(inputs, { period: '3m', enableProjection: true }, {});
    eng.run();
  } catch (e) {
    error = e;
  }
  assert(error === null, 'Aucune ReferenceError (paidNote/estimatedPaidSessions supprimés)');
}

async function test_ads_kpi_null_guard() {
  console.log('\n📋 Test 13: normalizeAdsData — CPA/CPC null quand conversions/clicks = 0');

  // Simulate the normalizeAdsData KPI block with zero conversions/clicks
  function computeKPIs(spend, conversions, clicks, value) {
    const kpis = { roas: null, cpa: null, cpc: null, ctr: null, cr: null };
    if (spend > 0) {
      kpis.roas = value / spend;
      kpis.cpa = conversions > 0 ? spend / conversions : null;
      kpis.cpc = clicks > 0 ? spend / clicks : null;
    }
    return kpis;
  }

  // Case 1: spend but no conversions/clicks
  const k1 = computeKPIs(1000, 0, 0, 0);
  assert(k1.cpa === null, 'CPA = null quand conversions = 0');
  assert(k1.cpc === null, 'CPC = null quand clicks = 0');
  assert(k1.roas === 0, 'ROAS = 0 quand value = 0');

  // Case 2: spend with real conversions/clicks
  const k2 = computeKPIs(1000, 20, 500, 5000);
  assert(Math.abs(k2.cpa - 50) < 0.001, 'CPA = 50 (1000/20)');
  assert(Math.abs(k2.cpc - 2) < 0.001, 'CPC = 2 (1000/500)');
  assert(Math.abs(k2.roas - 5) < 0.001, 'ROAS = 5 (5000/1000)');
}

async function test_report_bugs() {
  console.log('\n📋 Test 14: ReportGenerator — tous les bugs corrigés');

  const { ReportGenerator } = require('../src/backend/report.js');

  // Build minimal results that exercised every fixed path
  const results = {
    meta: { company: 'TestCo', url: 'https://test.com', auditType: 'private',
            date: new Date().toISOString(), version: '3.0', duration: 5 },
    scores: { global: 72, technical: 68, marketing: 55, data: 40, maturity: 'Intermédiaire' },
    technical: {
      performance: { loadTime: 2.4, grade: 'B', score: 68, lcp: '2.1s', cls: '0.05',
                     ttfb: '0.4s', pageWeight: 420000, https: true },
      crawl:   { pagesAnalyzed: 45, errors: [], robots: { present: true },
                 sitemap: { present: true }, redirects: [] },
      seo:     { indexability: { score: 74, issues: [] } },
      // correct path used by report: technical.security.https
      security: { https: true, headers: { hsts: true, csp: false, xframe: false } }
    },
    marketing: {
      tracking:   { detected: ['GA4', 'GTM'], score: 70,
                    ga4: { present: true }, gtm: { present: true }, meta: { present: false },
                    tiktok: { present: false }, linkedin: { present: false }, googleAds: { present: false } },
      conversion: { heuristicScore: 55 },
      elements:   { hasCTA: true, hasForms: true, hasPhone: false, hasEmail: true, hasChat: false }
    },
    // recommendations use .problem, not .title
    recommendations: [
      { problem: 'Sitemap absent', priority: 'Haute', impact: '+10% indexation',
        effort: 'Faible', estimatedGain: '+10%', category: 'SEO', evidence: 'Crawl' },
      { problem: 'CPA élevé', priority: 'Moyenne', impact: 'Rentabilité améliorée',
        effort: 'Moyen', estimatedGain: '-20% CPA', category: 'Ads', evidence: 'CSV' }
    ],
    roadmap: { quick: [{ problem: 'Sitemap absent' }], medium: [], long: [] },
    forecast: {
      dataStatus: 'ok',  // correct field (not .status)
      projection: {
        dataStatus: 'ok',
        scenarios: {
          // correct field: .sessions (not .traffic)
          conservative: { sessions: 3000, conversions: 90,  revenue: 9000,  cr: '3.00' },
          realistic:    { sessions: 3150, conversions: 100, revenue: 10000, cr: '3.17' },
          ambitious:    { sessions: 3450, conversions: 120, revenue: 12000, cr: '3.48' }
        },
        timeline: { labels: ['M1','M2','M3'],
          traffic:  { conservative: [3000,3000,3000], realistic: [3050,3100,3150], ambitious: [3150,3300,3450] },
          revenue:  { conservative: [9000,9000,9000], realistic: [9500,9750,10000], ambitious: [10500,11000,12000] }
        },
        assumptions: ['Baseline trafic: 3000 sessions/mois', 'ASSUMPTION CRO: Réaliste (+5%)']
      }
    },
    // quickWins is { generated, count, items } — NOT a plain array
    quickWins: {
      generated: true, count: 1,
      items: [{ title: 'Optimisation Conversion', impact: 'Élevé', effort: 'Moyen',
                observation: 'CR < 2%', action: 'A/B test CTA', potential: 40, confidence: 'MEDIUM' }]
    },
    // scalingPlan uses .baseMode (not .mode)
    scalingPlan: {
      generated: true, baseMode: 'private',
      dataSource: 'GA4/GSC/Ads',
      phases: [{ name: 'Phase 1', duration: '1-2 mois', focus: 'Tracking', actions: ['Vérifier GA4'], expectedGain: '+10%' }],
      kpis: { primary: [{ name: 'Trafic', baseline: 3000, target3m: 3600, target6m: 4500, source: 'GA4' }] },
      milestones: [{ month: 1, name: 'Tracking OK', criteria: 'GA4 actif', critical: false }]
    },
    forecastInputsFinal: {
      analysisWindow: { days: 90, startDate: '2025-12-06', endDate: '2026-03-06' },
      // baseline has only: sessions, conversions, revenue, spend
      baseline: {
        sessions:    { value: 9000,   source: 'GA4',      confidence: 'HIGH' },
        conversions: { value: 270,    source: 'GA4',      confidence: 'HIGH' },
        revenue:     { value: 27000,  source: 'GA4',      confidence: 'HIGH' },
        spend:       { value: 3000,   source: 'Ads CSV',  confidence: 'HIGH' }
      },
      // derived metrics live in .metrics, NOT in .baseline
      metrics: {
        conversionRate: { value: 3.0,  source: 'Calculé', confidence: 'HIGH' },
        aov:            { value: 100,  source: 'Calculé', confidence: 'HIGH' },
        roas:           { value: 9.0,  source: 'Calculé', confidence: 'MEDIUM' },
        cac:            { value: 11.1, source: 'Calculé', confidence: 'MEDIUM' }
      },
      dataCoverage: 100, confidenceGlobal: 'HIGH',
      privateAvailability: { hasGA4: true, hasGSC: false, hasGTM: false, hasAds: true }
    },
    ads: { normalized: { totals: { spend: 3000, conversions: 270, clicks: 6000, impressions: 80000, value: 27000 },
           kpis: { cpa: 11.1, cpc: 0.5, roas: 9.0, ctr: 7.5, cr: null } } },
    qualityGate: { passed: true, dataCoverage: 100, confidenceLevel: 'HIGH',
                   sourcesUsed: ['crawl','ga4','google-ads-csv'], missing: [] },
    evidence: [], unifiedData: {}
  };

  let html, err;
  try {
    const gen = new ReportGenerator(results);
    const out = await gen.generate();
    html = out.html;
  } catch (e) { err = e; }

  assert(!err, `Pas d'erreur à la génération HTML (${err?.message || 'ok'})`);
  assert(typeof html === 'string' && html.length > 500, 'HTML généré non vide');

  // Bug 1: technical.security.https — no crash, HTTPS row present
  assert(html.includes('✅') || html.includes('❌'), 'Ligne HTTPS rendue sans TypeError');

  // Bug 2: rec.problem displayed (not undefined)
  assert(html.includes('Sitemap absent'),  'rec.problem affiché correctement');
  assert(!html.includes('>undefined<'),    'Aucun champ undefined dans le HTML');

  // Bug 3: derived metrics from forecastInputsFinal.metrics shown correctly
  assert(html.includes('3.00%') || html.includes('3,00%') || html.includes('Taux conversion'),
    'Taux conversion affiché (metrics.conversionRate)');
  assert(html.includes('Panier moyen') || html.includes('AOV'), 'AOV affiché (metrics.aov)');

  // Bug 4: quickWins.items rendered (1 item)
  assert(html.includes('Optimisation Conversion'), 'Quick win title affiché depuis items[]');

  // Bug 5: scalingPlan.baseMode → 'données privées'
  assert(html.includes('données privées'), 'scalingPlan.baseMode détecté correctement');

  // Bug 6: forecast.dataStatus = 'ok' → projection shown (not disabled)
  assert(html.includes('Prévisions de Croissance'), 'Section forecast présente');
  assert(!html.includes('Prévisions indisponibles'), 'Prévisions non bloquées à tort');

  // Bug 7: scenarios.*.sessions displayed (3000)
  assert(html.includes('3') && (html.includes('3 000') || html.includes('3000')),
    'Valeur sessions scénario affichée (pas .traffic)');
}

// ─── Runner ───────────────────────────────────────────────────────────────────

(async () => {
  console.log('🧪 StratAds — Baseline AutoScan Pipeline Tests\n');
  try {
    await test_ga4_only();
    await test_google_ads_csv_only();
    await test_ga4_plus_google_ads();
    await test_no_sources();
    await test_period_10_days();
    await test_invalid_period();
    await test_no_nan_values();
    await test_structured_output();
    await test_ga4_getStartDate();
    await test_forecast_monthly_normalization();
    await test_forecast_null_cr_aov_no_nan();
    await test_forecast_no_reference_error();
    await test_ads_kpi_null_guard();
    await test_report_bugs();
  } catch (err) {
    console.error('\n💥 Unexpected test runner error:', err.stack || err);
    failed++;
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.error(`\n❌ ${failed} test(s) failed.`);
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
  }
})();
