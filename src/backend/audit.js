/**
 * STRATADS - AUDIT ENGINE V3
 * Moteur d'analyse pour les 4 modes: fast, public, private, full
 * Zéro NaN/undefined garanti
 */

const { DataContract } = require('./modules/dataContract.js');
const { Crawler } = require('./modules/crawler.js');
const { PerformanceAnalyzer } = require('./modules/performance.js');
const { TrackingAnalyzer } = require('./modules/tracking.js');
const { ConversionAnalyzer } = require('./modules/converter.js');
const { AdsImporter } = require('./modules/adsImporter.js');
const { ForecastEngine } = require('./modules/forecast.js');
const { ApiOrchestrator } = require('./modules/apiOrchestrator.js');
const { QualityGate } = require('./modules/qualityGate.js');
const { BaselineBuilder } = require('./modules/baselineBuilder.js');
const { QuickWinsEngine } = require('./modules/quickWinsEngine.js');
const { ScalingPlanEngine } = require('./modules/scalingPlanEngine.js');

class AuditEngine {
  constructor(url, company, auditType, options = {}) {
    this.url = url;
    this.company = company;
    this.auditType = auditType; // fast | public | private | full
    this.options = options;
    
    // Analysis Period (Days) - OBLIGATOIRE seulement pour PRIVATE/FULL
    const isPrivateOrFull = auditType === 'private' || auditType === 'full';
    const providedPeriod = Number(options.analysisPeriodDays);
    
    if (isPrivateOrFull) {
      // Pour PRIVATE/FULL: la période est obligatoire
      if (!Number.isFinite(providedPeriod) || providedPeriod < 1 || providedPeriod > 365) {
        throw new Error('analysisPeriodDays est obligatoire pour les audits Private/Full et doit être entre 1 et 365 jours. Veuillez définir une période d\'analyse dans l\'interface.');
      }
      this.analysisPeriodDays = providedPeriod;
    } else {
      // Pour FAST/PUBLIC: période optionnelle (null si non fournie)
      this.analysisPeriodDays = Number.isFinite(providedPeriod) && providedPeriod >= 1 && providedPeriod <= 365 
        ? providedPeriod 
        : null;
    }
    
    // Store metrics config
    this.metricsConfig = options.metricsConfig || {};
    
    this.log = options.log || (() => {});
    this.progress = options.progress || (() => {});
    
    // Initialiser le résultat avec le data contract
    this.results = DataContract.createEmpty(auditType, url, company);
    this.results.meta.analysisPeriodDays = this.analysisPeriodDays;
    
    // Composants
    this.crawler = null;
    this.perfAnalyzer = null;
    this.trackingAnalyzer = null;
    this.conversionAnalyzer = null;
    this.adsImporter = null;
  }

  async runApiDataCollection() {
    if (this.auditType !== 'private' && this.auditType !== 'full') {
      this.log('[Audit] API data collection skipped - not private/full mode');
      return;
    }

    this.log(`[Audit] 🔗 Starting API data collection (Period: ${this.analysisPeriodDays} days)...`);
    this.progress(60, 'Collecting API data...');

    try {
      // Propagate analysis period to ApiOrchestrator
      const orchestratorOptions = {
        ...this.options,
        analysisPeriodDays: this.analysisPeriodDays
      };
      
      const orchestrator = new ApiOrchestrator(orchestratorOptions);
      const apiResults = await orchestrator.fetchAllData();
      
      // Store raw API results
      if (!this.results.privateData) {
        this.results.privateData = { ...DataContract.schemas.privateData };
      }
      
      // Merge results
      if (apiResults.ga4) this.results.privateData.ga4 = { ...this.results.privateData.ga4, ...apiResults.ga4 };
      if (apiResults.gsc) this.results.privateData.gsc = { ...this.results.privateData.gsc, ...apiResults.gsc };
      if (apiResults.gtm) this.results.privateData.gtm = { ...this.results.privateData.gtm, ...apiResults.gtm };
      
      if (apiResults.adsApi) {
        if (!this.results.ads) this.results.ads = { ...DataContract.schemas.ads };
        this.results.ads.api = { ...this.results.ads.api, ...apiResults.adsApi };
      }
      
      this.log('[Audit] ✅ API data collection completed');
      
      await this.runBaselineBuilder(apiResults);
      
    } catch (error) {
      this.log(`[Audit] ⚠️ API data collection error: ${error.message}`);
      if (!this.results.privateData) {
        this.results.privateData = { ...DataContract.schemas.privateData };
      }
    }
  }

  async runBaselineBuilder(apiResults) {
    this.log('[Audit] 🏗️ Building Truth Baseline...');
    try {
      const adsData = this.results.ads?.normalized || {};
      const builder = new BaselineBuilder(apiResults, adsData);
      const baseline = builder.build();
      
      this.results.baseline = baseline;
      this.log(`[Audit] ✅ Baseline built: ${baseline.sessions.value || 0} sessions, ${baseline.conversions.value || 0} conversions`);
      
      // Create Unified Forecast Inputs
      this.createForecastInputsFinal(baseline);
      
    } catch (error) {
      this.log(`[Audit] ⚠️ Baseline builder error: ${error.message}`);
    }
  }

  createForecastInputsFinal(baseline) {
    this.log('[Audit] 🔄 Fusing data into ForecastInputsFinal...');
    
    // User manual inputs override baseline
    const manualConfig = this.metricsConfig || {};
    
    // Helper to prioritize sources: Manual > Baseline > unavailable
    const resolveMetric = (baselineMetric, manualValue, name) => {
      if (manualValue && Number(manualValue) > 0) {
        return {
          value: Number(manualValue),
          source: 'Manual Input',
          confidence: 'HIGH',
          originalBaseline: baselineMetric
        };
      }
      return baselineMetric;
    };

    // Determine data availability flags
    const hasGA4 = this.results.privateData?.ga4?.status === 'ok' && this.results.privateData?.ga4?.metrics?.sessions > 0;
    const hasGSC = this.results.privateData?.gsc?.status === 'ok' && this.results.privateData?.gsc?.metrics?.clicks > 0;
    const hasGTM = this.results.privateData?.gtm?.status === 'ok';
    const hasAds = baseline.spend.value !== null && baseline.spend.value > 0;
    const hasManualCR = manualConfig.currentConversionRate > 0;
    const hasManualAOV = manualConfig.averageOrderValue > 0;

    // Calculate data coverage percentage
    const sections = ['sessions', 'conversions', 'revenue', 'spend'];
    const availableSections = sections.filter(s => baseline[s].value !== null).length;
    const dataCoverage = Math.round((availableSections / sections.length) * 100);

    // Determine global confidence (lowest of all confidences)
    const confidences = [
      baseline.sessions.confidence,
      baseline.conversions.confidence,
      baseline.revenue.confidence,
      baseline.spend.confidence
    ].filter(c => c);
    const confidenceGlobal = confidences.includes('LOW') ? 'LOW' : 
                            confidences.includes('MEDIUM') ? 'MEDIUM' : 'HIGH';

    const inputs = {
      analysisWindow: {
        days: this.analysisPeriodDays,
        startDate: new Date(Date.now() - (this.analysisPeriodDays * 86400000)).toISOString(),
        endDate: new Date().toISOString()
      },
      baseline: {
        sessions: baseline.sessions,
        conversions: baseline.conversions,
        revenue: baseline.revenue,
        spend: baseline.spend
      },
      metrics: {
        conversionRate: resolveMetric(baseline.conversionRate, manualConfig.currentConversionRate, 'CR'),
        aov: resolveMetric(baseline.aov, manualConfig.averageOrderValue, 'AOV'),
        cac: baseline.cac,
        roas: baseline.roas,
        avgConversionValue: resolveMetric({ value: null, status: 'unavailable', source: 'unavailable', confidence: 'LOW' }, manualConfig.averageConversionValue, 'AvgConvValue'),
        avgCustomerValue: resolveMetric({ value: null, status: 'unavailable', source: 'unavailable', confidence: 'LOW' }, manualConfig.averageCustomerValue, 'LTV')
      },
      adsTotals: hasAds ? {
        spend: baseline.spend.value,
        conversions: baseline.conversions.value,
        revenue: baseline.revenue.value
      } : null,
      privateAvailability: {
        hasGA4,
        hasGSC,
        hasGTM,
        hasAds,
        hasManualCR,
        hasManualAOV
      },
      dataCoverage,
      confidenceGlobal
    };

    this.results.forecastInputsFinal = inputs;
    this.log(`[Audit] ✅ Forecast Inputs Ready. Coverage: ${dataCoverage}%, Confidence: ${confidenceGlobal}`);
  }

