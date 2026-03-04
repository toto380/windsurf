/**
 * StratAds — GA4 Audit Module
 * Audits GA4 events, parameters, ecommerce coherence from private GA4 data.
 * Produces a data-contract-compliant output.
 */

const MODULE_ID = 'ga4_audit';
const VERSION = '1.0.0';

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

const REQUIRED_ECOM_EVENTS = [
  'view_item', 'add_to_cart', 'begin_checkout', 'purchase',
];

const STANDARD_GA4_EVENTS = [
  'page_view', 'session_start', 'user_engagement', 'scroll',
  'click', 'file_download', 'view_item', 'add_to_cart',
  'begin_checkout', 'purchase', 'generate_lead',
];

function checkEcommerceCompleteness(events = []) {
  const eventNames = events.map(e => String(e.eventName || e.name || '').toLowerCase());
  const missing = REQUIRED_ECOM_EVENTS.filter(req => !eventNames.includes(req));
  const present = REQUIRED_ECOM_EVENTS.filter(req => eventNames.includes(req));
  return { missing, present, complete: missing.length === 0 };
}

function checkRevenueConsistency(totals, events = []) {
  const issues = [];
  const purchaseEvents = events.filter(e =>
    String(e.eventName || e.name || '').toLowerCase() === 'purchase'
  );

  if (purchaseEvents.length === 0 && safeNum(totals?.revenue) > 0) {
    issues.push('Revenue recorded without purchase events');
  }

  if (purchaseEvents.length > 0) {
    const eventRevenue = purchaseEvents.reduce((s, e) => s + safeNum(e.revenue || e.value), 0);
    const totalRevenue = safeNum(totals?.revenue);
    if (totalRevenue > 0 && eventRevenue > 0) {
      const delta = Math.abs(totalRevenue - eventRevenue) / totalRevenue;
      if (delta > 0.1) {
        issues.push(`Revenue mismatch: totals=${totalRevenue.toFixed(2)}, sum_events=${eventRevenue.toFixed(2)} (delta ${(delta*100).toFixed(1)}%)`);
      }
    }
  }

  return issues;
}

