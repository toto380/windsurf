/**
 * STRATADS - BASELINE AUTOSCAN PIPELINE
 *
 * 13-step pipeline triggered before the final audit.
 * Uses ONLY the global analysisPeriodDays — no separate period selector.
 *
 * RULES:
 * - NEVER invent data: if a metric is unmeasurable → value=null, status='unavailable'
 * - CSV rows outside the analysis period are excluded and logged
 * - Source priority: Manual > GA4 > Ads CSV > GSC > unavailable
 */

'use strict';

const { GA4Connector }        = require('../connectors/ga4.js');
const { GSCConnector }        = require('../connectors/gsc.js');
const { GoogleAdsConnector }  = require('../connectors/googleAds.js');
const { MetaAdsConnector }    = require('../connectors/metaAds.js');

// ─── Helpers ────────────────────────────────────────────────────────────────

function toNum(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function safeNum(v) {
  const n = toNum(v);
  return (n !== null && n > 0) ? n : null;
}

function computeDate(days) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate:   endDate.toISOString().split('T')[0]
  };
}

function unavailable(reason) {
  return { value: null, source: 'unavailable', confidence: 'LOW', status: 'unavailable', reason };
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

class BaselineAutoScan {
  /**
   * @param {object} params  - All UI params (analysisPeriodDays, serviceAccountData, …)
   * @param {function} log   - Log callback (msg: string) → void
   */
  constructor(params, log = console.log) {
    this.params   = params;
    this.log      = log;
    this.warnings = [];
    this.errors   = [];
    this.sourcesUsed = [];

    // Raw collected data
    this._ga4    = null;
    this._gsc    = null;
    this._googleAds = null;
    this._metaAds   = null;
  }

  // ── Step 1: validateAnalysisPeriod ──────────────────────────────────────
  _validateAnalysisPeriod() {
    const days = Number(this.params.analysisPeriodDays);
    if (!days || !Number.isFinite(days) || days < 1 || days > 365) {
      throw new Error('analysisPeriodDays est requis et doit être entre 1 et 365 jours');
    }
    this._days = days;
    const { startDate, endDate } = computeDate(days);
    this._startDate = startDate;
    this._endDate   = endDate;
    this.log(`✅ Période d'analyse : ${days} jours (${startDate} → ${endDate})`);
  }

  // ── Step 2: validateInputs ──────────────────────────────────────────────
  _validateInputs() {
    const p = this.params;
    const hasGA4 = !!(p.serviceAccountData?.path && p.ga4PropertyId);
    const hasGSC = !!(p.serviceAccountData?.path && p.gscSiteUrl);
    const hasGoogleCsv = !!(p.googleAdsCSV && (Array.isArray(p.googleAdsCSV) ? p.googleAdsCSV[0] : p.googleAdsCSV));
    const hasMetaCsv   = !!(p.metaAdsCSV   && (Array.isArray(p.metaAdsCSV)   ? p.metaAdsCSV[0]   : p.metaAdsCSV));
    const hasManual    = Object.values(p.metricsConfig || {}).some(v => v !== null && v !== undefined);

    if (!hasGA4 && !hasGSC && !hasGoogleCsv && !hasMetaCsv && !hasManual) {
      throw new Error('Aucune source de données disponible. Configurez GA4, GSC, ou importez un CSV Ads.');
    }

    if (hasGA4)         this.log('🔌 GA4 configuré');
    if (hasGSC)         this.log('🔌 GSC configuré');
    if (hasGoogleCsv)   this.log('📄 Google Ads CSV disponible');
    if (hasMetaCsv)     this.log('📄 Meta Ads CSV disponible');
    if (!hasGoogleCsv)  { this.log('⚠️ Google Ads CSV absent'); this.warnings.push('Google Ads CSV absent'); }
    if (!hasMetaCsv)    { this.log('⚠️ Meta Ads CSV absent');  this.warnings.push('Meta Ads CSV absent'); }

    this._hasGA4       = hasGA4;
    this._hasGSC       = hasGSC;
    this._hasGoogleCsv = hasGoogleCsv;
    this._hasMetaCsv   = hasMetaCsv;
  }

  // ── Step 3: testConnections ─────────────────────────────────────────────
  async _testConnections() {
    const p = this.params;

    if (this._hasGA4) {
      try {
        const r = await GA4Connector.testConnection(p.serviceAccountData.path, p.ga4PropertyId);
        if (r.success) this.log('✅ GA4 connecté');
        else { this.log(`⚠️ GA4 connexion échouée : ${r.error}`); this.warnings.push(`GA4 : ${r.error}`); this._hasGA4 = false; }
      } catch (e) {
        this.log(`⚠️ GA4 test échoué : ${e.message}`);
        this.warnings.push(`GA4 test : ${e.message}`);
        this._hasGA4 = false;
      }
    }

    if (this._hasGSC) {
      try {
        const r = await GSCConnector.testConnection(p.serviceAccountData.path, p.gscSiteUrl);
        if (r.success) this.log('✅ GSC connecté');
        else { this.log(`⚠️ GSC connexion échouée : ${r.error}`); this.warnings.push(`GSC : ${r.error}`); this._hasGSC = false; }
      } catch (e) {
        this.log(`⚠️ GSC test échoué : ${e.message}`);
        this.warnings.push(`GSC test : ${e.message}`);
        this._hasGSC = false;
      }
    }
  }

  // ── Step 4: collectGa4Data ──────────────────────────────────────────────
  async _collectGa4Data() {
    if (!this._hasGA4) return;
    const p = this.params;
    try {
      const connector = new GA4Connector(p.serviceAccountData.path, p.ga4PropertyId);
      this._ga4 = await connector.fetchData(`${this._days}d`, this._endDate);
      if (this._ga4.status === 'ok') {
        this.sourcesUsed.push('GA4');
        const m = this._ga4.metrics;
        this.log(`✅ GA4 données récupérées — sessions: ${m.sessions}, conversions: ${m.conversions}, revenue: ${m.revenue ?? 'N/A'}`);
      } else {
        this.log(`⚠️ GA4 erreur données : ${this._ga4.error}`);
        this.warnings.push(`GA4 données : ${this._ga4.error}`);
        this._ga4 = null;
      }
    } catch (e) {
      this.log(`⚠️ GA4 collecte échouée : ${e.message}`);
      this.warnings.push(`GA4 collecte : ${e.message}`);
      this._ga4 = null;
    }
  }

  // ── Step 5: collectGscData ──────────────────────────────────────────────
  async _collectGscData() {
    if (!this._hasGSC) return;
    const p = this.params;
    try {
      const connector = new GSCConnector(p.serviceAccountData.path, p.gscSiteUrl);
      this._gsc = await connector.fetchData(`${this._days}d`, this._endDate);
      if (this._gsc.status === 'ok') {
        this.sourcesUsed.push('GSC');
        const m = this._gsc.metrics;
        this.log(`✅ GSC données récupérées — clicks: ${m.clicks}, impressions: ${m.impressions}`);
      } else {
        this.log(`⚠️ GSC erreur données : ${this._gsc.error}`);
        this.warnings.push(`GSC données : ${this._gsc.error}`);
        this._gsc = null;
      }
    } catch (e) {
      this.log(`⚠️ GSC collecte échouée : ${e.message}`);
      this.warnings.push(`GSC collecte : ${e.message}`);
      this._gsc = null;
    }
  }

  // ── Step 6: parseGoogleAdsCsv ───────────────────────────────────────────
  async _parseGoogleAdsCsv() {
    if (!this._hasGoogleCsv) return;
    const p = this.params;
    const csvPath = Array.isArray(p.googleAdsCSV) ? p.googleAdsCSV[0] : p.googleAdsCSV;
    try {
      const connector = new GoogleAdsConnector(csvPath, this._days);
      this._googleAds = await connector.fetchData();
      if (this._googleAds.status === 'ok') {
        this.sourcesUsed.push('Google Ads CSV');
        const m = this._googleAds.metrics;
        this.log(`✅ Google Ads CSV chargé — spend: ${m.cost}€, conversions: ${m.conversions}, clicks: ${m.clicks}`);
        if (connector._excludedRows > 0) {
          this.log(`⚠️ Google Ads CSV : ${connector._excludedRows} ligne(s) hors période ignorée(s)`);
          this.warnings.push(`Google Ads CSV : ${connector._excludedRows} ligne(s) hors période exclue(s)`);
        }
      } else {
        this.log(`⚠️ Google Ads CSV erreur : ${this._googleAds.error}`);
        this.warnings.push(`Google Ads CSV : ${this._googleAds.error}`);
        this._googleAds = null;
      }
    } catch (e) {
      this.log(`⚠️ Google Ads CSV parse échoué : ${e.message}`);
      this.warnings.push(`Google Ads CSV parse : ${e.message}`);
      this._googleAds = null;
    }
  }

  // ── Step 7: parseMetaAdsCsv ─────────────────────────────────────────────
  async _parseMetaAdsCsv() {
    if (!this._hasMetaCsv) return;
    const p = this.params;
    const csvPath = Array.isArray(p.metaAdsCSV) ? p.metaAdsCSV[0] : p.metaAdsCSV;
    try {
      const connector = new MetaAdsConnector(csvPath, this._days);
      this._metaAds = await connector.fetchData();
      if (this._metaAds.status === 'ok') {
        this.sourcesUsed.push('Meta Ads CSV');
        const m = this._metaAds.metrics;
        this.log(`✅ Meta Ads CSV chargé — spend: ${m.spend}€, conversions: ${m.conversions}, clicks: ${m.clicks}`);
        if (connector._excludedRows > 0) {
          this.log(`⚠️ Meta Ads CSV : ${connector._excludedRows} ligne(s) hors période ignorée(s)`);
          this.warnings.push(`Meta Ads CSV : ${connector._excludedRows} ligne(s) hors période exclue(s)`);
        }
      } else {
        this.log(`⚠️ Meta Ads CSV erreur : ${this._metaAds.error}`);
        this.warnings.push(`Meta Ads CSV : ${this._metaAds.error}`);
        this._metaAds = null;
      }
    } catch (e) {
      this.log(`⚠️ Meta Ads CSV parse échoué : ${e.message}`);
      this.warnings.push(`Meta Ads CSV parse : ${e.message}`);
      this._metaAds = null;
    }
  }

  // ── Step 8: normalizeSourceData ─────────────────────────────────────────
  _normalizeSourceData() {
    // Compute aggregated ads totals (spend, conversions, value)
    let totalSpend = 0;
    let totalAdsConversions = 0;
    let totalConversionValue = 0;
    let totalAdsClicks = 0;

    if (this._googleAds?.status === 'ok') {
      const m = this._googleAds.metrics;
      totalSpend           += (toNum(m.cost) || 0);
      totalAdsConversions  += (toNum(m.conversions) || 0);
      totalConversionValue += (toNum(m.value) || 0);
      totalAdsClicks       += (toNum(m.clicks) || 0);
    }
    if (this._metaAds?.status === 'ok') {
      const m = this._metaAds.metrics;
      totalSpend           += (toNum(m.spend) || 0);
      totalAdsConversions  += (toNum(m.conversions) || 0);
      totalConversionValue += (toNum(m.value) || 0);
      totalAdsClicks       += (toNum(m.clicks) || 0);
    }

    this._adsTotals = {
      spend:           totalSpend           > 0 ? Math.round(totalSpend           * 100) / 100 : null,
      conversions:     totalAdsConversions  > 0 ? Math.round(totalAdsConversions  * 100) / 100 : null,
      conversionValue: totalConversionValue > 0 ? Math.round(totalConversionValue * 100) / 100 : null,
      clicks:          totalAdsClicks       > 0 ? Math.round(totalAdsClicks) : null
    };
  }

  // ── Step 9: buildBaselineMetrics ────────────────────────────────────────
  _buildBaselineMetrics() {
    const manual = this.params.metricsConfig || {};

    // ── sessions ──
    if (safeNum(manual.sessions) !== null) {
      this._sessions = { value: safeNum(manual.sessions), source: 'Manuel', confidence: 'HIGH', status: 'ok' };
    } else if (this._ga4?.status === 'ok') {
      const v = safeNum(this._ga4.metrics.sessions);
      this._sessions = v !== null
        ? { value: v, source: 'GA4', confidence: 'HIGH', status: 'ok' }
        : unavailable('Sessions non disponibles dans GA4');
    } else if (this._gsc?.status === 'ok') {
      const v = safeNum(this._gsc.metrics.clicks);
      this._sessions = v !== null
        ? { value: v, source: 'GSC (Clicks – proxy organique)', confidence: 'MEDIUM', status: 'ok',
            reason: 'Clics organiques uniquement — proxy, pas sessions totales' }
        : unavailable('Clicks GSC indisponibles');
    } else {
      this._sessions = unavailable('Analytics déconnecté (GA4 / GSC)');
    }

    // ── conversions ──
    if (safeNum(manual.conversions) !== null) {
      this._conversions = { value: safeNum(manual.conversions), source: 'Manuel', confidence: 'HIGH', status: 'ok' };
    } else if (this._ga4?.status === 'ok') {
      const v = safeNum(this._ga4.metrics.conversions);
      this._conversions = v !== null
        ? { value: v, source: 'GA4', confidence: 'HIGH', status: 'ok' }
        : unavailable('Conversions non disponibles dans GA4');
    } else if (this._adsTotals.conversions !== null) {
      this._conversions = { value: this._adsTotals.conversions, source: 'Ads CSV (Google + Meta)', confidence: 'MEDIUM', status: 'ok' };
    } else {
      this._conversions = unavailable('Aucune donnée de conversion trouvée');
    }

    // ── revenue ──
    if (safeNum(manual.revenue) !== null) {
      this._revenue = { value: safeNum(manual.revenue), source: 'Manuel', confidence: 'HIGH', status: 'ok' };
    } else if (this._ga4?.status === 'ok') {
      const v = safeNum(this._ga4.metrics.totalRevenue ?? this._ga4.metrics.revenue);
      if (v !== null) {
        this._revenue = { value: v, source: 'GA4', confidence: 'HIGH', status: 'ok' };
      } else {
        // GA4 available but no revenue
        this.log('⚠️ Revenue indisponible dans GA4');
        this.warnings.push('Revenue non disponible dans GA4 (e-commerce non configuré ?)');
        if (this._adsTotals.conversionValue !== null) {
          this._revenue = { value: this._adsTotals.conversionValue, source: 'Ads CSV (valeur conversion)', confidence: 'MEDIUM', status: 'ok' };
        } else {
          this._revenue = unavailable('Revenue absent de GA4 et des CSV Ads');
        }
      }
    } else if (this._adsTotals.conversionValue !== null) {
      this._revenue = { value: this._adsTotals.conversionValue, source: 'Ads CSV (valeur conversion)', confidence: 'MEDIUM', status: 'ok' };
    } else {
      this._revenue = unavailable('Aucune donnée de revenu disponible');
    }

    // ── spend ──
    if (safeNum(manual.spend) !== null) {
      this._spend = { value: safeNum(manual.spend), source: 'Manuel', confidence: 'HIGH', status: 'ok' };
    } else if (this._adsTotals.spend !== null) {
      const sources = [];
      if (this._googleAds?.status === 'ok') sources.push('Google Ads');
      if (this._metaAds?.status === 'ok')   sources.push('Meta Ads');
      this._spend = { value: this._adsTotals.spend, source: sources.join(' + ') || 'Ads CSV', confidence: 'HIGH', status: 'ok' };
      this.log(`✅ Spend calculé depuis ${this._spend.source} : ${this._spend.value}€`);
    } else {
      this._spend = unavailable('Aucun fichier CSV Ads disponible');
    }
  }

  // ── Step 10: computeDerivedMetrics ──────────────────────────────────────
  _computeDerivedMetrics() {
    const sessions    = this._sessions.value;
    const conversions = this._conversions.value;
    const revenue     = this._revenue.value;
    const spend       = this._spend.value;

    // conversionRate
    if (sessions !== null && sessions > 0 && conversions !== null) {
      const cr = (conversions / sessions) * 100;
      this._conversionRate = {
        value: Math.round(cr * 10000) / 10000,
        source: 'Calculé (Conversions / Sessions)',
        confidence: (this._sessions.confidence === 'HIGH' && this._conversions.confidence === 'HIGH') ? 'HIGH' : 'MEDIUM',
        status: 'ok'
      };
      this.log(`✅ Conversion rate calculé : ${this._conversionRate.value.toFixed(2)}%`);
    } else {
      this._conversionRate = unavailable(sessions === null ? 'Sessions manquantes' : conversions === null ? 'Conversions manquantes' : 'Sessions à zéro');
      this.log(`⚠️ Conversion rate unavailable : ${this._conversionRate.reason}`);
    }

    // averageOrderValue (AOV) = revenue / conversions (e-commerce)
    if (conversions !== null && conversions > 0 && revenue !== null) {
      const aov = revenue / conversions;
      this._averageOrderValue = {
        value: Math.round(aov * 100) / 100,
        source: 'Calculé (Revenue / Conversions)',
        confidence: this._revenue.confidence === 'HIGH' ? 'HIGH' : 'MEDIUM',
        status: 'ok'
      };
      this.log(`✅ Panier moyen calculé : ${this._averageOrderValue.value}€`);
    } else {
      this._averageOrderValue = unavailable(
        revenue === null ? 'Revenue manquant' :
        conversions === null ? 'Conversions manquantes' :
        'Conversions à zéro'
      );
      this.log(`⚠️ Average Order Value unavailable : ${this._averageOrderValue.reason}`);
    }

    // averageConversionValue = revenue / conversions (generic, same formula as AOV unless GA4 distinguishes)
    if (conversions !== null && conversions > 0 && revenue !== null) {
      this._averageConversionValue = {
        value: Math.round((revenue / conversions) * 100) / 100,
        source: 'Calculé (Revenue / Conversions)',
        confidence: this._revenue.confidence === 'HIGH' ? 'HIGH' : 'MEDIUM',
        status: 'ok'
      };
    } else {
      this._averageConversionValue = unavailable(
        revenue === null ? 'Revenue manquant' :
        conversions === null ? 'Conversions manquantes' :
        'Conversions à zéro'
      );
    }

    // ROAS = conversionValue / spend
    if (spend !== null && spend > 0 && revenue !== null) {
      const roas = revenue / spend;
      this._roas = {
        value: Math.round(roas * 100) / 100,
        source: 'Calculé (Revenue / Spend)',
        confidence: (this._revenue.confidence === 'HIGH' && this._spend.confidence === 'HIGH') ? 'HIGH' : 'MEDIUM',
        status: 'ok'
      };
      this.log(`✅ ROAS calculé : ${this._roas.value}`);
    } else {
      this._roas = unavailable(spend === null ? 'Spend manquant' : 'Revenue manquant');
      this.log(`⚠️ ROAS unavailable : ${this._roas.reason}`);
    }

    // CPA = spend / conversions
    if (spend !== null && spend > 0 && conversions !== null && conversions > 0) {
      this._cpa = {
        value: Math.round((spend / conversions) * 100) / 100,
        source: 'Calculé (Spend / Conversions)',
        confidence: 'MEDIUM',
        status: 'ok'
      };
    } else {
      this._cpa = unavailable(spend === null ? 'Spend manquant' : 'Conversions manquantes ou nulles');
    }
  }

  // ── Step 11: buildBaselineResult ────────────────────────────────────────
  _buildBaselineResult() {
    this._result = {
      analysisWindow: {
        days:      this._days,
        startDate: this._startDate,
        endDate:   this._endDate
      },
      metrics: {
        sessions:               this._sessions,
        conversions:            this._conversions,
        revenue:                this._revenue,
        conversionRate:         this._conversionRate,
        averageConversionValue: this._averageConversionValue,
        averageOrderValue:      this._averageOrderValue,
        spend:                  this._spend,
        cpa:                    this._cpa,
        roas:                   this._roas
      },
      sourcesUsed: this.sourcesUsed,
      warnings:    this.warnings,
      errors:      this.errors
    };
  }

  // ── Step 12: updateUiLog ────────────────────────────────────────────────
  _updateUiLog() {
    const m = this._result.metrics;
    const fmt = (metric, unit = '') => {
      if (metric.status === 'unavailable' || metric.value === null) {
        return `⚠️ unavailable — ${metric.reason || 'données manquantes'}`;
      }
      const v = typeof metric.value === 'number' ? metric.value.toFixed(2) : metric.value;
      return `✅ ${v}${unit} (source: ${metric.source}, confiance: ${metric.confidence})`;
    };

    this.log('─────────────────────────────');
    this.log(`📊 Sessions              : ${fmt(m.sessions)}`);
    this.log(`🛒 Conversions           : ${fmt(m.conversions)}`);
    this.log(`💰 Revenue               : ${fmt(m.revenue, '€')}`);
    this.log(`📈 Taux de conversion    : ${fmt(m.conversionRate, '%')}`);
    this.log(`🛍️  Valeur moy. conv.    : ${fmt(m.averageConversionValue, '€')}`);
    this.log(`🛒 Panier moyen (AOV)    : ${fmt(m.averageOrderValue, '€')}`);
    this.log(`💸 Spend Ads             : ${fmt(m.spend, '€')}`);
    this.log(`🎯 CPA                   : ${fmt(m.cpa, '€')}`);
    this.log(`📣 ROAS                  : ${fmt(m.roas)}`);
    this.log('─────────────────────────────');

    if (this.warnings.length) {
      this.log(`⚠️ ${this.warnings.length} avertissement(s) :`);
      this.warnings.forEach(w => this.log(`   ⚠️ ${w}`));
    }
  }

  // ── Step 13: prefillMetricsConfig ───────────────────────────────────────
  _buildPrefillConfig() {
    const m = this._result.metrics;
    this._result.prefill = {
      currentConversionRate:  m.conversionRate.value         !== null ? m.conversionRate.value         : null,
      avgConversionValue:     m.averageConversionValue.value  !== null ? m.averageConversionValue.value  : null,
      avgOrderValue:          m.averageOrderValue.value       !== null ? m.averageOrderValue.value       : null,
      spend:                  m.spend.value                   !== null ? m.spend.value                   : null
    };
  }

  // ── Quality gate ────────────────────────────────────────────────────────
  _qualityGate() {
    const m = this._result.metrics;
    const allUnavailable = Object.values(m).every(v => v.status === 'unavailable' || v.value === null);
    if (allUnavailable) {
      this._result.status  = 'failed';
      this._result.reason  = 'Aucune source exploitable — baseline non calculable';
      this.log('❌ Qualité insuffisante : aucune source exploitable. Vérifiez vos connexions et fichiers CSV.');
      return false;
    }

    // Check for NaN
    for (const [key, metric] of Object.entries(m)) {
      if (metric.value !== null && isNaN(metric.value)) {
        this.errors.push(`Métrique ${key} contient NaN — ignorée`);
        m[key] = unavailable(`Valeur NaN détectée pour ${key}`);
      }
    }

    if (!this._startDate || !this._endDate) {
      this._result.status = 'failed';
      this._result.reason = 'Période d\'analyse invalide';
      this.log('❌ Période d\'analyse invalide');
      return false;
    }

    this._result.status = 'success';
    return true;
  }

  // ── Main run() ──────────────────────────────────────────────────────────
  async run() {
    try {
      // Step 1
      this._validateAnalysisPeriod();

      // Step 2
      this._validateInputs();

      // Step 3
      await this._testConnections();

      // Steps 4-7 (parallel where possible)
      await Promise.all([
        this._collectGa4Data(),
        this._collectGscData()
      ]);
      await this._parseGoogleAdsCsv();
      await this._parseMetaAdsCsv();

      // Step 8
      this._normalizeSourceData();

      // Step 9
      this._buildBaselineMetrics();

      // Step 10
      this._computeDerivedMetrics();

      // Step 11
      this._buildBaselineResult();

      // Quality gate
      this._qualityGate();

      // Step 12
      this._updateUiLog();

      // Step 13
      this._buildPrefillConfig();

      return this._result;

    } catch (err) {
      this.errors.push(err.message);
      this.log(`❌ Pipeline baseline échouée : ${err.message}`);
      return {
        analysisWindow: null,
        metrics: {},
        sourcesUsed: this.sourcesUsed,
        warnings: this.warnings,
        errors: this.errors,
        status: 'failed',
        reason: err.message
      };
    }
  }
}

module.exports = { BaselineAutoScan };
