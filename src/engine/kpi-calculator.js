/**
 * STRATADS KPI CALCULATOR - Calcul des KPI essentiels business
 * ROAS, CPA, LTV/CAC, Conversion Rate, etc.
 */

export class KpiCalculator {
  
  /**
   * ROAS = revenue / ad spend
   */
  static calculateROAS(revenue, adSpend) {
    if (!adSpend || adSpend === 0) return 0;
    return revenue / adSpend;
  }

  /**
   * CPA = ad spend / conversions
   */
  static calculateCPA(adSpend, conversions) {
    if (!conversions || conversions === 0) return 0;
    return adSpend / conversions;
  }

  /**
   * Conversion Rate = conversions / sessions
   */
  static calculateConversionRate(conversions, sessions) {
    if (!sessions || sessions === 0) return 0;
    return (conversions / sessions) * 100;
  }

  /**
   * Customer Acquisition Cost
   */
  static calculateCAC(totalMarketingSpend, newCustomers) {
    if (!newCustomers || newCustomers === 0) return 0;
    return totalMarketingSpend / newCustomers;
  }

  /**
   * Lifetime Value
   */
  static calculateLTV(averageOrderValue, purchaseFrequency, margin) {
    return averageOrderValue * purchaseFrequency * (margin / 100);
  }

  /**
   * LTV/CAC Ratio
   */
  static calculateLTVCACRatio(ltv, cac) {
    if (!cac || cac === 0) return 0;
    return ltv / cac;
  }

  /**
   * Revenue Per Visitor
   */
  static calculateRevenuePerVisitor(revenue, sessions) {
    if (!sessions || sessions === 0) return 0;
    return revenue / sessions;
  }

  /**
   * Analyse complète des KPI avec benchmarks
   */
  static analyzeKPIs(data) {
    const {
      revenue = 0,
      adSpend = 0,
      conversions = 0,
      sessions = 0,
      newCustomers = conversions,
      averageOrderValue = 0,
      purchaseFrequency = 1,
      margin = 30
    } = data;

    const kpis = {
      roas: this.calculateROAS(revenue, adSpend),
      cpa: this.calculateCPA(adSpend, conversions),
      conversionRate: this.calculateConversionRate(conversions, sessions),
      cac: this.calculateCAC(adSpend, newCustomers),
      ltv: this.calculateLTV(averageOrderValue, purchaseFrequency, margin),
      ltvCacRatio: 0,
      revenuePerVisitor: this.calculateRevenuePerVisitor(revenue, sessions)
    };

    kpis.ltvCacRatio = this.calculateLTVCACRatio(kpis.ltv, kpis.cac);

    // Ajout des benchmarks et interprétations
    kpis.analysis = this.getBenchmarkAnalysis(kpis);
    kpis.healthScore = this.calculateHealthScore(kpis);

    return kpis;
  }

  /**
   * Analyse par rapport aux benchmarks du marché
   */
  static getBenchmarkAnalysis(kpis) {
    const analysis = {};

    // ROAS Analysis
    if (kpis.roas < 2) {
      analysis.roas = { status: 'critical', message: 'Non rentable - urgent', benchmark: '< 2' };
    } else if (kpis.roas < 3) {
      analysis.roas = { status: 'warning', message: 'Rentable mais fragile', benchmark: '2-3' };
    } else if (kpis.roas < 5) {
      analysis.roas = { status: 'good', message: 'Bon système', benchmark: '3-5' };
    } else {
      analysis.roas = { status: 'excellent', message: 'Très performant', benchmark: '> 5' };
    }

    // Conversion Rate Analysis (e-commerce)
    if (kpis.conversionRate < 1) {
      analysis.conversionRate = { status: 'critical', message: 'Très mauvais', benchmark: '< 1%' };
    } else if (kpis.conversionRate < 2) {
      analysis.conversionRate = { status: 'warning', message: 'Faible', benchmark: '1-2%' };
    } else if (kpis.conversionRate < 3) {
      analysis.conversionRate = { status: 'average', message: 'Moyen', benchmark: '2-3%' };
    } else if (kpis.conversionRate < 5) {
      analysis.conversionRate = { status: 'good', message: 'Bon', benchmark: '3-5%' };
    } else {
      analysis.conversionRate = { status: 'excellent', message: 'Excellent', benchmark: '> 5%' };
    }

    // LTV/CAC Ratio Analysis
    if (kpis.ltvCacRatio < 1.5) {
      analysis.ltvCacRatio = { status: 'critical', message: 'Danger - non scalable', benchmark: '< 1.5' };
    } else if (kpis.ltvCacRatio < 2) {
      analysis.ltvCacRatio = { status: 'warning', message: 'Rentable', benchmark: '2' };
    } else if (kpis.ltvCacRatio < 3) {
      analysis.ltvCacRatio = { status: 'good', message: 'Très bon', benchmark: '3' };
    } else {
      analysis.ltvCacRatio = { status: 'excellent', message: 'Scaling possible', benchmark: '> 4' };
    }

    return analysis;
  }