  runForecastEngine() {
    // Forecast enabled only if we have sufficient data
    if (this.auditType !== 'private' && this.auditType !== 'full') {
      this.log('[Audit] 📈 Forecast skipped (mode ' + this.auditType + ')');
      return;
    }
    
    // Check if forecast is blocked by Quality Gate
    // (We will run ForecastEngine anyway, but it will return "disabled" status if data missing)
    
    try {
      const inputs = this.results.forecastInputsFinal;
      if (!inputs) {
        throw new Error('ForecastInputsFinal missing');
      }

      const settings = this.options.forecastSettings || {};
      const engine = new ForecastEngine(inputs, settings, this.results);
      const forecast = engine.run();
      
      this.results.forecast = forecast;
      this.log('[Audit] 📈 Forecast generated');
    } catch (error) {
      this.log(`[Audit] ⚠️ Forecast engine error: ${error.message}`);
      this.results.forecast = {
        dataStatus: 'error',
        error: error.message
      };
    }
  }

  async run() {
    const startTime = Date.now();
    this.log(`[Audit] 🚀 Lancement audit ${this.auditType.toUpperCase()} - ${this.company}`);
    
    try {
      // === MODE FAST ===
      if (this.auditType === 'fast') {
        await this.runFastMode();
      }
      // === MODE PUBLIC ===
      else if (this.auditType === 'public') {
        await this.runPublicMode();
      }
      // === MODE PRIVATE ===
      else if (this.auditType === 'private') {
        await this.runPrivateMode();
      }
      // === MODE FULL ===
      else if (this.auditType === 'full') {
        await this.runFullMode();
      }

      // Calculer les scores finaux
      await this.calculateFinalScores();
      
      // Générer recommandations
      await this.generateRecommendations();
      
      // Générer roadmap
      await this.generateRoadmap();

      // Générer prévisions croissance
      this.runForecastEngine();

      this.generateQuickWins();

      this.generateScalingPlan();

      // Détecter contradictions entre modules (MASTER PROMPT)
      this.detectContradictions();

      // Phase 1.5: Quality Gate - vérifier la cohérence des données
      this.runQualityGate();

    } catch (error) {
      this.log(`[Audit] ❌ Erreur: ${error.message}`);
      this.results.error = error.message;
    }

    // Durée
    this.results.meta.duration = Math.round((Date.now() - startTime) / 1000);
    this.progress(100);
    
    // Valider et nettoyer
    return DataContract.validate(this.results);
  }

  // ==================== MODE FAST ====================
  async runFastMode() {
    this.log('[Audit] Mode FAST - Prospection 2min');
    
    // 1. Crawl léger (homepage + 20 URLs max)
    this.progress(10);
    this.log('[Audit] 🔍 Crawl léger (max 20 pages)');
    this.crawler = new Crawler(this.url, { maxPages: 20, checkRobots: true, checkSitemap: true });
    const crawlResult = await this.crawler.run();
    this.results.technical.crawl = crawlResult;
    
    // NOUVEAU: Transférer les technologies détectées
    if (crawlResult.technologies) {
      this.results.technical.technologies = crawlResult.technologies;
      this.log('[Audit] 🛠️ Technologies détectées: ' + Object.keys(crawlResult.technologies).filter(k => crawlResult.technologies[k].detected).join(', '));
    }

    // 1b. Security (HTTPS détecté via navigation réelle)
    this.progress(15);
    this.log('[Audit] 🔒 Analyse sécurité');
    await this.analyzeSecurity();

    // 2. Performance
    this.progress(30);
    this.log('[Audit] ⚡ Analyse performance');
    this.perfAnalyzer = new PerformanceAnalyzer(this.url, { mode: 'fast' });
    const perfResult = await this.perfAnalyzer.analyze();
    this.results.technical.performance = perfResult;
    
    // NOUVEAU: Fusionner les métriques FAST du crawler si disponibles
    this.mergeFastMetricsFromCrawler(crawlResult);

    // 3. Tracking detection
    this.progress(50);
    this.log('[Audit] 📡 Détection tracking');
    this.trackingAnalyzer = new TrackingAnalyzer(this.url);
    const trackingResult = await this.trackingAnalyzer.analyze();
    this.results.marketing.tracking = trackingResult;

    // 4. Conversion heuristique
    this.progress(70);
    this.log('[Audit] 🎯 Analyse conversion');
    this.conversionAnalyzer = new ConversionAnalyzer(this.url);
    const conversionResult = await this.conversionAnalyzer.analyze();
    this.results.marketing.conversion = conversionResult;
    this.results.marketing.elements = conversionResult.elements;

    this.progress(90);
    this.log('[Audit] ✅ Analyse FAST terminée');
  }

