/**
 * STRATADS - QUICK WINS ENGINE
 * Génère des quick wins data-driven sans chevauchement
 * Basé uniquement sur forecastInputsFinal et les données réelles
 */

class QuickWinsEngine {
  constructor(forecastInputs, auditResults) {
    this.inputs = forecastInputs;
    this.results = auditResults;
    this.wins = [];
  }

  generate() {
    this.wins = [];
    
    // 1. Quick Win: CPC Optimization (si données Ads disponibles)
    this.addCpcOptimizationWin();
    
    // 2. Quick Win: Conversion Rate Improvement (si CR détecté)
    this.addCroWin();
    
    // 3. Quick Win: Budget Reallocation (si allocation déséquilibrée)
    this.addBudgetReallocationWin();
    
    // 4. Quick Win: Missing Tracking (si tracking incomplet)
    this.addTrackingWin();
    
    // 5. Quick Win: SEO Quick Fixes (basé sur crawl, pas sur forecast)
    this.addSeoQuickWins();
    
    // Trier par impact décroissant
    return this.wins.sort((a, b) => this.impactValue(b.impact) - this.impactValue(a.impact));
  }

  addCpcOptimizationWin() {
    const cpc = this.inputs?.baseline?.cpc;
    const adsBudget = this.inputs?.budget?.allocation?.googleAds + this.inputs?.budget?.allocation?.metaAds;
    
    if (!cpc || !adsBudget || adsBudget <= 0) {
      this.wins.push({
        title: '💰 Optimisation CPC',
        observation: 'Données Ads insuffisantes pour calculer le CPC actuel',
        proof: 'CPC non détecté dans les imports CSV/API',
        impact: 'N/A',
        effort: 'Faible',
        action: 'Importer les données Google Ads/Meta Ads pour activer cette analyse',
        potential: 0,
        confidence: 'LOW',
        source: 'baseline.cpc'
      });
      return;
    }
    
    // Si CPC > 2€, opportunité d'optimisation
    if (cpc > 2) {
      const potentialGain = Math.round((cpc - 1.5) / cpc * 100); // Réduction à 1.5€
      this.wins.push({
        title: '💰 Réduction CPC',
        observation: `CPC actuel de ${cpc.toFixed(2)}€ supérieur au benchmark (1.5€)`,
        proof: `CPC calculé: ${cpc.toFixed(2)}€, Budget ads: ${adsBudget}% du total`,
        impact: 'Élevé',
        effort: 'Moyen',
        action: 'Optimiser les audiences, ajouter des mots-clés négatifs, améliorer le Quality Score',
        potential: potentialGain,
        confidence: this.inputs?.baseline?.cpc?.confidence || 'MEDIUM',
        source: 'baseline.cpc'
      });
    }
  }

  addCroWin() {
    const cr = this.inputs?.metrics?.conversionRate?.value;
    const sessions = this.inputs?.baseline?.sessions?.value;
    
    if (!cr || cr <= 0) {
      this.wins.push({
        title: '🎯 Optimisation Conversion',
        observation: 'Taux de conversion non détecté ou égal à 0',
        proof: 'Conversion rate: N/A dans les données GA4/GSC',
        impact: 'Élevé',
        effort: 'Moyen',
        action: 'Configurer le tracking des conversions dans GA4 ou GTM',
        potential: 50, // Potentiel estimé si pas de tracking
        confidence: 'LOW',
        source: 'metrics.conversionRate'
      });
      return;
    }
    
    // Si CR < 2%, forte opportunité CRO
    if (cr < 2) {
      const potentialGain = Math.round((2 - cr) / cr * 100);
      this.wins.push({
        title: '🎯 Amélioration Taux de Conversion',
        observation: `Taux de conversion actuel: ${cr.toFixed(2)}% (benchmark: 2-3%)`,
        proof: `${sessions != null ? sessions.toLocaleString() : 'N/A'} sessions/mois, ${cr.toFixed(2)}% conversion = ${sessions != null ? Math.round(sessions * cr / 100) : 'N/A'} conversions`,
        impact: 'Élevé',
        effort: 'Moyen',
        action: 'Audit UX, simplification du funnel, A/B testing sur les CTA principaux',
        potential: potentialGain,
        confidence: this.inputs?.metrics?.conversionRate?.confidence || 'MEDIUM',
        source: 'metrics.conversionRate'
      });
    }
  }

