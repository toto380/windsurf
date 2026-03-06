/**
 * STRATADS - QUALITY GATE MODULE (Phase 1.5)
 * Vérifie la cohérence des données avant génération du rapport
 * Règle DATA FIRST : pas de score/prévision sans données réelles
 */

const { DataContract } = require('./dataContract.js');

class QualityGate {
  constructor(results, auditType) {
    this.results = results;
    this.auditType = auditType;
    this.issues = [];
    this.scoreAdjustments = [];
    this.sourcesUsed = [];
  }

  /**
   * Valider la qualité des données et calculer la couverture
   * @returns {Object} Quality gate report
   */
  validate() {
    this.issues = [];
    this.scoreAdjustments = [];
    this.sourcesUsed = [];

    // Détecter les sources disponibles
    this.detectSources();

    // Calculer la couverture
    const coverage = this.calculateCoverage();

    // Vérifier les incohérences
    this.checkInconsistencies();

    // Ajuster les scores si données manquantes
    this.adjustScores();

    // Déterminer le niveau de confiance
    const confidenceLevel = this.computeConfidenceLevel(coverage);

    // Déterminer si le quality gate passe
    const passed = this.determineIfPassed(coverage, confidenceLevel);

    const report = {
      passed,
      dataCoverage: coverage,
      confidenceLevel,
      sourcesUsed: [...this.sourcesUsed],
      issues: [...this.issues],
      scoreAdjustments: [...this.scoreAdjustments],
      validationDate: new Date().toISOString(),
      missing: this.getMissingSources()
    };

    // Mettre à jour les résultats avec le quality gate
    this.results.qualityGate = report;
    this.results.dataAvailability = {
      sources: [...this.sourcesUsed],
      coverage,
      lastUpdated: new Date().toISOString(),
      missing: this.getMissingSources(),
      confidence: confidenceLevel
    };

    return report;
  }

  /**
   * Détecter quelles sources de données sont disponibles
   */
  detectSources() {
    const tech = this.results.technical || {};
    const marketing = this.results.marketing || {};
    const data = this.results.data || {};
    const privateData = this.results.privateData || {};
    const ads = this.results.ads || {};

    // Crawl data
    if (tech.crawl?.pagesAnalyzed > 0) {
      this.sourcesUsed.push('crawl');
    }

    // Performance (Lighthouse)
    if (tech.performance?.loadTime > 0 || tech.performance?.score > 0) {
      this.sourcesUsed.push('lighthouse');
    }

    // GA4
    if (privateData.ga4?.status === 'ok' && privateData.ga4?.metrics?.sessions > 0) {
      this.sourcesUsed.push('ga4');
    }

    // GSC
    if (privateData.gsc?.status === 'ok' && privateData.gsc?.metrics?.clicks > 0) {
      this.sourcesUsed.push('gsc');
    }

    // GTM
    if (privateData.gtm?.status === 'ok') {
      this.sourcesUsed.push('gtm');
    }

    // Google Ads API
    if (privateData.googleAds?.status === 'ok' || ads.api?.google?.status === 'ok') {
      this.sourcesUsed.push('google-ads-api');
    }

    // Meta Ads API
    if (privateData.metaAds?.status === 'ok' || ads.api?.meta?.status === 'ok') {
      this.sourcesUsed.push('meta-ads-api');
    }

    // CSV Imports
    if (ads.csv?.google?.imported) {
      this.sourcesUsed.push('google-ads-csv');
    }
    if (ads.csv?.meta?.imported) {
      this.sourcesUsed.push('meta-ads-csv');
    }

    // Tracking
    if (marketing.tracking?.detected?.length > 0) {
      this.sourcesUsed.push('tracking');
    }
  }

  /**
   * Calculer le pourcentage de couverture des données
   */
  calculateCoverage() {
    const requiredSources = this.getRequiredSources();
    if (requiredSources.length === 0) return 100;

    const availableCount = this.sourcesUsed.filter(s => 
      requiredSources.includes(s) || 
      (s === 'google-ads-csv' && requiredSources.includes('ads')) ||
      (s === 'meta-ads-csv' && requiredSources.includes('ads')) ||
      (s === 'google-ads-api' && requiredSources.includes('ads')) ||
      (s === 'meta-ads-api' && requiredSources.includes('ads'))
    ).length;

    return Math.round((availableCount / requiredSources.length) * 100);
  }

  /**
   * Obtenir les sources requises selon le mode d'audit
   */
  getRequiredSources() {
    const base = ['crawl'];
    
    switch (this.auditType) {
      case 'fast':
        return [...base, 'lighthouse', 'tracking'];
      case 'public':
        return [...base, 'lighthouse', 'tracking'];
      case 'private':
        return [...base, 'lighthouse', 'tracking', 'ga4', 'gsc', 'ads'];
      case 'full':
        return [...base, 'lighthouse', 'tracking', 'ga4', 'gsc', 'gtm', 'ads'];
      default:
        return base;
    }
  }