  /**
   * NOUVEAU: Fusionner les métriques FAST collectées par le crawler
   * dans les résultats de performance
   */
  mergeFastMetricsFromCrawler(crawlResult) {
    if (!crawlResult?.performanceMetrics) return;
    
    const perf = this.results.technical.performance;
    const fastMetrics = crawlResult.performanceMetrics;
    
    // Si performance.js a une erreur, utiliser les métriques du crawler
    if (perf.error) {
      this.log('[Audit] ⚠️ Performance.js en erreur, utilisation des métriques crawler');
      this.results.technical.performance = {
        ...perf,
        https: fastMetrics.https,
        pageWeight: fastMetrics.pageWeight,
        scriptCount: fastMetrics.scriptCount,
        imageCount: fastMetrics.imageCount,
        requestCount: fastMetrics.requestCount,
        loadTime: perf.loadTime || 'Non disponible',
        score: this.calculatePerformanceScore(fastMetrics)
      };
      return;
    }
    
    // Fusionner uniquement si les valeurs sont null dans performance.js
    if (perf.https === null && fastMetrics.https !== null) {
      perf.https = fastMetrics.https;
    }
    if (perf.pageWeight === null && fastMetrics.pageWeight !== null) {
      perf.pageWeight = fastMetrics.pageWeight;
    }
    if (perf.scriptCount === null && fastMetrics.scriptCount !== null) {
      perf.scriptCount = fastMetrics.scriptCount;
    }
    if (perf.imageCount === null && fastMetrics.imageCount !== null) {
      perf.imageCount = fastMetrics.imageCount;
    }
    if (perf.requestCount === null && fastMetrics.requestCount !== null) {
      perf.requestCount = fastMetrics.requestCount;
    }
    
    // Recalculer le score avec les métriques fusionnées
    perf.score = this.calculatePerformanceScore({...perf, ...fastMetrics});
    
    this.log('[Audit] ✅ Métriques FAST fusionnées depuis le crawler');
  }

  /**
   * NOUVEAU: Calculer le score performance basé sur les métriques FAST
   */
  calculatePerformanceScore(metrics) {
    let score = 50; // Base
    
    // HTTPS bonus
    if (metrics.https) score += 10;
    
    // Poids page (en KB)
    const pageWeightKB = metrics.pageWeight ? metrics.pageWeight / 1024 : 0;
    if (pageWeightKB < 100) score += 15;
    else if (pageWeightKB < 500) score += 5;
    else if (pageWeightKB > 1000) score -= 10;
    
    // Scripts count
    if (metrics.scriptCount < 10) score += 10;
    else if (metrics.scriptCount < 30) score += 5;
    else if (metrics.scriptCount > 50) score -= 10;
    
    // Images count
    if (metrics.imageCount < 20) score += 5;
    else if (metrics.imageCount > 50) score -= 5;
    
    // Requests count
    if (metrics.requestCount < 20) score += 5;
    else if (metrics.requestCount > 50) score -= 5;
    
    return Math.max(0, Math.min(100, score));
  }

  // ==================== MODE PUBLIC ====================
  async runPublicMode() {
    this.log('[Audit] Mode PUBLIC COMPLET');
    
    // 1. Crawl complet (200 pages)
    this.progress(10);
    this.log('[Audit] 🔍 Crawl complet (max 200 pages)');
    this.crawler = new Crawler(this.url, { maxPages: 200, checkRobots: true, checkSitemap: true });
    const crawlResult = await this.crawler.run();
    this.results.technical.crawl = crawlResult;

    // 2. Analyse SEO technique
    this.progress(25);
    this.log('[Audit] 🔎 Analyse SEO technique');
    await this.analyzeSEODeep(crawlResult);

    // 3. Performance complète
    this.progress(40);
    this.log('[Audit] ⚡ Performance web');
    this.perfAnalyzer = new PerformanceAnalyzer(this.url, { mode: 'public' });
    const perfResult = await this.perfAnalyzer.analyze();
    this.results.technical.performance = perfResult;

    // 4. Security
    this.progress(50);
    this.log('[Audit] 🔒 Analyse sécurité');
    await this.analyzeSecurity();

    // 5. Tracking
    this.progress(60);
    this.log('[Audit] 📡 Tracking & consentement');
    this.trackingAnalyzer = new TrackingAnalyzer(this.url);
    const trackingResult = await this.trackingAnalyzer.analyze();
    this.results.marketing.tracking = trackingResult;

    // 6. Conversion
    this.progress(75);
    this.log('[Audit] 🎯 Audit conversion');
    this.conversionAnalyzer = new ConversionAnalyzer(this.url);
    const conversionResult = await this.conversionAnalyzer.analyze();
    this.results.marketing.conversion = conversionResult;
    this.results.marketing.elements = conversionResult.elements;

    this.progress(90);
    this.log('[Audit] ✅ Analyse PUBLIC terminée');
  }

  // ==================== MODE PRIVATE ====================
  async runPrivateMode() {
    this.log('[Audit] Mode PRIVATE - Data Marketing');

    // 1. Analyse technique (léger)
    this.progress(10);
    this.log('[Audit] 🔍 Analyse technique (léger)');
    this.crawler = new Crawler(this.url, { maxPages: 200 });
    const crawlResult = await this.crawler.run();
    this.results.technical.crawl = crawlResult;

    // 2. Performance
    this.progress(20);
    this.log('[Audit] ⚡ Performance');
    this.perfAnalyzer = new PerformanceAnalyzer(this.url, { mode: 'private' });
    const perfResult = await this.perfAnalyzer.analyze();
    this.results.technical.performance = perfResult;

    // 3. Tracking
    this.progress(30);
    this.log('[Audit] 📡 Tracking');
    this.trackingAnalyzer = new TrackingAnalyzer(this.url);
    const trackingResult = await this.trackingAnalyzer.analyze();
    this.results.marketing.tracking = trackingResult;

    // 4. Conversion
    this.progress(40);
    this.log('[Audit] 🎯 Conversion');
    this.conversionAnalyzer = new ConversionAnalyzer(this.url);
    const conversionResult = await this.conversionAnalyzer.analyze();
    this.results.marketing.conversion = conversionResult;
    this.results.marketing.elements = conversionResult.elements;

    // 5. Import Ads CSV (si fourni)
    this.progress(50);
    await this.importAdsData();

    // 6. API Data Collection
    this.progress(70);
    await this.runApiDataCollection();

    // 7. Build unified dataset (Phase 4)
    this.buildUnifiedDataset();

    this.progress(90);
    this.log('[Audit] ✅ Analyse PRIVATE terminée');
  }

  // ==================== MODE FULL ====================
  async runFullMode() {
    this.log('[Audit] Mode FULL - Audit Premium 360°');

    // 1. Crawl complet
    this.progress(10);
    this.log('[Audit] 🔍 Crawl complet + SEO');
    this.crawler = new Crawler(this.url, { maxPages: 1000 });
    const crawlResult = await this.crawler.run();
    this.results.technical.crawl = crawlResult;
    await this.analyzeSEODeep(crawlResult);
    await this.analyzeSecurity();

    // 2. Performance
    this.progress(25);
    this.log('[Audit] ⚡ Performance avancée');
    this.perfAnalyzer = new PerformanceAnalyzer(this.url, { mode: 'full' });
    const perfResult = await this.perfAnalyzer.analyze();
    this.results.technical.performance = perfResult;

    // 3. Tracking complet
    this.progress(40);
    this.log('[Audit] 📡 Tracking & Data Layer');
    this.trackingAnalyzer = new TrackingAnalyzer(this.url);
    const trackingResult = await this.trackingAnalyzer.analyze();
    this.results.marketing.tracking = trackingResult;

    // 4. Conversion
    this.progress(50);
    this.log('[Audit] 🎯 Funnel & Conversion');
    this.conversionAnalyzer = new ConversionAnalyzer(this.url);
    const conversionResult = await this.conversionAnalyzer.analyze();
    this.results.marketing.conversion = conversionResult;
    this.results.marketing.elements = conversionResult.elements;

    // 5. Import Ads
    this.progress(60);
    await this.importAdsData();

    // 6. API Data Collection
    this.progress(75);
    await this.runApiDataCollection();

    // 7. Benchmark (qualitatif)
    this.progress(85);
    this.log('[Audit] 📈 Benchmark & Projections');
    this.results.benchmark = this.generateBenchmark();

    // 8. Build unified dataset (Phase 4)
    this.buildUnifiedDataset();

    this.progress(95);
    this.log('[Audit] ✅ Analyse FULL terminée');
  }

