/**
 * STRATADS - ADS IMPORTER
 * Parse CSV Google Ads et Meta Ads sans OAuth
 * Règles: valeurs manquantes = "Non disponible", pas d'invention de chiffres
 */

const fs = require('fs-extra');
const path = require('path');

class AdsImporter {
  constructor() {
    this.errors = [];
  }

  /**
   * Parse un fichier CSV Google Ads (export campagnes)
   * Colonnes attendues: Campaign, Ad group, Impressions, Clicks, Cost, Conversions, Conv. value
   */
  async parseGoogleAdsCSV(csvPath) {
    try {
      if (!await fs.pathExists(csvPath)) {
        return { imported: false, campaigns: [], totals: this.getEmptyTotals(), error: 'Fichier non trouvé' };
      }

      const content = await fs.readFile(csvPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      if (lines.length < 2) {
        return { imported: false, campaigns: [], totals: this.getEmptyTotals(), error: 'CSV vide ou invalide' };
      }

      // Détecter le séparateur (virgule ou point-virgule)
      const separator = content.includes(';') ? ';' : ',';
      const headers = this.parseCSVLine(lines[0], separator).map(h => h.trim().toLowerCase());
      
      // Mapping flexible des colonnes
      const colMap = {
        campaign: this.findColumn(headers, ['campaign', 'campagne', 'nom de la campagne']),
        adGroup: this.findColumn(headers, ['ad group', 'groupe d\'annonces']),
        impressions: this.findColumn(headers, ['impressions', 'impr.']),
        clicks: this.findColumn(headers, ['clics', 'clicks', 'clic']),
        cost: this.findColumn(headers, ['coût', 'cost', 'montant dépensé', 'amount spent']),
        conversions: this.findColumn(headers, ['conversions', 'conv.', 'conversions', 'résultats', 'results']),
        value: this.findColumn(headers, ['valeur de conv.', 'conv. value', 'conversion value', 'valeur'])
      };

      const campaigns = [];
      let campaignMap = new Map();

      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i], separator);
        if (values.length < 3) continue;

        const campaignName = colMap.campaign >= 0 ? values[colMap.campaign]?.trim() : '';
        if (!campaignName) continue;

        const impressions = this.parseNumber(values[colMap.impressions]);
        const clicks = this.parseNumber(values[colMap.clicks]);
        const cost = this.parseCost(values[colMap.cost]);
        const conversions = this.parseNumber(values[colMap.conversions]);
        const value = this.parseCost(values[colMap.value]);

        // Agréger par campagne
        if (!campaignMap.has(campaignName)) {
          campaignMap.set(campaignName, {
            name: campaignName,
            impressions: 0,
            clicks: 0,
            spend: 0,
            conversions: 0,
            value: 0
          });
        }

        const camp = campaignMap.get(campaignName);
        camp.impressions += impressions;
        camp.clicks += clicks;
        camp.spend += cost;
        camp.conversions += conversions;
        camp.value += value;
      }

      // Convertir en array et calculer KPIs
      for (const [name, data] of campaignMap) {
        campaigns.push({
          name: data.name,
          impressions: data.impressions || 'Non disponible',
          clicks: data.clicks || 'Non disponible',
          spend: data.spend > 0 ? data.spend : 'Non disponible',
          conversions: data.conversions || 'Non disponible',
          value: data.value > 0 ? data.value : 'Non disponible',
          ctr: data.impressions > 0 ? ((data.clicks / data.impressions) * 100).toFixed(2) + '%' : 'Non disponible',
          cpc: data.clicks > 0 ? (data.spend / data.clicks).toFixed(2) + '€' : 'Non disponible',
          cpa: data.conversions > 0 ? (data.spend / data.conversions).toFixed(2) + '€' : 'Non disponible',
          roas: (data.value > 0 && data.spend > 0) ? (data.value / data.spend).toFixed(2) : 'Non disponible'
        });
      }

      // Calculer les totaux
      const totals = this.calculateTotals(campaigns);

