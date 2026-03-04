/**
 * StratAds — GTM Web Audit Module
 * Audits GTM tags, triggers, variables and dataLayer configuration.
 * Produces a data-contract-compliant output.
 */

const MODULE_ID = 'gtm_web_audit';
const VERSION = '1.0.0';

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeArr(v) { return Array.isArray(v) ? v : []; }
function safeNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function classifyTag(tag) {
  const type = String(tag?.type || tag?.tagType || '').toLowerCase();
  const name = String(tag?.name || '').toLowerCase();
  if (type.includes('ga4') || type.includes('googanalytics') || name.includes('ga4')) return 'GA4';
  if (type.includes('googads') || type.includes('awconv') || name.includes('google ads')) return 'Google Ads';
  if (type.includes('floodlight')) return 'Floodlight';
  if (type.includes('fb') || name.includes('meta') || name.includes('facebook')) return 'Meta Pixel';
  if (type.includes('html') || type === 'custom_html') return 'Custom HTML';
  if (type.includes('img') || type === 'custom_image') return 'Custom Image';
  if (type.includes('gtm') || type.includes('linkedintag')) return 'LinkedIn';
  return 'Other';
}

function analyzeDataLayer(tags) {
  const dlPushPatterns = tags.filter(t => {
    const code = String(t?.code || t?.tagConfig?.code || '');
    return code.includes('dataLayer.push');
  });
  return {
    pushCount: dlPushPatterns.length,
    hasPushes: dlPushPatterns.length > 0,
  };
}

function detectDuplicateTags(tags) {
  const byType = {};
  for (const tag of tags) {
    const category = classifyTag(tag);
    if (!byType[category]) byType[category] = [];
    byType[category].push(tag?.name || tag?.tagId || 'unnamed');
  }
  const duplicates = [];
  for (const [category, names] of Object.entries(byType)) {
    if (names.length > 1 && ['GA4', 'Google Ads', 'Meta Pixel'].includes(category)) {
      duplicates.push({ category, count: names.length, names });
    }
  }
  return duplicates;
}

function checkPausedTags(tags) {
  return tags.filter(t => t?.paused === true || t?.status === 'paused');
}

