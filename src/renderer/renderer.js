let selectedAdsExportPaths = null;
let selectedMetaAdsExportPaths = null;
let selectedServiceAccountJsonPath = null;
let selectedOutputDir = null;
let currentOutputPath = null;

/* StratAds Audit - Premium Renderer
 * Works with preload.cjs => window.api
 */
const $ = (id) => document.getElementById(id);

const els = {
  url: $('urlInput'),
  company: $('companyInput'),
  start: $('startBtn'),
  status: $('status-area'),
  progress: $('progress'),
  logoBtn: $('logoBtn'),
  logoPath: $('logoPath'),
  logoStatus: $('logoStatus'),
  openFolder: $('openFolderBtn'),
  openHtml: $('openHtmlBtn'),
  openPdf: $('openPdfBtn'),
  result: $('result-panel'),
  resultActions: $('resultActions'),
  auditProfileSelect: $('auditProfileSelect'),
  privateAccessBlock: $('privateAccessBlock'),
  saJsonBtn: $('saJsonBtn'),
  saJsonPath: $('saJsonPath'),
  saStatus: $('saStatus'),
  ga4PropertyId: $('ga4PropertyId'),
  gscSiteUrl: $('gscSiteUrl'),
  gtmAccountId: $('gtmAccountId'),
  gtmContainerId: $('gtmContainerId'),
  testConnectionsBtn: $('testConnectionsBtn'),
  adsImportBtn: $('adsImportBtn'),
  adsImportPath: $('adsImportPath'),
  adsStatus: $('adsStatus'),
  metaAdsImportBtn: $('metaAdsImportBtn'),
  metaAdsImportPath: $('metaAdsImportPath'),
  metaStatus: $('metaStatus'),
  reportLoc: $('report-location'),
  copyPath: $('copyPathBtn'),
  pathDetails: $('pathDetails'),
  lang: $('langSelect'),
  outputDirBtn: $('outputDirBtn'),
  outputDirPath: $('outputDirPath'),
  outputDirStatus: $('outputDirStatus'),
  analysisPeriodDays: $('analysisPeriodDays'),
  enableProjection: $('enableProjection'),
  enableObjective: $('enableObjective'),
  forecastPeriod: $('forecastPeriod'),
  objectiveInputs: $('objectiveInputs'),
  objectiveMetric: $('objectiveMetric'),
  objectiveValue: $('objectiveValue'),
  forecastSector: $('forecastSector'),
  baselinePeriodDays: $('baselinePeriodDays'),
  fetchBaselineBtn: $('fetchBaselineBtn'),
  baselineConsole: $('baselineConsole'),
  baselineResults: $('baselineResults')
};

const fileStatusEls = [
  'logoStatus',
  'outputDirStatus',
  'saStatus',
  'adsStatus',
  'metaStatus'
].map(key => els[key]).filter(Boolean);
fileStatusEls.forEach(el => el.classList.remove('active'));