  /**
   * Obtenir les sources manquantes
   */
  getMissingSources() {
    const required = this.getRequiredSources();
    return required.filter(r => {
      if (r === 'ads') {
        return !this.sourcesUsed.some(s => 
          s.includes('google-ads') || s.includes('meta-ads')
        );
      }
      return !this.sourcesUsed.includes(r);
    });
  }

  /**
   * Vérifier les incohérences entre les modules
   */
  checkInconsistencies() {
    const tech = this.results.technical || {};

    // Incohérence HTTPS
    if (tech.security?.https === false && tech.crawl?.https?.enabled === true) {
      this.issues.push({
        type: 'inconsistency',
        severity: 'medium',
        module: 'security/crawl',
        message: 'HTTPS: security dit false mais crawl dit true',
        resolution: 'Utiliser la valeur du crawl (navigation réelle)'
      });
    }

    // LCP non mesuré
    const perf = tech.performance || {};
    if (perf.lcp === 'Non disponible' || perf.lcp === null || perf.lcp === undefined) {
      this.issues.push({
        type: 'missing_metric',
        severity: 'high',
        module: 'performance',
        message: 'LCP (Largest Contentful Paint) non mesuré',
        impact: 'Score performance plafonné, confidence LOW',
        resolution: 'Vérifier que Lighthouse a pu mesurer la page'
      });

      this.scoreAdjustments.push({
        score: 'technical.performance',
        original: perf.score || 50,
        adjusted: Math.min(perf.score || 50, 60),
        reason: 'LCP non mesuré'
      });
    }

    // GA4 absent en mode private/full
    if ((this.auditType === 'private' || this.auditType === 'full') && 
        !this.sourcesUsed.includes('ga4')) {
      this.issues.push({
        type: 'missing_source',
        severity: 'high',
        module: 'ga4',
        message: 'Google Analytics 4 non connecté',
        impact: 'Forecast désactivé, données trafic manquantes',
        resolution: 'Fournir les credentials GA4 ou passer en mode Public'
      });
    }

    // Ads absent alors que configuré
    if ((this.auditType === 'private' || this.auditType === 'full') &&
        !this.sourcesUsed.some(s => s.includes('ads'))) {
      this.issues.push({
        type: 'missing_source',
        severity: 'medium',
        module: 'ads',
        message: 'Données Ads non disponibles (ni CSV ni API)',
        impact: 'ROAS et CPA non calculés',
        resolution: 'Importer un CSV ou connecter l\'API Ads'
      });
    }

    // Crawl incomplet
    if (tech.crawl?.pagesAnalyzed < 5 && this.auditType !== 'fast') {
      this.issues.push({
        type: 'incomplete_data',
        severity: 'high',
        module: 'crawl',
        message: `Crawl incomplet: seulement ${tech.crawl?.pagesAnalyzed} pages analysées`,
        impact: 'Analyse SEO et structure partielle',
        resolution: 'Vérifier l\'URL et la connexion réseau'
      });
    }
  }

  /**
   * Ajuster les scores si données manquantes
   */
  adjustScores() {
    const scores = this.results.scores || {};

    // Si pas de données marketing, plafonner le score marketing
    if (!this.sourcesUsed.includes('tracking') && !this.sourcesUsed.includes('ga4')) {
      if (scores.marketing > 50) {
        this.scoreAdjustments.push({
          score: 'marketing',
          original: scores.marketing,
          adjusted: 50,
          reason: 'Aucune donnée marketing disponible'
        });
        this.results.scores.marketing = 50;
      }
    }

    // Si pas de données privées en mode private/full, plafonner data score
    if ((this.auditType === 'private' || this.auditType === 'full') && 
        scores.data > 50 && 
        !this.sourcesUsed.some(s => ['ga4', 'gsc', 'google-ads-api', 'meta-ads-api'].includes(s))) {
      this.scoreAdjustments.push({
        score: 'data',
        original: scores.data,
        adjusted: 50,
        reason: 'Données privées non disponibles'
      });
      this.results.scores.data = 50;
    }
  }

  /**
   * Calculer le niveau de confiance
   */
  computeConfidenceLevel(coverage) {
    // Bas niveau si moins de 40% de couverture
    if (coverage < 40) return 'LOW';
    
    // Haut niveau si plus de 80% et sources clés présentes
    if (coverage >= 80 && 
        this.sourcesUsed.includes('crawl') &&
        (this.sourcesUsed.includes('ga4') || this.sourcesUsed.includes('gsc'))) {
      return 'HIGH';
    }
    
    // Medium pour le reste
    return 'MEDIUM';
  }

