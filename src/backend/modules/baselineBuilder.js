/**
 * STRATADS - BASELINE BUILDER
 * Constructs the "Truth" baseline from available data sources.
 * NO FAKE DATA allowed.
 * 
 * Sources:
 * - GA4 (High confidence for sessions/conversions/revenue)
 * - GSC (Medium confidence proxy for sessions via clicks)
 * - Ads API/CSV (High confidence for spend/ROAS/CPA)
 */

class BaselineBuilder {
  constructor(apiResults, adsData) {
    this.apiResults = apiResults || {};
    this.adsData = adsData || {}; // ads.normalized structure
    
    // Default baseline structure
    this.baseline = {
      sessions: { value: null, source: 'unavailable', confidence: 'LOW', reason: 'No data' },
      conversions: { value: null, source: 'unavailable', confidence: 'LOW', reason: 'No data' },
      revenue: { value: null, source: 'unavailable', confidence: 'LOW', reason: 'No data' },
      spend: { value: null, source: 'unavailable', confidence: 'LOW', reason: 'No data' },
      
      // Derived metrics
      conversionRate: { value: null, source: 'unavailable', confidence: 'LOW' },
      aov: { value: null, source: 'unavailable', confidence: 'LOW' },
      cac: { value: null, source: 'unavailable', confidence: 'LOW' },
      roas: { value: null, source: 'unavailable', confidence: 'LOW' }
    };
  }

  build() {
    this._detectSessions();
    this._detectConversions();
    this._detectRevenue();
    this._detectSpend();
    
    this._calculateDerivedMetrics();
    
    return this.baseline;
  }

  _detectSessions() {
    // 1. GA4
    if (this.apiResults.ga4?.status === 'ok' && this.apiResults.ga4.metrics?.sessions !== undefined) {
      const val = Number(this.apiResults.ga4.metrics.sessions);
      if (!isNaN(val) && val > 0) {
        this.baseline.sessions = {
          value: val,
          source: 'GA4',
          confidence: 'HIGH'
        };
        return;
      }
    }

    // 2. GSC (Clicks as proxy)
    if (this.apiResults.gsc?.status === 'ok' && this.apiResults.gsc.metrics?.clicks !== undefined) {
      const val = Number(this.apiResults.gsc.metrics.clicks);
      if (!isNaN(val) && val > 0) {
        this.baseline.sessions = {
          value: val,
          source: 'GSC (Clicks Proxy)',
          confidence: 'MEDIUM',
          note: 'Organic clicks only'
        };
        return;
      }
    }
    
    this.baseline.sessions = {
      value: null,
      status: 'unavailable',
      source: 'unavailable',
      confidence: 'LOW',
      reason: 'Analytics disconnected (GA4/GSC)'
    };
  }

  _detectConversions() {
    let totalConversions = 0;
    let sources = [];
    let hasData = false;

    // 1. GA4 Conversions (Total)
    if (this.apiResults.ga4?.status === 'ok' && this.apiResults.ga4.metrics?.conversions !== undefined) {
      const val = Number(this.apiResults.ga4.metrics.conversions);
      if (!isNaN(val)) {
        totalConversions = val; // GA4 usually sees all conversions including Ads if linked
        sources.push('GA4');
        hasData = true;
      }
    }

    // 2. Fallback: Sum of Ads conversions if GA4 missing or zero
    if (!hasData && this.adsData.totals?.conversions > 0) {
      totalConversions = Number(this.adsData.totals.conversions);
      sources.push('Ads (API/CSV)');
      hasData = true;
    }

    if (hasData) {
      this.baseline.conversions = {
        value: totalConversions,
        source: sources.join(', '),
        confidence: sources.includes('GA4') ? 'HIGH' : 'MEDIUM'
      };
    } else {
      this.baseline.conversions = {
        value: null,
        status: 'unavailable',
        source: 'unavailable',
        confidence: 'LOW',
        reason: 'No conversion data found'
      };
    }
  }

