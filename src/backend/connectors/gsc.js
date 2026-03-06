const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

class GSCConnector {
  constructor(serviceAccountPath, siteUrl) {
    this.serviceAccountPath = serviceAccountPath;
    this.siteUrl = siteUrl;
    this.auth = null;
  }

  async authenticate() {
    try {
      const auth = new GoogleAuth({
        keyFile: this.serviceAccountPath,
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
      });
      this.auth = await auth.getClient();
      return true;
    } catch (error) {
      console.error('[GSC] Auth error:', error.message);
      return false;
    }
  }

  async fetchData(dateRange = '28d', endDate) {
    if (!this.auth) {
      const ok = await this.authenticate();
      if (!ok) throw new Error('Authentication failed');
    }

    const resolvedEndDate = endDate || new Date().toISOString().split('T')[0];
    const client = google.searchconsole({ version: 'v1', auth: this.auth });

    try {
      // 1. Get site info
      const site = await client.sites.get({ siteUrl: this.siteUrl });

      // 2. Fetch analytics data
      const analytics = await client.searchanalytics.query({
        siteUrl: this.siteUrl,
        requestBody: {
          startDate: this._getStartDate(dateRange),
          endDate: resolvedEndDate,
          dimensions: ['QUERY', 'PAGE'],
          rowLimit: 1000
        }
      });

      // 3. Fetch top queries
      const topQueries = await client.searchanalytics.query({
        siteUrl: this.siteUrl,
        requestBody: {
          startDate: this._getStartDate(dateRange),
          endDate: resolvedEndDate,
          dimensions: ['QUERY'],
          rowLimit: 20
        }
      });

      // 4. Fetch top pages
      const topPages = await client.searchanalytics.query({
        siteUrl: this.siteUrl,
        requestBody: {
          startDate: this._getStartDate(dateRange),
          endDate: resolvedEndDate,
          dimensions: ['PAGE'],
          rowLimit: 20
        }
      });

      // Process the data
      const allRows = analytics.data.rows || [];
      let totalClicks = 0;
      let totalImpressions = 0;
      let totalPosition = 0;

      allRows.forEach(row => {
        totalClicks += row.clicks || 0;
        totalImpressions += row.impressions || 0;
        totalPosition += row.position || 0;
      });

      const avgPosition = totalImpressions > 0 ? totalPosition / totalImpressions : 0;
      const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

      return {
        status: 'ok',
        site: {
          url: this.siteUrl,
          permissionLevel: site.data.permissionLevel
        },
        dateRange,
        metrics: {
          clicks: totalClicks,
          impressions: totalImpressions,
          ctr: Math.round(ctr * 100) / 100,
          position: Math.round(avgPosition * 100) / 100
        },
        topQueries: this._parseTopQueries(topQueries.data.rows || []),
        topPages: this._parseTopPages(topPages.data.rows || []),
        evidence: `Data fetched from GSC for ${this.siteUrl} over ${dateRange}`,
        confidence: 'HIGH'
      };

    } catch (error) {
      console.error('[GSC] Data fetch error:', error.message);
      return {
        status: 'error',
        error: error.message,
        evidence: `Failed to fetch data from GSC for ${this.siteUrl}`,
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

  _parseTopQueries(rows) {
    return rows.map(row => ({
      query: row.keys[0],
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: Math.round((row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0) * 100) / 100,
      position: Math.round(row.position * 100) / 100,
      opportunity: this._calculateOpportunity(row)
    })).sort((a, b) => b.opportunity - a.opportunity);
  }

  _parseTopPages(rows) {
    return rows.map(row => ({
      page: row.keys[0],
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: Math.round((row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0) * 100) / 100,
      position: Math.round(row.position * 100) / 100
    }));
  }

  _calculateOpportunity(row) {
    // Simple opportunity score: high impressions + low position
    const positionScore = Math.max(0, 20 - (row.position || 0));
    const impressionScore = Math.min(10, (row.impressions || 0) / 100);
    return Math.round((positionScore + impressionScore) * 100) / 100;
  }

  static async testConnection(serviceAccountPath, siteUrl) {
    if (!serviceAccountPath || !siteUrl) {
      return { success: false, error: 'Service account path and site URL are required' };
    }

    try {
      const connector = new GSCConnector(serviceAccountPath, siteUrl);
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

module.exports = { GSCConnector };