  // ==================== HELPERS ====================

  async analyzeSEODeep(crawlResult) {
    const pagesList = crawlResult.pages || [];
    const errors = crawlResult.errors || [];
    const pagesCount = pagesList.length;

    // Analyse réelle par page
    const pagesWithTitle = pagesList.filter(p => p.title && p.title.length > 0);
    const pagesWithMeta = pagesList.filter(p => p.metaDescription && p.metaDescription.length > 0);
    const pagesWithH1 = pagesList.filter(p => p.headings?.h1 === 1);
    const pagesWithSchema = pagesList.filter(p => p.schemaPresent);
    const pagesWithImgAlt = pagesList.filter(p => p.imagesWithoutAlt === 0);
    const errors404 = errors.filter(e => e.status === 404);
    const allSchemaTypes = [...new Set(pagesList.flatMap(p => p.schemaTypes || []))];

    // Score SEO basé sur les données réelles
    let seoScore = 50;
    if (pagesCount > 0) {
      const titleRatio = pagesWithTitle.length / pagesCount;
      const metaRatio = pagesWithMeta.length / pagesCount;
      const h1Ratio = pagesWithH1.length / pagesCount;
      seoScore = Math.round(
        titleRatio * 30 +
        metaRatio * 25 +
        h1Ratio * 25 +
        (crawlResult.robots?.present ? 10 : 0) +
        (crawlResult.sitemap?.present ? 10 : 0)
      );
      seoScore = Math.max(0, Math.min(100, seoScore - errors404.length * 3));
    }

    // Issues réelles détectées
    const issues = [];
    if (pagesCount > 0 && pagesWithTitle.length < pagesCount) {
      issues.push(`${pagesCount - pagesWithTitle.length} page(s) sans balise title`);
    }
    if (pagesCount > 0 && pagesWithMeta.length < pagesCount) {
      issues.push(`${pagesCount - pagesWithMeta.length} page(s) sans meta description`);
    }
    if (pagesCount > 0 && pagesWithH1.length < pagesCount) {
      issues.push(`${pagesCount - pagesWithH1.length} page(s) sans H1 unique`);
    }
    if (errors404.length > 0) issues.push(`${errors404.length} erreur(s) 404 détectée(s)`);
    if (!crawlResult.robots?.present) issues.push('Fichier robots.txt absent');
    if (!crawlResult.sitemap?.present) issues.push('Sitemap XML absent');

    this.results.technical.seo = {
      indexability: { score: seoScore, issues: issues.slice(0, 6) },
      title: {
        present: pagesWithTitle.length > 0,
        optimal: pagesWithTitle.length === pagesCount && pagesCount > 0,
        text: pagesList[0]?.title || '',
        pagesWithout: pagesCount - pagesWithTitle.length
      },
      meta: {
        present: pagesWithMeta.length > 0,
        optimal: pagesWithMeta.length === pagesCount && pagesCount > 0,
        description: pagesList[0]?.metaDescription || '',
        pagesWithout: pagesCount - pagesWithMeta.length
      },
      headings: {
        h1: pagesList[0]?.headings?.h1 || 0,
        h2: pagesList[0]?.headings?.h2 || 0,
        h3: pagesList[0]?.headings?.h3 || 0,
        pagesWithoutH1: pagesCount - pagesWithH1.length
      },
      schema: {
        present: pagesWithSchema.length > 0,
        types: allSchemaTypes,
        pagesWithSchema: pagesWithSchema.length
      },
      images: {
        pagesWithAltIssues: pagesCount - pagesWithImgAlt.length
      },
      errors404: errors404.length,
      hreflang: { present: false, tags: [] }
    };
  }

  async analyzeSecurity() {
    try {
      // Utiliser les résultats du crawler si disponibles (HTTPS déterminé par navigation réelle)
      if (this.results.technical.crawl?.https) {
        const secHeaders = this.results.technical.crawl.securityHeaders || {};
        this.results.technical.security = {
          https: this.results.technical.crawl.https.enabled,
          finalUrl: this.results.technical.crawl.https.finalUrl,
          hadRedirect: this.results.technical.crawl.https.hadRedirect,
          note: this.results.technical.crawl.https.note,
          headers: {
            hsts: secHeaders.hsts || false,
            csp: secHeaders.csp || false,
            xframe: secHeaders.xframe || false,
            xcontent: secHeaders.xcontent || false,
            raw: secHeaders.raw || {}
          }
        };
        return;
      }
      
      // Fallback: URL parsing (mais ce n'est pas la méthode recommandée)
      const url = new URL(this.url);
      this.results.technical.security = {
        https: url.protocol === 'https:',
        finalUrl: this.url,
        hadRedirect: false,
        note: 'HTTPS déterminé par URL initiale (pas de navigation)',
        headers: { hsts: false, csp: false, xframe: false }
      };
    } catch {
      this.results.technical.security = { 
        https: false, 
        finalUrl: this.url, 
        hadRedirect: false,
        note: 'Erreur de parsing URL',
        headers: { hsts: false, csp: false, xframe: false } 
      };
    }
  }

  async importAdsData() {
    if (!this.options.googleAdsCSV && !this.options.metaAdsCSV) return;
    
    this.adsImporter = new AdsImporter();
    
    // Ensure ads structure exists
    if (!this.results.ads) {
      this.results.ads = { ...DataContract.schemas.ads };
    }
    
    // Google Ads CSV
    if (this.options.googleAdsCSV) {
      this.log('[Audit] 📥 Import Google Ads CSV');
      const googleResult = await this.adsImporter.parseGoogleAdsCSV(this.options.googleAdsCSV);
      this.results.ads.csv.google = {
        ...googleResult,
        imported: true,
        importDate: new Date().toISOString(),
        source: 'csv'
      };
    }

    // Meta Ads CSV
    if (this.options.metaAdsCSV) {
      this.log('[Audit] 📥 Import Meta Ads CSV');
      const metaResult = await this.adsImporter.parseMetaAdsCSV(this.options.metaAdsCSV);
      this.results.ads.csv.meta = {
        ...metaResult,
        imported: true,
        importDate: new Date().toISOString(),
        source: 'csv'
      };
    }

    // Normalize and merge all ads data sources
    this.normalizeAdsData();

    // Calculate consolidated KPIs
    this.results.ads.kpis = this.adsImporter.computeKPIs(
      this.results.ads.normalized.campaigns,
      null
    );
    
    this.log('[Audit] ✅ Ads data imported and normalized');
  }

