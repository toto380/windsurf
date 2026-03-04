/**
 * STRATADS REPORT GENERATOR - Génération des rapports business
 * 4 types d'audits : Fast, Public Complet, Private, Full
 */

import fs from "fs-extra";
import path from "node:path";
import { StratadsCharts } from "./stratads-charts.js";
import { FastAuditReportGenerator } from "./fast-audit-report-generator.js";
import { KpiCalculator } from "../engine/kpi-calculator.js";

export class StratadsReportGenerator {
  constructor(auditResults) {
    this.results = auditResults;
    this.company = auditResults.meta?.company || auditResults.executiveSummary?.company || 'unknown-company';
    this.auditType = auditResults.meta?.auditType || 'fast';
    console.log(`[ReportGenerator] Company: ${this.company}, Type: ${this.auditType}`);
  }

  async generateReport() {
    switch (this.auditType) {
      case 'fast':
        return this.generateFastReport();
      case 'public':
        return this.generatePublicReport();
      case 'private':
        return this.generatePrivateReport();
      case 'full':
        return this.generateFullReport();
      default:
        throw new Error(`Type d'audit non reconnu: ${this.auditType}`);
    }
  }

  generateFastReport() {
    console.log(`[ReportGenerator] generateFastReport - Company: ${this.company}`);
    try {
      const { acquisitionScore, performance, tracking, growthPotential, quickWins } = this.results;
      
      // Utiliser le nouveau FastAuditReportGenerator
      const fastReportGenerator = new FastAuditReportGenerator(this.results);
      
      const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StratAds Fast Audit - ${this.company}</title>
    <style>${this.getBaseStyles()}</style>
</head>
<body>
    <div class="container">
        ${this.generateExecutiveSummary()}
        ${this.generateAcquisitionScore(acquisitionScore)}
        ${this.generatePerformanceSection(performance)}
        ${this.generateTrackingSection(tracking)}
        ${this.generateQuickWins(quickWins)}
        ${this.generateGrowthPotential(growthPotential)}
        
        <footer class="footer">
            <p>💰 Audit complet disponible : 2500€</p>
            <p>📞 Contactez-nous pour une analyse détaillée</p>
        </footer>
    </div>
</body>
</html>`;

      console.log(`[ReportGenerator] HTML généré, filename: ${this.company}`);
      
      return {
        html,
        filename: `stratads-fast-${this.company.replace(/\s+/g, '-').toLowerCase()}.html`,
        type: 'fast'
      };
    } catch (error) {
      console.error(`[ReportGenerator] Erreur dans generateFastReport:`, error.message);
      console.error(`[ReportGenerator] Stack:`, error.stack);
      throw error;
    }
  }

  generatePublicReport() {
    // Fast report + sections complémentaires
    const fastReport = this.generateFastReport();
    
    const additionalSections = `
        ${this.generateConversionAnalysis()}
        ${this.generateSiteAnalysis()}
        ${this.generateFunnelEstimation()}
        ${this.generateMaturityScore()}
        ${this.generateRoadmap()}
    `;

    // Insert additional sections before footer
    const html = fastReport.html.replace('<footer class="footer">', additionalSections + '<footer class="footer">');
    
    return {
      html,
      filename: `stratads-public-${this.company.replace(/\s+/g, '-').toLowerCase()}.html`,
      type: 'public'
    };
  }

  generatePrivateReport() {
    // Public report + données réelles
    const publicReport = this.generatePublicReport();
    
    const privateSections = `
        ${this.generateDataIntegrity()}
        ${this.generateROASAnalysis()}
        ${this.generateCPAAnalysis()}
        ${this.generateCampaignStructure()}
        ${this.generateRealFunnel()}
        ${this.generateLTVCACAnalysis()}
        ${this.generateScalingDiagnosis()}
    `;

    const html = publicReport.html.replace('<footer class="footer">', privateSections + '<footer class="footer">');
    
    return {
      html,
      filename: `stratads-private-${this.company.replace(/\s+/g, '-').toLowerCase()}.html`,
      type: 'private'
    };
  }

  generateFullReport() {
    // Private report + benchmarks et projections
    const privateReport = this.generatePrivateReport();
    
    const premiumSections = `
        ${this.generateMarketBenchmarks()}
        ${this.generateGrowthProjections()}
        ${this.generateScalingPlan()}
    `;

    const html = privateReport.html.replace('<footer class="footer">', premiumSections + '<footer class="footer">');
    
    return {
      html,
      filename: `stratads-full-${this.company.replace(/\s+/g, '-').toLowerCase()}.html`,
      type: 'full'
    };
  }

  // === SECTIONS GÉNÉRIQUES ===

  generateExecutiveSummary() {
    const { acquisitionScore, growthPotential } = this.results;
    
    // Pour le Fast Audit, la structure est différente
    const globalScore = acquisitionScore.global || 0;
    const grade = this.getGradeFromScore(globalScore);
    
    return `
<section class="section">
    <h2>📊 Résumé Exécutif</h2>
    <div class="cards">
        <div class="card">
            <h3>Score Acquisition</h3>
            <div class="score ${grade.toLowerCase()}">${globalScore}/100</div>
            <p>Note: ${grade}</p>
        </div>
        <div class="card">
            <h3>Revenu Actuel Estimé</h3>
            <div class="amount">€${(growthPotential.currentRevenue / 1000000).toFixed(1)}M</div>
            <p>Annuel</p>
        </div>
        <div class="card">
            <h3>Potentiel de Croissance</h3>
            <div class="growth">${(growthPotential.growthMultiplier * 100 - 100).toFixed(0)}%</div>
            <p>Optimisation possible</p>
        </div>
    </div>
    <div class="alert ${acquisitionScore.global > 60 ? 'success' : 'warning'}">
        ${acquisitionScore.global > 60 ? 
          '✅ Votre système d\'acquisition est bien structuré' : 
          '⚠️ Des optimisations importantes sont nécessaires'
        }
    </div>
</section>`;
  }

  generateAcquisitionScore(score) {
    return `
<section class="section">
    <h2>🎯 Score Global Acquisition</h2>
    <div class="score-breakdown">
        <div class="score-item">
            <label>Tracking</label>
            <div class="progress">
                <div class="bar" style="width: ${score.tracking}%"></div>
            </div>
            <span>${score.tracking}/30</span>
        </div>
        <div class="score-item">
            <label>Performance</label>
            <div class="progress">
                <div class="bar" style="width: ${score.performance}%"></div>
            </div>
            <span>${score.performance}/25</span>
        </div>
        <div class="score-item">
            <label>Conversion</label>
            <div class="progress">
                <div class="bar" style="width: ${score.conversion}%"></div>
            </div>
            <span>${score.conversion}/20</span>
        </div>
        <div class="score-item">
            <label>Economics</label>
            <div class="progress">
                <div class="bar" style="width: ${score.economics}%"></div>
            </div>
            <span>${score.economics}/25</span>
        </div>
    </div>
    <div class="radar-chart">
        <!-- Placeholder pour radar chart -->
        <div class="chart-placeholder">📈 Radar Chart: Maturité Acquisition</div>
    </div>
</section>`;
  }

  generatePerformanceSection(performance) {
    return `
<section class="section">
    <h2>⚡ Performance Web</h2>
    <div class="cards">
        <div class="card">
            <h3>Vitesse de Chargement</h3>
            <div class="score ${performance.speed > 70 ? 'good' : performance.speed > 40 ? 'warning' : 'critical'}">${performance.speed}/100</div>
            <p>${performance.loadTime}s</p>
        </div>
        <div class="card">
            <h3>Optimisation Mobile</h3>
            <div class="score ${performance.mobileOptimized ? 'good' : 'critical'}">
                ${performance.mobileOptimized ? '✅ Optimisé' : '❌ Non optimisé'}
            </div>
        </div>
    </div>
</section>`;
  }

  generateTrackingSection(tracking) {
    // Pour le Fast Audit, la structure est différente
    if (!tracking || !tracking.detected) {
      return `
<section class="section">
    <h2>📡 Tracking Detection</h2>
    <div class="alert warning">
        ⚠️ Tracking non analysé
    </div>
</section>`;
    }
    
    return `
<section class="section">
    <h2>📡 Tracking Detection</h2>
    <div class="tracking-grid">
        ${tracking.detected.map(platform => `
            <div class="tracking-item detected">
                <span class="platform">${platform.toUpperCase()}</span>
                <span class="status">✅</span>
            </div>
        `).join('')}
    </div>
    <div class="alert ${tracking.hasGTM ? 'success' : 'warning'}">
        ${tracking.hasGTM ? 
          '✅ Google Tag Manager détecté' : 
          '⚠️ Google Tag Manager manquant - recommandé'
        }
    </div>
</section>`;
  }

  generateGrowthPotential(potential) {
    const lostRevenue = potential.lostRevenue;
    
    return `
<section class="section">
    <h2>🚀 Potentiel de Croissance</h2>
    <div class="growth-comparison">
        <div class="scenario current">
            <h3>Actuel</h3>
            <div class="amount">€${(potential.currentRevenue / 1000000).toFixed(1)}M</div>
        </div>
        <div class="arrow">→</div>
        <div class="scenario potential">
            <h3>Optimisé</h3>
            <div class="amount">€${(potential.potentialRevenue / 1000000).toFixed(1)}M</div>
        </div>
    </div>
    <div class="alert critical">
        💸 <strong>Perte actuelle estimée: €${(lostRevenue / 1000000).toFixed(1)}M/an</strong>
    </div>
    <div class="confidence">
        Niveau de confiance: ${potential.confidence === 'high' ? 'Élevé' : 'Moyen'}
    </div>
</section>`;
  }

  generateQuickWins(wins) {
    return `
<section class="section">
    <h2>⚡ Top 5 Quick Wins</h2>
    <div class="quick-wins">
        ${wins.map((win, index) => `
            <div class="quick-win">
                <div class="rank">${index + 1}</div>
                <div class="content">
                    <h4>${win.title}</h4>
                    <p>${win.description}</p>
                    <div class="tags">
                        <span class="impact ${win.impact.toLowerCase()}">Impact: ${win.impact}</span>
                        <span class="effort ${win.effort.toLowerCase()}">Effort: ${win.effort}</span>
                    </div>
                </div>
            </div>
        `).join('')}
    </div>
</section>`;
  }

  // === STYLES ===

  // === UTILITAIRES ===
  
  getGradeFromScore(score) {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Bon';
    if (score >= 40) return 'Moyen';
    return 'Faible';
  }

  getBaseStyles() {
    return `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f8f9fa; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 40px; padding: 40px 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px; }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        .header h2 { font-size: 1.8em; margin-bottom: 10px; }
        .subtitle { opacity: 0.9; font-size: 1.1em; }
        .section { background: white; margin-bottom: 30px; padding: 30px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .section h2 { color: #667eea; margin-bottom: 20px; font-size: 1.5em; }
        .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .card h3 { color: #666; margin-bottom: 10px; }
        .score { font-size: 2em; font-weight: bold; margin-bottom: 5px; }
        .score.a { color: #22c55e; }
        .score.b { color: #f59e0b; }
        .score.c { color: #ef4444; }
        .score.d { color: #dc2626; }
        .score.good { color: #22c55e; }
        .score.warning { color: #f59e0b; }
        .score.critical { color: #ef4444; }
        .amount { font-size: 1.8em; font-weight: bold; color: #667eea; }
        .growth { font-size: 1.8em; font-weight: bold; color: #22c55e; }
        .alert { padding: 15px; border-radius: 8px; margin: 20px 0; }
        .alert.success { background: #d1fae5; color: #065f46; border-left: 4px solid #10b981; }
        .alert.warning { background: #fef3c7; color: #92400e; border-left: 4px solid #f59e0b; }
        .alert.critical { background: #fee2e2; color: #991b1b; border-left: 4px solid #ef4444; }
        .progress { background: #e5e7eb; height: 8px; border-radius: 4px; overflow: hidden; margin: 5px 0; }
        .bar { background: #667eea; height: 100%; transition: width 0.3s ease; }
        .tracking-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
        .tracking-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; border-radius: 6px; }
        .tracking-item.detected { background: #d1fae5; }
        .tracking-item.missing { background: #fee2e2; }
        .growth-comparison { display: flex; align-items: center; justify-content: center; gap: 30px; margin: 30px 0; }
        .scenario { text-align: center; padding: 20px; border-radius: 8px; }
        .scenario.current { background: #fee2e2; }
        .scenario.potential { background: #d1fae5; }
        .arrow { font-size: 2em; color: #667eea; }
        .quick-wins { display: grid; gap: 15px; }
        .quick-win { display: flex; gap: 15px; padding: 20px; background: #f8f9fa; border-radius: 8px; }
        .quick-win .rank { font-size: 1.5em; font-weight: bold; color: #667eea; min-width: 30px; }
        .quick-win .content { flex: 1; }
        .quick-win h4 { margin-bottom: 8px; color: #333; }
        .tags { display: flex; gap: 10px; margin-top: 10px; }
        .tags span { padding: 4px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; }
        .impact.élevé { background: #fee2e2; color: #991b1b; }
        .impact.faible { background: #d1fae5; color: #065f46; }
        .effort.faible { background: #dbeafe; color: #1e40af; }
        .effort.moyen { background: #fef3c7; color: #92400e; }
        .footer { text-align: center; padding: 40px; background: #667eea; color: white; border-radius: 12px; margin-top: 40px; }
        .chart-placeholder { padding: 40px; background: #f8f9fa; border-radius: 8px; text-align: center; color: #666; }
    `;
  }

  // Placeholder pour les sections avancées
  generateConversionAnalysis() { return '<section class="section"><h2>🔄 Analyse Conversion</h2><p>Section en développement...</p></section>'; }
  generateSiteAnalysis() { return '<section class="section"><h2>🌐 Analyse Site</h2><p>Section en développement...</p></section>'; }
  generateFunnelEstimation() { return '<section class="section"><h2>📊 Estimation Funnel</h2><p>Section en développement...</p></section>'; }
  generateMaturityScore() { return '<section class="section"><h2>📈 Score Maturité</h2><p>Section en développement...</p></section>'; }
  generateRoadmap() { return '<section class="section"><h2>🗺️ Roadmap Optimisation</h2><p>Section en développement...</p></section>'; }
  generateDataIntegrity() { return '<section class="section"><h2>🔍 Data Integrity</h2><p>Section en développement...</p></section>'; }
  generateROASAnalysis() { return '<section class="section"><h2>💰 Analyse ROAS</h2><p>Section en développement...</p></section>'; }
  generateCPAAnalysis() { return '<section class="section"><h2>💸 Analyse CPA</h2><p>Section en développement...</p></section>'; }
  generateCampaignStructure() { return '<section class="section"><h2>🎯 Structure Campagnes</h2><p>Section en développement...</p></section>'; }
  generateRealFunnel() { return '<section class="section"><h2>📊 Funnel Réel</h2><p>Section en développement...</p></section>'; }
  generateLTVCACAnalysis() { return '<section class="section"><h2>📈 LTV/CAC Analysis</h2><p>Section en développement...</p></section>'; }
  generateScalingDiagnosis() { return '<section class="section"><h2>🚀 Diagnostic Scaling</h2><p>Section en développement...</p></section>'; }
  generateMarketBenchmarks() { return '<section class="section"><h2>📊 Benchmarks Marché</h2><p>Section en développement...</p></section>'; }
  generateGrowthProjections() { return '<section class="section"><h2>📈 Projections Croissance</h2><p>Section en développement...</p></section>'; }
  generateScalingPlan() { return '<section class="section"><h2>🗺️ Plan Scaling</h2><p>Section en développement...</p></section>'; }
}
