/**
 * StratAds — Tracking Infrastructure Module
 * Detects GA4/GTM Web/Server, consent layer, architecture flow.
 * Produces a data-contract-compliant output.
 */

import axios from 'axios';

const MODULE_ID = 'tracking_infrastructure';
const VERSION = '1.0.0';

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s) { return String(s ?? '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#039;'}[c])); }

function detectGA4(html) {
  const ids = [];
  const re = /G-([A-Z0-9]{6,12})/gi;
  let m;
  while ((m = re.exec(html))) ids.push(`G-${m[1].toUpperCase()}`);
  const unique = [...new Set(ids)];
  return {
    detected: unique.length > 0,
    ids: unique,
    direct: /googletagmanager\.com\/gtag\/js/i.test(html),
    viaGtm: /GTM-[A-Z0-9]+/i.test(html) && unique.length > 0,
  };
}

function detectGTM(html) {
  const ids = [];
  const re = /GTM-([A-Z0-9]+)/gi;
  let m;
  while ((m = re.exec(html))) ids.push(`GTM-${m[1].toUpperCase()}`);
  const unique = [...new Set(ids)];
  return {
    detected: unique.length > 0,
    ids: unique,
    scriptPresent: /googletagmanager\.com\/gtm\.js/i.test(html),
    noscriptPresent: /googletagmanager\.com\/ns\.html/i.test(html),
  };
}

function detectServerSide(html) {
  // Heuristics: sGTM endpoints, custom domains loading gtm.js
  const sgtmDomains = [];
  const re = /https?:\/\/([a-z0-9.-]+)\/gtm\.js/gi;
  let m;
  while ((m = re.exec(html))) {
    const domain = m[1].toLowerCase();
    // Exclude official Google Tag Manager domain using exact suffix match
    const isGoogleDomain = domain === 'googletagmanager.com' || domain.endsWith('.googletagmanager.com');
    if (!isGoogleDomain) {
      sgtmDomains.push(domain);
    }
  }
  return {
    detected: sgtmDomains.length > 0,
    domains: [...new Set(sgtmDomains)],
  };
}