  /**
   * Normalize and merge all ads data sources (CSV + API)
   * Creates unified dataset in ads.normalized
   */
  normalizeAdsData() {
    if (!this.results.ads) {
      this.results.ads = { ...DataContract.schemas.ads };
    }

    const normalized = {
      campaigns: [],
      totals: { impressions: 0, clicks: 0, spend: 0, conversions: 0, value: 0 },
      kpis: { roas: null, cpa: null, cpc: null, ctr: null, cr: null },
      sources: []
    };

    // Collect campaigns from CSV sources
    const csvGoogle = this.results.ads.csv?.google;
    const csvMeta = this.results.ads.csv?.meta;

    if (csvGoogle?.imported && csvGoogle.campaigns?.length > 0) {
      normalized.campaigns.push(...csvGoogle.campaigns.map(c => ({ ...c, source: 'google-csv' })));
      normalized.sources.push('google-csv');
      
      if (csvGoogle.totals) {
        normalized.totals.impressions += csvGoogle.totals.impressions || 0;
        normalized.totals.clicks += csvGoogle.totals.clicks || 0;
        normalized.totals.spend += csvGoogle.totals.spend || 0;
        normalized.totals.conversions += csvGoogle.totals.conversions || 0;
        normalized.totals.value += csvGoogle.totals.value || 0;
      }
    }

    if (csvMeta?.imported && csvMeta.campaigns?.length > 0) {
      normalized.campaigns.push(...csvMeta.campaigns.map(c => ({ ...c, source: 'meta-csv' })));
      normalized.sources.push('meta-csv');
      
      if (csvMeta.totals) {
        normalized.totals.impressions += csvMeta.totals.impressions || 0;
        normalized.totals.clicks += csvMeta.totals.clicks || 0;
        normalized.totals.spend += csvMeta.totals.spend || 0;
        normalized.totals.conversions += csvMeta.totals.conversions || 0;
        normalized.totals.value += csvMeta.totals.value || 0;
      }
    }

    // Collect campaigns from API sources (prefer API over CSV for freshness)
    const apiGoogle = this.results.ads.api?.google;
    const apiMeta = this.results.ads.api?.meta;

    if (apiGoogle?.status === 'ok' && apiGoogle.campaigns?.length > 0) {
      // Remove any CSV Google campaigns and replace with API data
      normalized.campaigns = normalized.campaigns.filter(c => !c.source?.includes('google'));
      normalized.campaigns.push(...apiGoogle.campaigns.map(c => ({ ...c, source: 'google-api' })));
      normalized.sources.push('google-api');
      
      if (apiGoogle.totals || apiGoogle.metrics) {
        const metrics = apiGoogle.totals || apiGoogle.metrics || {};
        normalized.totals.impressions += metrics.impressions || 0;
        normalized.totals.clicks += metrics.clicks || 0;
        normalized.totals.spend += metrics.cost || metrics.spend || 0;
        normalized.totals.conversions += metrics.conversions || 0;
        normalized.totals.value += metrics.value || 0;
      }
    }

    if (apiMeta?.status === 'ok' && apiMeta.campaigns?.length > 0) {
      // Remove any CSV Meta campaigns and replace with API data
      normalized.campaigns = normalized.campaigns.filter(c => !c.source?.includes('meta'));
      normalized.campaigns.push(...apiMeta.campaigns.map(c => ({ ...c, source: 'meta-api' })));
      normalized.sources.push('meta-api');
      
      if (apiMeta.totals || apiMeta.metrics) {
        const metrics = apiMeta.totals || apiMeta.metrics || {};
        normalized.totals.impressions += metrics.impressions || 0;
        normalized.totals.clicks += metrics.clicks || 0;
        normalized.totals.spend += metrics.spend || 0;
        normalized.totals.conversions += metrics.conversions || 0;
        normalized.totals.value += metrics.value || 0;
      }
    }

    // Calculate KPIs from totals
    if (normalized.totals.spend > 0) {
      normalized.kpis.roas = normalized.totals.value / normalized.totals.spend;
      normalized.kpis.cpa = normalized.totals.spend / (normalized.totals.conversions || 1);
      normalized.kpis.cpc = normalized.totals.spend / (normalized.totals.clicks || 1);
    }
    if (normalized.totals.impressions > 0) {
      normalized.kpis.ctr = (normalized.totals.clicks / normalized.totals.impressions) * 100;
    }
    if (normalized.totals.clicks > 0) {
      normalized.kpis.cr = (normalized.totals.conversions / normalized.totals.clicks) * 100;
    }

    this.results.ads.normalized = normalized;
    this.log(`[Audit] 📊 Ads normalized: ${normalized.campaigns.length} campaigns from ${normalized.sources.join(', ')}`);
  }

  /**
   * Phase 4: Build unified dataset from public + private data
   * Merges SEO data + traffic GSC + traffic GA4 + ads conversions
   */
  buildUnifiedDataset() {
    const unified = {
      traffic: { sources: [], total: 0, byChannel: {} },
      conversions: { total: 0, bySource: {} },
      revenue: { total: 0, bySource: {} },
      keywords: { top: [], count: 0 },
      pages: { top: [], performance: [] }
    };

    // 1. Traffic from GA4
    const ga4Data = this.results.privateData?.ga4?.metrics;
    if (ga4Data?.sessions > 0) {
      unified.traffic.sources.push({
        source: 'GA4',
        sessions: ga4Data.sessions,
        users: ga4Data.users || 0,
        dateRange: '28 days'
      });
      unified.traffic.total += ga4Data.sessions;
      unified.traffic.byChannel.ga4 = ga4Data.sessions;
    }

    // 2. Traffic from GSC
    const gscData = this.results.privateData?.gsc?.metrics;
    if (gscData?.clicks > 0) {
      unified.traffic.sources.push({
        source: 'GSC',
        clicks: gscData.clicks,
        impressions: gscData.impressions || 0,
        ctr: gscData.ctr || 0,
        dateRange: '28 days'
      });
      // Use clicks as proxy for traffic
      unified.traffic.total += gscData.clicks;
      unified.traffic.byChannel.organic = gscData.clicks;
    }

    // 3. Keywords from GSC
    if (gscData?.keywords && Array.isArray(gscData.keywords)) {
      unified.keywords.top = gscData.keywords.slice(0, 10).map(k => ({
        keyword: k.keyword || k.query,
        clicks: k.clicks || 0,
        impressions: k.impressions || 0,
        ctr: k.ctr || 0,
        position: k.position || k.position || 0
      }));
      unified.keywords.count = gscData.keywords.length;
    }

    // 4. Conversions from GA4
    if (ga4Data?.conversions > 0) {
      unified.conversions.total = ga4Data.conversions;
      unified.conversions.bySource.ga4 = ga4Data.conversions;
    }

    // 5. Conversions from Ads
    const adsData = this.results.ads?.normalized;
    if (adsData?.totals?.conversions > 0) {
      unified.conversions.total += adsData.totals.conversions;
      unified.conversions.bySource.ads = adsData.totals.conversions;
    }

    // 6. Revenue from Ads
    if (adsData?.totals?.value > 0) {
      unified.revenue.total = adsData.totals.value;
      unified.revenue.bySource.ads = adsData.totals.value;
    }

    // 7. Top pages from crawl
    const crawlPages = this.results.technical?.crawl?.pages || [];
    if (crawlPages.length > 0) {
      // Sort by SEO score
      const topPages = crawlPages
        .sort((a, b) => (b.seoScore || 0) - (a.seoScore || 0))
        .slice(0, 10)
        .map(p => ({
          url: p.url,
          title: p.title,
          seoScore: p.seoScore || 0,
          status: p.status,
          internalLinksCount: p.internalLinksCount || 0
        }));
      unified.pages.top = topPages;
    }

    // 8. Page performance data
    const perfData = this.results.technical?.performance;
    if (perfData) {
      unified.pages.performance = [{
        url: this.url,
        loadTime: perfData.loadTime,
        score: perfData.score,
        pageWeight: perfData.pageWeight,
        scriptCount: perfData.scriptCount
      }];
    }

    // Store unified data
    this.results.unifiedData = unified;
    this.log(`[Audit] 📊 Unified dataset: ${unified.traffic.total} traffic, ${unified.conversions.total} conversions, ${unified.keywords.count} keywords`);
  }

