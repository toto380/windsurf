const fs = require('fs-extra');
const path = require('path');

class MetaAdsConnector {
  constructor(csvFilePath, periodDays = null) {
    this.csvFilePath = csvFilePath;
    this.periodDays = periodDays;
  }

  async fetchData() {
    if (!this.csvFilePath) {
      return {
        status: 'error',
        error: 'No CSV file provided',
        evidence: 'Meta Ads CSV file not selected',
        confidence: 'LOW'
      };
    }

    try {
      // Check if file exists
      const exists = await fs.pathExists(this.csvFilePath);
      if (!exists) {
        return {
          status: 'error',
          error: 'CSV file not found',
          evidence: `Meta Ads CSV file not found at ${this.csvFilePath}`,
          confidence: 'LOW'
        };
      }

      // Read and parse CSV file
      const csvContent = await fs.readFile(this.csvFilePath, 'utf-8');
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        return {
          status: 'error',
          error: 'CSV file is empty or invalid',
          evidence: 'Meta Ads CSV file has no data',
          confidence: 'LOW'
        };
      }

      // Parse CSV data (simplified implementation)
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const dataRows = lines.slice(1).map(line => 
        line.split(',').map(cell => cell.trim().replace(/"/g, ''))
      );

      // Filter by period if specified
      let filteredRows = dataRows;
      if (this.periodDays) {
        filteredRows = this._filterByPeriod(headers, dataRows);
      }

      // Extract metrics from CSV
      const metrics = this._extractMetrics(headers, filteredRows);
      const topCampaigns = this._extractTopCampaigns(headers, filteredRows);

      return {
        status: 'ok',
        account: {
          name: 'CSV Import',
          id: 'From CSV',
          status: 'IMPORTED'
        },
        dateRange: 'From CSV',
        metrics,
        topCampaigns,
        topAdSets: [], // Can be extracted if needed
        topAds: [], // Can be extracted if needed
        evidence: `Data imported from Meta Ads CSV file: ${path.basename(this.csvFilePath)}`,
        confidence: 'HIGH'
      };

    } catch (error) {
      console.error('[MetaAds] CSV import error:', error.message);
      return {
        status: 'error',
        error: error.message,
        evidence: `Failed to parse Meta Ads CSV file: ${path.basename(this.csvFilePath)}`,
        confidence: 'LOW'
      };
    }
  }

  _filterByPeriod(headers, dataRows) {
    // Find date column index
    const dateIndex = headers.findIndex(h => 
      h.toLowerCase().includes('date') || 
      h.toLowerCase().includes('day') ||
      h.toLowerCase().includes('time')
    );
    
    if (dateIndex === -1) {
      // No date column found, return all rows
      return dataRows;
    }
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.periodDays);
    
    return dataRows.filter(row => {
      const dateStr = row[dateIndex];
      if (!dateStr) return false;
      
      const rowDate = new Date(dateStr);
      return !isNaN(rowDate.getTime()) && rowDate >= cutoffDate;
    });
  }

