import axios from 'axios';

// -----------------------------------------------------------------------
// Stack architecture detection
// -----------------------------------------------------------------------

/**
 * Detect GA4 loading mode and GTM/GA4 IDs from raw HTML.
 * Returns:
 *   ga4Mode: "gtm"    — GA4 loaded only via GTM (OPTIMAL)
 *           "direct" — GA4 hardcoded directly (no GTM)
 *           "dual"   — GA4 loaded BOTH via GTM AND directly (DUPLICATE RISK)
 *           "none"   — GA4 not detected
 *   gtmMode: "present" | "none"
 *   duplicateRisk: boolean
 *   evidence: human-readable proof string
 */
function detectStackArchitecture(html) {
  const h = String(html || '');

  // GTM detection
  const gtmScriptMatch = h.match(/googletagmanager\.com\/gtm\.js[^"']*["'].*?GTM-([A-Z0-9]+)/i)
    || h.match(/GTM-([A-Z0-9]+)/i);
  const hasGTMScript = /googletagmanager\.com\/gtm\.js/i.test(h);
  const hasGTMId = /GTM-[A-Z0-9]+/i.test(h);
  const hasGTM = hasGTMScript || hasGTMId;
  const gtmId = gtmScriptMatch ? `GTM-${gtmScriptMatch[1]}` : (h.match(/GTM-([A-Z0-9]+)/i)?.[1] ? `GTM-${h.match(/GTM-([A-Z0-9]+)/i)[1]}` : null);

  // GA4 detection — direct hardcoded (gtag.js with G- measurement ID)
  const ga4DirectScript = /googletagmanager\.com\/gtag\/js\?id=G-[A-Z0-9]+/i.test(h)
    || /src=["']https:\/\/www\.googletagmanager\.com\/gtag\/js/i.test(h);
  const ga4DirectGtag = /gtag\(['"]config['"],\s*['"]G-[A-Z0-9]+['"]/i.test(h);
  const hasGA4Direct = ga4DirectScript || ga4DirectGtag;

  // GA4 detection — via GTM container (G- ID inside GTM-loaded scripts, or known GTM+GA4 pattern)
  // When GTM is present, assume GA4 might be loaded via GTM (cannot confirm without GTM API)
  const ga4IdMatch = h.match(/G-([A-Z0-9]{6,})/i);
  const ga4Id = ga4IdMatch ? `G-${ga4IdMatch[1]}` : null;
  const hasGA4Id = !!ga4Id;

  // Determine mode
  let ga4Mode;
  let duplicateRisk = false;
  let evidence;

  if (hasGTM && hasGA4Direct) {
    // Both GTM and hardcoded GA4 found — likely duplicate
    ga4Mode = 'dual';
    duplicateRisk = true;
    evidence = `GTM détecté (${gtmId || 'GTM-?'}) ET GA4 hardcodé (${ga4Id || 'G-?'}) en simultané — risque de double comptage`;
  } else if (hasGTM && hasGA4Id && !hasGA4Direct) {
    // GTM present, GA4 ID found but NOT loaded directly → GA4 via GTM (optimal)
    ga4Mode = 'gtm';
    duplicateRisk = false;
    evidence = `GA4 (${ga4Id || 'G-?'}) piloté via GTM (${gtmId || 'GTM-?'}) — architecture recommandée`;
  } else if (!hasGTM && hasGA4Direct) {
    ga4Mode = 'direct';
    duplicateRisk = false;
    evidence = `GA4 (${ga4Id || 'G-?'}) intégré en direct (hardcodé) — GTM absent`;
  } else if (hasGTM && !hasGA4Id) {
    ga4Mode = 'none';
    duplicateRisk = false;
    evidence = `GTM présent (${gtmId || 'GTM-?'}) mais aucune propriété GA4 détectée`;
  } else {
    ga4Mode = 'none';
    duplicateRisk = false;
    evidence = 'Ni GTM ni GA4 détecté dans le HTML de la page';
  }

  return {
    hasGTM,
    hasGA4: hasGA4Id || hasGA4Direct,
    hasGA4Direct,
    ga4Mode,
    ga4Id,
    gtmId,
    duplicateRisk,
    gtmMode: hasGTM ? 'present' : 'none',
    evidence,
  };
}

/**
 * Detect all third-party tracking pixels/tags with name, category, and evidence.
 */
function detectThirdPartyPixels(html) {
  const h = String(html || '');
  const found = [];

  const PIXELS = [
    // Analytics
    { name: 'Google Analytics 4 (GA4)', category: 'Analytics', pattern: /G-[A-Z0-9]{6,}|google-analytics\.com\/g\/collect|gtag\.js\?id=G-/i },
    { name: 'Google Tag Manager (GTM)', category: 'Tag Manager', pattern: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/i },
    // Ads
    { name: 'Meta Pixel (Facebook)', category: 'Ads / Retargeting', pattern: /connect\.facebook\.net\/.*\/fbevents\.js|fbq\(|facebook\.com\/tr/i },
    { name: 'Google Ads (gTag)', category: 'Ads / Conversion', pattern: /AW-[0-9]+|googleadservices\.com\/pagead\/conversion/i },
    { name: 'Microsoft Ads / Bing UET', category: 'Ads / Retargeting', pattern: /bat\.bing\.com\/bat\.js|uetq\(/i },
    { name: 'LinkedIn Insight Tag', category: 'Ads / B2B', pattern: /snap\.licdn\.com\/li\.lms-analytics|_linkedin_partner_id/i },
    { name: 'TikTok Pixel', category: 'Ads / Retargeting', pattern: /analytics\.tiktok\.com\/i18n\/pixel|ttq\(|tiktok\.com\/i18n\/pixel/i },
    { name: 'Twitter / X Pixel', category: 'Ads / Retargeting', pattern: /static\.ads-twitter\.com\/uwt\.js|twq\(/i },
    { name: 'Pinterest Tag', category: 'Ads / Retargeting', pattern: /pintrk\(|ct\.pinterest\.com/i },
    { name: 'Snapchat Pixel', category: 'Ads / Retargeting', pattern: /tr\.snapchat\.com\/p\.js|snaptr\(/i },
    // Heatmaps / Session recording
    { name: 'Hotjar', category: 'Heatmap / Session', pattern: /static\.hotjar\.com\/c\/hotjar-|hj\(/i },
    { name: 'Clarity (Microsoft)', category: 'Heatmap / Session', pattern: /clarity\.ms\/tag|clarity\(|c\.clarity\.ms/i },
    { name: 'FullStory', category: 'Heatmap / Session', pattern: /fullstory\.com\/s\/fs\.js|window\._fs_/i },
    // CMP / Consent
    { name: 'Cookiebot (CMP)', category: 'Consent / RGPD', pattern: /cookiebot\.com/i },
    { name: 'OneTrust (CMP)', category: 'Consent / RGPD', pattern: /onetrust/i },
    { name: 'Didomi (CMP)', category: 'Consent / RGPD', pattern: /didomi/i },
    { name: 'Axeptio (CMP)', category: 'Consent / RGPD', pattern: /axept\.io|axeptio/i },
    { name: 'Tarteaucitron (CMP)', category: 'Consent / RGPD', pattern: /tarteaucitron/i },
    // Chat / Support
    { name: 'Intercom', category: 'Chat / Support', pattern: /widget\.intercom\.io\/widget|intercomSettings/i },
    { name: 'HubSpot Tracking', category: 'CRM / Marketing', pattern: /js\.hs-scripts\.com|hs-analytics\.net/i },
    { name: 'Segment', category: 'CDP / Analytics', pattern: /cdn\.segment\.com\/analytics\.js|analytics\.load\(/i },
  ];

  for (const px of PIXELS) {
    if (px.pattern.test(h)) {
      // Extract a short evidence snippet
      const match = h.match(px.pattern);
      const snippet = match ? match[0].slice(0, 60) : 'pattern matched';
      found.push({ name: px.name, category: px.category, evidence: `"${snippet}"` });
    }
  }

  return found;
}

function detectTags(html) {
  return detectThirdPartyPixels(html).map(p => p.name);
}

// -----------------------------------------------------------------------
// Scoring
// -----------------------------------------------------------------------

/**
 * Score the tracking stack.
 * GA4+GTM (no duplicate): 90  | GA4+GTM (duplicate): 72
 * GA4 direct only: 58          | GTM only (no GA4): 42
 * Neither: 0
 * CMP present: +8 (max 100)
 * Each additional pixel beyond GA4/GTM: +1 (max +5)
 */
function scoreFromArchitecture(arch, pixels) {
  let s = 0;

  if (arch.ga4Mode === 'gtm')    s = 90; // optimal
  else if (arch.ga4Mode === 'dual')   s = 72; // duplicate risk
  else if (arch.ga4Mode === 'direct') s = 58; // GA4 without GTM
  else if (arch.hasGTM)               s = 42; // GTM without GA4
  // else 0

  const hasCMP = pixels.some(p => p.category === 'Consent / RGPD');
  if (hasCMP) s = Math.min(100, s + 8);

  // Bonus for additional marketing pixels (signals business maturity)
  const extraPixels = pixels.filter(p => p.category === 'Ads / Retargeting' || p.category === 'Ads / Conversion').length;
  s = Math.min(100, s + Math.min(5, extraPixels));

  return Math.round(s);
}

function scoreFromTags(tags) {
  let s = 0;
  const hasGTM = tags.some(t => /GTM/i.test(t));
  const hasGA4 = tags.some(t => /GA4|Google Analytics 4/i.test(t));
  const hasCMP = tags.some(t => /CMP|Cookiebot|OneTrust|Didomi/i.test(t));
  if (hasGA4) s += 45;
  if (hasGTM) s += 35;
  if (hasCMP) s += 10;
  if (tags.length >= 3) s += 10;
  return Math.min(100, s);
}

// -----------------------------------------------------------------------
// Main scanner
// -----------------------------------------------------------------------

export async function scanTrackingLite(url) {
  try {
    const res = await axios.get(url, {
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'StratAdsAudit/1.0 (+https://stratads.agency)'
      }
    });

    const html = res?.data || '';
    const arch = detectStackArchitecture(html);
    const pixels = detectThirdPartyPixels(html);
    const tags = pixels.map(p => p.name);
    const score = scoreFromArchitecture(arch, pixels);

    return {
      lite: true,
      score,
      tags,
      pixels,                    // [{name, category, evidence}]
      stackArchitecture: arch,   // {ga4Mode, gtmId, ga4Id, duplicateRisk, evidence, ...}
      network: { totalRequests: 0, thirdPartyRequests: 0, sample: [] },
      cookies: [],
      dataLayerSample: 'Non détecté',
      captureMode: 'http',
    };
  } catch (e) {
    return {
      lite: true,
      error: String(e?.message || e),
      score: 0,
      tags: [],
      pixels: [],
      stackArchitecture: {
        hasGTM: false, hasGA4: false, hasGA4Direct: false,
        ga4Mode: 'none', ga4Id: null, gtmId: null,
        duplicateRisk: false, gtmMode: 'none',
        evidence: `Erreur lors de la requête HTTP : ${String(e?.message || e)}`,
      },
      network: { totalRequests: 0, thirdPartyRequests: 0, sample: [] },
      cookies: [],
      dataLayerSample: 'Non détecté',
      captureMode: 'http',
    };
  }
}