  async calculateFinalScores() {
    const tech = this.results.technical;
    const marketing = this.results.marketing;

    // Score performance - basé sur les métriques collectées
    let perfScore = 50; // Default
    if (this.perfAnalyzer && this.perfAnalyzer.results) {
      const perf = this.perfAnalyzer.results;
      // Calculer score basé sur loadTime et métriques FAST
      const loadTime = perf.loadTime || 3;
      const pageWeight = perf.pageWeight || 0;
      
      if (loadTime < 2) perfScore = 80;
      else if (loadTime < 3) perfScore = 65;
      else if (loadTime < 4) perfScore = 50;
      else perfScore = 35;
      
      // Bonus/Malus HTTPS
      if (perf.https) perfScore += 5;
      if (pageWeight > 0 && pageWeight < 500000) perfScore += 5; // < 500KB
    }

    // Score crawl
    const crawlScore = tech.crawl?.pagesAnalyzed > 0 ? 70 : 30;
    
    // Score SEO - calculé depuis crawl en FAST mode, ou depuis tech.seo en autres modes
    let seoScore = 50;
    if (this.auditType === 'fast') {
      // Calcul SEO basé sur le crawl en FAST mode
      const crawl = tech.crawl;
      if (crawl?.pagesAnalyzed > 0) {
        const errors = crawl.errors?.length || 0;
        const hasRobots = crawl.robots?.present || false;
        const hasSitemap = crawl.sitemap?.present || false;
        const hasTitle = crawl.pages?.[0]?.title?.length > 0;
        const hasMeta = crawl.pages?.[0]?.metaDescription?.length > 0;
        
        seoScore = 70; // Base pour crawl réussi
        seoScore -= errors * 5;
        if (hasRobots) seoScore += 5;
        if (hasSitemap) seoScore += 5;
        if (hasTitle) seoScore += 5;
        if (hasMeta) seoScore += 5;
        seoScore = Math.max(30, Math.min(100, seoScore));
      }
    } else {
      // Autres modes: utiliser tech.seo si disponible
      seoScore = tech.seo?.indexability?.score || 50;
    }
    
    // Score sécurité
    const securityScore = tech.security?.https ? 80 : 40;
    
    this.results.scores.technical = Math.round((perfScore + crawlScore + seoScore + securityScore) / 4);
    
    // Stocker les scores individuels pour le rapport
    this.results.technical.performance = this.results.technical.performance || {};
    this.results.technical.performance.score = perfScore;
    this.results.technical.crawl = this.results.technical.crawl || {};
    this.results.technical.crawl.seo = { score: seoScore };

    // Score marketing
    const trackScore = marketing.tracking?.score || 30;
    const convScore = marketing.conversion?.heuristicScore || 30;
    this.results.scores.marketing = Math.round((trackScore + convScore) / 2);

    // Score data (PRIVATE/FULL uniquement)
    if (this.auditType === 'private' || this.auditType === 'full') {
      const hasAdsData = this.results.data?.ads?.google?.imported || this.results.data?.ads?.meta?.imported;
      this.results.scores.data = hasAdsData ? 70 : 30;
    }

    // Score global
    const weights = { technical: 0.35, marketing: 0.35, data: 0.30 };
    let globalScore = this.results.scores.technical * weights.technical + 
                      this.results.scores.marketing * weights.marketing;
    
    if (this.results.scores.data !== undefined) {
      globalScore += this.results.scores.data * weights.data;
    } else {
      globalScore = (this.results.scores.technical + this.results.scores.marketing) / 2;
    }

    this.results.scores.global = Math.round(globalScore);

    // Maturité
    if (this.results.scores.global >= 75) this.results.scores.maturity = 'Avancé';
    else if (this.results.scores.global >= 50) this.results.scores.maturity = 'Intermédiaire';
    else this.results.scores.maturity = 'Débutant';
  }

