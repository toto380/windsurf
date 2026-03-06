/**
 * STRATADS - PERFORMANCE MODULE
 * Métriques Web Vitals via Playwright
 * Zéro NaN/undefined garanti
 */

const { chromium } = require('playwright');

class PerformanceAnalyzer {
  constructor(url, options = {}) {
    this.url = url;
    this.options = {
      mode: options.mode || 'public', // 'fast' ou 'public'
      ...options
    };
    this.results = {
      loadTime: 0,
      fcp: 'Non disponible',
      lcp: 'Non disponible',
      cls: 'Non disponible',
      ttfb: 'Non disponible',
      grade: 'C',
      metrics: {},
      // NOUVEAU: Catégorie pour FAST mode (pas de durée affichée)
      perfCategory: null, // 'Rapide', 'Moyenne', 'Lente'
      // NOUVEAU: Métriques FAST collectées via Playwright
      https: null,
      pageWeight: null,
      scriptCount: null,
      imageCount: null,
      requestCount: null
    };
  }

  async analyze() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    try {
      // Activer la collecte des métriques de performance
      await page.addInitScript(() => {
        // Polyfill pour PerformanceObserver si nécessaire
        if (!window.performance) {
          window.performance = { now: () => Date.now() };
        }
      });

      // NOUVEAU: Stratégie de timeout adaptatif
      let response = null;
      let loadTime = 0;
      let timeoutUsed = 0;
      
      // Phase 1: 15s avec domcontentloaded (rapide)
      try {
        const startTime = Date.now();
        response = await page.goto(this.url, { 
          waitUntil: 'domcontentloaded',
          timeout: 15000 
        });
        loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
        timeoutUsed = 15;
        console.log('[Performance] Phase 1 réussie - domcontentloaded en', loadTime + 's');
      } catch (error1) {
        console.log('[Performance] Phase 1 échouée, tentative Phase 2...');
        
        // Phase 2: 30s avec networkidle (standard)
        try {
          const startTime = Date.now();
          response = await page.goto(this.url, { 
            waitUntil: 'networkidle',
            timeout: 30000 
          });
          loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
          timeoutUsed = 30;
          console.log('[Performance] Phase 2 réussie - networkidle en', loadTime + 's');
        } catch (error2) {
          console.log('[Performance] Phase 2 échouée, tentative Phase 3...');
          
          // Phase 3: 60s avec load (dernier recours)
          try {
            const startTime = Date.now();
            response = await page.goto(this.url, { 
              waitUntil: 'load',
              timeout: 60000 
            });
            loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
            timeoutUsed = 60;
            console.log('[Performance] Phase 3 réussie - load en', loadTime + 's');
          } catch (error3) {
            console.error('[Performance] Toutes les phases échouées, utilisation des métriques partielles');
            throw new Error(`Timeout adaptatif échoué: ${error3.message}`);
          }
        }
      }

      // Temps de chargement total
      this.results.loadTime = loadTime;
      this.results.timeoutUsed = timeoutUsed; // Pour debugging

      // Collecter les métriques Web Vitals avec gestion d'erreur
      let webVitals = {};
      try {
        webVitals = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0];
          const paint = performance.getEntriesByType('paint');
          
          // Time to First Byte
          const ttfb = nav ? nav.responseStart - nav.startTime : 0;
          
          // First Contentful Paint
          const fcpEntry = paint.find(p => p.name === 'first-contentful-paint');
          const fcp = fcpEntry ? fcpEntry.startTime : 0;
          
          // DOM Content Loaded
          const dcl = nav ? nav.domContentLoadedEventEnd - nav.startTime : 0;
          
          // Load Event
          const loadTime = nav ? nav.loadEventEnd - nav.startTime : 0;

          return {
            ttfb: Math.round(ttfb),
            fcp: Math.round(fcp),
            dcl: Math.round(dcl),
            loadTime: Math.round(loadTime),
            domInteractive: nav ? Math.round(nav.domInteractive - nav.startTime) : 0
          };
        });
      } catch (webVitalsError) {
        console.warn('[Performance] Erreur Web Vitals:', webVitalsError.message);
        webVitals = { ttfb: 0, fcp: 0, dcl: 0, loadTime: 0, domInteractive: 0 };
      }

      // NOUVEAU: Collecter les métriques FAST avec gestion d'erreur
      try {
        await this.collectFastMetrics(page);
      } catch (fastMetricsError) {
        console.warn('[Performance] Erreur métriques FAST:', fastMetricsError.message);
        // Valeurs par défaut pour les métriques FAST
        this.results.https = false;
        this.results.pageWeight = 0;
        this.results.scriptCount = 0;
        this.results.imageCount = 0;
        this.results.requestCount = 0;
      }

      // Tentative de récupérer LCP via PerformanceObserver (simplifié)
      let lcpData = 0;
      try {
        lcpData = await this.measureLCP(page);
      } catch (lcpError) {
        console.warn('[Performance] Erreur LCP:', lcpError.message);
      }
      
      // Tentative de récupérer CLS
      let clsData = 0;
      try {
        clsData = await this.measureCLS(page);
      } catch (clsError) {
        console.warn('[Performance] Erreur CLS:', clsError.message);
      }

      // Normaliser toutes les valeurs
      this.results.ttfb = this.normalizeTime(webVitals.ttfb);
      this.results.fcp = this.normalizeTime(webVitals.fcp);
      this.results.lcp = this.normalizeTime(lcpData);
      this.results.cls = this.normalizeCLS(clsData);
      
      this.results.metrics = {
        domInteractive: this.normalizeTime(webVitals.domInteractive),
        domContentLoaded: this.normalizeTime(webVitals.dcl)
      };

      // Calculer la grade
      this.results.grade = this.calculateGrade();
      
      // NOUVEAU: Calculer perfCategory pour FAST mode
      this.results.perfCategory = this.calculatePerfCategory();
      
      // Calculer le score
      this.results.score = this.calculateScore();

    } catch (error) {
      console.error('[Performance]', error.message);
      // Valeurs par défaut en cas d'erreur - toujours créer perfCategory pour FAST
      this.results = {
        loadTime: 'Non disponible',
        fcp: 'Non disponible',
        lcp: 'Non disponible',
        cls: 'Non disponible',
        ttfb: 'Non disponible',
        grade: 'N/A',
        metrics: {},
        perfCategory: null, // Sera masqué en FAST si null
        https: false,
        pageWeight: 0,
        scriptCount: 0,
        imageCount: 0,
        requestCount: 0,
        score: 0,
        error: error.message,
        timeoutUsed: 0
      };
    } finally {
      await browser.close();
    }

    return this.results;
  }

  /**
   * NOUVEAU: Collecter les métriques FAST (https, poids, scripts, images, requêtes)
   */
  async collectFastMetrics(page) {
    try {
      // 1. Vérifier HTTPS
      const finalUrl = page.url();
      this.results.https = finalUrl.startsWith('https://');
      
      // 2. Compter les scripts
      this.results.scriptCount = await page.$$eval('script', el => el.length);
      
      // 3. Compter les images
      this.results.imageCount = await page.$$eval('img', el => el.length);
      
      // 4. Mesurer le poids de la page (HTML uniquement)
      const html = await page.content();
      this.results.pageWeight = Buffer.byteLength(html, 'utf8');
      
      // 5. Compter les requêtes réseau (déjà compté via page.on('request'))
      // Note: requestCount est compté au niveau du crawler
      this.results.requestCount = null; // Sera rempli par le crawler si disponible
      
    } catch (e) {
      console.error('[Performance] Error collecting FAST metrics:', e.message);
      // Garder les valeurs null si erreur
    }
  }

  async measureLCP(page) {
    try {
      // Utiliser un script pour capturer LCP
      const lcp = await page.evaluate(() => {
        return new Promise((resolve) => {
          let lcpValue = 0;
          
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1];
            if (lastEntry) {
              lcpValue = lastEntry.startTime;
            }
          });
          
          try {
            observer.observe({ entryTypes: ['largest-contentful-paint'] });
          } catch (e) {
            // LCP non supporté
            resolve(0);
            return;
          }
          
          // Attendre un peu puis retourner la valeur
          setTimeout(() => {
            observer.disconnect();
            resolve(lcpValue);
          }, 1000);
        });
      });
      
      return lcp;
    } catch {
      return 0;
    }
  }

  async measureCLS(page) {
    try {
      const cls = await page.evaluate(() => {
        return new Promise((resolve) => {
          let clsValue = 0;
          
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) {
                clsValue += entry.value;
              }
            }
          });
          
          try {
            observer.observe({ entryTypes: ['layout-shift'] });
          } catch (e) {
            resolve(0);
            return;
          }
          
          setTimeout(() => {
            observer.disconnect();
            resolve(clsValue);
          }, 1000);
        });
      });
      
      return cls;
    } catch {
      return 0;
    }
  }

  normalizeTime(ms) {
    if (!ms || ms <= 0 || !Number.isFinite(ms)) {
      return 'Non disponible';
    }
    if (ms < 1000) {
      return Math.round(ms) + 'ms';
    }
    return (ms / 1000).toFixed(2) + 's';
  }

  normalizeCLS(value) {
    if (!value || !Number.isFinite(value) || value < 0) {
      return 'Non disponible';
    }
    return value.toFixed(3);
  }

  calculateGrade() {
    // Convertir en nombres pour comparaison
    const loadTime = parseFloat(this.results.loadTime) || 0;
    const fcp = this.parseTimeToMs(this.results.fcp);
    
    // Scoring simplifié
    let score = 50; // Base
    
    if (loadTime < 2) score += 25;
    else if (loadTime < 3) score += 15;
    else if (loadTime < 5) score += 5;
    
    if (fcp < 1800) score += 25; // < 1.8s
    else if (fcp < 3000) score += 15;
    
    // Attribuer grade
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 50) return 'C';
    return 'D';
  }

  /**
   * Calcule la catégorie de performance pour FAST mode
   * Ne retourne pas de durée chiffrée, uniquement une catégorie
   * @returns {string} 'Rapide', 'Moyenne', 'Lente' ou null
   */
  calculatePerfCategory() {
    const loadTime = parseFloat(this.results.loadTime) || 0;
    
    // Basé sur le loadTime (sans l'afficher)
    if (loadTime < 2.5) return 'Rapide';
    if (loadTime < 5) return 'Moyenne';
    if (loadTime > 0) return 'Lente';
    return null; // Non mesuré
  }

  /**
   * Calcule le score de performance (0-100)
   * Basé sur les métriques collectées
   * @returns {number} Score de performance
   */
  calculateScore() {
    let score = 100;
    
    // Pénalité temps de chargement
    const loadTime = parseFloat(this.results.loadTime) || 0;
    if (loadTime > 5) score -= 30;
    else if (loadTime > 3) score -= 20;
    else if (loadTime > 2) score -= 10;
    
    // Pénalité TTFB
    const ttfb = this.parseTimeToMs(this.results.ttfb);
    if (ttfb > 1000) score -= 20;
    else if (ttfb > 600) score -= 10;
    else if (ttfb > 300) score -= 5;
    
    // Pénalité FCP
    const fcp = this.parseTimeToMs(this.results.fcp);
    if (fcp > 3000) score -= 20;
    else if (fcp > 2000) score -= 10;
    else if (fcp > 1000) score -= 5;
    
    // Bonus HTTPS
    if (this.results.https) score += 5;
    
    // Pénalité poids de page
    const weightKB = (this.results.pageWeight || 0) / 1024;
    if (weightKB > 3000) score -= 15;
    else if (weightKB > 2000) score -= 10;
    else if (weightKB > 1000) score -= 5;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  parseTimeToMs(timeStr) {
    if (!timeStr || timeStr === 'Non disponible') return 999999;
    const match = String(timeStr).match(/([\d.]+)(ms|s)/);
    if (!match) return 999999;
    const val = parseFloat(match[1]);
    return match[2] === 's' ? val * 1000 : val;
  }

  getScore() {
    const gradeScores = { A: 100, B: 80, C: 60, D: 40, 'N/A': 0 };
    let score = gradeScores[this.results.grade] || 50;
    
    // Ajuster score basé sur les métriques FAST collectées
    if (this.options.mode === 'fast') {
      // Bonus HTTPS
      if (this.results.https) score += 5;
      
      // Malus poids page > 500KB
      if (this.results.pageWeight && this.results.pageWeight > 500000) {
        score -= 10;
      }
      
      // Malus trop de scripts > 50
      if (this.results.scriptCount && this.results.scriptCount > 50) {
        score -= 10;
      }
      
      // Bonus images optimisées < 20
      if (this.results.imageCount && this.results.imageCount < 20) {
        score += 5;
      }
      
      score = Math.max(0, Math.min(100, score));
    }
    
    return score;
  }
}

module.exports = { PerformanceAnalyzer };