const auditStepPresets = {
  fast: [
    { label: 'Vérification des prérequis', keywords: ['prérequis', 'pre-requis', 'pré-requis'] },
    { label: 'Analyse express du site', keywords: ['scan', 'fast', 'express'] },
    { label: 'Collecte des métriques', keywords: ['baseline', 'metrics', 'data'] },
    { label: 'Génération du rapport', keywords: ['rapport', 'report', 'pdf'] }
  ],
  public: [
    { label: 'Vérification des prérequis', keywords: ['prérequis', 'pre-requis', 'pré-requis'] },
    { label: 'Crawl complet', keywords: ['crawl'] },
    { label: 'Analyse SEO technique', keywords: ['seo'] },
    { label: 'Performance web', keywords: ['performance'] },
    { label: 'Sécurité & Tracking', keywords: ['sécurité', 'tracking'] },
    { label: 'Audit conversion', keywords: ['conversion'] },
    { label: 'Finalisation du rapport', keywords: ['terminée', 'rapport', 'report'] }
  ],
  private: [
    { label: 'Vérification des prérequis', keywords: ['prérequis', 'pre-requis', 'pré-requis'] },
    { label: 'Analyse technique', keywords: ['analyse technique', 'crawl'] },
    { label: 'Performance', keywords: ['performance'] },
    { label: 'Tracking', keywords: ['tracking'] },
    { label: 'Conversion', keywords: ['conversion'] },
    { label: 'Import Ads', keywords: ['import', 'ads', 'csv'] },
    { label: 'Collecte API', keywords: ['api data', 'api', 'collect'] },
    { label: 'Dataset unifié', keywords: ['dataset', 'unified'] },
    { label: 'Finalisation du rapport', keywords: ['terminée', 'rapport', 'report'] }
  ],
  full: [
    { label: 'Vérification des prérequis', keywords: ['prérequis', 'pre-requis', 'pré-requis'] },
    { label: 'Crawl + SEO avancé', keywords: ['crawl', 'seo'] },
    { label: 'Performance avancée', keywords: ['performance'] },
    { label: 'Tracking & Data Layer', keywords: ['tracking', 'data layer'] },
    { label: 'Audit conversion', keywords: ['conversion'] },
    { label: 'Import Ads', keywords: ['import', 'ads', 'csv'] },
    { label: 'Collecte API', keywords: ['api data', 'api'] },
    { label: 'Benchmark & scaling', keywords: ['benchmark'] },
    { label: 'Dataset unifié', keywords: ['dataset', 'unified'] },
    { label: 'Finalisation du rapport', keywords: ['terminée', 'rapport', 'report'] }
  ]
};

let currentSteps = [];
let auditInProgress = false;

function profileToConfig(profile){
  // Architecture StratAds V3 - Prix selon specs
  const p = String(profile || 'fast').toLowerCase();
  switch(p){
    case 'fast':
      return { auditType: 'fast', description: 'Prospection 2min - Gratuit', price: 0 };
    case 'public':
      return { auditType: 'public', description: 'Public Complet - 2500€', price: 2500 };
    case 'private':
      return { auditType: 'private', description: 'Private Audit - 3500-4000€', price: 3750 };
    case 'full':
      return { auditType: 'full', description: 'Full Audit - 5000€', price: 5000 };
    default:
      return { auditType: 'fast', description: 'Prospection 2min - Gratuit', price: 0 };
  }
}

function getCurrentAuditType(){
  const profile = els.auditProfileSelect?.value || 'fast';
  return profileToConfig(profile).auditType;
}

function initStepTracking(auditType, options = {}){
  const { announce = false } = options;
  const preset = auditStepPresets[auditType] || auditStepPresets.fast;
  currentSteps = preset.map((step, index) => ({
    label: step.label,
    keywords: (step.keywords || []).map(k => k.toLowerCase()),
    status: index === 0 ? 'active' : 'pending'
  }));
  if (announce && currentSteps.length){
    logLine(`▶️ ${currentSteps[0].label}`, { skipSteps: true });
  }
}

function markStepDone(index){
  if (index < 0 || index >= currentSteps.length) return;
  if (currentSteps[index].status === 'done') return;
  currentSteps[index].status = 'done';
  logLine(`✅ ${currentSteps[index].label}`, { skipSteps: true });
}

function announceNextStep(){
  const nextIndex = currentSteps.findIndex(step => step.status === 'pending');
  if (nextIndex >= 0) {
    currentSteps[nextIndex].status = 'active';
    logLine(`▶️ ${currentSteps[nextIndex].label}`, { skipSteps: true });
  } else if (currentSteps.length) {
    logLine('✅ Toutes les étapes sont terminées.', { skipSteps: true });
  }
}

function markActiveStepFailed(reason){
  const idx = currentSteps.findIndex(step => step.status === 'active');
  if (idx === -1) return;
  currentSteps[idx].status = 'failed';
  const suffix = reason ? ` - ${reason}` : '';
  logLine(`❌ ${currentSteps[idx].label}${suffix}`, { skipSteps: true });
}

function resetStepsProgress(){
  initStepTracking(getCurrentAuditType(), { announce: true });
}