  addBudgetReallocationWin() {
    const allocation = this.inputs?.budget?.allocation;
    if (!allocation) return;
    
    const total = allocation.seo + allocation.googleAds + allocation.metaAds + allocation.social + allocation.content + allocation.abTest;
    
    // Si une catégorie dépasse 50%, déséquilibre
    const maxAlloc = Math.max(...Object.values(allocation));
    const maxKey = Object.entries(allocation).find(([k, v]) => v === maxAlloc)?.[0];
    
    if (maxAlloc > 50) {
      this.wins.push({
        title: '⚖️ Rééquilibrage Budget Marketing',
        observation: `Allocation de ${maxAlloc}% sur ${maxKey}, déséquilibre détecté`,
        proof: `Répartition actuelle: SEO ${allocation.seo}%, Ads ${allocation.googleAds + allocation.metaAds}%, Social ${allocation.social}%`,
        impact: 'Moyen',
        effort: 'Faible',
        action: `Redistribuer 10-15% du budget ${maxKey} vers les canaux sous-investis`,
        potential: 15,
        confidence: 'HIGH',
        source: 'budget.allocation'
      });
    }
  }

  addTrackingWin() {
    const tracking = this.results?.marketing?.tracking;
    if (!tracking) return;
    
    const missingTools = [];
    if (!tracking.ga4?.present) missingTools.push('GA4');
    if (!tracking.gtm?.present) missingTools.push('GTM');
    if (!tracking.meta?.present) missingTools.push('Meta Pixel');
    
    if (missingTools.length > 0) {
      this.wins.push({
        title: '📡 Installation Tracking',
        observation: `${missingTools.length} outil(s) de tracking manquant(s): ${missingTools.join(', ')}`,
        proof: `Tracking détecté: ${Object.entries(tracking).filter(([k, v]) => v?.present).map(([k]) => k).join(', ') || 'Aucun'}`,
        impact: 'Élevé',
        effort: 'Faible',
        action: `Installer ${missingTools.join(' + ')} pour mesurer les conversions et optimiser les campagnes`,
        potential: 30,
        confidence: 'HIGH',
        source: 'marketing.tracking'
      });
    }
  }

  addSeoQuickWins() {
    const pages = this.results?.technical?.crawl?.pages || [];
    if (pages.length === 0) return;
    
    const pagesWithoutTitle = pages.filter(p => !p.title || p.title.length < 10).length;
    const pagesWithoutMeta = pages.filter(p => !p.metaDescription || p.metaDescription.length < 50).length;
    
    if (pagesWithoutTitle > 0 || pagesWithoutMeta > 0) {
      this.wins.push({
        title: '🔍 SEO Quick Wins',
        observation: `${pagesWithoutTitle} pages sans titre optimisé, ${pagesWithoutMeta} sans meta description`,
        proof: `Sur ${pages.length} pages crawlées: ${pagesWithoutTitle} titres manquants, ${pagesWithoutMeta} descriptions manquantes`,
        impact: 'Moyen',
        effort: 'Faible',
        action: 'Ajouter les balises title et meta description sur les pages identifiées',
        potential: Math.min(25, pagesWithoutTitle * 2),
        confidence: 'HIGH',
        source: 'technical.crawl.pages'
      });
    }
  }

  impactValue(impact) {
    const values = { 'Élevé': 3, 'Moyen': 2, 'Faible': 1, 'N/A': 0 };
    return values[impact] || 0;
  }
}

module.exports = { QuickWinsEngine };