  /**
   * Déterminer si le quality gate passe
   */
  determineIfPassed(coverage, confidenceLevel) {
    // Le gate passe si on a au minimum le crawl
    if (!this.sourcesUsed.includes('crawl')) {
      return false;
    }

    // En mode fast, on accepte une couverture plus faible
    if (this.auditType === 'fast') {
      return coverage >= 30;
    }

    // En mode public, au moins 50% de couverture
    if (this.auditType === 'public') {
      return coverage >= 50;
    }

    // En mode private/full, besoin de plus de données
    if (this.auditType === 'private' || this.auditType === 'full') {
      return coverage >= 60 && confidenceLevel !== 'LOW';
    }

    return true;
  }

  /**
   * Vérifier si le forecast peut être généré
   */
  canGenerateForecast() {
    const forecastInputs = this.results.forecastInputsFinal;
    
    if (!forecastInputs) {
      return {
        allowed: false,
        reason: 'Inputs de prévision non générés (BaselineBuilder manquant)'
      };
    }

    // Validate baseline sessions - must be real measured traffic (null is NOT ok)
    const sessions = forecastInputs.baseline?.sessions;
    if (!sessions || sessions.value === null || sessions.value === undefined || sessions.value <= 0) {
      return {
        allowed: false,
        reason: 'Prévisions indisponibles : trafic historique non mesuré. Connectez GA4 ou GSC pour obtenir des données réelles.'
      };
    }

    // Validate data source - must be from real analytics (GA4/GSC), not crawl estimates
    const validTrafficSources = ['GA4', 'GSC (Clicks Proxy)', 'GSC'];
    const isRealTraffic = validTrafficSources.some(src => sessions.source?.includes(src));
    if (!isRealTraffic) {
      return {
        allowed: false,
        reason: 'Prévisions indisponibles : source de trafic non valide. Données crawl/estimées interdites pour les prévisions.'
      };
    }

    // Validate conversion rate
    const cr = forecastInputs.metrics?.conversionRate;
    if (!cr || !cr.value || cr.value <= 0) {
      return {
        allowed: true,
        warning: 'Taux de conversion non détecté - prévisions trafic uniquement'
      };
    }

    // Validate AOV for revenue forecasts
    const aov = forecastInputs.metrics?.aov;
    if (!aov || aov.value === null || aov.value === undefined || aov.value <= 0) {
      return {
        allowed: true,
        warning: 'Panier moyen non détecté - prévisions trafic uniquement (revenue indisponible)'
      };
    }

    // Check confidence levels
    if (sessions.confidence === 'LOW' && (!cr.confidence || cr.confidence === 'LOW')) {
      return {
        allowed: true,
        warning: 'Faible confiance dans les données - prévisions indicatives uniquement'
      };
    }

    return { allowed: true };
  }

  /**
   * Vérifier si les Quick Wins peuvent être générés
   */
  canGenerateQuickWins() {
    const forecastInputs = this.results.forecastInputsFinal;
    
    // Need at least some data (baseline or crawl)
    const hasCrawl = this.sourcesUsed.includes('crawl');
    const hasBaseline = forecastInputs?.baseline?.sessions?.value !== null;
    
    if (!hasCrawl && !hasBaseline) {
      return {
        allowed: false,
        reason: 'Quick Wins indisponibles : aucune donnée source (crawl ou analytics)'
      };
    }
    
    return { allowed: true };
  }

  /**
   * Vérifier si le Scaling Plan peut être généré
   */
  canGenerateScalingPlan() {
    const forecastInputs = this.results.forecastInputsFinal;
    
    if (!forecastInputs) {
      return {
        allowed: false,
        reason: 'Scaling Plan indisponible : inputs de prévision manquants'
      };
    }
    
    // Can generate with either private data or at least crawl data
    const hasPrivateData = forecastInputs.privateAvailability?.hasGA4 || 
                          forecastInputs.privateAvailability?.hasGSC ||
                          forecastInputs.privateAvailability?.hasAds;
    const hasCrawl = this.sourcesUsed.includes('crawl');
    
    if (!hasPrivateData && !hasCrawl) {
      return {
        allowed: false,
        reason: 'Scaling Plan indisponible : données insuffisantes (besoin crawl ou analytics)'
      };
    }
    
    return { 
      allowed: true, 
      mode: hasPrivateData ? 'private' : 'public',
      note: hasPrivateData ? 'Plan basé sur données privées' : 'Plan basé sur données publiques uniquement'
    };
  }

  /**
   * Vérifier si des recommandations peuvent être générées
   */
  canGenerateRecommendations() {
    // Au minimum besoin du crawl
    if (!this.sourcesUsed.includes('crawl')) {
      return {
        allowed: false,
        reason: 'Données de crawl requises pour les recommandations'
      };
    }

    return { allowed: true };
  }
}

module.exports = { QualityGate };
