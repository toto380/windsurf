/**
 * StratAds — Ads Audit Module
 * Audits pixel setup, event mapping, attribution quality, deduplication.
 * Covers Google Ads and Meta Ads.
 * Produces a data-contract-compliant output.
 */

const MODULE_ID = 'ads_audit';
const VERSION = '1.0.0';

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function safeArr(v) { return Array.isArray(v) ? v : []; }

const REQUIRED_ADS_EVENTS = {
  google: ['purchase', 'add_to_cart', 'begin_checkout', 'generate_lead'],
  meta: ['Purchase', 'AddToCart', 'InitiateCheckout', 'Lead'],
};

function checkEventMapping(pixels, platform) {
  const required = REQUIRED_ADS_EVENTS[platform] || [];
  const eventNames = pixels.map(e => String(e.eventName || e.event || e.name || ''));
  const missing = required.filter(r => !eventNames.some(n => n.toLowerCase() === r.toLowerCase()));
  const present = required.filter(r => eventNames.some(n => n.toLowerCase() === r.toLowerCase()));
  return { missing, present, complete: missing.length === 0 };
}

function checkAttributionWindow(data) {
  // Heuristic: check for extended attribution windows (14d, 30d) vs default (7d)
  const window = safeNum(data?.attributionWindowDays || data?.attribution_window || 0);
  if (window === 0) return { configured: false, days: null };
  return { configured: true, days: window, isExtended: window > 7 };
}

function checkDeduplication(googleData, infraData) {
  // Check if both server-side and pixel are present for the same events
  const pixelConversions = safeNum(googleData?.totals30d?.conversions || 0);
  const serverConversions = safeNum(googleData?.serverSideConversions || 0);

  if (pixelConversions > 0 && serverConversions > 0) {
    const dupRatio = Math.min(pixelConversions, serverConversions) / Math.max(pixelConversions, serverConversions);
    if (dupRatio > 0.5) {
      return {
        risk: 'high',
        evidence: `Pixel conversions: ${pixelConversions}, Server conversions: ${serverConversions}, overlap ratio: ${dupRatio.toFixed(2)}`,
      };
    }
    return { risk: 'medium', evidence: `Both channels active, overlap ratio: ${dupRatio.toFixed(2)}` };
  }
  return { risk: 'low', evidence: 'Single attribution channel' };
}