  _detectRevenue() {
    let totalRevenue = 0;
    let sources = [];
    let hasData = false;

    // 1. GA4 Revenue
    // Note: 'eventValue' or 'totalRevenue' depending on connector mapping
    if (this.apiResults.ga4?.status === 'ok' && (this.apiResults.ga4.metrics?.totalRevenue !== undefined || this.apiResults.ga4.metrics?.eventValue !== undefined)) {
      const val = Number(this.apiResults.ga4.metrics.totalRevenue || this.apiResults.ga4.metrics.eventValue || 0);
      if (!isNaN(val) && val > 0) {
        totalRevenue = val;
        sources.push('GA4');
        hasData = true;
      }
    }

    // 2. Fallback: Ads Revenue if GA4 missing
    if (!hasData && this.adsData.totals?.value > 0) {
      totalRevenue = Number(this.adsData.totals.value);
      sources.push('Ads (API/CSV)');
      hasData = true;
    }

    if (hasData) {
      this.baseline.revenue = {
        value: totalRevenue,
        source: sources.join(', '),
        confidence: sources.includes('GA4') ? 'HIGH' : 'MEDIUM'
      };
    } else {
      this.baseline.revenue = {
        value: null,
        status: 'unavailable',
        source: 'unavailable',
        confidence: 'LOW',
        reason: 'No revenue data found'
      };
    }
  }

  _detectSpend() {
    // Spend comes primarily from Ads data
    if (this.adsData.totals?.spend !== undefined) {
      const val = Number(this.adsData.totals.spend);
      if (!isNaN(val) && val > 0) {
        this.baseline.spend = {
          value: val,
          source: 'Ads (API/CSV)',
          confidence: 'HIGH'
        };
        return;
      }
    }

    this.baseline.spend = {
      value: null,
      status: 'unavailable',
      source: 'unavailable',
      confidence: 'LOW',
      reason: 'No ads spend data'
    };
  }

  _calculateDerivedMetrics() {
    // Use null checks - don't convert null to 0 for calculations
    const sessions = this.baseline.sessions.value;
    const conversions = this.baseline.conversions.value;
    const revenue = this.baseline.revenue.value;
    const spend = this.baseline.spend.value;

    // 1. Conversion Rate - only calculate if we have real data
    if (sessions !== null && sessions > 0 && conversions !== null) {
      this.baseline.conversionRate = {
        value: (conversions / sessions) * 100, // Percentage
        source: 'Calculated (Conversions / Sessions)',
        confidence: this.baseline.sessions.confidence === 'HIGH' && this.baseline.conversions.confidence === 'HIGH' ? 'HIGH' : 'MEDIUM'
      };
    } else {
      this.baseline.conversionRate = {
        value: null,
        status: 'unavailable',
        source: 'unavailable',
        confidence: 'LOW',
        reason: sessions === null ? 'Sessions missing' : 'Sessions zero or unavailable'
      };
    }

    // 2. AOV (Average Order Value)
    if (conversions !== null && conversions > 0 && revenue !== null) {
      this.baseline.aov = {
        value: revenue / conversions,
        source: 'Calculated (Revenue / Conversions)',
        confidence: this.baseline.revenue.confidence === 'HIGH' ? 'HIGH' : 'MEDIUM'
      };
    } else {
      this.baseline.aov = {
        value: null,
        status: 'unavailable',
        source: 'unavailable',
        confidence: 'LOW',
        reason: conversions === null ? 'Conversions missing' : 'Conversions zero or unavailable'
      };
    }

    // 3. CAC (Customer Acquisition Cost) - Global
    if (conversions !== null && conversions > 0 && spend !== null && spend > 0) {
      this.baseline.cac = {
        value: spend / conversions,
        source: 'Calculated (Spend / Conversions)',
        confidence: 'MEDIUM'
      };
    } else {
      this.baseline.cac = {
        value: null,
        status: 'unavailable',
        source: 'unavailable',
        confidence: 'LOW',
        reason: spend === null ? 'Spend missing' : (conversions === null ? 'Conversions missing' : 'Data unavailable')
      };
    }

    // 4. ROAS (Return on Ad Spend)
    if (spend !== null && spend > 0 && revenue !== null) {
      this.baseline.roas = {
        value: revenue / spend,
        source: 'Calculated (Revenue / Spend)',
        confidence: this.baseline.revenue.confidence === 'HIGH' ? 'HIGH' : 'MEDIUM'
      };
    } else {
      this.baseline.roas = {
        value: null,
        status: 'unavailable',
        source: 'unavailable',
        confidence: 'LOW',
        reason: spend === null ? 'Spend missing' : 'Revenue missing'
      };
    }
  }
}

module.exports = { BaselineBuilder };
