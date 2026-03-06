/**
 * STRATADS BACKEND - INDEX V3
 * Orchestrateur pour les 4 modes d'audit avec PDF export
 */

const fs = require("fs-extra");
const path = require("path");
const { AuditEngine } = require("./audit.js");
const { ReportGenerator } = require("./report.js");
const { PDFExporter } = require("./pdf.js");
const { ApiOrchestrator } = require("./modules/apiOrchestrator.js");
const { BaselineAutoScan } = require("./modules/baselineAutoScan.js");

/**
 * Nettoie une chaîne pour l'utiliser comme nom de fichier (Windows/Linux/Mac)
 * Supprime les caractères interdits: < > : " / \ | ? *
 */
function sanitizeFilename(str) {
  return str
    .replace(/[<>:"\/\\|?*]/g, '')  // Caractères interdits Windows
    .replace(/\s+/g, '-')              // Espaces -> tirets
    .toLowerCase()
    .slice(0, 50);                     // Limite la longueur
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === null || value === undefined) return 0;
  const parsed = parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function aggregateAdsData(adsResults = {}) {
  const totals = {
    spend: 0,
    conversions: 0,
    revenue: 0,
    value: 0,
    clicks: 0,
    impressions: 0
  };
  const sources = new Set();
  const campaigns = [];

  const addEntry = (entry, label) => {
    if (!entry || entry.status === 'error') return;
    const metrics = entry.metrics || entry.totals;
    if (metrics) {
      totals.spend += toNumber(metrics.cost ?? metrics.spend);
      totals.conversions += toNumber(metrics.conversions);
      const revenueValue = toNumber(metrics.revenue ?? metrics.value);
      totals.revenue += revenueValue;
      totals.value += revenueValue;
      totals.clicks += toNumber(metrics.clicks);
      totals.impressions += toNumber(metrics.impressions);
      sources.add(label);
    }

    const topCampaigns = entry.topCampaigns || entry.campaigns;
    if (Array.isArray(topCampaigns) && topCampaigns.length) {
      sources.add(label);
      campaigns.push(...topCampaigns.map(c => ({ ...c, source: label })));
    }
  };

  addEntry(adsResults.csv?.google, 'google-csv');
  addEntry(adsResults.csv?.meta, 'meta-csv');
  addEntry(adsResults.api?.google, 'google-api');
  addEntry(adsResults.api?.meta, 'meta-api');

  return {
    totals: {
      spend: Number(totals.spend.toFixed(2)) || 0,
      conversions: Number(totals.conversions.toFixed(2)) || 0,
      revenue: Number(totals.revenue.toFixed(2)) || 0,
      value: Number(totals.value.toFixed(2)) || 0,
      clicks: Math.round(totals.clicks) || 0,
      impressions: Math.round(totals.impressions) || 0
    },
    sources: Array.from(sources),
    campaigns
  };
}

class Backend {
  constructor() {
    this.engine = null;
    this.generator = null;
    this.pdfExporter = new PDFExporter();
  }

  async testConnections(params, log = console.log) {
    log('[Backend] 🔧 Testing API connections...');
    
    try {
      const results = await ApiOrchestrator.testConnections(params);
      log('[Backend] ✅ Connection tests completed');
      return { success: true, results };
    } catch (error) {
      log(`[Backend] ❌ Connection test error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async fetchBaseline(params, log = console.log) {
    log('[Backend] 📊 Démarrage du baseline autoscan...');

    try {
      // RÈGLE DE PÉRIODE UNIQUE : only analysisPeriodDays is used
      const analysisPeriodDays = Number(params.analysisPeriodDays);
      if (!analysisPeriodDays || analysisPeriodDays < 1 || analysisPeriodDays > 365) {
        throw new Error('analysisPeriodDays requis (1–365 jours)');
      }

      const pipeline = new BaselineAutoScan(params, log);
      const result = await pipeline.run();

      log('[Backend] ✅ Baseline autoscan terminé');
      return { success: true, results: result };

    } catch (error) {
      log(`[Backend] ❌ Baseline fetch error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async run(params, log = console.log, progress = () => {}) {
    const { url, company, auditType, googleAdsCSV, metaAdsCSV } = params;
    const forecastSettings = this.normalizeForecastSettings(params?.forecastSettings || {});
    
    log(`[Backend] 🚀 ${auditType.toUpperCase()} - ${company}`);
    
    try {
      progress(5);
      
      // Validation
      if (!url || !company) throw new Error("URL et company requis");
      
      // Options pour l'audit - gérer les tableaux de chemins
      const auditOptions = {
        log,
        progress: (p) => progress(5 + Math.round(p * 0.6)), // 5% -> 65%
        googleAdsCSV: Array.isArray(googleAdsCSV) ? googleAdsCSV[0] : googleAdsCSV,
        metaAdsCSV: Array.isArray(metaAdsCSV) ? metaAdsCSV[0] : metaAdsCSV,
        forecastSettings,
        metricsConfig: params.metricsConfig,
        serviceAccountData: params.serviceAccountData,
        ga4PropertyId: params.ga4PropertyId,
        gscSiteUrl: params.gscSiteUrl,
        gtmAccountId: params.gtmAccountId,
        gtmContainerId: params.gtmContainerId
      };
      
      // Exécution audit
      this.engine = new AuditEngine(url, company, auditType, auditOptions);
      const results = await this.engine.run();
      
      progress(70);
      
      // Génération rapport HTML
      this.generator = new ReportGenerator(results);
      const report = await this.generator.generate();
      
      progress(85);
      
      // Sauvegarde des fichiers
      const outputDir = await this.save(results, report, params);
      
      // Génération PDF
      log(`[Backend] 📄 Génération PDF...`);
      const htmlPath = path.join(outputDir, 'report.html');
      const pdfPath = path.join(outputDir, 'report.pdf');
      
      const pdfResult = await this.pdfExporter.export(htmlPath, pdfPath, {
        company,
        auditType
      });
      
      if (!pdfResult.success) {
        log(`[Backend] ⚠️ PDF: ${pdfResult.error}`);
      } else {
        log(`[Backend] ✅ PDF généré`);
      }
      
      progress(100);
      
      log(`[Backend] ✅ Terminé`);
      
      return {
        success: true,
        outputDir,
        report,
        pdfPath: pdfResult.success ? pdfPath : null,
        results,
        metadata: {
          company,
          url,
          auditType,
          score: results.scores.global
        }
      };
      
    } catch (error) {
      log(`[Backend] ❌ ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async save(results, report, params) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const companySafe = sanitizeFilename(params.company);
    const mode = params.auditType;
    const outputDir = path.join(process.cwd(), "tmp", `${companySafe}-${mode}-${timestamp}`);
    
    await fs.ensureDir(outputDir);
    
    // Sauvegarde auditResult.json (data contract)
    await fs.writeJson(path.join(outputDir, "auditResult.json"), results, { spaces: 2 });
    
    if (results.forecastInputsFinal) {
      await fs.writeJson(path.join(outputDir, "forecastInputsFinal.json"), results.forecastInputsFinal, { spaces: 2 });
    }
    
    if (results.forecast) {
      await fs.writeJson(path.join(outputDir, "forecastOutput.json"), results.forecast, { spaces: 2 });
    }
    
    if (results.qualityGate) {
      await fs.writeJson(path.join(outputDir, "qualityGate.json"), results.qualityGate, { spaces: 2 });
    }
    
    if (results.baseline) {
      await fs.writeJson(path.join(outputDir, "baseline.json"), results.baseline, { spaces: 2 });
    }
    
    // Sauvegarde report.html
    await fs.writeFile(path.join(outputDir, "report.html"), report.html, "utf-8");
    
    return outputDir;
  }

  normalizeForecastSettings(rawSettings) {
    const settings = { ...(rawSettings || {}) };

    if (typeof settings.period !== 'string') settings.period = '3m';
    if (typeof settings.optimizationType !== 'string') settings.optimizationType = 'full_growth';
    if (typeof settings.effort !== 'string') settings.effort = 'modéré';

    if (settings.budget !== null && settings.budget !== undefined) {
      const budgetNum = Number(settings.budget);
      settings.budget = Number.isFinite(budgetNum) && budgetNum >= 0 ? budgetNum : null;
    } else {
      settings.budget = null;
    }

    if (typeof settings.sector !== 'string') settings.sector = '';

    return settings;
  }
}

module.exports = { Backend };