  _extractMetrics(headers, dataRows) {
    // Default values
    let totalSpend = 0;
    let totalClicks = 0;
    let totalImpressions = 0;
    let totalConversions = 0;
    let totalValue = 0;

    // Find column indices (Meta Ads uses different column names)
    const spendIndex = headers.findIndex(h => 
      h.toLowerCase().includes('spend') || h.toLowerCase().includes('amount spent')
    );
    const clicksIndex = headers.findIndex(h => h.toLowerCase().includes('click'));
    const impressionsIndex = headers.findIndex(h => h.toLowerCase().includes('impression'));
    const conversionsIndex = headers.findIndex(h => 
      h.toLowerCase().includes('conversion') || h.toLowerCase().includes('result')
    );
    const valueIndex = headers.findIndex(h => 
      h.toLowerCase().includes('purchase') || h.toLowerCase().includes('revenue')
    );

    // Sum up values from all rows
    dataRows.forEach(row => {
      if (spendIndex >= 0) totalSpend += parseFloat(row[spendIndex]) || 0;
      if (clicksIndex >= 0) totalClicks += parseFloat(row[clicksIndex]) || 0;
      if (impressionsIndex >= 0) totalImpressions += parseFloat(row[impressionsIndex]) || 0;
      if (conversionsIndex >= 0) totalConversions += parseFloat(row[conversionsIndex]) || 0;
      if (valueIndex >= 0) totalValue += parseFloat(row[valueIndex]) || 0;
    });

    // Calculate derived metrics
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
    const roas = totalSpend > 0 ? totalValue / totalSpend : 0;

    return {
      spend: Math.round(totalSpend * 100) / 100,
      clicks: Math.round(totalClicks),
      impressions: Math.round(totalImpressions),
      conversions: Math.round(totalConversions),
      value: Math.round(totalValue * 100) / 100,
      ctr: Math.round(ctr * 100) / 100,
      cpc: Math.round(cpc * 100) / 100,
      cpa: Math.round(cpa * 100) / 100,
      roas: Math.round(roas * 100) / 100
    };
  }

  _extractTopCampaigns(headers, dataRows) {
    // Find campaign name column
    const campaignIndex = headers.findIndex(h => 
      h.toLowerCase().includes('campaign') || h.toLowerCase().includes('campaign name')
    );
    
    if (campaignIndex === -1) return [];

    // Group by campaign
    const campaigns = {};
    const spendIndex = headers.findIndex(h => 
      h.toLowerCase().includes('spend') || h.toLowerCase().includes('amount spent')
    );
    const clicksIndex = headers.findIndex(h => h.toLowerCase().includes('click'));
    const impressionsIndex = headers.findIndex(h => h.toLowerCase().includes('impression'));
    const conversionsIndex = headers.findIndex(h => 
      h.toLowerCase().includes('conversion') || h.toLowerCase().includes('result')
    );

    dataRows.forEach(row => {
      const campaignName = row[campaignIndex] || 'Unknown Campaign';
      
      if (!campaigns[campaignName]) {
        campaigns[campaignName] = {
          name: campaignName,
          status: 'ACTIVE', // Default status for Meta
          spend: 0,
          clicks: 0,
          impressions: 0,
          conversions: 0,
          value: 0
        };
      }

      if (spendIndex >= 0) campaigns[campaignName].spend += parseFloat(row[spendIndex]) || 0;
      if (clicksIndex >= 0) campaigns[campaignName].clicks += parseFloat(row[clicksIndex]) || 0;
      if (impressionsIndex >= 0) campaigns[campaignName].impressions += parseFloat(row[impressionsIndex]) || 0;
      if (conversionsIndex >= 0) campaigns[campaignName].conversions += parseFloat(row[conversionsIndex]) || 0;
    });

    // Sort by spend and return top 10
    return Object.values(campaigns)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10)
      .map(campaign => ({
        ...campaign,
        spend: Math.round(campaign.spend * 100) / 100,
        clicks: Math.round(campaign.clicks),
        impressions: Math.round(campaign.impressions),
        conversions: Math.round(campaign.conversions),
        value: Math.round(campaign.value * 100) / 100
      }));
  }

  static async importFromCSV(csvFilePath, periodDays = null) {
    const connector = new MetaAdsConnector(csvFilePath, periodDays);
    return await connector.fetchData();
  }

  static async testConnection(csvFilePath) {
    if (!csvFilePath) {
      return { success: false, error: 'CSV file path is required' };
    }

    try {
      const connector = new MetaAdsConnector(csvFilePath);
      const exists = await fs.pathExists(csvFilePath);
      
      if (!exists) {
        return { success: false, error: 'CSV file not found' };
      }

      // Try to read first few lines to validate format
      const content = await fs.readFile(csvFilePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        return { success: false, error: 'CSV file appears to be empty' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = { MetaAdsConnector };
