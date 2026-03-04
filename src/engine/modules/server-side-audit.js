/**
 * StratAds — Server-Side Audit Module
 * Audits server-side GTM container, enrichment, deduplication.
 * Produces a data-contract-compliant output.
 */

import axios from 'axios';

const MODULE_ID = 'server_side_audit';
const VERSION = '1.0.0';

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeArr(v) { return Array.isArray(v) ? v : []; }

/**
 * Probe a potential sGTM endpoint.
 * sGTM typically exposes /healthz or /gtm.js
 */
async function probeSgtmEndpoint(domain) {
  const endpoints = [
    `https://${domain}/healthz`,
    `https://${domain}/gtm.js`,
  ];
  for (const url of endpoints) {
    try {
      const res = await axios.get(url, { timeout: 5000, maxRedirects: 3 });
      const body = String(res.data || '');
      if (res.status === 200) {
        return {
          reachable: true,
          url,
          isHealthz: url.endsWith('/healthz') && body.includes('ok'),
          isGtmJs: url.endsWith('/gtm.js') && body.includes('GoogleTagManager'),
        };
      }
    } catch { /* unreachable */ }
  }
  return { reachable: false, url: null };
}

function detectDeduplication(tags = []) {
  // Check if any tag has deduplication key or event deduplication
  const hasDedupTag = tags.some(t => {
    const code = String(t?.code || t?.tagConfig?.code || JSON.stringify(t) || '');
    return /dedup|transaction_id|event_id|order_id/i.test(code);
  });
  return hasDedupTag;
}

function checkEnrichment(container) {
  const enrichments = [];
  const tags = safeArr(container?.tags);
  for (const tag of tags) {
    const code = String(tag?.code || tag?.tagConfig?.code || JSON.stringify(tag) || '');
    if (/user_id|userId/i.test(code)) enrichments.push('user_id');
    if (/client_id|clientId/i.test(code)) enrichments.push('client_id');
    if (/session_id|sessionId/i.test(code)) enrichments.push('session_id');
    if (/revenue|value|transaction/i.test(code)) enrichments.push('ecommerce_data');
  }
  return [...new Set(enrichments)];
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Audit server-side GTM setup.
 *
 * @param {object} trackingInfraData - Output from tracking-infrastructure module
 * @param {object} [gtmData] - Output from GTM API module
 * @returns {Promise<object>} Data-contract-compliant output
 */
export async function auditServerSide(trackingInfraData, gtmData) {
  const sgtmDomains = trackingInfraData?.metrics?.serverSideDomains || [];
  const detected = trackingInfraData?.metrics?.serverSideDetected || false;

  const issues = [];
  const observations = [];
  const recommendations = [];

  if (!detected || sgtmDomains.length === 0) {
    observations.push({ type: 'status', value: 'not_detected', label: 'sGTM not detected' });

    recommendations.push({
      id: 'deploy_sgtm',
      title: 'Déployer un container server-side GTM',
      priority: 'next',
      effort: 'L',
      impact: 'Meilleure qualité de données, protection ITP/adblockers',
      details: 'Déployer sGTM sur Cloud Run (Google Cloud) ou Stape.io. Configurer les tags GA4 et Ads côté serveur.',
    });

    return {
      module_id: MODULE_ID,
      version: VERSION,
      ok: true,
      inputs: { source: 'tracking_infrastructure' },
      observations,
      evidence: ['No server-side GTM detected from HTML analysis'],
      issues: [],
      metrics: { detected: false, domains: [] },
      score_contrib: { weight: 0.15, score: null, skipped: true },
      recommendations,
    };
  }

  // Probe sGTM endpoints
  const probeResults = [];
  for (const domain of sgtmDomains) {
    const result = await probeSgtmEndpoint(domain);
    probeResults.push({ domain, ...result });
  }

  observations.push(
    { type: 'sgtm_domains', value: sgtmDomains, label: 'sGTM domains detected' },
    { type: 'probe_results', value: probeResults, label: 'Endpoint probe results' },
  );

  const allReachable = probeResults.every(r => r.reachable);
  const anyReachable = probeResults.some(r => r.reachable);

  if (!anyReachable) {
    issues.push({
      id: 'sgtm_unreachable',
      title: 'Container server-side inaccessible',
      severity: 'high',
      description: `sGTM détecté (${sgtmDomains.join(', ')}) mais inaccessible depuis l'extérieur.`,
      evidence: `Domains: ${sgtmDomains.join(', ')} — all unreachable`,
      confidence: 0.75,
      effort: 'M',
    });
  }

  // Check deduplication in sGTM tags
  const sgtmTags = safeArr(gtmData?.serverTags || gtmData?.container?.tags);
  const hasDedup = detectDeduplication(sgtmTags);
  if (!hasDedup && sgtmTags.length > 0) {
    issues.push({
      id: 'sgtm_no_deduplication',
      title: 'Déduplication manquante côté serveur',
      severity: 'medium',
      description: 'Aucune clé de déduplication (transaction_id, event_id) détectée dans le container sGTM.',
      evidence: `sGTM tags: ${sgtmTags.length}, dedup: false`,
      confidence: 0.7,
      effort: 'M',
    });
    recommendations.push({
      id: 'add_sgtm_deduplication',
      title: 'Ajouter déduplication dans sGTM',
      priority: 'next',
      effort: 'M',
      impact: 'Élimination des événements en doublon',
      details: 'Utiliser transaction_id ou event_id pour dédupliquer les conversions GA4 et Ads côté serveur.',
    });
  }

  // Check enrichment
  const enrichments = checkEnrichment({ tags: sgtmTags });
  if (enrichments.length === 0 && sgtmTags.length > 0) {
    issues.push({
      id: 'sgtm_no_enrichment',
      title: 'Aucun enrichissement côté serveur',
      severity: 'low',
      description: 'sGTM sans enrichissement user_id/session_id — valeur ajoutée limitée.',
      evidence: 'No enrichment keys found in sGTM tags',
      confidence: 0.65,
      effort: 'M',
    });
  }

  let score = 85; // sGTM present is a good baseline
  if (!anyReachable) score -= 30;
  for (const issue of issues) {
    score -= ({ critical:25, high:15, medium:8, low:3, info:0 }[issue.severity] || 0);
  }
  score = Math.max(0, score);

  return {
    module_id: MODULE_ID,
    version: VERSION,
    ok: true,
    inputs: { source: 'tracking_infrastructure' },
    observations,
    evidence: [
      `sGTM domains: ${sgtmDomains.join(', ')}`,
      `Reachable: ${anyReachable}`,
      `Enrichment fields: ${enrichments.join(', ') || 'none'}`,
      `Deduplication: ${hasDedup}`,
    ],
    issues,
    metrics: {
      detected: true,
      domains: sgtmDomains,
      reachable: anyReachable,
      probeResults,
      enrichments,
      hasDeduplication: hasDedup,
      tagCount: sgtmTags.length,
    },
    score_contrib: {
      weight: 0.15,
      score,
      skipped: false,
    },
    recommendations,
  };
}
