const { GA4Connector } = require('../connectors/ga4.js');
const { GSCConnector } = require('../connectors/gsc.js');
const { GTMConnector } = require('../connectors/gtm.js');
const { GoogleAdsConnector } = require('../connectors/googleAds.js');
const { MetaAdsConnector } = require('../connectors/metaAds.js');

class ApiOrchestrator {
    constructor(params) {
      this.params = params;
      this.results = {
        ads: {}
      };
    }

  async fetchAllData() {
    const promises = [];

    // GA4
    if (this.params.serviceAccountData && this.params.ga4PropertyId) {
      promises.push(this._fetchGA4());
    }

    // GSC
    if (this.params.serviceAccountData && this.params.gscSiteUrl) {
      promises.push(this._fetchGSC());
    }

    // GTM
    if (this.params.serviceAccountData && this.params.gtmAccountId && this.params.gtmContainerId) {
      promises.push(this._fetchGTM());
    }

    // Google Ads - Use CSV file
    if (this.params.googleAdsCSV && this.params.googleAdsCSV.length > 0) {
      promises.push(this._fetchGoogleAds());
    }

    // Meta Ads - Use CSV file
    if (this.params.metaAdsCSV && this.params.metaAdsCSV.length > 0) {
      promises.push(this._fetchMetaAds());
    }

    // Execute all API calls in parallel
    await Promise.allSettled(promises);

    // Calculate aggregated KPIs
    this._calculateKPIs();

    return this.results;
  }

  async _fetchGA4() {
    try {
      const connector = new GA4Connector(
        this.params.serviceAccountData.path,
        this.params.ga4PropertyId
      );
      
      // Use analysisPeriodDays - PAS de fallback (validation stricte)
      const days = this.params.analysisPeriodDays;
      if (!days || days < 1 || days > 365) {
        throw new Error('analysisPeriodDays est requis et doit être entre 1 et 365 jours');
      }
      const dateRange = `${days}d`;
      const data = await connector.fetchData(dateRange);
      this.results.ga4 = data;
    } catch (error) {
      console.error('[API Orchestrator] GA4 error:', error.message);
      this.results.ga4 = {
        status: 'error',
        error: error.message,
        evidence: 'Failed to fetch GA4 data',
        confidence: 'LOW'
      };
    }
  }

  async _fetchGSC() {
    try {
      const connector = new GSCConnector(
        this.params.serviceAccountData.path,
        this.params.gscSiteUrl
      );
      
      // Use analysisPeriodDays - PAS de fallback (validation stricte)
      const days = this.params.analysisPeriodDays;
      if (!days || days < 1 || days > 365) {
        throw new Error('analysisPeriodDays est requis et doit être entre 1 et 365 jours');
      }
      const dateRange = `${days}d`;
      const data = await connector.fetchData(dateRange);
      this.results.gsc = data;
    } catch (error) {
      console.error('[API Orchestrator] GSC error:', error.message);
      this.results.gsc = {
        status: 'error',
        error: error.message,
        evidence: 'Failed to fetch GSC data',
        confidence: 'LOW'
      };
    }
  }

  async _fetchGTM() {
    try {
      const connector = new GTMConnector(
        this.params.serviceAccountData.path,
        this.params.gtmAccountId,
        this.params.gtmContainerId
      );
      
      const data = await connector.fetchData();
      this.results.gtm = data;
    } catch (error) {
      console.error('[API Orchestrator] GTM error:', error.message);
      this.results.gtm = {
        status: 'error',
        error: error.message,
        evidence: 'Failed to fetch GTM data',
        confidence: 'LOW'
      };
    }
  }

  async _fetchGoogleAds() {
    try {
      // Ensure results object exists
      if (!this.results) {
        this.results = {};
      }
      if (!this.results.adsApi) {
        this.results.adsApi = {};
      }
      
      // Use the first CSV file path
      const csvPath = Array.isArray(this.params.googleAdsCSV) 
        ? this.params.googleAdsCSV[0] 
        : this.params.googleAdsCSV;
        
      const connector = new GoogleAdsConnector(csvPath);
      const data = await connector.fetchData();
      
      // Store in new adsApi structure
      this.results.adsApi.google = {
        ...data,
        source: 'api',
        importDate: new Date().toISOString()
      };
      
      // Keep backward compatibility
      this.results.googleAds = data;
    } catch (error) {
      console.error('[API Orchestrator] Google Ads error:', error.message);
      
      // Ensure results object exists for error case
      if (!this.results) {
        this.results = {};
      }
      if (!this.results.adsApi) {
        this.results.adsApi = {};
      }
      
      this.results.adsApi.google = {
        status: 'error',
        error: error.message,
        evidence: 'Failed to import Google Ads CSV data',
        confidence: 'LOW'
      };
      this.results.googleAds = this.results.adsApi.google;
    }
  }

