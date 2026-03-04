/**
 * STRATADS FAST AUDIT - Version Prospection 2min
 * Respecte les contraintes : pas de chiffres financiers, pas d'estimations de CA
 */

import { chromium } from "playwright";

export class FastAuditProspection {
  constructor(url, company) {
    this.url = url;
    this.company = company;
  }

  async run() {
    console.log(`[FastAudit] 🚀 Prospection 2min - ${this.company}`);
    
    // 1. Score global acquisition
    const acquisitionScore = await this.calculateAcquisitionScore();
    
    // 2. Score acquisition détaillé
    const detailedScores = await this.calculateDetailedScores();
    
    // 3. Performance du site
    const performance = await this.analyzePerformance();
    
    // 4. Tracking marketing
    const tracking = await this.detectTracking();
    
    // 5. Opportunités d'optimisation
    const quickWins = await this.generateQuickWins(acquisitionScore, tracking, performance);
    
    // 6. Potentiel de croissance (en % uniquement)
    const growthPotential = await this.estimateGrowthPotential(acquisitionScore, detailedScores);
    
    const results = {
      meta: {
        company: this.company,
        url: this.url,
        date: new Date().toISOString(),
        auditType: 'fast',
        pricing: { price: 0, description: 'Gratuit - Prospection 2min' }
      },
      executiveSummary: {
        globalScore: acquisitionScore.global,
        maturityLevel: this.getMaturityLevel(acquisitionScore.global),
        potentialImprovement: this.getPotentialImprovement(acquisitionScore.global)
      },
      acquisitionScore: detailedScores,
      performance,
      tracking,
      quickWins,
      growthPotential,
      conclusion: this.generateConclusion()
    };
    
    return results;
  }

  async calculateAcquisitionScore() {
    // Analyse rapide pour score global /100
    const tracking = await this.detectTracking();
    const performance = await this.analyzePerformance();
    
    let trackingScore = 0;
    if (tracking.hasGTM) trackingScore += 15;
    if (tracking.hasPixels) trackingScore += 10;
    
    let performanceScore = 0;
    if (performance.speed > 70) performanceScore += 15;
    else if (performance.speed > 40) performanceScore += 10;
    
    // Estimation basique de conversion (structure du site)
    const conversionScore = 15; // Default moyen
    
    // Estimation economics (présence e-commerce)
    const economicsScore = 12; // Default moyen
    
    const global = trackingScore + performanceScore + conversionScore + economicsScore;
    
    return { global, trackingScore, performanceScore, conversionScore, economicsScore };
  }

  async calculateDetailedScores() {
    const acquisition = await this.calculateAcquisitionScore();
    
    return {
      tracking: Math.min(25, acquisition.trackingScore),
      performance: Math.min(25, acquisition.performanceScore),
      conversion: Math.min(25, acquisition.conversionScore),
      economics: Math.min(25, acquisition.economicsScore)
    };
  }

