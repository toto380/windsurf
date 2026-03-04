/**
 * StratAds — Data Quality Module
 * Detects duplications, revenue inconsistency, self-referrals.
 * Produces a data-contract-compliant output.
 */

const MODULE_ID = 'data_quality';
const VERSION = '1.0.0';

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function safeArr(v) { return Array.isArray(v) ? v : []; }
function safePct(num, den) { return den > 0 ? (num / den) * 100 : null; }

// ── Self-referral detection ───────────────────────────────────────────────────

function detectSelfReferrals(ga4Data, url) {
  const rows = safeArr(ga4Data?.rows || []);
  const hostname = (() => {
    try { return new URL(url || '').hostname.replace(/^www\./, ''); } catch { return null; }
  })();

  if (!hostname || rows.length === 0) return { detected: false, count: 0, sources: [] };

  const selfRefs = rows.filter(row => {
    const source = String(row.source || row.sessionSource || '').toLowerCase();
    return source.includes(hostname) || source === hostname;
  });

  return {
    detected: selfRefs.length > 0,
    count: selfRefs.length,
    sources: selfRefs.map(r => r.source || r.sessionSource),
    sessions: selfRefs.reduce((s, r) => s + safeNum(r.sessions), 0),
  };
}

// ── Event deduplication detection ────────────────────────────────────────────

function detectEventDuplication(ga4Data) {
  const events = safeArr(ga4Data?.events || ga4Data?.rows || []);
  const sessionEvents = events.filter(e =>
    String(e.eventName || e.name || '').toLowerCase() === 'session_start'
  );
  const pageViews = events.filter(e =>
    String(e.eventName || e.name || '').toLowerCase() === 'page_view'
  );

  const issues = [];

  // Heuristic: if session_start count >> page_views * reasonable_ratio, likely duplicate
  const totalSessions = safeNum(ga4Data?.totals?.sessions || 0);
  const totalPageViews = safeNum(ga4Data?.totals?.screenPageViews || ga4Data?.totals?.pageViews || 0);

  if (totalSessions > 0 && totalPageViews > 0) {
    const pagesPerSession = totalPageViews / totalSessions;
    if (pagesPerSession > 50) {
      issues.push({
        type: 'page_view_inflation',
        evidence: `pages_per_session=${pagesPerSession.toFixed(1)} — likely page_view duplication`,
        severity: 'high',
      });
    }
    if (pagesPerSession < 0.5 && totalSessions > 100) {
      issues.push({
        type: 'page_view_missing',
        evidence: `pages_per_session=${pagesPerSession.toFixed(1)} — page_view not firing consistently`,
        severity: 'medium',
      });
    }
  }

  return { issues, totalSessions, totalPageViews };
}

// ── Revenue consistency ───────────────────────────────────────────────────────

function checkRevenueDistribution(ga4Data, adsData) {
  const issues = [];

  const ga4Revenue = safeNum(ga4Data?.totals?.revenue || 0);
  const adsRevenue = safeNum(adsData?.totals30d?.value || adsData?.revenue || 0);
  const adsCost = safeNum(adsData?.totals30d?.cost || adsData?.cost || 0);

  if (ga4Revenue > 0 && adsRevenue > 0) {
    const delta = Math.abs(ga4Revenue - adsRevenue) / Math.max(ga4Revenue, adsRevenue);
    if (delta > 0.3) {
      issues.push({
        type: 'revenue_mismatch_ga4_ads',
        evidence: `GA4 revenue: ${ga4Revenue.toFixed(0)}€, Ads reported value: ${adsRevenue.toFixed(0)}€ (delta ${(delta*100).toFixed(0)}%)`,
        severity: 'high',
      });
    }
  }

  // ROAS sanity: if ROAS > 20, likely inflated conversions
  if (adsCost > 0 && adsRevenue > 0) {
    const roas = adsRevenue / adsCost;
    if (roas > 20) {
      issues.push({
        type: 'roas_inflated',
        evidence: `Ads ROAS=${roas.toFixed(1)} — unusually high, may indicate double-counted conversions`,
        severity: 'medium',
      });
    }
  }

  return issues;
}

// ── Channel distribution ──────────────────────────────────────────────────────