  async generateRecommendations() {
    const recs = [];
    const evidence = [];
    
    let evidenceCounter = 1;

    // 1. SEO Recommendations (data-driven)
    const seoScore = this.results.scores.technical || 0;
    if (seoScore < 50) {
      const crawlData = this.results.technical?.crawl;
      
      // Missing sitemap
      if (!crawlData?.sitemap?.present) {
        const evidenceId = `ev-${evidenceCounter++}`;
        evidence.push({
          id: evidenceId,
          source: 'crawl',
          metric: 'sitemap',
          page: this.url,
          date: new Date().toISOString().split('T')[0],
          value: false,
          description: 'Aucun sitemap.xml détecté'
        });
        
        recs.push({
          id: `rec-${recs.length + 1}`,
          problem: 'Absence de sitemap.xml',
          evidence: 'Aucun fichier sitemap.xml détecté lors du crawl',
          impact: 'L\'indexation Google est moins efficace, perte de visibilité organique estimée à 10%',
          priority: 'Moyenne',
          effort: 'Faible',
          estimatedGain: '+10% visibilité organique',
          evidenceRefs: [evidenceId],
          category: 'SEO'
        });
      }
      
      // Low SEO scores on pages
      const lowSeoPages = crawlData?.pages?.filter(p => (p.seoScore || 0) < 50) || [];
      if (lowSeoPages.length > 0) {
        const evidenceId = `ev-${evidenceCounter++}`;
        evidence.push({
          id: evidenceId,
          source: 'crawl',
          metric: 'seoScore',
          page: lowSeoPages.map(p => p.url).slice(0, 3).join(', '),
          date: new Date().toISOString().split('T')[0],
          value: lowSeoPages.length,
          description: `${lowSeoPages.length} pages avec score SEO < 50`
        });
        
        recs.push({
          id: `rec-${recs.length + 1}`,
          problem: `Score SEO faible sur ${lowSeoPages.length} pages`,
          evidence: `Score SEO moyen de ${Math.round(lowSeoPages.reduce((sum, p) => sum + (p.seoScore || 0), 0) / lowSeoPages.length)} sur les pages analysées`,
          impact: 'Perte de ranking et de trafic organique',
          priority: 'Haute',
          effort: 'Moyen',
          estimatedGain: '+20% trafic organique',
          evidenceRefs: [evidenceId],
          category: 'SEO'
        });
      }
    }

    // 2. Performance Recommendations (data-driven)
    const perf = this.results.technical.performance;
    if (perf?.loadTime && perf.loadTime > 3) {
      const evidenceId = `ev-${evidenceCounter++}`;
      evidence.push({
        id: evidenceId,
        source: 'lighthouse',
        metric: 'loadTime',
        page: this.url,
        date: new Date().toISOString().split('T')[0],
        value: perf.loadTime,
        description: `Temps de chargement: ${perf.loadTime}s`
      });
      
      recs.push({
        id: `rec-${recs.length + 1}`,
        problem: `Temps de chargement lent (${perf.loadTime}s)`,
        evidence: `Le temps de chargement dépasse l'objectif de 2s avec ${perf.loadTime}s mesuré`,
        impact: 'Chaque seconde supplémentaire réduit le taux de conversion de 7%',
        priority: 'Haute',
        effort: 'Élevé',
        estimatedGain: '+15% conversion',
        evidenceRefs: [evidenceId],
        category: 'Performance'
      });
    }

    // 3. Tracking Recommendations (data-driven)
    const trackingScore = this.results.marketing?.tracking?.heuristicScore || 0;
    if (trackingScore < 50) {
      const trackingData = this.results.marketing?.tracking;
      const missingTools = [];
      
      if (!trackingData?.googleAnalytics) missingTools.push('Google Analytics');
      if (!trackingData?.googleTagManager) missingTools.push('Google Tag Manager');
      if (!trackingData?.metaPixel) missingTools.push('Meta Pixel');
      
      if (missingTools.length > 0) {
        const evidenceId = `ev-${evidenceCounter++}`;
        evidence.push({
          id: evidenceId,
          source: 'tracking',
          metric: 'tools',
          page: this.url,
          date: new Date().toISOString().split('T')[0],
          value: missingTools.length,
          description: `Outils manquants: ${missingTools.join(', ')}`
        });
        
        recs.push({
          id: `rec-${recs.length + 1}`,
          problem: 'Tracking analytics incomplet',
          evidence: `Outils de tracking manquants: ${missingTools.join(', ')}`,
          impact: 'Impossible de mesurer les performances marketing et d\'optimiser le ROI',
          priority: 'Haute',
          effort: 'Faible',
          estimatedGain: 'Visibilité complète sur les performances',
          evidenceRefs: [evidenceId],
          category: 'Marketing'
        });
      }
    }

    // 4. Conversion Recommendations (data-driven)
    const convScore = this.results.marketing?.conversion?.heuristicScore || 0;
    if (convScore < 50) {
      const convData = this.results.marketing?.conversion;
      const missingElements = [];
      
      if (!convData?.elements?.cta) missingElements.push('CTA');
      if (!convData?.elements?.forms) missingElements.push('Formulaires');
      if (!convData?.elements?.trust) missingElements.push('Éléments de confiance');
      
      if (missingElements.length > 0) {
        const evidenceId = `ev-${evidenceCounter++}`;
        evidence.push({
          id: evidenceId,
          source: 'conversion',
          metric: 'elements',
          page: this.url,
          date: new Date().toISOString().split('T')[0],
          value: missingElements.length,
          description: `Éléments de conversion manquants: ${missingElements.join(', ')}`
        });
        
        recs.push({
          id: `rec-${recs.length + 1}`,
          problem: 'Éléments de conversion insuffisants',
          evidence: `Éléments manquants détectés: ${missingElements.join(', ')}`,
          impact: 'Taux de conversion réduit, pertes d\'opportunités commerciales',
          priority: 'Moyenne',
          effort: 'Moyen',
          estimatedGain: '+25% taux de conversion',
          evidenceRefs: [evidenceId],
          category: 'Conversion'
        });
      }
    }

    // 5. Ads Recommendations (data-driven - si données disponibles)
    const adsData = this.results.ads?.normalized;
    if (adsData?.kpis) {
      if (adsData.kpis.roas && adsData.kpis.roas < 3) {
        const evidenceId = `ev-${evidenceCounter++}`;
        evidence.push({
          id: evidenceId,
          source: 'ads',
          metric: 'roas',
          page: 'global',
          date: new Date().toISOString().split('T')[0],
          value: adsData.kpis.roas,
          description: `ROAS actuel: ${adsData.kpis.roas.toFixed(2)}`
        });
        
        recs.push({
          id: `rec-${recs.length + 1}`,
          problem: `ROAS sous-optimal (${adsData.kpis.roas.toFixed(2)})`,
          evidence: `Le retour sur investissement publicitaire est de ${adsData.kpis.roas.toFixed(2)}, sous l'objectif de 3`,
          impact: 'Budget publicitaire non optimisé, pertes de rentabilité',
          priority: 'Haute',
          effort: 'Moyen',
          estimatedGain: '+50% ROAS',
          evidenceRefs: [evidenceId],
          category: 'Publicité'
        });
      }
    }

    // 6. Data-driven recommendations based on metrics config (only for private/full)
    if (this.metricsConfig && this.metricsConfig.currentConversionRate && this.metricsConfig.currentConversionRate < 2) {
      const evidenceId = `ev-${evidenceCounter++}`;
      evidence.push({
        id: evidenceId,
        source: 'metrics',
        metric: 'conversionRate',
        page: 'global',
        date: new Date().toISOString().split('T')[0],
        value: this.metricsConfig.currentConversionRate,
        description: `Taux de conversion actuel: ${this.metricsConfig.currentConversionRate}%`
      });
      
      recs.push({
        id: `rec-${recs.length + 1}`,
        problem: `Taux de conversion faible (${this.metricsConfig.currentConversionRate}%)`,
        evidence: `Le taux de conversion est de ${this.metricsConfig.currentConversionRate}%, sous la moyenne sectorielle de 2-3%`,
        impact: 'Potentiel de revenus non exploité',
        priority: 'Haute',
        effort: 'Moyen',
        estimatedGain: `+${(3 - this.metricsConfig.currentConversionRate).toFixed(1)}% taux de conversion`,
        evidenceRefs: [evidenceId],
        category: 'Conversion'
      });
    }

    // Store evidence and recommendations
    this.results.evidence = evidence;
    this.results.recommendations = recs.slice(0, 10);
    
    this.log(`[Audit] 📋 Generated ${recs.length} recommendations with ${evidence.length} evidence items`);
  }

