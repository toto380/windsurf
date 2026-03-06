const { DataContract } = require('./dataContract.js');

const PERIOD_TO_MONTHS = {
  '3m': 3,
  '6m': 6,
  '12m': 12
};

class ForecastEngine {
  /**
   * @param {Object} inputs - The Unified Forecast Inputs (from AuditEngine)
   * @param {Object} settings - User settings (period, objectives, etc.)
   * @param {Object} results - Full audit results context
   */
  constructor(inputs, settings = {}, results = {}) {
    this.inputs = inputs;
    this.settings = {
      period: '3m',
      enableProjection: true, // Toggle simultané
      enableObjective: false, // Toggle simultané
      targetMetric: null,
      targetValue: null,
      ...settings
    };
    this.results = results;
    this.assumptions = [];
  }

  run() {
    // 1. Validate Data Availability
    if (!this.validateInputs()) {
      return this.buildDisabledOutput();
    }

    // 2. Prepare Variables
    const months = PERIOD_TO_MONTHS[this.settings.period] || 3;
    const baselineSessions = this.inputs.baseline.sessions.value;
    const currentCR = this.inputs.metrics.conversionRate.value / 100;
    const currentAOV = this.inputs.metrics.aov.value;
    const cpc = this.deriveCPC();
    
    // 3. Run enabled modes
    const output = {
      dataStatus: 'ok',
      settings: this.settings,
      assumptions: this.assumptions,
      confidence: this.inputs.baseline.sessions.confidence
    };

    // Projection Mode (if enabled)
    if (this.settings.enableProjection) {
      output.projection = this.runProjectionMode(baselineSessions, currentCR, currentAOV, cpc, months);
    }

    // Objective Mode (if enabled and target defined)
    if (this.settings.enableObjective && this.settings.targetValue > 0) {
      output.objective = this.runObjectiveMode(baselineSessions, currentCR, currentAOV, cpc);
    }

    return output;
  }

  validateInputs() {
    const sessions = this.inputs.baseline.sessions;
    // Check for null or undefined explicitly (not just falsy)
    if (!sessions || sessions.value === null || sessions.value === undefined || sessions.value <= 0) {
      this.assumptions.push('Trafic historique indisponible (Sessions = null ou 0).');
      return false;
    }
    
    // We allow running without revenue/spend, but traffic is mandatory for any traffic forecast.
    return true;
  }

  buildDisabledOutput() {
    return {
      ...DataContract.schemas.forecast,
      dataStatus: 'disabled',
      settings: this.settings,
      assumptions: [
        'Prévisions désactivées : Données insuffisantes.',
        'Connectez Google Analytics 4 ou Google Search Console pour activer les prévisions.',
        ...this.assumptions
      ]
    };
  }

  deriveCPC() {
    const ads = this.results.ads?.normalized?.kpis;
    
    if (ads && ads.cpc > 0) return ads.cpc;
    
    // If we have spend and clicks in baseline - check for null values
    const spendValue = this.inputs.baseline.spend.value;
    const clicksValue = this.results.ads?.normalized?.totals?.clicks;
    if (spendValue !== null && spendValue > 0 && clicksValue !== null && clicksValue > 0) {
      return spendValue / clicksValue;
    }

    return null; // Unavailable
  }

  runProjectionMode(baselineSessions, cr, aov, cpc, months) {
    // Scenarios: Conservative, Realistic, Ambitious
    // NOTE: Les facteurs de croissance sont FIXES, basés uniquement sur les données business
    // Aucune influence du score d'audit ou du crawl technique
    
    // 1. Organic Growth (SEO, Content, Social) - Facteurs fixes sans heuristique
    const organicGrowthFactors = {
      conservative: 1.0,      // x1.0 = flat (pas de croissance)
      realistic: 1.005,       // x1.005 = +0.5% par mois (croissance organique modeste)
      ambitious: 1.015        // x1.015 = +1.5% par mois (avec efforts SEO/content)
    };

    // 2. Apply CRO assumptions (explicitly marked)
    const croAssumptions = {
      conservative: 0,      // No CRO improvement
      realistic: 0.05,       // +5% CRO (ASSUMPTION)
      ambitious: 0.15      // +15% CRO (ASSUMPTION)
    };

    // Generate Timelines - CRO marked as ASSUMPTION
    const scenarios = {
      conservative: this.projectTimeline(baselineSessions, organicGrowthFactors.conservative, 0, months, cr * (1 + croAssumptions.conservative), aov),
      realistic: this.projectTimeline(baselineSessions, organicGrowthFactors.realistic, 0, months, cr * (1 + croAssumptions.realistic), aov),
      ambitious: this.projectTimeline(baselineSessions, organicGrowthFactors.ambitious, 0, months, cr * (1 + croAssumptions.ambitious), aov)
    };

    return {
      dataStatus: 'ok',
      mode: 'projection',
      settings: this.settings,
      scenarios: {
        conservative: scenarios.conservative.totals,
        realistic: scenarios.realistic.totals,
        ambitious: scenarios.ambitious.totals
      },
      timeline: {
        labels: Array.from({length: months}, (_, i) => `M${i+1}`),
        traffic: {
          conservative: scenarios.conservative.monthly.map(m => m.sessions),
          realistic: scenarios.realistic.monthly.map(m => m.sessions),
          ambitious: scenarios.ambitious.monthly.map(m => m.sessions)
        },
        revenue: {
          conservative: scenarios.conservative.monthly.map(m => m.revenue),
          realistic: scenarios.realistic.monthly.map(m => m.revenue),
          ambitious: scenarios.ambitious.monthly.map(m => m.revenue)
        }
      },
      assumptions: [
        `Période: ${months} mois`,
        `Baseline trafic: ${Math.round(baselineSessions)} sessions/mois`,
        cpc ? `Impact Paid: ~${Math.round(estimatedPaidSessions)} sessions ajoutées (CPC ${cpc.toFixed(2)}€)` : paidNote,
        `ASSUMPTION CRO: Réaliste (+5%), Ambitieux (+15%)`,
        ...this.assumptions
      ],
      confidence: this.inputs.baseline.sessions.confidence
    };
  }

