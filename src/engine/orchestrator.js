import path from 'node:path';
import fs from 'fs-extra';
import { fileURLToPath } from 'node:url';

// Core modules
import { scanDNS } from './modules/dns-infra.js';
import { scanSecurityHeaders } from './modules/security-headers.js';
import { scanRobotsAndSitemap } from './modules/robots-sitemap.js';
import { scanCrawler } from './modules/crawler.js';
import { scanSchema } from './modules/schema.js';
import { scanTechStack } from './modules/techstack.js';
import { scanPlaywright } from './modules/playwright.js';
import { scanTrackingLite } from './modules/tracking-lite.js';
import { scanLighthouse } from './modules/lighthouse.js';
import { buildSerpPreview } from './modules/serp-preview.js';
import { fetchPrivateGoogleData } from './modules/google-private.js';
import { scanGtmApi } from './modules/gtm-api.js';
import { buildCabinetAuditV21 } from './audit/cabinet-v21.js';
import { loadGoogleAdsExports } from './modules/ads-import.js';
import { loadMetaAdsExports } from './modules/meta-ads-import.js';
import { buildAdsIntelligence } from './v2/ads/ads-intelligence.js';

// New tracking modules (Option C)
import { scanTrackingInfrastructure } from './modules/tracking-infrastructure.js';
import { auditGA4 } from './modules/ga4-audit.js';
import { auditGTMWeb } from './modules/gtm-web-audit.js';
import { auditServerSide } from './modules/server-side-audit.js';
import { auditAds } from './modules/ads-audit.js';
import { auditDataQuality } from './modules/data-quality.js';

// Core scoring & quality gate
import { computeGlobalScore } from '../core/scoring-engine.js';
import { checkPrivatePreconditions } from '../core/quality-gate.js';

import { generateHtmlReport } from '../main/report-gen-html.js';

// --- Presets (client-facing)
// fast     : quick qualification (no Playwright, no Lighthouse)
// classic  : cabinet standard (Tracking lite + Lighthouse)
// private  : private-data only (GA4/GSC/GTM via API — no public scan modules)
// full     : deep audit (Playwright + Lighthouse + screenshots)
export const PRESETS = {
  fast: {
    trackingLite: true,
    playwright: false,
    lighthouse: false,
  },
  classic: {
    trackingLite: true,
    playwright: false,
    lighthouse: true,
  },
  private: {
    trackingLite: false,
    playwright: false,
    lighthouse: false,
  },
  full: {
    trackingLite: false,
    playwright: true,
    lighthouse: true,
  },
};