function detectConsent(html) {
  const cmpPatterns = [
    { name: 'Cookiebot', re: /cookiebot\.com/i },
    { name: 'OneTrust', re: /onetrust\.com|optanon/i },
    { name: 'Didomi', re: /didomi/i },
    { name: 'TrustCommander', re: /trustcommander/i },
    { name: 'RGPD-Consent (generic)', re: /window\.Consent\b|consentGranted|consentDenied/i },
    { name: 'Google Consent Mode', re: /gtag\(['"]consent['"]/i },
  ];
  const found = [];
  for (const { name, re } of cmpPatterns) {
    if (re.test(html)) found.push(name);
  }
  return {
    detected: found.length > 0,
    providers: found,
    consentMode: /gtag\(['"]consent['"]/i.test(html),
  };
}

function detectAdsPixels(html) {
  const pixels = [];
  if (/fbq\s*\(|facebook\.net\/en_US\/fbevents/i.test(html)) pixels.push('Meta Pixel');
  if (/gtag\(['"]event['"],|google_conversion_id|googleads\.g\.doubleclick/i.test(html)) pixels.push('Google Ads');
  if (/tiktok\.com\/i18n\/pixel|ttq\./i.test(html)) pixels.push('TikTok Pixel');
  if (/linkedin\.com\/insight\/init/i.test(html)) pixels.push('LinkedIn Insight');
  if (/analytics\.twitter\.com|twq\s*\(/i.test(html)) pixels.push('Twitter/X Pixel');
  if (/snaptr\s*\(/i.test(html)) pixels.push('Snapchat Pixel');
  return { detected: pixels.length > 0, pixels };
}

function buildArchitectureFlow(ga4, gtm, serverSide, consent) {
  const nodes = [];
  if (gtm.detected) nodes.push({ id: 'gtm', label: 'GTM Web', type: 'container' });
  if (ga4.detected) nodes.push({ id: 'ga4', label: 'GA4', type: 'analytics' });
  if (serverSide.detected) nodes.push({ id: 'sgtm', label: 'sGTM', type: 'server' });
  if (consent.detected) nodes.push({ id: 'cmp', label: consent.providers[0] || 'CMP', type: 'consent' });

  const edges = [];
  if (gtm.detected && ga4.detected) edges.push({ from: 'gtm', to: 'ga4', label: 'fires' });
  if (gtm.detected && serverSide.detected) edges.push({ from: 'gtm', to: 'sgtm', label: 'routes' });
  if (consent.detected && gtm.detected) edges.push({ from: 'cmp', to: 'gtm', label: 'consent signal' });

  return { nodes, edges };
}

function scoreInfrastructure(ga4, gtm, consent, serverSide, issues) {
  let score = 100;
  const deductions = issues
    .filter(i => !i.severity || ['critical','high','medium'].includes(i.severity))
    .reduce((s, i) => s + ({ critical:25, high:15, medium:8 }[i.severity] || 0), 0);
  score = Math.max(0, score - deductions);
  return score;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Audit tracking infrastructure for a URL.
 * @param {string} url
 * @returns {Promise<object>} Data-contract-compliant output
 */
export async function scanTrackingInfrastructure(url) {
  let html = '';
  let fetchError = null;

  try {
    const res = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'StratAds-Audit/1.0' },
      maxContentLength: 3 * 1024 * 1024,
    });
    html = String(res.data || '');
  } catch (e) {
    fetchError = e?.message || String(e);
  }

  const ga4 = detectGA4(html);
  const gtm = detectGTM(html);
  const serverSide = detectServerSide(html);
  const consent = detectConsent(html);
  const adsPixels = detectAdsPixels(html);
  const flow = buildArchitectureFlow(ga4, gtm, serverSide, consent);

  const issues = [];
  const observations = [];
  const recommendations = [];

  // Issue: No GA4
  if (!ga4.detected) {
    issues.push({
      id: 'no_ga4',
      title: 'GA4 non détecté',
      severity: 'critical',
      description: 'Aucun identifiant GA4 (G-XXXXXXXX) trouvé dans le HTML de la page.',
      evidence: 'Pattern G-XXXXXX absent du HTML',
      confidence: 0.9,
      effort: 'M',
    });
    recommendations.push({
      id: 'install_ga4',
      title: 'Installer GA4 via GTM',
      priority: 'now',
      effort: 'M',
      impact: 'Données analytics disponibles',
      details: 'Créer une propriété GA4, ajouter la balise via GTM avec trigger All Pages.',
    });
  }

  // Issue: No GTM
  if (!gtm.detected) {
    issues.push({
      id: 'no_gtm',
      title: 'GTM non détecté',
      severity: 'high',
      description: 'Google Tag Manager absent du HTML — gestion des tags impossible sans GTM.',
      evidence: 'Aucun identifiant GTM-XXXX trouvé',
      confidence: 0.9,
      effort: 'S',
    });
    recommendations.push({
      id: 'install_gtm',
      title: 'Installer GTM',
      priority: 'now',
      effort: 'S',
      impact: 'Centralisation de tous les tags',
      details: 'Créer un container GTM, ajouter snippet head + body, déployer via CMS ou développeur.',
    });
  }

  // Issue: GA4 dual load
  if (ga4.direct && ga4.viaGtm) {
    issues.push({
      id: 'ga4_dual_load',
      title: 'GA4 chargé en double (direct + GTM)',
      severity: 'high',
      description: 'GA4 détecté à la fois en direct (gtag.js) ET via GTM — risque de double comptage.',
      evidence: `GA4 direct: ${ga4.direct}, GA4 via GTM: ${ga4.viaGtm}`,
      confidence: 0.85,
      effort: 'S',
    });
    recommendations.push({
      id: 'remove_ga4_direct',
      title: 'Supprimer le tag GA4 hardcodé',
      priority: 'now',
      effort: 'S',
      impact: 'Élimination du double comptage',
      details: 'Supprimer le snippet gtag.js direct et conserver uniquement le tag GTM.',
    });
  }

  // Issue: No consent layer
  if (!consent.detected) {
    issues.push({
      id: 'no_consent',
      title: 'Aucune CMP / consentement détecté',
      severity: 'high',
      description: 'Aucune solution de gestion du consentement RGPD détectée.',
      evidence: 'Aucun pattern CMP connu trouvé',
      confidence: 0.75,
      effort: 'M',
    });
    recommendations.push({
      id: 'add_cmp',
      title: 'Ajouter une CMP conforme RGPD',
      priority: 'now',
      effort: 'M',
      impact: 'Conformité légale + données de qualité',
      details: 'Intégrer Cookiebot, OneTrust ou Didomi avec Google Consent Mode v2.',
    });
  }

  // Issue: GTM noscript missing
  if (gtm.detected && !gtm.noscriptPresent) {
    issues.push({
      id: 'gtm_noscript_missing',
      title: 'GTM noscript manquant',
      severity: 'low',
      description: 'Le snippet noscript GTM (body) est absent.',
      evidence: 'googletagmanager.com/ns.html non trouvé',
      confidence: 0.8,
      effort: 'XS',
    });
  }

  observations.push(
    { type: 'ga4', value: ga4, label: 'GA4 detection' },
    { type: 'gtm', value: gtm, label: 'GTM detection' },
    { type: 'server_side', value: serverSide, label: 'Server-side GTM' },
    { type: 'consent', value: consent, label: 'Consent layer' },
    { type: 'ads_pixels', value: adsPixels, label: 'Ads pixels' },
    { type: 'architecture_flow', value: flow, label: 'Architecture flow' },
  );

  const score = scoreInfrastructure(ga4, gtm, consent, serverSide, issues);

  return {
    module_id: MODULE_ID,
    version: VERSION,
    ok: !fetchError,
    error: fetchError || undefined,
    inputs: { url },
    observations,
    evidence: [
      `GA4 IDs: ${ga4.ids.join(', ') || 'none'}`,
      `GTM IDs: ${gtm.ids.join(', ') || 'none'}`,
      `CMP: ${consent.providers.join(', ') || 'none'}`,
      `Server-side domains: ${serverSide.domains.join(', ') || 'none'}`,
      `Ads pixels: ${adsPixels.pixels.join(', ') || 'none'}`,
    ],
    issues,
    metrics: {
      ga4Detected: ga4.detected,
      ga4Ids: ga4.ids,
      gtmDetected: gtm.detected,
      gtmIds: gtm.ids,
      serverSideDetected: serverSide.detected,
      serverSideDomains: serverSide.domains,
      consentDetected: consent.detected,
      consentProviders: consent.providers,
      consentMode: consent.consentMode,
      adsPixels: adsPixels.pixels,
      architectureFlow: flow,
    },
    score_contrib: {
      weight: 0.15,
      score,
      skipped: false,
    },
    recommendations,
    artifacts: [],
  };
}