function checkFiringTriggers(tags) {
  const noTrigger = tags.filter(t => {
    const triggers = safeArr(t?.firingTriggerId || t?.firingRuleId);
    return triggers.length === 0 && !t?.teardownHook;
  });
  return noTrigger;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Audit GTM container configuration.
 *
 * @param {object} gtmData - Output from gtm-api module or GTM API data
 * @param {object} [trackingData] - Supplementary tracking data
 * @returns {object} Data-contract-compliant output
 */
export function auditGTMWeb(gtmData, trackingData) {
  const hasData = !!(gtmData?.ok && (gtmData?.tags || gtmData?.container));
  const tags = safeArr(gtmData?.tags || gtmData?.container?.tags);
  const triggers = safeArr(gtmData?.triggers || gtmData?.container?.triggers);
  const variables = safeArr(gtmData?.variables || gtmData?.container?.variables);

  const issues = [];
  const observations = [];
  const recommendations = [];

  if (!hasData) {
    return {
      module_id: MODULE_ID,
      version: VERSION,
      ok: false,
      skipped: false,
      inputs: { source: 'gtmApi' },
      observations: [{ type: 'status', value: 'no_data', label: 'GTM data unavailable' }],
      evidence: ['No GTM API data — service account with GTM Viewer access required'],
      issues: [{
        id: 'gtm_data_unavailable',
        title: 'Données GTM API non disponibles',
        severity: 'medium',
        description: 'Accès GTM API non fourni.',
        evidence: 'gtmData.ok=false',
        confidence: 1,
        effort: 'S',
      }],
      metrics: { dataAvailable: false },
      score_contrib: { weight: 0.10, score: 0, skipped: true },
      recommendations: [{
        id: 'provide_gtm_access',
        title: 'Fournir accès GTM via service account',
        priority: 'next',
        effort: 'S',
        impact: 'Audit GTM complet',
        details: 'Ajouter l\'email service account en Viewer dans GTM > Admin > User Management.',
      }],
    };
  }

  observations.push(
    { type: 'tags', value: { count: tags.length, categories: tags.map(classifyTag) }, label: 'GTM tags' },
    { type: 'triggers', value: { count: triggers.length }, label: 'GTM triggers' },
    { type: 'variables', value: { count: variables.length }, label: 'GTM variables' },
  );

  // Tag categorization
  const tagsByCategory = {};
  for (const tag of tags) {
    const cat = classifyTag(tag);
    tagsByCategory[cat] = (tagsByCategory[cat] || 0) + 1;
  }

  // Duplicate tags
  const duplicates = detectDuplicateTags(tags);
  for (const dup of duplicates) {
    issues.push({
      id: `gtm_duplicate_${dup.category.toLowerCase().replace(/\s/g,'_')}`,
      title: `Tags ${dup.category} en doublon (${dup.count}x)`,
      severity: 'high',
      description: `${dup.count} tags ${dup.category} détectés — risque de double comptage.`,
      evidence: `Tags: ${dup.names.join(', ')}`,
      confidence: 0.9,
      effort: 'S',
    });
    recommendations.push({
      id: `merge_${dup.category.toLowerCase().replace(/\s/g,'_')}_tags`,
      title: `Fusionner les tags ${dup.category} en doublon`,
      priority: 'now',
      effort: 'S',
      impact: 'Élimination du double comptage',
      details: `Conserver un seul tag ${dup.category} avec trigger All Pages.`,
    });
  }

  // Tags without trigger
  const noTriggerTags = checkFiringTriggers(tags);
  if (noTriggerTags.length > 0) {
    issues.push({
      id: 'gtm_tags_no_trigger',
      title: `${noTriggerTags.length} tag(s) sans déclencheur`,
      severity: 'medium',
      description: 'Des tags n\'ont aucun déclencheur défini — ne se déclencheront jamais.',
      evidence: `Tags: ${noTriggerTags.map(t => t?.name || 'unnamed').join(', ')}`,
      confidence: 0.85,
      effort: 'XS',
    });
  }

  // Paused tags
  const pausedTags = checkPausedTags(tags);
  if (pausedTags.length > 0) {
    issues.push({
      id: 'gtm_paused_tags',
      title: `${pausedTags.length} tag(s) en pause`,
      severity: 'low',
      description: 'Des tags sont en pause dans GTM — vérifier si intentionnel.',
      evidence: `Paused: ${pausedTags.map(t => t?.name || 'unnamed').join(', ')}`,
      confidence: 1,
      effort: 'XS',
    });
  }

  // No GA4 tag
  if (!tagsByCategory['GA4'] || tagsByCategory['GA4'] === 0) {
    issues.push({
      id: 'gtm_no_ga4_tag',
      title: 'Aucun tag GA4 dans GTM',
      severity: 'critical',
      description: 'Container GTM sans tag GA4 — tracking analytics absent.',
      evidence: `Tags par catégorie: ${JSON.stringify(tagsByCategory)}`,
      confidence: 0.9,
      effort: 'M',
    });
    recommendations.push({
      id: 'add_ga4_tag_gtm',
      title: 'Ajouter tag GA4 dans GTM',
      priority: 'now',
      effort: 'M',
      impact: 'Analytics actifs',
      details: 'Créer tag "Google Analytics: GA4 Configuration" avec ID de mesure G-XXXX.',
    });
  }

  const dlInfo = analyzeDataLayer(tags);

  let score = 100;
  for (const issue of issues) {
    score -= ({ critical:25, high:15, medium:8, low:3, info:0 }[issue.severity] || 0);
  }
  score = Math.max(0, score);

  return {
    module_id: MODULE_ID,
    version: VERSION,
    ok: true,
    inputs: { source: 'gtmApi' },
    observations,
    evidence: [
      `Total tags: ${tags.length}`,
      `Triggers: ${triggers.length}`,
      `Variables: ${variables.length}`,
      `Tags par catégorie: ${Object.entries(tagsByCategory).map(([k,v])=>`${k}:${v}`).join(', ')}`,
      `Tags en doublon: ${duplicates.length}`,
      `Tags sans déclencheur: ${noTriggerTags.length}`,
    ],
    issues,
    metrics: {
      dataAvailable: true,
      tagCount: tags.length,
      triggerCount: triggers.length,
      variableCount: variables.length,
      tagsByCategory,
      duplicateTags: duplicates,
      pausedTagCount: pausedTags.length,
      noTriggerTagCount: noTriggerTags.length,
      dataLayer: dlInfo,
    },
    score_contrib: {
      weight: 0.10,
      score,
      skipped: false,
    },
    recommendations,
  };
}