  async generateRoadmap() {
    const recs = this.results.recommendations;
    
    const highPriority = recs.filter(r => r.priority === 'Haute');
    const mediumPriority = recs.filter(r => r.priority === 'Moyenne');
    const lowPriority = recs.filter(r => r.priority === 'Basse');

    this.results.roadmap.quick = highPriority.filter(r => r.effort === 'Faible').concat(mediumPriority.filter(r => r.effort === 'Faible')).slice(0, 5);
    this.results.roadmap.medium = highPriority.filter(r => r.effort === 'Moyen').concat(mediumPriority.filter(r => r.effort === 'Moyen')).slice(0, 5);
    this.results.roadmap.long = highPriority.filter(r => r.effort === 'Élevé').concat(lowPriority).slice(0, 5);
  }

  generateBenchmark() {
    return {
      type: 'qualitatif',
      industry: 'Non spécifié',
      thresholds: {
        loadTime: { good: '< 2s', average: '2-4s', poor: '> 4s' },
        ctr: { good: '> 3%', average: '1-3%', poor: '< 1%' },
        conversionRate: { good: '> 2%', average: '1-2%', poor: '< 1%' }
      },
      notes: 'Benchmark qualitatif sans données GA4. Pour une analyse benchmarkée, fournir accès GA4.'
    };
  }

  /**
   * Détection des contradictions entre modules d'analyse
   * Règle MASTER PROMPT: Signaler les incohérences entre modules
   */
  detectContradictions() {
    const contradictions = [];
    const tech = this.results.technical;
    
    // Vérifier contradiction HTTPS entre analyses
    // Exemple: FAST (ancien crawl) dit HTTPS false, PUBLIC (nouveau crawl) dit HTTPS true
    if (tech.security?.https === false && tech.crawl?.redirects?.some(r => r.to?.startsWith('https:'))) {
      contradictions.push({
        type: 'https_redirect',
        severity: 'info',
        message: 'Redirection HTTP → HTTPS détectée. Le site est sécurisé mais l\'URL initiale utilise HTTP.',
        modules: ['security', 'crawl'],
        resolution: 'Considérer le site comme HTTPS sécurisé (URL finale)'
      });
    }
    
    // Vérifier contradiction tracking
    if (tech.crawl?.pagesAnalyzed > 0 && this.results.marketing.tracking?.detected?.length === 0) {
      // Si on a crawlé des pages mais aucun tracking détecté
      // Cela peut être normal ou une erreur de détection
      if (this.results.marketing.tracking?.gtm?.present) {
        // GTM présent mais pas dans la liste detected - incohérence mineure
        contradictions.push({
          type: 'tracking_consistency',
          severity: 'low',
          message: 'GTM détecté mais absent de la liste des outils.',
          modules: ['tracking', 'crawl'],
          resolution: 'Mise à jour automatique de la liste'
        });
      }
    }
    
    // Stocker les contradictions dans les résultats
    this.results.contradictions = contradictions;
    
    // Log si des contradictions trouvées
    if (contradictions.length > 0) {
      this.log(`[Audit] ⚠️ ${contradictions.length} contradiction(s) détectée(s)`);
      for (const c of contradictions) {
        this.log(`  - ${c.type}: ${c.message}`);
      }
    }
    
    return contradictions;
  }

  /**
   * Phase 1.5: Quality Gate - vérifier la cohérence des données avant génération du rapport
   */
  runQualityGate() {
    this.log('[Audit] 🔍 Quality Gate - Validation des données...');
    
    const qualityGate = new QualityGate(this.results, this.auditType);
    const report = qualityGate.validate();
    
    // Log du résultat
    this.log(`[Audit] 📊 Quality Gate: ${report.passed ? '✅ PASS' : '⚠️ WARNING'}`);
    this.log(`[Audit] 📈 Data Coverage: ${report.dataCoverage}% | Confidence: ${report.confidenceLevel}`);
    this.log(`[Audit] 📋 Sources: ${report.sourcesUsed.join(', ') || 'Aucune'}`);
    
    if (report.issues.length > 0) {
      this.log(`[Audit] ⚠️ ${report.issues.length} issue(s) détectée(s):`);
      report.issues.forEach(issue => {
        this.log(`    [${issue.severity.toUpperCase()}] ${issue.module}: ${issue.message}`);
      });
    }
    
    // Vérifier si le forecast peut être généré
    const forecastCheck = qualityGate.canGenerateForecast();
    if (!forecastCheck.allowed) {
      this.log(`[Audit] ⚠️ Forecast désactivé: ${forecastCheck.reason}`);
      this.results.forecast.dataStatus = 'disabled';
      this.results.forecast.assumptions = [forecastCheck.reason];
    } else if (forecastCheck.warning) {
      this.log(`[Audit] ℹ️ ${forecastCheck.warning}`);
      this.results.forecast.assumptions.push(forecastCheck.warning);
    }
    
    return report;
  }

  /**
   * NEW: Générer Quick Wins data-driven sans chevauchement
   */
  generateQuickWins() {
    this.log('[Audit] ⚡ Génération Quick Wins...');
    
    try {
      const engine = new QuickWinsEngine(this.results.forecastInputsFinal, this.results);
      const wins = engine.generate();
      
      this.results.quickWins = {
        generated: true,
        count: wins.length,
        items: wins,
        timestamp: new Date().toISOString()
      };
      
      this.log(`[Audit] ✅ ${wins.length} Quick Wins générés`);
      wins.forEach((w, i) => {
        this.log(`   ${i+1}. ${w.title} [${w.impact}] - ${w.potential}% potentiel`);
      });
    } catch (error) {
      this.log(`[Audit] ⚠️ Erreur Quick Wins: ${error.message}`);
      this.results.quickWins = { generated: false, error: error.message };
    }
  }

  /**
   * NEW: Générer Scaling Plan (private si présent, sinon public)
   */
  generateScalingPlan() {
    this.log('[Audit] 📈 Génération Scaling Plan...');
    
    try {
      const engine = new ScalingPlanEngine(this.results.forecastInputsFinal, this.results, this.auditType);
      const plan = engine.generate();
      
      this.results.scalingPlan = {
        generated: true,
        ...plan,
        timestamp: new Date().toISOString()
      };
      
      this.log(`[Audit] ✅ Scaling Plan généré (${plan.baseMode})`);
      this.log(`   Phases: ${plan.phases.length} | KPIs: ${plan.kpis.primary.length} primaires`);
      this.log(`   Source: ${plan.dataSource}`);
    } catch (error) {
      this.log(`[Audit] ⚠️ Erreur Scaling Plan: ${error.message}`);
      this.results.scalingPlan = { generated: false, error: error.message };
    }
  }
}

module.exports = { AuditEngine };