  /**
   * Score de santé global 0-100
   */
  static calculateHealthScore(kpis) {
    let score = 0;
    let factors = 0;

    // ROAS (30%)
    if (kpis.roas > 5) score += 30;
    else if (kpis.roas > 3) score += 25;
    else if (kpis.roas > 2) score += 20;
    else if (kpis.roas > 1) score += 10;
    factors++;

    // Conversion Rate (25%)
    if (kpis.conversionRate > 5) score += 25;
    else if (kpis.conversionRate > 3) score += 20;
    else if (kpis.conversionRate > 2) score += 15;
    else if (kpis.conversionRate > 1) score += 10;
    factors++;

    // LTV/CAC Ratio (25%)
    if (kpis.ltvCacRatio > 4) score += 25;
    else if (kpis.ltvCacRatio > 3) score += 20;
    else if (kpis.ltvCacRatio > 2) score += 15;
    else if (kpis.ltvCacRatio > 1.5) score += 10;
    factors++;

    // CPA (20%)
    if (kpis.cpa > 0 && kpis.cpa < 50) score += 20;
    else if (kpis.cpa < 100) score += 15;
    else if (kpis.cpa < 200) score += 10;
    factors++;

    return Math.round(score);
  }

  /**
   * Calcul du potentiel de scaling
   */
  static calculateScalingPotential(kpis) {
    const { roas, ltvCacRatio, conversionRate } = kpis;
    
    let scalingScore = 0;
    
    // ROAS stability
    if (roas > 3) scalingScore += 30;
    else if (roas > 2) scalingScore += 20;
    else if (roas > 1) scalingScore += 10;
    
    // LTV/CAC ratio
    if (ltvCacRatio > 4) scalingScore += 40;
    else if (ltvCacRatio > 3) scalingScore += 30;
    else if (ltvCacRatio > 2) scalingScore += 20;
    else if (ltvCacRatio > 1.5) scalingScore += 10;
    
    // Conversion stability
    if (conversionRate > 3) scalingScore += 30;
    else if (conversionRate > 2) scalingScore += 20;
    else if (conversionRate > 1) scalingScore += 10;
    
    return {
      score: scalingScore,
      level: scalingScore > 80 ? 'excellent' : scalingScore > 60 ? 'good' : scalingScore > 40 ? 'limited' : 'poor',
      canScale: scalingScore > 60
    };
  }

  /**
   * Calcul de la perte d'argent
   */
  static calculateLostRevenue(kpis, optimizationPotential = 0.3) {
    const { revenue, roas, healthScore } = kpis;
    
    if (!revenue || revenue === 0) return 0;
    
    // Perte basée sur le score de santé
    const lostPercentage = (100 - healthScore) / 100 * optimizationPotential;
    const lostRevenue = revenue * lostPercentage;
    
    return {
      currentRevenue: revenue,
      lostRevenue: Math.round(lostRevenue),
      potentialRevenue: Math.round(revenue + lostRevenue),
      lostPercentage: Math.round(lostPercentage * 100),
      optimizationPotential
    };
  }
}