function analyzeChannelDistribution(ga4Data) {
  const channels = safeArr(ga4Data?.channelRows || ga4Data?.rows || []).filter(r => r.channel || r.sessionDefaultChannelGrouping);
  if (channels.length === 0) return null;

  const total = channels.reduce((s, r) => s + safeNum(r.sessions), 0);
  if (total === 0) return null;

  const distribution = channels.map(r => ({
    channel: r.channel || r.sessionDefaultChannelGrouping,
    sessions: safeNum(r.sessions),
    share: safePct(safeNum(r.sessions), total),
  })).sort((a, b) => b.sessions - a.sessions);

  // Check for unusual concentration
  const topShare = distribution[0]?.share || 0;
  const directShare = distribution.find(d => /direct/i.test(d.channel))?.share || 0;

  const anomalies = [];
  if (directShare > 40) {
    anomalies.push({ type: 'high_direct_traffic', evidence: `Direct: ${directShare.toFixed(1)}% — may indicate UTM tracking issues` });
  }
  if (topShare > 85 && distribution.length > 1) {
    anomalies.push({ type: 'channel_concentration', evidence: `${distribution[0].channel}: ${topShare.toFixed(1)}% of sessions` });
  }

  return { distribution, anomalies };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Audit data quality across GA4 and Ads data.
 *
 * @param {object} ga4Data - GA4 data (from privateGoogle or ga4-audit)
 * @param {object} [adsData] - Ads data (from ads-import)
 * @param {string} [url] - Site URL for self-referral detection
 * @returns {object} Data-contract-compliant output
 */
export function auditDataQuality(ga4Data, adsData, url) {
  const hasGA4 = !!(ga4Data?.ok || ga4Data?.totals);
  const hasAds = !!(adsData?.ok && !adsData?.skipped);

  const issues = [];
  const observations = [];
  const recommendations = [];

  if (!hasGA4) {
    return {
      module_id: MODULE_ID,
      version: VERSION,
      ok: false,
      skipped: false,
      inputs: { url, source: 'ga4' },
      observations: [{ type: 'status', value: 'no_data', label: 'No GA4 data for quality check' }],
      evidence: ['No GA4 data available for data quality analysis'],
      issues: [{
        id: 'dq_no_data',
        title: 'Données insuffisantes pour l\'audit qualité',
        severity: 'info',
        description: 'Données GA4 requises pour l\'analyse de qualité.',
        evidence: 'ga4.ok=false',
        confidence: 1,
        effort: 'M',
      }],
      metrics: { dataAvailable: false },
      score_contrib: { weight: 0.10, score: null, skipped: true },
      recommendations: [],
    };
  }

  const selfReferrals = detectSelfReferrals(ga4Data, url);
  const duplication = detectEventDuplication(ga4Data);
  const revenueIssues = hasAds ? checkRevenueDistribution(ga4Data, adsData) : [];
  const channelAnalysis = analyzeChannelDistribution(ga4Data);

  observations.push(
    { type: 'self_referrals', value: selfReferrals, label: 'Self-referral analysis' },
    { type: 'event_duplication', value: duplication, label: 'Event duplication check' },
    { type: 'channel_distribution', value: channelAnalysis, label: 'Channel distribution' },
  );

  // Self-referrals
  if (selfReferrals.detected) {
    issues.push({
      id: 'dq_self_referrals',
      title: `Self-référentiels détectés (${selfReferrals.count} sources)`,
      severity: 'high',
      description: `Le domaine lui-même apparaît comme source de trafic — sessions incorrectement attribuées.`,
      evidence: `Self-ref sources: ${selfReferrals.sources.join(', ')}`,
      confidence: 0.9,
      effort: 'S',
    });
    recommendations.push({
      id: 'fix_self_referrals',
      title: 'Corriger les self-référentiels GA4',
      priority: 'now',
      effort: 'S',
      impact: 'Attribution de trafic correcte',
      details: `Ajouter ${new URL(url || 'https://example.com').hostname} dans la liste des domaines exclus dans GA4 Admin > Data Streams > Configure tag settings > List unwanted referrals.`,
    });
  }

  // Event duplication issues
  for (const dupIssue of duplication.issues) {
    issues.push({
      id: `dq_${dupIssue.type}`,
      title: `Problème qualité: ${dupIssue.type.replace(/_/g, ' ')}`,
      severity: dupIssue.severity,
      description: dupIssue.evidence,
      evidence: dupIssue.evidence,
      confidence: 0.75,
      effort: 'M',
    });
  }

  // Revenue mismatch
  for (const ri of revenueIssues) {
    issues.push({
      id: `dq_${ri.type}`,
      title: `Incohérence revenus: ${ri.type.replace(/_/g, ' ')}`,
      severity: ri.severity,
      description: ri.evidence,
      evidence: ri.evidence,
      confidence: 0.8,
      effort: 'M',
    });
    if (ri.type === 'revenue_mismatch_ga4_ads') {
      recommendations.push({
        id: 'fix_revenue_mismatch',
        title: 'Aligner la mesure du revenu GA4 et Ads',
        priority: 'now',
        effort: 'M',
        impact: 'Attribution correcte du ROI',
        details: 'Vérifier que purchase/conversion utilisent le même champ "revenue" dans le dataLayer.',
      });
    }
  }

  // Channel anomalies
  if (channelAnalysis?.anomalies?.length) {
    for (const anomaly of channelAnalysis.anomalies) {
      issues.push({
        id: `dq_${anomaly.type}`,
        title: `Anomalie canal: ${anomaly.type.replace(/_/g, ' ')}`,
        severity: anomaly.type === 'high_direct_traffic' ? 'medium' : 'low',
        description: anomaly.evidence,
        evidence: anomaly.evidence,
        confidence: 0.7,
        effort: 'S',
      });
    }
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
    inputs: { url, sources: ['ga4', 'ads'] },
    observations,
    evidence: [
      `Self-referrals: ${selfReferrals.detected ? selfReferrals.count + ' found' : 'none'}`,
      `Event duplication issues: ${duplication.issues.length}`,
      `Revenue consistency issues: ${revenueIssues.length}`,
      `Channel anomalies: ${channelAnalysis?.anomalies?.length || 0}`,
    ],
    issues,
    metrics: {
      dataAvailable: true,
      selfReferrals,
      eventDuplication: duplication,
      revenueIssues,
      channelDistribution: channelAnalysis,
    },
    score_contrib: {
      weight: 0.10,
      score,
      skipped: false,
    },
    recommendations,
  };
}
