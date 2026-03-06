const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

class GA4Connector {
  constructor(serviceAccountPath, propertyId) {
    this.serviceAccountPath = serviceAccountPath;
    this.propertyId = propertyId;
    this.auth = null;
  }

  async authenticate() {
    try {
      const auth = new GoogleAuth({
        keyFile: this.serviceAccountPath,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly']
      });
      this.auth = await auth.getClient();
      return true;
    } catch (error) {
      console.error('[GA4] Auth error:', error.message);
      return false;
    }
  }

  async fetchData(dateRange = '28d') {
    if (!this.auth) {
      const ok = await this.authenticate();
      if (!ok) throw new Error('Authentication failed');
    }

    const adminClient = google.analyticsadmin({ version: 'v1beta', auth: this.auth });
    const dataClient = google.analyticsdata({ version: 'v1beta', auth: this.auth });

    try {
      // 1. Get property info to validate access
      const property = await adminClient.properties.get({ name: `properties/${this.propertyId}` });
      
      // 2. Run a report for sessions and conversions
      const report = await dataClient.properties.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{ startDate: this._getStartDate(dateRange), endDate: 'today' }],
        metrics: [
          { name: 'sessions' },
          { name: 'conversions' },
          { name: 'totalRevenue' }
        ],
        dimensions: [
          { name: 'date' }
        ]
      });

      // 3. Run a report for top pages
      const pagesReport = await dataClient.properties.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{ startDate: this._getStartDate(dateRange), endDate: 'today' }],
        metrics: [
          { name: 'sessions' },
          { name: 'conversions' }
        ],
        dimensions: [
          { name: 'pagePath' },
          { name: 'pageTitle' }
        ],
        orderBys: [
          { metric: { metricName: 'sessions' }, desc: true }
        ],
        limit: 10
      });

      // 4. Run a report for channels
      const channelsReport = await dataClient.properties.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{ startDate: this._getStartDate(dateRange), endDate: 'today' }],
        metrics: [
          { name: 'sessions' },
          { name: 'conversions' }
        ],
        dimensions: [
          { name: 'sessionDefaultChannelGroup' }
        ]
      });

      return {
        status: 'ok',
        property: {
          name: property.data.displayName,
          id: this.propertyId
        },
        dateRange,
        metrics: this._parseReport(report),
        topPages: this._parsePagesReport(pagesReport),
        channels: this._parseChannelsReport(channelsReport),
        evidence: `Data fetched from GA4 property ${this.propertyId} for ${dateRange}`,
        confidence: 'HIGH'
      };

    } catch (error) {
      console.error('[GA4] Data fetch error:', error.message);
      return {
        status: 'error',
        error: error.message,
        evidence: `Failed to fetch data from GA4 property ${this.propertyId}`,
        confidence: 'LOW'
      };
    }
  }

  _getStartDate(range) {
    const now = new Date();
    // Handle Nd format (e.g. "10d", "28d", "90d", "365d")
    const daysMatch = String(range || '').match(/^(\d+)d$/);
    if (daysMatch) {
      const days = parseInt(daysMatch[1], 10);
      const d = new Date(now);
      d.setDate(d.getDate() - days);
      return d.toISOString().split('T')[0];
    }
    if (range === '12m') {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d.toISOString().split('T')[0];
    }
    // Fallback: 28 days ago
    const d = new Date(now);
    d.setDate(d.getDate() - 28);
    return d.toISOString().split('T')[0];
  }

  _parseReport(report) {
    const rows = report.data.rows || [];
    let totalSessions = 0;
    let totalConversions = 0;
    let totalRevenue = 0;

    rows.forEach(row => {
      totalSessions += parseInt(row.metricValues[0].value) || 0;
      totalConversions += parseInt(row.metricValues[1].value) || 0;
      totalRevenue += parseFloat(row.metricValues[2].value) || 0;
    });

    return {
      sessions: totalSessions,
      conversions: totalConversions,
      revenue: totalRevenue
    };
  }

  _parsePagesReport(report) {
    const rows = report.data.rows || [];
    return rows.map(row => ({
      page: row.dimensionValues[0].value,
      title: row.dimensionValues[1].value,
      sessions: parseInt(row.metricValues[0].value) || 0,
      conversions: parseInt(row.metricValues[1].value) || 0
    }));
  }

  _parseChannelsReport(report) {
    const rows = report.data.rows || [];
    return rows.map(row => ({
      channel: row.dimensionValues[0].value,
      sessions: parseInt(row.metricValues[0].value) || 0,
      conversions: parseInt(row.metricValues[1].value) || 0
    }));
  }

  static async testConnection(serviceAccountPath, propertyId) {
    if (!serviceAccountPath || !propertyId) {
      return { success: false, error: 'Service account path and property ID are required' };
    }

    try {
      const connector = new GA4Connector(serviceAccountPath, propertyId);
      const authOk = await connector.authenticate();
      if (!authOk) {
        return { success: false, error: 'Authentication failed' };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = { GA4Connector };