  async _fetchMetaAds() {
    try {
      // Ensure results object exists
      if (!this.results) {
        this.results = {};
      }
      if (!this.results.adsApi) {
        this.results.adsApi = {};
      }
      
      // Use the first CSV file path
      const csvPath = Array.isArray(this.params.metaAdsCSV) 
        ? this.params.metaAdsCSV[0] 
        : this.params.metaAdsCSV;
        
      const connector = new MetaAdsConnector(csvPath);
      const data = await connector.fetchData();
      
      // Store in new adsApi structure
      this.results.adsApi.meta = {
        ...data,
        source: 'api',
        importDate: new Date().toISOString()
      };
      
      // Keep backward compatibility
      this.results.metaAds = data;
    } catch (error) {
      console.error('[API Orchestrator] Meta Ads error:', error.message);
      
      // Ensure results object exists for error case
      if (!this.results) {
        this.results = {};
      }
      if (!this.results.adsApi) {
        this.results.adsApi = {};
      }
      
      this.results.adsApi.meta = {
        status: 'error',
        error: error.message,
        evidence: 'Failed to import Meta Ads CSV data',
        confidence: 'LOW'
      };
      this.results.metaAds = this.results.adsApi.meta;
    }
  }

  _calculateKPIs() {
    const kpis = {
      roas: 'Non disponible',
      cpa: 'Non disponible',
      cpc: 'Non disponible',
      cpm: 'Non disponible',
      ctr: 'Non disponible',
      cr: 'Non disponible'
    };

    // Calculate from Google Ads (new adsApi structure)
    const googleAds = this.results.adsApi?.google || this.results.googleAds;
    if (googleAds?.status === 'ok') {
      const metrics = googleAds.metrics;
      kpis.roas = metrics.roas !== 0 ? Math.round(metrics.roas * 100) / 100 : 'Non disponible';
      kpis.cpa = metrics.cpa > 0 ? Math.round(metrics.cpa * 100) / 100 : 'Non disponible';
      kpis.cpc = metrics.cpc > 0 ? Math.round(metrics.cpc * 100) / 100 : 'Non disponible';
      kpis.ctr = metrics.ctr > 0 ? Math.round(metrics.ctr * 100) / 100 : 'Non disponible';
    }

    // Calculate from Meta Ads (new adsApi structure)
    const metaAds = this.results.adsApi?.meta || this.results.metaAds;
    if (metaAds?.status === 'ok') {
      const metrics = metaAds.metrics;
      
      // Use Meta values if Google values are not available
      if (kpis.roas === 'Non disponible' && metrics.roas !== 0) {
        kpis.roas = Math.round(metrics.roas * 100) / 100;
      }
      if (kpis.cpa === 'Non disponible' && metrics.cpa > 0) {
        kpis.cpa = Math.round(metrics.cpa * 100) / 100;
      }
      if (kpis.cpc === 'Non disponible' && metrics.cpc > 0) {
        kpis.cpc = Math.round(metrics.cpc * 100) / 100;
      }
      if (kpis.ctr === 'Non disponible' && metrics.ctr > 0) {
        kpis.ctr = Math.round(metrics.ctr * 100) / 100;
      }
    }

    // Calculate conversion rate
    if (this.results.ga4?.status === 'ok' && this.results.ga4.metrics.sessions > 0) {
      const cr = (this.results.ga4.metrics.conversions / this.results.ga4.metrics.sessions) * 100;
      kpis.cr = Math.round(cr * 100) / 100;
    }

    // Calculate CPM from Google Ads
    if (googleAds?.status === 'ok' && googleAds.metrics.impressions > 0) {
      const cpm = (googleAds.metrics.cost / googleAds.metrics.impressions) * 1000;
      kpis.cpm = Math.round(cpm * 100) / 100;
    } else if (metaAds?.status === 'ok' && metaAds.metrics.impressions > 0) {
      const cpm = (metaAds.metrics.spend / metaAds.metrics.impressions) * 1000;
      kpis.cpm = Math.round(cpm * 100) / 100;
    }

    this.results.kpis = kpis;
  }

  static async testConnections(params) {
    const results = {};

    // Test GA4
    if (params.serviceAccountData && params.ga4PropertyId) {
      results.ga4 = await GA4Connector.testConnection(
        params.serviceAccountData.path,
        params.ga4PropertyId
      );
    }

    // Test GSC
    if (params.serviceAccountData && params.gscSiteUrl) {
      results.gsc = await GSCConnector.testConnection(
        params.serviceAccountData.path,
        params.gscSiteUrl
      );
    }

    // Test GTM
    if (params.serviceAccountData && params.gtmAccountId) {
      results.gtm = await GTMConnector.testConnection(
        params.serviceAccountData.path,
        params.gtmAccountId,
        params.gtmContainerId
      );
    }

    // Test Google Ads - Use CSV file
    if (params.googleAdsCSV && params.googleAdsCSV.length > 0) {
      const csvPath = Array.isArray(params.googleAdsCSV) 
        ? params.googleAdsCSV[0] 
        : params.googleAdsCSV;
      results.googleAds = await GoogleAdsConnector.testConnection(csvPath);
    }

    // Test Meta Ads - Use CSV file
    if (params.metaAdsCSV && params.metaAdsCSV.length > 0) {
      const csvPath = Array.isArray(params.metaAdsCSV) 
        ? params.metaAdsCSV[0] 
        : params.metaAdsCSV;
      results.metaAds = await MetaAdsConnector.testConnection(csvPath);
    }

    return results;
  }
};