function trackStepProgress(message){
  if (!currentSteps.length) return;
  const normalized = String(message || '').toLowerCase();
  const failIndicators = ['❌', 'error', 'erreur', 'fail', 'échec', 'timeout', 'timed out'];
  const hasFail = failIndicators.some(token => token === '❌' ? String(message || '').includes('❌') : normalized.includes(token));
  if (hasFail) {
    markActiveStepFailed(message);
    return;
  }

  const idx = currentSteps.findIndex(step => step.status === 'active' && step.keywords.some(keyword => normalized.includes(keyword)));
  if (idx >= 0) {
    markStepDone(idx);
    announceNextStep();
  }
}

function completeAllSteps(){
  if (!currentSteps.length) return;
  currentSteps = currentSteps.map(step => ({ ...step, status: 'done' }));
  logLine('✅ Toutes les étapes sont terminées.', { skipSteps: true });
}

function togglePrivateAccessUI(){
  const cfg = profileToConfig(els.auditProfileSelect?.value);
  const isAdvancedMode = cfg.auditType === 'private' || cfg.auditType === 'full';

  const sectionIds = [
    'analysisPeriodSection',
    'baselineSection',
    'privateAccessBlock',
    'metricsConfigSection',
    'forecastSection'
  ];

  sectionIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = isAdvancedMode ? 'block' : 'none';
  });

  if (!isAdvancedMode) {
    const baselineConsole = document.getElementById('baselineConsole');
    if (baselineConsole) baselineConsole.style.display = 'none';
  }
}

let selectedLogo = 'favicon.png'; // default

function basenamePath(p){
  const s = String(p||'').replace(/[\/\\]+$/,'');
  const parts = s.split(/[/\\]/);
  return parts[parts.length-1] || s;
}

async function copyToClipboard(text){
  try{
    if (navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(String(text||''));
      return true;
    }
  }catch(_){}
  try{
    const ta=document.createElement('textarea');
    ta.value=String(text||'');
    ta.style.position='fixed';
    ta.style.left='-9999px';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok=document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }catch(_){}
  return false;
}

function logLine(msg, options = {}){
  if (els.status && els.status.classList.contains('hidden')) {
    els.status.classList.remove('hidden');
  }
  const div = document.createElement('div');
  div.textContent = msg;
  els.status.appendChild(div);
  els.status.scrollTop = els.status.scrollHeight;
  if (auditInProgress && !options.skipSteps) {
    trackStepProgress(msg);
  }
}

function updateFileStatus(statusEl, ok){
  if (!statusEl) return;
  statusEl.classList.toggle('active', !!ok);
}

function setProgress(pct){
  const v = Math.max(0, Math.min(100, Number(pct)||0));
  els.progress.style.setProperty('--progress', `${v}%`);
}

async function pickLogo(){
  if (!window.api || !window.api.selectFile){
    logLine("⚠️ API Electron non connectée (selectFile).");
    return;
  }
  try{
    const result = await window.api.selectFile({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg','png','svg'] }]
    });
    
    if (result && result.length > 0){
      selectedLogo = result[0];
      if (els.logoPath) els.logoPath.value = result[0];
      updateFileStatus(els.logoStatus, true);
      logLine("🖼️ Logo sélectionné.");
    } else {
      updateFileStatus(els.logoStatus, false);
    }
  }catch(e){
    logLine(`❌ Logo: ${e?.message || e}`);
    updateFileStatus(els.logoStatus, false);
  }
}

function validateUrl(u){
  try{
    const url = new URL(u);
    return url.href;
  }catch{
    return null;
  }
}