  async analyzePerformance() {
    try {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      
      const startTime = Date.now();
      await page.goto(this.url, { waitUntil: 'networkidle' });
      const loadTime = Date.now() - startTime;
      
      const metrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0];
        return {
          loadTime: navigation.loadEventEnd - navigation.loadEventStart,
          domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart
        };
      });
      
      await browser.close();
      
      const speed = Math.max(0, 100 - Math.round(loadTime / 100));
      const performanceLevel = this.getPerformanceLevel(speed);
      
      return {
        speed,
        loadTime: loadTime / 1000,
        mobileOptimized: await this.checkMobileOptimization(),
        performanceLevel
      };
    } catch (error) {
      return {
        speed: 50,
        loadTime: 3,
        mobileOptimized: false,
        performanceLevel: 'lent',
        error: error.message
      };
    }
  }

  async detectTracking() {
    try {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      
      await page.goto(this.url, { waitUntil: 'networkidle' });
      
      const tracking = await page.evaluate(() => {
        const trackers = {
          gtm: !!window.dataLayer,
          ga4: !!window.gtag,
          facebook: !!window.fbq,
          linkedin: !!window.lintrk,
          tiktok: !!window.ttq,
          googleAds: !!window.google_trackConversion
        };
        
        return {
          hasGTM: trackers.gtm,
          hasPixels: Object.values(trackers).some(Boolean),
          detected: Object.entries(trackers)
            .filter(([key, detected]) => detected)
            .map(([key]) => key)
        };
      });
      
      await browser.close();
      
      const impact = this.getTrackingImpact(tracking);
      
      return {
        ...tracking,
        impact
      };
    } catch (error) {
      return {
        hasGTM: false,
        hasPixels: false,
        detected: [],
        impact: 'Tracking non analysable',
        error: error.message
      };
    }
  }

  async generateQuickWins(acquisitionScore, tracking, performance) {
    const wins = [];
    
    // Quick Win 1: Tracking
    if (!tracking.hasGTM) {
      wins.push({
        title: "Installer Google Tag Manager",
        explanation: "Centraliser tous les pixels et tracking events",
        impact: "élevé",
        effort: "faible"
      });
    }
    
    // Quick Win 2: Performance
    if (performance.speed < 70) {
      wins.push({
        title: "Optimiser la vitesse de chargement",
        explanation: "Réduire le temps de chargement sous 2 secondes",
        impact: "élevé",
        effort: "moyen"
      });
    }
    
    // Quick Win 3: Tracking complet
    if (tracking.detected.length < 3) {
      wins.push({
        title: "Compléter le tracking conversion",
        explanation: "Ajouter les événements d'achat et panier",
        impact: "élevé",
        effort: "faible"
      });
    }
    
    // Quick Win 4: Mobile
    if (!performance.mobileOptimized) {
      wins.push({
        title: "Optimiser pour le mobile",
        explanation: "Assurer une expérience mobile fluide",
        impact: "moyen",
        effort: "moyen"
      });
    }
    
    // Quick Win 5: CTA
    wins.push({
      title: "Optimiser les appels à l'action",
      explanation: "Renforcer les boutons CTA et formulaires",
      impact: "moyen",
      effort: "faible"
    });
    
    return wins.slice(0, 5);
  }

  async estimateGrowthPotential(acquisitionScore, detailedScores) {
    // Estimation basée sur le score global uniquement
    const globalScore = acquisitionScore.global;
    
    let potentialImprovement;
    if (globalScore < 40) {
      potentialImprovement = "+50% à +120%";
    } else if (globalScore < 60) {
      potentialImprovement = "+20% à +50%";
    } else if (globalScore < 80) {
      potentialImprovement = "+20% à +35%";
    } else {
      potentialImprovement = "+20% à +30%";
    }
    
    // Explication du potentiel
    const explanation = this.getPotentialExplanation(globalScore, detailedScores);
    
    return {
      potentialImprovement,
      explanation,
      confidence: globalScore > 50 ? 'élevée' : 'moyenne'
    };
  }

  generateConclusion() {
    return {
      summary: "Cet audit rapide identifie les principales opportunités d'optimisation de votre acquisition.",
      nextSteps: [
        "Un audit StratAds complet permet d'analyser en profondeur :",
        "• Vos campagnes publicitaires",
        "• Votre tunnel de conversion", 
        "• Vos données analytics",
        "• La rentabilité réelle de votre acquisition"
      ],
      callToAction: "Audit complet StratAds - Analyse complète acquisition"
    };
  }

  // Méthodes utilitaires
  getMaturityLevel(score) {
    if (score < 40) return 'chaotique';
    if (score < 60) return 'structuré';
    if (score < 80) return 'data-driven';
    return 'scaling ready';
  }

  getPotentialImprovement(score) {
    if (score < 40) return 'Système fragile - Optimisations majeures possibles';
    if (score < 60) return 'Système fonctionnel mais inefficace';
    if (score < 80) return 'Système structuré - Optimisations ciblées';
    return 'Système mature - Optimisations fines possibles';
  }

  getPerformanceLevel(speed) {
    if (speed > 80) return 'rapide';
    if (speed > 60) return 'correct';
    if (speed > 40) return 'lent';
    return 'très lent';
  }

  getTrackingImpact(tracking) {
    if (!tracking.hasGTM) {
      return 'Absence de tracking = données incomplètes, remarketing impossible';
    }
    if (tracking.detected.length < 2) {
      return 'Tracking limité = optimisation publicitaire restreinte';
    }
    return 'Tracking présent = base solide pour optimisation';
  }

  getPotentialExplanation(globalScore, detailedScores) {
    const weaknesses = [];
    
    if (detailedScores.tracking < 15) weaknesses.push("tracking incomplet");
    if (detailedScores.performance < 15) weaknesses.push("performance lente");
    if (detailedScores.conversion < 15) weaknesses.push("conversion faible");
    if (detailedScores.economics < 15) weaknesses.push("structure economics non optimisée");
    
    if (weaknesses.length === 0) {
      return "Votre système d'acquisition est bien structuré. Des optimisations fines pourraient améliorer le ROI.";
    } else if (weaknesses.length === 1) {
      return `Une amélioration du ${weaknesses[0]} pourrait significativement augmenter la performance marketing.`;
    } else {
      return `Plusieurs améliorations identifiées (${weaknesses.join(', ')}) permettraient d'optimiser considérablement votre acquisition.`;
    }
  }

  async checkMobileOptimization() {
    try {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(this.url, { waitUntil: 'networkidle' });
      
      const isOptimized = await page.evaluate(() => {
        const hasViewport = document.querySelector('meta[name="viewport"]');
        const isResponsive = window.innerWidth <= 375;
        return hasViewport && isResponsive;
      });
      
      await browser.close();
      return isOptimized;
    } catch (error) {
      return false;
    }
  }
}