function computeROAS(data) {
  const cost = safeNum(data?.totals30d?.cost || data?.spend || 0);
  const value = safeNum(data?.totals30d?.value || data?.revenue || 0);
  if (cost === 0) return null;
  return value / cost;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Audit Ads setup: pixel, event mapping, deduplication, ROAS.
 *
 * @param {object} googleAdsData - Output from ads-import module
 * @param {object} metaAdsData - Output from meta-ads-import module
 * @param {object} [trackingInfraData] - Output from tracking-infrastructure module
 * @returns {object} Data-contract-compliant output
 */
export function auditAds(googleAdsData, metaAdsData, trackingInfraData) {
  const hasGoogle = !!(googleAdsData?.ok && !googleAdsData?.skipped);
  const hasMeta = !!(metaAdsData?.ok && !metaAdsData?.skipped);
  const hasAnyAds = hasGoogle || hasMeta;

  const issues = [];
  const observations = [];
  const recommendations = [];

  const adsPixels = trackingInfraData?.metrics?.adsPixels || [];

  // No ads data at all
  if (!hasAnyAds) {
    return {
      module_id: MODULE_ID,
      version: VERSION,
      ok: false,
      skipped: false,
      inputs: { source: 'ads_import' },
      observations: [{ type: 'status', value: 'no_data', label: 'No Ads data' }],
      evidence: ['No Google Ads or Meta Ads data available'],
      issues: [{
        id: 'ads_data_unavailable',
        title: 'Données Ads non disponibles',
        severity: 'medium',
        description: 'Aucun export Ads fourni — audit de performance Ads impossible.',
        evidence: 'google.ok=false, meta.ok=false',
        confidence: 1,
        effort: 'S',
      }],
      metrics: { dataAvailable: false, platforms: {} },
      score_contrib: { weight: 0.15, score: 0, skipped: true },
      recommendations: [{
        id: 'provide_ads_exports',
        title: 'Fournir exports Google Ads / Meta Ads',
        priority: 'next',
        effort: 'S',
        impact: 'Audit performance Ads complet',
        details: 'Exporter les données campagnes sur 30 jours depuis Google Ads et Meta Ads Manager.',
      }],
    };
  }

  const metrics = { dataAvailable: true, platforms: {} };

  // ── Google Ads analysis
  if (hasGoogle) {
    const gTotals = googleAdsData?.totals30d || {};
    const gCost = safeNum(gTotals.cost);
    const gConversions = safeNum(gTotals.conversions);
    const gValue = safeNum(gTotals.value);
    const gRoas = computeROAS(googleAdsData);
    const gEvents = safeArr(googleAdsData?.conversions || googleAdsData?.events || []);

    observations.push({ type: 'google_ads_totals', value: gTotals, label: 'Google Ads 30d totals' });

    metrics.platforms.google = {
      cost: gCost,
      conversions: gConversions,
      revenue: gValue,
      roas: gRoas,
    };

    // ROAS check
    if (gRoas !== null) {
      if (gRoas < 1) {
        issues.push({
          id: 'google_roas_negative',
          title: `ROAS Google Ads négatif (${gRoas.toFixed(2)})`,
          severity: 'critical',
          description: `ROAS de ${gRoas.toFixed(2)} — dépenses supérieures aux revenus.`,
          evidence: `cost=${gCost}, value=${gValue}, ROAS=${gRoas.toFixed(2)}`,
          confidence: 1,
          effort: 'M',
          impact_euro: gCost - gValue,
        });
        recommendations.push({
          id: 'optimize_google_roas',
          title: 'Optimiser les campagnes Google Ads sous-performantes',
          priority: 'now',
          effort: 'M',
          impact: `Récupération estimée: ${(gCost - gValue).toFixed(0)}€`,
          details: 'Analyser les campagnes KILL (ROAS < 1), pauser ou restructurer les ad groups non performants.',
        });
      } else if (gRoas < 2) {
        issues.push({
          id: 'google_roas_low',
          title: `ROAS Google Ads faible (${gRoas.toFixed(2)})`,
          severity: 'high',
          description: `ROAS de ${gRoas.toFixed(2)} — objectif minimum recommandé : 2x.`,
          evidence: `cost=${gCost}, value=${gValue}, ROAS=${gRoas.toFixed(2)}`,
          confidence: 0.95,
          effort: 'M',
        });
      }
    }

    // Event mapping
    const eventCheck = checkEventMapping(gEvents, 'google');
    if (eventCheck.missing.length > 0) {
      issues.push({
        id: 'google_events_missing',
        title: `Événements Google Ads manquants: ${eventCheck.missing.join(', ')}`,
        severity: 'high',
        description: 'Des événements de conversion Google Ads standard sont absents.',
        evidence: `Missing: ${eventCheck.missing.join(', ')}`,
        confidence: 0.85,
        effort: 'M',
      });
    }

    // Deduplication check
    const dedup = checkDeduplication(googleAdsData, trackingInfraData);
    if (dedup.risk === 'high') {
      issues.push({
        id: 'google_ads_deduplication_risk',
        title: 'Risque de double comptage conversions Google Ads',
        severity: 'high',
        description: dedup.evidence,
        evidence: dedup.evidence,
        confidence: 0.75,
        effort: 'M',
      });
      recommendations.push({
        id: 'fix_google_ads_deduplication',
        title: 'Configurer la déduplication Google Ads',
        priority: 'now',
        effort: 'M',
        impact: 'Données de conversion fiables',
        details: 'Utiliser une seule source de vérité (sGTM ou pixel), configurer order_id pour la déduplication.',
      });
    }
  }

  // ── Meta Ads analysis
  if (hasMeta) {
    const mTotals = metaAdsData?.totals30d || {};
    const mCost = safeNum(mTotals.cost || mTotals.spend);
    const mConversions = safeNum(mTotals.conversions);
    const mValue = safeNum(mTotals.value || mTotals.purchase_value);
    const mRoas = mCost > 0 ? mValue / mCost : null;

    observations.push({ type: 'meta_ads_totals', value: mTotals, label: 'Meta Ads 30d totals' });

    metrics.platforms.meta = {
      spend: mCost,
      conversions: mConversions,
      revenue: mValue,
      roas: mRoas,
    };

    if (mRoas !== null && mRoas < 1) {
      issues.push({
        id: 'meta_roas_negative',
        title: `ROAS Meta Ads négatif (${mRoas.toFixed(2)})`,
        severity: 'critical',
        description: `Meta ROAS de ${mRoas.toFixed(2)} — dépenses supérieures aux revenus.`,
        evidence: `spend=${mCost}, value=${mValue}`,
        confidence: 0.95,
        effort: 'M',
        impact_euro: mCost - mValue,
      });
    }
  }

  // No pixel in HTML
  if (adsPixels.length === 0 && (hasGoogle || hasMeta)) {
    issues.push({
      id: 'ads_pixel_not_detected',
      title: 'Aucun pixel Ads détecté dans le HTML',
      severity: 'high',
      description: 'Des données Ads existent mais aucun pixel n\'est détecté sur le site.',
      evidence: 'No ads pixels found in HTML analysis',
      confidence: 0.7,
      effort: 'M',
    });
  }

  let score = 100;
  for (const issue of issues) {
    score -= ({ critical:25, high:15, medium:8, low:3, info:0 }[issue.severity] || 0);
  }
  score = Math.max(0, score);

  return {
    module_id: MODULE_ID,
    version: VERSION,
    ok: true,
    inputs: { sources: ['ads_import', 'meta_ads_import', 'tracking_infrastructure'] },
    observations,
    evidence: [
      hasGoogle ? `Google Ads: cost=${safeNum(googleAdsData?.totals30d?.cost).toFixed(0)}€, ROAS=${computeROAS(googleAdsData)?.toFixed(2) || 'N/A'}` : 'Google Ads: no data',
      hasMeta ? `Meta Ads: spend=${safeNum(metaAdsData?.totals30d?.cost || metaAdsData?.totals30d?.spend).toFixed(0)}€` : 'Meta Ads: no data',
      `Pixels HTML: ${adsPixels.join(', ') || 'none'}`,
    ],
    issues,
    metrics,
    score_contrib: {
      weight: 0.15,
      score,
      skipped: false,
    },
    recommendations,
  };
}