function buildParams(){
  const url = validateUrl((els.url.value||'').trim());
  const company = (els.company.value||'').trim() || (url ? new URL(url).hostname : '');
  const lang = (els.lang.value||'fr').trim();
  const profile = (els.auditProfileSelect?.value || 'fast');
  const cfg = profileToConfig(profile);

  const analysisPeriodDays = Number(els.analysisPeriodDays?.value);

  const baselinePeriodDays = Number(els.baselinePeriodDays?.value) || null;

  const enableProjection = els.enableProjection?.checked ?? true;
  const enableObjective = els.enableObjective?.checked ?? false;
  const objectiveMetric = els.objectiveMetric?.value || null;
  const objectiveValue = els.objectiveValue?.value ? Number(els.objectiveValue.value) : null;

  const gscUrl = (els.gscSiteUrl?.value || '').trim() || url;

  const metricsConfig = {
    averageConversionValue: getNumberValue('avgConversionValue'),
    averageCustomerValue: getNumberValue('avgCustomerValue'),
    currentConversionRate: getNumberValue('currentConversionRate'),
    averageOrderValue: getNumberValue('avgOrderValue')
  };

  const params = {
    url,
    company,
    lang,
    auditType: cfg.auditType,
    pricing: cfg,
    serviceAccountData: selectedServiceAccountJsonPath ? { path: selectedServiceAccountJsonPath } : null,
    googleAdsCSV: selectedAdsExportPaths,
    metaAdsCSV: selectedMetaAdsExportPaths,
    ga4PropertyId: els.ga4PropertyId?.value || null,
    gscSiteUrl: gscUrl,
    gtmAccountId: els.gtmAccountId?.value || null,
    gtmContainerId: els.gtmContainerId?.value || null,
    metricsConfig,
    baselinePeriodDays,
    logoPath: selectedLogo !== 'favicon.png' ? selectedLogo : null,
    outputDir: selectedOutputDir,
    forecastSettings: {
      analysisPeriodDays, // SEULE période utilisée - obligatoire
      period: els.forecastPeriod?.value || '3m',
      enableProjection, // ✅ Toggle simultané
      enableObjective, // ✅ Toggle simultané
      targetMetric: objectiveMetric,
      targetValue: objectiveValue,
      sector: (els.forecastSector?.value || '').trim()
    }
  };

  console.log('[renderer] buildParams', {
    googleAdsCSV: params.googleAdsCSV,
    metaAdsCSV: params.metaAdsCSV,
    serviceAccount: params.serviceAccountData?.path,
    baselinePeriodDays: params.baselinePeriodDays,
    outputDir: params.outputDir
  });

  return params;
}

// Helper function to get numeric value from input
function getNumberValue(elementId, defaultValue = null) {
  const element = document.getElementById(elementId);
  if (!element) return defaultValue;
  const value = element.value.trim();
  if (value === '') return defaultValue;
  const num = Number(value.replace(/\s+/g, ''));
  return Number.isFinite(num) && num >= 0 ? num : defaultValue;
}

function setBusy(b){
  if (els.start) els.start.disabled = b;
}

function setupEvents(){
if (els.auditProfileSelect){
  els.auditProfileSelect.addEventListener('change', () => {
    togglePrivateAccessUI();
  });
  // initial
  togglePrivateAccessUI();
}

function setupBudgetCalculator() {
  const budgetInputs = ['budgetSeo', 'budgetGoogleAds', 'budgetMetaAds', 'budgetSocial', 'budgetContent', 'budgetABTest'];
  
  function updateTotal() {
    let total = 0;
    budgetInputs.forEach(id => {
      const value = getNumberValue(id, 0);
      total += value;
    });
    
    const totalElement = document.getElementById('budgetTotal');
    if (totalElement) {
      totalElement.textContent = `Total: ${total}%`;
      totalElement.style.color = total === 100 ? 'var(--primary)' : 'var(--error)';
    }
  }
  
  // Add event listeners
  budgetInputs.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('input', updateTotal);
    }
  });
  
  // Initial calculation
  updateTotal();
}

  if (els.outputDirBtn){
    els.outputDirBtn.addEventListener('click', async () => {
      try{
        const result = await window.api.selectFile({
          properties: ['openDirectory', 'createDirectory']
        });
        
        if (result && result.length > 0){
          selectedOutputDir = result[0];
          if (els.outputDirPath) els.outputDirPath.value = result[0];
          updateFileStatus(els.outputDirStatus, true);
          logLine("📁 Dossier de sortie sélectionné.");
        } else {
          updateFileStatus(els.outputDirStatus, false);
        }
      }catch(e){
        logLine(`❌ Dossier sortie: ${e?.message || e}`);
        updateFileStatus(els.outputDirStatus, false);
      }
    });
  }

  if (els.adsImportBtn){
    els.adsImportBtn.addEventListener('click', async () => {
      try{
        const result = await window.api.selectFile({
          properties: ['openFile', 'multiSelections'],
          filters: [
            { name: 'Google Ads exports', extensions: ['csv'] },
            { name: 'All files', extensions: ['*'] }
          ]
        });
        
        if (!result || !result.length){
          selectedAdsExportPaths = null;
          if (els.adsImportPath) els.adsImportPath.value = "";
          updateFileStatus(els.adsStatus, false);
          logLine("ℹ️ Aucun export Google Ads importé.");
          return;
        }
        selectedAdsExportPaths = result;
        const label = result.length === 1 ? result[0] : `${result.length} fichiers sélectionnés`;
        if (els.adsImportPath) els.adsImportPath.value = label;
        updateFileStatus(els.adsStatus, true);
        logLine(`📦 Export Google Ads importé: ${label}`);
      }catch(e){
        logLine(`❌ Import Google Ads: ${e.message || e}`);
        updateFileStatus(els.adsStatus, false);
      }
    });
  }


