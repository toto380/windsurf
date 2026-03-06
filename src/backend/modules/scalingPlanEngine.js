/**
 * STRATADS - SCALING PLAN ENGINE
 * Génère un plan de scaling data-driven
 * Basé sur private quand présent, sinon public
 */

class ScalingPlanEngine {
  constructor(forecastInputs, auditResults, auditType) {
    this.inputs = forecastInputs;
    this.results = auditResults;
    this.auditType = auditType;
    this.hasPrivateData = !!forecastInputs?.baseline?.sessions?.value;
  }

  generate() {
    // Mode de base: PRIVATE si données disponibles, sinon PUBLIC
    const baseMode = this.hasPrivateData ? 'private' : 'public';
    
    const plan = {
      baseMode,
      dataSource: this.hasPrivateData ? 'Données privées (GA4/GSC/Ads)' : 'Données publiques (crawl, benchmarks)',
      phases: this.generatePhases(),
      kpis: this.generateKPIs(),
      budget: this.generateBudgetPlan(),
      milestones: this.generateMilestones()
    };
    
    return plan;
  }

  generatePhases() {
    const phases = [];
    const cr = this.inputs?.metrics?.conversionRate?.value || 0;
    const tracking = this.results?.marketing?.tracking;
    
    // Phase 1: Fondation (toujours présente)
    phases.push({
      name: 'Phase 1: Fondation',
      duration: '1-2 mois',
      focus: this.hasPrivateData ? 'Tracking & Optimisation' : 'Setup & Mesure',
      actions: this.hasPrivateData 
        ? ['Vérifier tracking GA4/GTM', 'Optimiser les campagnes actuelles', 'Fixer les erreurs techniques']
        : ['Installer GA4/GTM', 'Setup tracking conversions', 'Audit technique complet'],
      investment: this.hasPrivateData ? 'Maintenance' : 'Setup initial',
      expectedGain: this.hasPrivateData ? '+10-15%' : 'Baseline établie'
    });
    
    // Phase 2: Croissance
    phases.push({
      name: 'Phase 2: Croissance',
      duration: '2-4 mois',
      focus: cr < 2 ? 'CRO & Acquisition' : 'Scaling Acquisition',
      actions: cr < 2 
        ? ['A/B testing landing pages', 'Optimisation funnel', 'Campagnes lookalike']
        : ['Scale budget Ads', 'SEO content', 'Remarketing avancé'],
      investment: this.hasPrivateData ? '+30% budget' : 'Budget conservateur',
      expectedGain: this.hasPrivateData ? '+25-40%' : '+15-25%'
    });
    
    // Phase 3: Accélération (uniquement si données privées)
    if (this.hasPrivateData) {
      phases.push({
        name: 'Phase 3: Accélération',
        duration: '4-6 mois',
        focus: 'Maximisation ROAS',
        actions: ['Automatisation campagnes', 'Multi-canal avancé', 'Expansion géographique'],
        investment: '+50% budget (si ROAS > 3)',
        expectedGain: '+40-60%'
      });
    }
    
    return phases;
  }

  generateKPIs() {
    const kpis = {
      primary: [],
      secondary: []
    };
    
    const sessions = this.inputs?.baseline?.sessions?.value;
    const cr = this.inputs?.metrics?.conversionRate?.value;
    const aov = this.inputs?.metrics?.aov?.value;
    
    // KPIs primaires basés sur les données disponibles
    if (sessions) {
      kpis.primary.push({
        name: 'Trafic',
        baseline: sessions,
        target3m: Math.round(sessions * 1.2),
        target6m: Math.round(sessions * 1.5),
        source: this.inputs?.baseline?.sessions?.source
      });
    }
    
    if (cr && aov) {
      const conversions = Math.round(sessions * cr / 100);
      const revenue = Math.round(conversions * aov);
      
      kpis.primary.push({
        name: 'Revenus',
        baseline: revenue,
        target3m: Math.round(revenue * 1.3),
        target6m: Math.round(revenue * 1.8),
        source: 'calculated'
      });
      
      kpis.secondary.push({
        name: 'Panier moyen',
        baseline: aov,
        target3m: Math.round(aov * 1.05),
        target6m: Math.round(aov * 1.1),
        source: this.inputs?.metrics?.aov?.source
      });
    }
    
    // ROAS si données Ads
    const roas = this.results?.ads?.normalized?.kpis?.roas;
    if (roas) {
      kpis.primary.push({
        name: 'ROAS',
        baseline: roas,
        target3m: Math.max(roas * 1.2, 3),
        target6m: Math.max(roas * 1.4, 4),
        source: 'ads.normalized.kpis'
      });
    }
    
    return kpis;
  }

  generateBudgetPlan() {
    // Répartition recommandée selon le mode (sans budget total)
    const recommendedAllocation = this.hasPrivateData 
      ? { seo: 25, googleAds: 35, metaAds: 25, social: 8, content: 5, abTest: 2 }
      : { seo: 40, googleAds: 20, metaAds: 15, social: 15, content: 8, abTest: 2 };
    
    return {
      status: 'recommendation_only',
      message: 'Budget marketing retiré - plan basé sur des estimations benchmark',
      estimatedBudget: this.hasPrivateData ? '5000-10000€/mois' : '2000-5000€/mois',
      recommendedAllocation
    };
  }

  generateMilestones() {
    const milestones = [];
    const cr = this.inputs?.metrics?.conversionRate?.value;
    
    // Milestone 1: Tracking complet
    milestones.push({
      month: 1,
      name: 'Tracking Complet',
      criteria: 'GA4 + GTM + Conversions configurés',
      critical: !this.hasPrivateData
    });
    
    // Milestone 2: CRO baseline
    if (cr && cr < 2) {
      milestones.push({
        month: 2,
        name: 'CRO Baseline',
        criteria: 'Taux de conversion stabilisé à 2%+',
        critical: true
      });
    }
    
    // Milestone 3: Break-even Ads
    const roas = this.results?.ads?.normalized?.kpis?.roas;
    if (roas && roas < 3) {
      milestones.push({
        month: 3,
        name: 'ROAS Cible',
        criteria: 'ROAS > 3 atteint sur les campagnes principales',
        critical: true
      });
    }
    
    // Milestone 4: Scaling ready
    milestones.push({
      month: this.hasPrivateData ? 4 : 6,
      name: 'Scaling Ready',
      criteria: this.hasPrivateData 
        ? 'ROAS stable > 3 + CRO > 2% + Budget extensible'
        : 'Tracking complet + Funnel optimisé + Premiers résultats',
      critical: true
    });
    
    return milestones;
  }
}

module.exports = { ScalingPlanEngine };