function scoreGA4(totals, ecomCheck, issues) {
  let score = 100;
  for (const issue of issues) {
    score -= ({ critical:25, high:15, medium:8, low:3, info:0 }[issue.severity] || 0);
  }
  // Bonus: all ecom events present
  if (ecomCheck.complete) score = Math.min(100, score + 5);
  return Math.max(0, score);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Audit GA4 data from private Google access results.
 *
 * @param {object} privateGoogleData - Output from google-private module
 * @param {object} [trackingData] - Output from tracking-lite or tracking-infrastructure
 * @returns {object} Data-contract-compliant output
 */
export function auditGA4(privateGoogleData, trackingData) {
  const ga4Data = privateGoogleData?.ga4 || privateGoogleData?.ga4Totals || null;
  const hasData = !!(ga4Data?.ok || ga4Data?.totals);
  const totals = ga4Data?.totals || {};
  const events = ga4Data?.events || ga4Data?.rows || [];
  const campaigns = privateGoogleData?.ga4?.campaigns || [];
  const isPartial = privateGoogleData?.status === 'PARTIAL';
  // Collect actionable messages from pipelineLog for display in report
  const pipelineWarnings = (privateGoogleData?.pipelineLog || [])
    .filter(e => e.status === 'FAIL' && e.actionableMessage)
    .map(e => e.actionableMessage);
  const privateErrors = privateGoogleData?.errors || [];

  const issues = [];
  const observations = [];
  const recommendations = [];

  if (!hasData) {
    // Build a diagnostic error description from errors/pipelineLog
    const diagMessages = [];
    for (const e of privateErrors) {
      if (e.actionableMessage) diagMessages.push(e.actionableMessage);
      else if (e.message) diagMessages.push(e.message);
    }
    const diagDesc = diagMessages.length
      ? diagMessages.join(' | ')
      : 'Accès GA4 privé non fourni ou token invalide.';

    return {
      module_id: MODULE_ID,
      version: VERSION,
      ok: false,
      skipped: false,
      inputs: { source: 'privateGoogle' },
      observations: [{ type: 'status', value: 'no_data', label: 'GA4 data unavailable' }],
      evidence: ['No GA4 data available — private access required'],
      issues: [{
        id: 'ga4_data_unavailable',
        title: 'Données GA4 non disponibles',
        severity: 'high',
        description: diagDesc,
        evidence: `ga4.ok=false, status=${privateGoogleData?.status || 'FAIL'}`,
        confidence: 1,
        effort: 'M',
      }],
      metrics: { dataAvailable: false },
      score_contrib: { weight: 0.15, score: 0, skipped: true },
      recommendations: [{
        id: 'provide_ga4_access',
        title: 'Fournir accès GA4 via service account',
        priority: 'now',
        effort: 'S',
        impact: 'Données réelles pour audit',
        details: 'Ajouter l\'email service account en Viewer sur la propriété GA4.',
      }],
    };
  }

  // Check sessions / users
  const sessions = safeNum(totals.sessions);
  const users = safeNum(totals.users);
  const conversions = safeNum(totals.conversions);
  const revenue = safeNum(totals.revenue);

  observations.push(
    { type: 'totals', value: totals, label: 'GA4 totals (28d)' },
    { type: 'events', value: events, label: 'GA4 event list' },
  );

  // Check: sessions > 0
  if (sessions === 0) {
    issues.push({
      id: 'ga4_zero_sessions',
      title: 'Aucune session GA4 sur 28 jours',
      severity: 'critical',
      description: 'GA4 accessible mais 0 sessions — tracking non fonctionnel ou propriété vide.',
      evidence: `sessions=${sessions}`,
      confidence: 1,
      effort: 'M',
    });
  }

  // Check: users > sessions (anomaly)
  if (users > sessions * 1.1 && sessions > 0) {
    issues.push({
      id: 'ga4_users_gt_sessions',
      title: 'Utilisateurs supérieurs aux sessions',
      severity: 'medium',
      description: 'users > sessions — probablement une incohérence de configuration GA4.',
      evidence: `users=${users}, sessions=${sessions}`,
      confidence: 0.8,
      effort: 'S',
    });
  }

  // Ecommerce completeness
  const ecomCheck = checkEcommerceCompleteness(events);
  if (ecomCheck.missing.length > 0) {
    issues.push({
      id: 'ga4_ecom_events_missing',
      title: `Événements e-commerce manquants: ${ecomCheck.missing.join(', ')}`,
      severity: ecomCheck.missing.includes('purchase') ? 'critical' : 'high',
      description: 'Des événements GA4 e-commerce standard sont absents.',
      evidence: `Missing: ${ecomCheck.missing.join(', ')}`,
      confidence: 0.9,
      effort: 'M',
    });
    recommendations.push({
      id: 'add_ecom_events',
      title: 'Compléter les événements e-commerce GA4',
      priority: 'now',
      effort: 'M',
      impact: 'Funnel e-commerce complet',
      details: `Ajouter les événements manquants via GTM dataLayer: ${ecomCheck.missing.join(', ')}`,
    });
  }

  // Revenue consistency
  const revenueIssues = checkRevenueConsistency(totals, events);
  for (const ri of revenueIssues) {
    issues.push({
      id: `ga4_revenue_${issues.length}`,
      title: 'Incohérence de revenu GA4',
      severity: 'high',
      description: ri,
      evidence: ri,
      confidence: 0.85,
      effort: 'M',
    });
  }

  // Conversion rate
  const convRate = sessions > 0 ? (conversions / sessions) * 100 : null;
  if (convRate !== null && convRate === 0 && sessions > 100) {
    issues.push({
      id: 'ga4_zero_conversions',
      title: 'Aucune conversion GA4 (taux = 0%)',
      severity: 'high',
      description: 'Sessions détectées mais aucune conversion — objectifs non configurés.',
      evidence: `sessions=${sessions}, conversions=${conversions}`,
      confidence: 0.9,
      effort: 'M',
    });
    recommendations.push({
      id: 'configure_ga4_conversions',
      title: 'Configurer les conversions GA4',
      priority: 'now',
      effort: 'M',
      impact: 'Mesure des objectifs business',
      details: 'Marquer les événements clés comme conversions dans GA4 Admin.',
    });
  }

  const ecomScore = ecomCheck.complete ? 100 : Math.round((ecomCheck.present.length / REQUIRED_ECOM_EVENTS.length) * 100);
  const score = scoreGA4(totals, ecomCheck, issues);

  // Add PARTIAL warning if some data dimensions were unavailable
  if (isPartial) {
    observations.push({ type: 'status', value: 'partial', label: 'GA4 data PARTIAL — some dimensions unavailable' });
    issues.push({
      id: 'ga4_partial_data',
      title: 'Données GA4 partielles',
      severity: 'medium',
      description: 'Certaines dimensions GA4 n\'ont pas pu être récupérées. Les données affichées sont incomplètes.',
      evidence: `status=PARTIAL, warnings=${(pipelineWarnings||[]).length}`,
      confidence: 0.9,
      effort: 'S',
    });
  }
  // Add actionable messages from pipelineLog as observations
  for (const msg of (pipelineWarnings || [])) {
    observations.push({ type: 'actionable', value: msg, label: 'Action requise' });
  }

  return {
    module_id: MODULE_ID,
    version: VERSION,
    ok: true,
    status: isPartial ? 'PARTIAL' : 'OK',
    inputs: { source: 'privateGoogle' },
    observations,
    evidence: [
      `Sessions 28j: ${sessions}`,
      `Users 28j: ${users}`,
      `Conversions: ${conversions}`,
      `Revenue: ${revenue.toFixed(2)}€`,
      `Taux de conversion: ${convRate !== null ? convRate.toFixed(2) + '%' : 'N/A'}`,
      `Événements e-commerce présents: ${ecomCheck.present.join(', ') || 'none'}`,
    ],
    issues,
    metrics: {
      dataAvailable: true,
      status: isPartial ? 'PARTIAL' : 'OK',
      sessions,
      users,
      conversions,
      revenue,
      conversionRate: convRate,
      ecommerceCompleteness: ecomCheck,
      ecomScore,
      campaigns: campaigns.length,
      events: events.length,
    },
    tables: {
      campaigns,
      events,
      channels: ga4Data?.channels || [],
      sourceMedium: ga4Data?.sourceMedium || [],
    },
    score_contrib: {
      weight: 0.15,
      score,
      skipped: false,
    },
    recommendations,
  };
}