if (els.metaAdsImportBtn){
  els.metaAdsImportBtn.addEventListener('click', async () => {
    try{
      const result = await window.api.selectFile({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Meta Ads exports', extensions: ['csv', 'xlsx'] },
          { name: 'All files', extensions: ['*'] }
        ]
      });
      
      if (!result || !result.length){
      selectedMetaAdsExportPaths = null;
      if (els.metaAdsImportPath) els.metaAdsImportPath.value = "";
      updateFileStatus(els.metaStatus, false);
      logLine("ℹ️ Aucun export Meta Ads importé.");
      return;
    }
    selectedMetaAdsExportPaths = result;
    const label = result.length === 1 ? result[0] : `${result.length} fichiers sélectionnés`;
    if (els.metaAdsImportPath) els.metaAdsImportPath.value = label;
    updateFileStatus(els.metaStatus, true);
    logLine(`📦 Export Meta Ads importé: ${label}`);
  }catch(e){
    logLine(`❌ Import Meta Ads: ${e.message || e}`);
    updateFileStatus(els.metaStatus, false);
  }
});
}

if (els.saJsonBtn){
  els.saJsonBtn.addEventListener('click', async () => {
    try{
      const result = await window.api.selectFile({
        properties: ['openFile'],
        filters: [
          { name: 'Google Service Account JSON', extensions: ['json'] },
          { name: 'All files', extensions: ['*'] }
        ]
      });
      
      if (!result || !result.length){
        selectedServiceAccountJsonPath = null;
        if (els.saJsonPath) els.saJsonPath.value = "";
        updateFileStatus(els.saStatus, false);
        logLine("ℹ️ Aucun JSON sélectionné.");
        return;
      }
      selectedServiceAccountJsonPath = result[0];
      if (els.saJsonPath) els.saJsonPath.value = result[0];
      updateFileStatus(els.saStatus, true);
      logLine("🔐 Service account JSON sélectionné.");
    }catch(e){
      logLine(`❌ JSON service account: ${e.message || e}`);
      updateFileStatus(els.saStatus, false);
    }
  });
}