// Maps preset names to their corresponding report profile ids.
// Used to auto-select the correct report profile when reportProfile
// is not explicitly set by the caller.
const PRESET_TO_PROFILE = {
  fast:    'fast',
  classic: 'public',
  private: 'private_only',
  full:    'full',
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runAudit(params, log, progress, mainWindow) {
  // Keep a real ISO timestamp for display, and a filesystem-safe one for folders/files.
  const timestampIso = new Date().toISOString();
  const timestampSafe = timestampIso.replace(/[:]/g, '-').replace(/\./g, '-');

// DEBUG: always print core params (helps verify private/public selection)
console.log('[orchestrator] params', {
  accessMode: params?.accessMode,
  branch: params?.branch,
  auditMode: params?.auditMode,
  preset: params?.preset,
  ga4PropertyId: params?.ga4PropertyId,
  gscSiteUrl: params?.gscSiteUrl,
  hasServiceAccountJsonPath: !!params?.serviceAccountJsonPath
});

console.log('[orchestrator] private preflight', {
  hasJson: !!params?.serviceAccountJsonPath,
  ga4PropertyId: params?.ga4PropertyId,
  gscSiteUrl: params?.gscSiteUrl
});




  const safeCompany = (params.company || new URL(params.url).hostname || 'client')
    .replace(/[^a-z0-9]/gi, '_');

  const projectRoot = path.resolve(__dirname, '../../');
  const reportRoot = (params && params.outputDir)
    ? path.resolve(String(params.outputDir))
    : path.join(projectRoot, 'reports');
  await fs.ensureDir(reportRoot);
  const auditDir = path.join(reportRoot, `${safeCompany}_${timestampSafe}`);
  await fs.ensureDir(auditDir);

  const presetName = (params.preset || 'classic');
  const reportModules = params?.reportModules || null;
  const wantPublicLight = reportModules ? !!reportModules.publicLight : false;
  const wantPublicFull = reportModules ? !!reportModules.publicFull : !String(params?.accessMode||'').toLowerCase().startsWith('private');
  const wantPrivateAds = reportModules
    ? !!reportModules.privateAds
    : (Array.isArray(params?.adsExportPaths) && params.adsExportPaths.length > 0) ||
      (Array.isArray(params?.metaAdsExportPaths) && params.metaAdsExportPaths.length > 0);
  const wantPrivateGoogle = reportModules
    ? (!!reportModules.privateGoogle && !!params?.serviceAccountJsonPath)
    : (String(params?.accessMode||'').toLowerCase().startsWith('private') &&
       !!params?.serviceAccountJsonPath &&
       (!!params?.ga4PropertyId || !!params?.gscSiteUrl));
  const includePublic = (wantPublicLight || wantPublicFull);
  const includePrivate = (wantPrivateAds || wantPrivateGoogle);

  const preset = PRESETS[presetName] || PRESETS.classic;

  const results = {
    meta: {
      privateErrors: [],
      accessMode: params?.accessMode || 'public',
      ...params,
      company: params.company || safeCompany,
      url: params.url,
      preset: presetName,
      timestampIso,
      timestampSafe,
      // auditMode drives legacy template density. Map from selected modules.
      auditMode: (wantPublicLight && !wantPublicFull) ? 'fast' : presetName,
      lang: params.lang || 'fr',
      // reportProfile drives the premium pipeline renderer selection.
      // Caller can override; falls back to preset → profile mapping.
      reportProfile: params.reportProfile || PRESET_TO_PROFILE[presetName] || 'fast',
    },
    scores: {},
    modules: {},
  };

// Defensive wrapper: never abort the whole audit because one module fails.
async function safeModule(key, label, fn, fallback = { skipped: true }) {
  try {
    const v = await fn();
    results.modules[key] = v ?? fallback;
    return results.modules[key];
  } catch (e) {
    const msg = (e && (e.stack || e.message)) ? (e.stack || e.message) : String(e);
    log(`⚠️ ${label} failed: ${msg}`);
    results.modules[key] = { error: msg, skipped: true };
    return results.modules[key];
  }
}

// 0) Optional: Private data via Google APIs (service account)
if (wantPrivateGoogle){
    console.log('[orchestrator] entering private block');
    log('🔐 entering private block');

    console.log('[orchestrator] private mode selected');
    log('🔐 Private mode selected');
    log({ ga4PropertyId: params.ga4PropertyId, gscSiteUrl: params.gscSiteUrl, serviceAccountJsonPath: params.serviceAccountJsonPath });
  log('🔐 Accès privé (GA4 / Search Console)...');
  await safeModule(
    'privateGoogle',
    'Accès privé Google',
    () => fetchPrivateGoogleData({
      serviceAccountJsonPath: params.serviceAccountJsonPath,
      ga4PropertyId: params.ga4PropertyId,
      gscSiteUrl: params.gscSiteUrl,    }),
    { ok:false, skipped:true }
  );

  console.log('[orchestrator] privateGoogle result', results.modules.privateGoogle);
  log('🔎 privateGoogle result', results.modules.privateGoogle);
  if (results.modules.privateGoogle && results.modules.privateGoogle.ok !== true){
    const errs = Array.isArray(results.modules.privateGoogle?.errors) ? results.modules.privateGoogle.errors : [];
    if (errs.length){
      for (const e of errs) results.meta.privateErrors.push(e);
    } else {
      results.meta.privateErrors.push({ source:'privateGoogle', message: results.modules.privateGoogle?.error || results.modules.privateGoogle?.reason || 'unknown' });
    }
  }

  // 0a) GTM audit via Tag Manager API (service account + Viewer)
await safeModule(
  'gtmAudit',
  'Audit GTM (API Tag Manager)',
  () => scanGtmApi({
    serviceAccountJsonPath: params.serviceAccountJsonPath,
    gtmPublicId: params.gtmPublicId,
    siteUrl: params.siteUrl || params.url,
    url: params.url,
    gscSiteUrl: params.gscSiteUrl,
  }, (e)=>results.meta.privateErrors.push(e)),
  { ok:false, audited:false, skipped:true }
);

// 0c) Build cabinet private audit object (scores/signals/plan)
results.audit = buildCabinetAuditV21(results, params);

// 0b) Optional: Google Ads exports import (truthful comparison)
  if (params.adsExportPaths && Array.isArray(params.adsExportPaths) && params.adsExportPaths.length){
    log('📦 Import export Google Ads (CSV)...');
    await safeModule(
      'adsImport',
      'Google Ads (export)',
      () => loadGoogleAdsExports(params.adsExportPaths),
      { ok:false, skipped:true }
    );

    log('🔎 privateGoogle result', results.modules.privateGoogle);
    if (results.modules.privateGoogle && results.modules.privateGoogle.ok !== true){
      const errs = Array.isArray(results.modules.privateGoogle?.errors) ? results.modules.privateGoogle.errors : [];
      if (errs.length){
        for (const e of errs) results.meta.privateErrors.push(e);
      } else {
        results.meta.privateErrors.push({ source:'privateGoogle', message: results.modules.privateGoogle?.error || results.modules.privateGoogle?.reason || 'unknown' });
      }
    }

  } else {
    results.modules.adsImport = { ok:false, skipped:true };
    log('🧯 Private exclusive: skipping public modules.');
    progress(60);

  }
} else {
  results.modules.privateGoogle = { ok:false, skipped:true };
}

// Private Ads via uploads (no OAuth)
if (wantPrivateAds){
  const gFiles = Array.isArray(params?.adsExportPaths) ? params.adsExportPaths.filter(Boolean) : [];
  const mFiles = Array.isArray(params?.metaAdsExportPaths) ? params.metaAdsExportPaths.filter(Boolean) : [];
  if (gFiles.length || mFiles.length){
    log('📦 Import exports Ads (Google / Meta)...');
    await safeModule('adsGoogle', 'Google Ads (export)', () => loadGoogleAdsExports(gFiles), { ok:false, skipped: !gFiles.length, reason:'no google files' });
    await safeModule('adsMeta', 'Meta Ads (export)', () => loadMetaAdsExports(mFiles), { ok:false, skipped: !mFiles.length, reason:'no meta files' });
    // Build unified intelligence layer (quality gate, metrics, insights)
    results.modules.adsIntelligence = buildAdsIntelligence({ google: results.modules.adsGoogle, meta: results.modules.adsMeta }, results.meta);
  } else {
    results.modules.adsGoogle = { ok:false, skipped:true, reason:'no files' };
    results.modules.adsMeta = { ok:false, skipped:true, reason:'no files' };
    results.modules.adsIntelligence = buildAdsIntelligence({ google: results.modules.adsGoogle, meta: results.modules.adsMeta }, results.meta);
  }
} else {
  results.modules.adsGoogle = { ok:false, skipped:true };
  results.modules.adsMeta = { ok:false, skipped:true };
  results.modules.adsIntelligence = buildAdsIntelligence({ google: results.modules.adsGoogle, meta: results.modules.adsMeta }, results.meta);
}

if (includePublic){
  // 1) DNS & Infra
    log('🔍 DNS / Infra (SPF, DMARC, enregistrements)...');
    await safeModule('security','DNS / Infra', () => scanDNS(params.url));
    progress(10);

    // 2) Security headers
    log('🛡️ Security Headers (HSTS, CSP, XFO, etc.)...');
    await safeModule('securityHeaders','Security headers', () => scanSecurityHeaders(params.url));
    progress(20);

    // 3) Robots & sitemap
    log('🤖 Robots.txt & Sitemap...');
    await safeModule('robots','Robots & Sitemap', () => scanRobotsAndSitemap(params.url));
    progress(30);

    // 4) Crawl SEO
    log('🕸️ Crawling & SEO On-Page...');
    await safeModule('seo','Crawl SEO', () => scanCrawler(params.url));
    try {
      results.modules.serpPreview = buildSerpPreview(results.modules.seo);
    } catch {
      results.modules.serpPreview = { skipped: true };
    }
    progress(52);

    // 5) Schema
    log('🧩 Schema (JSON-LD) & Rich snippets signals...');
    await safeModule('schema','Schema', () => scanSchema(params.url));
    progress(60);

    // 6) Tech stack
    log('🧱 Tech stack (CDN/CMS/Framework/Analytics)...');
    await safeModule('techstack','Tech stack', () => scanTechStack(params.url));
    progress(68);

    // 7) Tracking
    if (preset.playwright) {
      log('🕵️‍♂️ Simulation utilisateur (Tracking, Ads, Cookies)...');
      await safeModule('tracking','Tracking (Playwright)', () => scanPlaywright(params.url, log, params), { skipped:true });
    } else if (preset.trackingLite) {
      log('🔎 Détection tracking (lite)...');
      await safeModule('tracking','Tracking (lite)', () => scanTrackingLite(params.url), { skipped:true });
    } else {
      results.modules.tracking = { skipped: true };
    }
    progress(82);

    // 8) Lighthouse
    const wantsLighthouse = (params.useLighthouse !== false);
    if (preset.lighthouse && wantsLighthouse) {
      log('⚡ Lighthouse (Performance & Best Practices)...');
      results.modules.lighthouse = await scanLighthouse(params.url);
    } else {
      results.modules.lighthouse = { skipped: true };
    }
    progress(84);

    // 8b) Tracking Infrastructure (new Option C module)
    log('🏗️ Audit infrastructure tracking (GA4/GTM/CMP)...');
    await safeModule(
      'trackingInfrastructure',
      'Tracking Infrastructure',
      () => scanTrackingInfrastructure(params.url),
      { skipped: true }
    );
    progress(88);

    // 8c) Server-side audit (depends on trackingInfrastructure)
    log('🖥️ Audit server-side GTM...');
    await safeModule(
      'serverSideAudit',
      'Server-side GTM',
      () => auditServerSide(results.modules.trackingInfrastructure || {}, results.modules.gtmAudit || {}),
      { skipped: true }
    );
    progress(91);

    }

  // 8d) New modules: GA4, GTM Web, Ads, Data Quality
  if (includePrivate || results.modules.privateGoogle?.ok) {
    log('📊 Audit GA4 (données privées)...');
    results.modules.ga4Audit = auditGA4(results.modules.privateGoogle || {});

    log('⚙️ Audit GTM Web (configuration)...');
    results.modules.gtmWebAudit = auditGTMWeb(results.modules.gtmAudit || {});
  } else {
    results.modules.ga4Audit = { skipped: true };
    results.modules.gtmWebAudit = { skipped: true };
  }

  if (wantPrivateAds || results.modules.adsGoogle?.ok || results.modules.adsMeta?.ok) {
    log('💰 Audit Ads (pixels, attribution, ROAS)...');
    results.modules.adsAudit = auditAds(
      results.modules.adsGoogle || results.modules.adsImport || {},
      results.modules.adsMeta || {},
      results.modules.trackingInfrastructure || {}
    );
  } else {
    results.modules.adsAudit = { skipped: true };
  }

  if (includePrivate && (results.modules.privateGoogle?.ok || results.modules.ga4Audit?.ok)) {
    log('🔬 Audit qualité des données...');
    const ga4ForQuality = results.modules.privateGoogle?.ga4Totals || results.modules.privateGoogle?.ga4 || {};
    results.modules.dataQuality = auditDataQuality(
      ga4ForQuality,
      results.modules.adsGoogle || results.modules.adsImport || {},
      params.url
    );
  } else {
    results.modules.dataQuality = { skipped: true };
  }

// 9) Scores — use new scoring engine (8 criteria) with legacy fallback
    log('🧮 Calcul des scores...');
    calculateGlobalScore(results);
    progress(96);

    // 9b) Save audit_run.json (single source of truth + debug pipeline log)
    try {
      const pipelineLog = results.modules?.privateGoogle?.pipelineLog || [];
      const auditRunData = {
        meta: { url: results.meta?.url, company: results.meta?.company, timestampIso: results.meta?.timestampIso, accessMode: results.meta?.accessMode },
        scores: { public: results.scores?.publicScore ?? null, private: results.scores?.privateScore ?? null, global: results.scores?.global ?? null },
        public: {
          security: results.modules?.security ? { score: results.modules.security.score } : null,
          seo: results.modules?.seo ? { score: results.modules.seo.score } : null,
          trackingInfrastructure: results.modules?.trackingInfrastructure?.metrics || null,
        },
        private: {
          ga4: results.modules?.ga4Audit?.metrics || null,
          gsc: results.modules?.privateGoogle?.gsc?.ok ? { totals: results.modules.privateGoogle.gsc.totals } : null,
          ads: results.modules?.adsAudit?.metrics || null,
        },
        merged: {
          issues: Object.entries(results.modules || {}).flatMap(([, m]) => Array.isArray(m?.issues) ? m.issues : []).length,
          recommendations: Object.entries(results.modules || {}).flatMap(([, m]) => Array.isArray(m?.recommendations) ? m.recommendations : []).length,
        },
        pipelineLog,
      };
      const auditRunPath = path.join(auditDir, 'audit_run.json');
      await fs.writeFile(auditRunPath, JSON.stringify(auditRunData, null, 2), 'utf-8');
      log(`✅ audit_run.json sauvegardé: ${auditRunPath}`);
    } catch (e) {
      const msg = (e && (e.stack || e.message)) ? (e.stack || e.message) : String(e);
      log(`⚠️ audit_run.json save failed: ${msg}`);
    }

    // 10) HTML Report (HTML-only output)
    log('📄 Génération rapport HTML...');
    let htmlReportRes = null;
    try {
      htmlReportRes = await generateHtmlReport(results, auditDir, safeCompany);
      if (htmlReportRes?.htmlPath && fs.existsSync(htmlReportRes.htmlPath)) {
        log(`✅ Rapport HTML généré: ${htmlReportRes.htmlPath}`);
      }
    } catch (e) {
      const msg = (e && (e.stack || e.message)) ? (e.stack || e.message) : String(e);
      log(`⚠️ HTML report generation failed: ${msg}`);
    }

    // Verify outputs
    try {
      const htmlP = htmlReportRes?.htmlPath;
      const htmlOk = htmlP ? fs.existsSync(htmlP) : false;
      if (htmlOk) log(`✅ HTML généré: ${htmlP}`);
    } catch (e) {
      const msg = (e && (e.stack || e.message)) ? (e.stack || e.message) : String(e);
      log(`⚠️ Output verification failed: ${msg}`);
    }
  progress(100);

  return auditDir;
}

function calculateGlobalScore(res) {
  // Use new scoring engine (8 criteria) when new modules are present.
  // Falls back to legacy calculation when old modules dominate.
  const hasNewModules = res.modules.trackingInfrastructure && !res.modules.trackingInfrastructure.skipped;

  if (hasNewModules) {
    try {
      const engineResult = computeGlobalScore(res);
      // Compute publicScore (public modules) and privateScore (private modules)
      const publicScore = _computePublicScore(res);
      const privateScore = _computePrivateScore(res);
      res.scores = {
        global: engineResult.global,
        publicScore,
        privateScore,
        // Legacy fields for backward compat with existing report templates
        tracking: engineResult.criteria.ga4 ?? 0,
        seo: res.modules.seo?.score ?? 0,
        performance: res.modules.lighthouse?.skipped ? 0 : Math.round((res.modules.lighthouse?.performance ?? 0) * 100),
        security: res.modules.security?.score ?? 0,
        headers: res.modules.securityHeaders?.score ?? 0,
        robots: res.modules.robots?.score ?? 0,
        schema: res.modules.schema?.score ?? 0,
        // New criteria
        infrastructure: engineResult.criteria.infrastructure ?? 0,
        ga4: engineResult.criteria.ga4 ?? 0,
        ecommerce: engineResult.criteria.ecommerce ?? 0,
        gtm: engineResult.criteria.gtm ?? 0,
        server_side: engineResult.criteria.server_side ?? 0,
        ads: engineResult.criteria.ads ?? 0,
        data_quality: engineResult.criteria.data_quality ?? 0,
        business_reliability: engineResult.criteria.business_reliability ?? 0,
      };
      return;
    } catch { /* fall through to legacy */ }
  }

  // Legacy scoring (kept for backward compat)
  const parts = [];

  const trk = res.modules.tracking;
  const seo = res.modules.seo;
  const sec = res.modules.security;
  const hdr = res.modules.securityHeaders;
  const rob = res.modules.robots;
  const sch = res.modules.schema;
  const lh = res.modules.lighthouse;

  const scoreTracking = trk?.skipped ? null : (trk?.score ?? 0);
  const scoreSEO = seo?.score ?? 0;
  const scoreSecurity = sec?.score ?? 0;
  const scoreHeaders = hdr?.score ?? 0;
  const scoreRobots = rob?.score ?? 0;
  const scoreSchema = sch?.score ?? 0;
  const scorePerf = (lh?.skipped ? null : Math.round((lh?.performance ?? 0) * 100));

  // Base weights (classic/full)
  const weights = {
    tracking: 0.34,
    seo: 0.22,
    performance: 0.18,
    security: 0.12,
    headers: 0.08,
    robots: 0.04,
    schema: 0.02,
  };

  const add = (key, value) => {
    if (value === null || value === undefined) return;
    parts.push([key, value]);
  };

  add('tracking', scoreTracking);
  add('seo', scoreSEO);
  add('performance', scorePerf);
  add('security', scoreSecurity);
  add('headers', scoreHeaders);
  add('robots', scoreRobots);
  add('schema', scoreSchema);

  const totalW = parts.reduce((s, [k]) => s + (weights[k] ?? 0), 0) || 1;
  const global = parts.reduce((s, [k, v]) => s + v * ((weights[k] ?? 0) / totalW), 0);

  const publicScore = _computePublicScore(res);
  const privateScore = _computePrivateScore(res);

  res.scores = {
    global: Math.round(global),
    publicScore,
    privateScore,
    tracking: Math.round(scoreTracking ?? 0),
    seo: Math.round(scoreSEO),
    performance: Math.round(scorePerf ?? 0),
    security: Math.round(scoreSecurity),
    headers: Math.round(scoreHeaders),
    robots: Math.round(scoreRobots),
    schema: Math.round(scoreSchema),
  };
}

/** Compute public score from public-only modules (0-100) */
function _computePublicScore(res) {
  const m = res.modules || {};
  const parts = [];
  const w = { seo: 0.30, security: 0.20, headers: 0.15, robots: 0.10, schema: 0.10, performance: 0.15 };
  if (typeof m.seo?.score === 'number') parts.push(['seo', m.seo.score]);
  if (typeof m.security?.score === 'number') parts.push(['security', m.security.score]);
  if (typeof m.securityHeaders?.score === 'number') parts.push(['headers', m.securityHeaders.score]);
  if (typeof m.robots?.score === 'number') parts.push(['robots', m.robots.score]);
  if (typeof m.schema?.score === 'number') parts.push(['schema', m.schema.score]);
  if (!m.lighthouse?.skipped && typeof m.lighthouse?.performance === 'number') parts.push(['performance', Math.round(m.lighthouse.performance * 100)]);
  if (!parts.length) return null;
  const totalW = parts.reduce((s, [k]) => s + (w[k] ?? 0), 0) || 1;
  return Math.round(parts.reduce((s, [k, v]) => s + v * ((w[k] ?? 0) / totalW), 0));
}

/** Compute private score from private-only modules (0-100) */
function _computePrivateScore(res) {
  const m = res.modules || {};
  const parts = [];
  const w = { ga4: 0.40, ads: 0.30, dataQuality: 0.20, gtm: 0.10 };
  if (typeof m.ga4Audit?.score_contrib?.score === 'number' && !m.ga4Audit?.score_contrib?.skipped) parts.push(['ga4', m.ga4Audit.score_contrib.score]);
  if (typeof m.adsAudit?.score_contrib?.score === 'number' && !m.adsAudit?.score_contrib?.skipped) parts.push(['ads', m.adsAudit.score_contrib.score]);
  if (typeof m.dataQuality?.score_contrib?.score === 'number' && !m.dataQuality?.score_contrib?.skipped) parts.push(['dataQuality', m.dataQuality.score_contrib.score]);
  if (typeof m.gtmWebAudit?.score_contrib?.score === 'number' && !m.gtmWebAudit?.score_contrib?.skipped) parts.push(['gtm', m.gtmWebAudit.score_contrib.score]);
  if (!parts.length) return null;
  const totalW = parts.reduce((s, [k]) => s + (w[k] ?? 0), 0) || 1;
  return Math.round(parts.reduce((s, [k, v]) => s + v * ((w[k] ?? 0) / totalW), 0));
}