      return {
        imported: campaigns.length > 0,
        campaigns: campaigns.slice(0, 50), // Limiter à 50 campagnes
        totals,
        count: campaigns.length
      };

    } catch (error) {
      this.errors.push(`Google Ads CSV: ${error.message}`);
      return { imported: false, campaigns: [], totals: this.getEmptyTotals(), error: error.message };
    }
  }

  /**
   * Parse un fichier CSV Meta Ads (Facebook/Instagram)
   * Colonnes attendues: Campaign name, Impressions, Clicks, Amount spent, Results, Cost per result
   */
  async parseMetaAdsCSV(csvPath) {
    try {
      if (!await fs.pathExists(csvPath)) {
        return { imported: false, campaigns: [], totals: this.getEmptyTotals(), error: 'Fichier non trouvé' };
      }

      const content = await fs.readFile(csvPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      if (lines.length < 2) {
        return { imported: false, campaigns: [], totals: this.getEmptyTotals(), error: 'CSV vide ou invalide' };
      }

      const separator = content.includes(';') ? ';' : ',';
      const headers = this.parseCSVLine(lines[0], separator).map(h => h.trim().toLowerCase());
      
      // Mapping flexible des colonnes Meta
      const colMap = {
        campaign: this.findColumn(headers, ['campaign name', 'campagne', 'nom de la campagne']),
        impressions: this.findColumn(headers, ['impressions', 'impr.']),
        clicks: this.findColumn(headers, ['clics', 'clicks', 'clic', 'link clicks']),
        spend: this.findColumn(headers, ['montant dépensé', 'amount spent', 'coût', 'cost', 'dépenses']),
        results: this.findColumn(headers, ['résultats', 'results', 'conversions']),
        cpr: this.findColumn(headers, ['coût par résultat', 'cost per result', 'cpa']),
        value: this.findColumn(headers, ['value', 'valeur', 'purchase value'])
      };

      const campaigns = [];
      let campaignMap = new Map();

      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i], separator);
        if (values.length < 3) continue;

        const campaignName = colMap.campaign >= 0 ? values[colMap.campaign]?.trim() : '';
        if (!campaignName) continue;

        const impressions = this.parseNumber(values[colMap.impressions]);
        const clicks = this.parseNumber(values[colMap.clicks]);
        const spend = this.parseCost(values[colMap.spend]);
        const conversions = this.parseNumber(values[colMap.results]);
        const value = this.parseCost(values[colMap.value]);

        if (!campaignMap.has(campaignName)) {
          campaignMap.set(campaignName, {
            name: campaignName,
            impressions: 0,
            clicks: 0,
            spend: 0,
            conversions: 0,
            value: 0
          });
        }

        const camp = campaignMap.get(campaignName);
        camp.impressions += impressions;
        camp.clicks += clicks;
        camp.spend += spend;
        camp.conversions += conversions;
        camp.value += value;
      }

      for (const [name, data] of campaignMap) {
        campaigns.push({
          name: data.name,
          impressions: data.impressions || 'Non disponible',
          clicks: data.clicks || 'Non disponible',
          spend: data.spend > 0 ? data.spend : 'Non disponible',
          conversions: data.conversions || 'Non disponible',
          value: data.value > 0 ? data.value : 'Non disponible',
          ctr: data.impressions > 0 ? ((data.clicks / data.impressions) * 100).toFixed(2) + '%' : 'Non disponible',
          cpc: data.clicks > 0 ? (data.spend / data.clicks).toFixed(2) + '€' : 'Non disponible',
          cpa: data.conversions > 0 ? (data.spend / data.conversions).toFixed(2) + '€' : 'Non disponible',
          roas: (data.value > 0 && data.spend > 0) ? (data.value / data.spend).toFixed(2) : 'Non disponible'
        });
      }

      const totals = this.calculateTotals(campaigns);

      return {
        imported: campaigns.length > 0,
        campaigns: campaigns.slice(0, 50),
        totals,
        count: campaigns.length
      };

    } catch (error) {
      this.errors.push(`Meta Ads CSV: ${error.message}`);
      return { imported: false, campaigns: [], totals: this.getEmptyTotals(), error: error.message };
    }
  }

  /**
   * Calcule les KPIs consolidés entre Google Ads et Meta Ads
   */
  computeKPIs(googleData, metaData) {
    const googleSpend = this.extractNumber(googleData?.totals?.spend);
    const metaSpend = this.extractNumber(metaData?.totals?.spend);
    const googleValue = this.extractNumber(googleData?.totals?.value);
    const metaValue = this.extractNumber(metaData?.totals?.value);
    const googleClicks = this.extractNumber(googleData?.totals?.clicks);
    const metaClicks = this.extractNumber(metaData?.totals?.clicks);
    const googleImpressions = this.extractNumber(googleData?.totals?.impressions);
    const metaImpressions = this.extractNumber(metaData?.totals?.impressions);
    const googleConversions = this.extractNumber(googleData?.totals?.conversions);
    const metaConversions = this.extractNumber(metaData?.totals?.conversions);

    const totalSpend = googleSpend + metaSpend;
    const totalValue = googleValue + metaValue;
    const totalClicks = googleClicks + metaClicks;
    const totalImpressions = googleImpressions + metaImpressions;
    const totalConversions = googleConversions + metaConversions;

    return {
      roas: totalSpend > 0 && totalValue > 0 ? (totalValue / totalSpend).toFixed(2) : 'Non disponible',
      cpa: totalSpend > 0 && totalConversions > 0 ? (totalSpend / totalConversions).toFixed(2) + '€' : 'Non disponible',
      cpc: totalSpend > 0 && totalClicks > 0 ? (totalSpend / totalClicks).toFixed(2) + '€' : 'Non disponible',
      cpm: totalSpend > 0 && totalImpressions > 0 ? ((totalSpend / totalImpressions) * 1000).toFixed(2) + '€' : 'Non disponible',
      ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) + '%' : 'Non disponible',
      cr: totalClicks > 0 && totalConversions > 0 ? ((totalConversions / totalClicks) * 100).toFixed(2) + '%' : 'Non disponible',
      totalSpend: totalSpend > 0 ? totalSpend.toFixed(2) + '€' : 'Non disponible',
      totalValue: totalValue > 0 ? totalValue.toFixed(2) + '€' : 'Non disponible'
    };
  }

  // === Helpers privés ===

  parseCSVLine(line, separator = ',') {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === separator && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    values.push(current.trim());
    return values;
  }

  findColumn(headers, possibleNames) {
    for (const name of possibleNames) {
      const idx = headers.findIndex(h => h.includes(name.toLowerCase()));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  parseNumber(value) {
    if (!value) return 0;
    const cleaned = String(value).replace(/[^\d.-]/g, '').replace(/\.(?=.*\.)/g, '');
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? 0 : num;
  }

  parseCost(value) {
    if (!value) return 0;
    // Gérer formats: 1 234,56 € | $1,234.56 | 1234.56
    const cleaned = String(value)
      .replace(/[^\d.,-]/g, '')
      .replace(/\s/g, '')
      .replace(',', '.');
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? 0 : num;
  }

  extractNumber(value) {
    if (typeof value === 'number') return value;
    if (!value || value === 'Non disponible') return 0;
    const num = parseFloat(String(value).replace(/[^\d.-]/g, ''));
    return Number.isNaN(num) ? 0 : num;
  }

  getEmptyTotals() {
    return {
      spend: 'Non disponible',
      clicks: 'Non disponible',
      impressions: 'Non disponible',
      conversions: 'Non disponible',
      value: 'Non disponible'
    };
  }

  calculateTotals(campaigns) {
    if (!campaigns || campaigns.length === 0) {
      return this.getEmptyTotals();
    }

    let spend = 0, clicks = 0, impressions = 0, conversions = 0, value = 0;
    let hasSpend = false, hasValue = false;

    for (const camp of campaigns) {
      const s = this.extractNumber(camp.spend);
      const c = this.extractNumber(camp.clicks);
      const i = this.extractNumber(camp.impressions);
      const conv = this.extractNumber(camp.conversions);
      const v = this.extractNumber(camp.value);

      if (s > 0) { spend += s; hasSpend = true; }
      if (c > 0) clicks += c;
      if (i > 0) impressions += i;
      if (conv > 0) conversions += conv;
      if (v > 0) { value += v; hasValue = true; }
    }

    return {
      spend: hasSpend ? spend.toFixed(2) + '€' : 'Non disponible',
      clicks: clicks > 0 ? clicks : 'Non disponible',
      impressions: impressions > 0 ? impressions : 'Non disponible',
      conversions: conversions > 0 ? conversions : 'Non disponible',
      value: hasValue ? value.toFixed(2) + '€' : 'Non disponible'
    };
  }
}

module.exports = { AdsImporter };