if (els.logoBtn){
    els.logoBtn.addEventListener('click', pickLogo);
  }

  if (els.testConnectionsBtn){
  els.testConnectionsBtn.addEventListener('click', async () => {
    const params = buildParams();
    if (!window.api || !window.api.testConnections) {
      logLine("❌ API Electron non connectée pour tester les connexions.");
      return;
    }
    setBusy(true);
    logLine("🔧 Test des connexions aux API...");
    try {
      const results = await window.api.testConnections(params);
      logLine("✅ Tests terminés.");
      if (results.ga4) logLine(`GA4: ${results.ga4.success ? '✅ Succès' : '❌ Erreur - ' + results.ga4.error}`);
      if (results.gsc) logLine(`GSC: ${results.gsc.success ? '✅ Succès' : '❌ Erreur - ' + results.gsc.error}`);
      if (results.gtm) logLine(`GTM: ${results.gtm.success ? '✅ Succès' : '❌ Erreur - ' + results.gtm.error}`);
      if (results.googleAds) logLine(`Google Ads: ${results.googleAds.success ? '✅ Succès' : '❌ Erreur - ' + results.googleAds.error}`);
      if (results.metaAds) logLine(`Meta Ads: ${results.metaAds.success ? '✅ Succès' : '❌ Erreur - ' + results.metaAds.error}`);
    } catch (e) {
      logLine(`❌ Erreur lors du test des connexions: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  });
  }

  if (els.fetchBaselineBtn){
    els.fetchBaselineBtn.addEventListener('click', async () => {
      const baselinePeriod = els.baselinePeriodDays?.value?.trim();
      if (!baselinePeriod || isNaN(baselinePeriod) || Number(baselinePeriod) < 1 || Number(baselinePeriod) > 365) {
        logLine("❌ Période de baseline requise : entrez un nombre de jours entre 1 et 365");
        els.baselinePeriodDays?.focus();
        return;
      }

      if (!window.api || !window.api.fetchBaseline) {
        logLine("❌ API Electron non connectée pour récupérer la baseline.");
        return;
      }

      setBusy(true);
      logLine(`📊 Récupération de la baseline sur ${baselinePeriod} jours...`);

      try {
        const params = buildParams();
        params.baselinePeriodDays = Number(baselinePeriod);

        const results = await window.api.fetchBaseline(params);

        // Afficher dans la console dédiée
        if (els.baselineConsole) els.baselineConsole.style.display = 'block';
        if (els.baselineResults) {
          els.baselineResults.textContent = JSON.stringify(results, null, 2);
        }

        // Log dans la console principale
        logLine("✅ Baseline récupérée avec succès !");
        if (results.sessions) logLine(`👥 Sessions: ${results.sessions.value || 'N/A'} (source: ${results.sessions.source || 'N/A'})`);
        if (results.conversions) logLine(`🛒 Conversions: ${results.conversions.value || 'N/A'} (source: ${results.conversions.source || 'N/A'})`);
        if (results.revenue) logLine(`💰 Revenus: ${results.revenue.value || 'N/A'} (source: ${results.revenue.source || 'N/A'})`);
        if (results.conversionRate) logLine(`📈 Taux conversion: ${results.conversionRate.value ? results.conversionRate.value.toFixed(2) + '%' : 'N/A'}`);
        if (results.aov) logLine(`🛍️ Panier moyen: ${results.aov.value ? results.aov.value.toFixed(2) + '€' : 'N/A'}`);

      } catch (e) {
        logLine(`❌ Erreur lors de la récupération baseline: ${e?.message || e}`);
        if (els.baselineResults) {
          els.baselineResults.textContent = `Erreur: ${e?.message || e}`;
        }
      } finally {
        setBusy(false);
      }
    });
  }

if (els.start){
  els.start.addEventListener('click', () => {
    // Validation analysisPeriodDays - OBLIGATOIRE seulement pour PRIVATE/FULL
    const profile = els.auditProfileSelect?.value || 'fast';
    const isPrivateOrFull = profile === 'private' || profile === 'full';
    
    if (isPrivateOrFull) {
      const analysisPeriodValue = els.analysisPeriodDays?.value?.trim();
      if (!analysisPeriodValue || isNaN(analysisPeriodValue) || Number(analysisPeriodValue) < 1 || Number(analysisPeriodValue) > 365) {
        logLine("❌ Période d'analyse obligatoire pour audits Private/Full : entrez un nombre de jours entre 1 et 365 (ex: 90)");
        els.analysisPeriodDays?.focus();
        return;
      }
    }
    
    const params = buildParams();
    if (!params.url){
      logLine("❌ URL invalide. Exemple: https://example.com");
      return;
    }
    if (!window.api || !window.api.startAudit){
      logLine("❌ API Electron non connectée. Vérifie preload.cjs et main.js.");
      return;
    }
    if (els.status) {
      els.status.classList.remove('hidden');
      els.status.innerHTML = "";
    }

    if (els.progress) {
      els.progress.classList.remove('hidden');
    }

    if (els.result) {
      els.result.classList.add('hidden');
    }

    if (els.resultActions) {
      els.resultActions.style.display = 'none';
    }

    setProgress(2);
    setBusy(true);
    auditInProgress = true;
    resetStepsProgress();
    try{
      window.api.startAudit(params);
    }catch(e){
      logLine(`❌ Start: ${e?.message || e}`);
      setBusy(false);
      auditInProgress = false;
    }
  });
}

  if (els.enableObjective) {
    els.enableObjective.addEventListener('change', () => {
      if (els.objectiveInputs) {
        els.objectiveInputs.style.display = els.enableObjective.checked ? 'block' : 'none';
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (els.logoPath) els.logoPath.value = "favicon.png (par défaut)";
  setupEvents();

  if (!window.api){
    logLine("❌ API Electron non connectée (window.api absent).");
    return;
  }

  window.api.onLog((msg) => logLine(msg));
  window.api.onProgress((pct) => setProgress(pct));
  window.api.onComplete((res) => {
    setBusy(false);
    setProgress(100);
    auditInProgress = false;
    completeAllSteps();
    if (els.result) els.result.classList.remove('hidden');
    
    const folder = res?.folder || res?.path || res?.outputDir;
    currentOutputPath = folder; // Store for button handlers
    
    // Show result action buttons
    if (els.resultActions) {
      els.resultActions.style.display = 'flex';
    }
    
    if (els.reportLoc){
      const base = folder ? basenamePath(folder) : '';
      els.reportLoc.textContent = base ? base : (folder ? folder : 'Rapports générés.');
      els.reportLoc.title = folder || '';
    }
    if (els.pathDetails){
      els.pathDetails.textContent = folder || '';
    }
    
    // Afficher les informations de pricing
    if (res.pricing) {
      logLine(`💰 ${res.pricing.description}`);
      if (res.pricing.price > 0) {
        logLine(`💵 Prix: ${res.pricing.price}€`);
      }
    }
    
    // Setup result button handlers
    setupResultButtons();

    // Open report automatically (HTML first, fallback to folder)
    try {
      if (res?.success && window.api?.openReportHTML && currentOutputPath) {
        window.api.openReportHTML(currentOutputPath).catch(() => {
          window.api?.openReportFolder?.(currentOutputPath).catch(() => {});
        });
      }
    } catch (_) {}
  });
});

function setupResultButtons() {
  // Open Folder button
  if (els.openFolder){
    els.openFolder.onclick = async () => {
      try{
        if (window.api?.openReportFolder && currentOutputPath){
          const result = await window.api.openReportFolder(currentOutputPath);
          if (!result?.ok) logLine(`⚠️ ${result?.error || 'Impossible d\'ouvrir'}`);
          else logLine('📁 Dossier ouvert');
        }
      }catch(e){
        logLine(`❌ Open folder: ${e?.message || e}`);
      }
    };
  }

  // Open HTML button
  if (els.openHtml){
    els.openHtml.onclick = async () => {
      try{
        if (window.api?.openReportHTML && currentOutputPath){
          const result = await window.api.openReportHTML(currentOutputPath);
          if (!result?.ok) logLine(`⚠️ ${result?.error || 'Impossible d\'ouvrir HTML'}`);
          else logLine('🌐 Rapport HTML ouvert');
        }
      }catch(e){
        logLine(`❌ Open HTML: ${e?.message || e}`);
      }
    };
  }

  // Open PDF button
  if (els.openPdf){
    els.openPdf.onclick = async () => {
      try{
        if (window.api?.openReportPDF && currentOutputPath){
          const result = await window.api.openReportPDF(currentOutputPath);
          if (!result?.ok) logLine(`⚠️ ${result?.error || 'PDF non trouvé'}`);
          else logLine('📄 Rapport PDF ouvert');
        }
      }catch(e){
        logLine(`❌ Open PDF: ${e?.message || e}`);
      }
    };
  }

  // Copy Path button (if exists)
  if (els.copyPath){
    els.copyPath.onclick = async () => {
      if (!currentOutputPath) return;
      const ok = await copyToClipboard(currentOutputPath);
      if (ok) logLine('📋 Chemin copié.');
      else logLine('⚠️ Copie impossible sur ce système.');
    };
  }

  setupBudgetCalculator();
}