  projectTimeline(baseSessions, growthFactor, paidSessions, months, cr, aov) {
    const monthly = [];
    let currentOrganic = baseSessions;
    let totalSessions = 0;
    let totalRevenue = 0;
    let totalConversions = 0;

    for (let i = 0; i < months; i++) {
      currentOrganic *= growthFactor;
      const monthSessions = currentOrganic + paidSessions;
      const monthConversions = monthSessions * cr;
      const monthRevenue = monthConversions * aov;

      monthly.push({
        sessions: Math.round(monthSessions),
        conversions: Math.round(monthConversions),
        revenue: Math.round(monthRevenue)
      });

      totalSessions += monthSessions;
      totalRevenue += monthRevenue;
      totalConversions += monthConversions;
    }

    return {
      monthly,
      totals: {
        sessions: Math.round(totalSessions),
        conversions: Math.round(totalConversions),
        revenue: Math.round(totalRevenue),
        cr: (cr * 100).toFixed(2)
      }
    };
  }

  runObjectiveMode(baselineSessions, currentCR, currentAOV, cpc) {
    const target = this.settings.targetValue;
    const metric = this.settings.targetMetric; // 'revenue', 'conversions', 'traffic'
    
    // We assume objective is MONTHLY target at end of period? Or TOTAL over period?
    // Let's assume MONTHLY target to reach.
    
    let requiredSessions = 0;
    let requiredConversions = 0;
    let requiredRevenue = 0;

    if (metric === 'revenue') {
      requiredRevenue = target;
      requiredConversions = currentAOV > 0 ? target / currentAOV : 0;
      requiredSessions = currentCR > 0 ? requiredConversions / currentCR : 0;
    } else if (metric === 'conversions') {
      requiredConversions = target;
      requiredRevenue = target * currentAOV;
      requiredSessions = currentCR > 0 ? target / currentCR : 0;
    } else if (metric === 'traffic') {
      requiredSessions = target;
      requiredConversions = target * currentCR;
      requiredRevenue = requiredConversions * currentAOV;
    }

    // Gap analysis
    const trafficGap = Math.max(0, requiredSessions - baselineSessions);
    
    // How to fill gap?
    // 1. CRO (Improve CR) - How much can we realistically improve?
    // 2. SEO (Organic Growth) - Slow
    // 3. Paid (Ads) - Fast, costs money

    // Strategy: 
    // - Assume 10% SEO growth (optimistic)
    // - Assume 20% CRO improvement (optimistic)
    // - Fill rest with Paid
    
    const optimizedCR = currentCR * 1.2; 
    const organicContribution = baselineSessions * 1.1; // 10% organic growth
    
    // Recalculate needed sessions with optimized CR (if revenue/conv goal)
    let neededSessionsForGoal = requiredSessions;
    if (metric !== 'traffic') {
      neededSessionsForGoal = metric === 'revenue' 
        ? (requiredRevenue / currentAOV) / optimizedCR
        : requiredConversions / optimizedCR;
    }

    const paidTrafficNeeded = Math.max(0, neededSessionsForGoal - organicContribution);
    let estimatedBudget = 0;
    let budgetNote = '';

    if (paidTrafficNeeded > 0) {
      if (cpc) {
        estimatedBudget = paidTrafficNeeded * cpc;
      } else {
        budgetNote = 'CPC inconnu, budget non estimable.';
      }
    }

    return {
      dataStatus: 'ok',
      mode: 'objective',
      settings: this.settings,
      target: {
        metric,
        value: target
      },
      requirements: {
        traffic: Math.round(neededSessionsForGoal),
        conversions: Math.round(metric === 'revenue' ? requiredRevenue / currentAOV : (metric === 'conversions' ? target : neededSessionsForGoal * optimizedCR)),
        revenue: Math.round(metric === 'revenue' ? target : (metric === 'conversions' ? target * currentAOV : neededSessionsForGoal * optimizedCR * currentAOV)),
        budget: estimatedBudget > 0 ? Math.round(estimatedBudget) : null,
        paidTraffic: Math.round(paidTrafficNeeded)
      },
      gapAnalysis: {
        trafficGap: Math.round(trafficGap),
        strategy: [
          `Croissance Organique: +10% (${Math.round(organicContribution - baselineSessions)} sessions)`,
          `Optimisation Conversion: +20% (CR ${ (currentCR*100).toFixed(2)}% -> ${(optimizedCR*100).toFixed(2)}%)`,
          `Acquisition Payante requise: ${Math.round(paidTrafficNeeded)} sessions`
        ]
      },
      assumptions: [
        `Objectif mensuel: ${target} ${metric}`,
        budgetNote,
        ...this.assumptions
      ],
      confidence: this.inputs.baseline.sessions.confidence
    };
  }
}

module.exports = { ForecastEngine };
