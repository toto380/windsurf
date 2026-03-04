/**
 * STRATADS REPORT GENERATOR PRO - Génération de rapports professionnels
 * Comparable à un cabinet de conseil en stratégie
 * Orienté ROI, clair, structuré pour dirigeants
 */

import fs from "fs-extra";
import path from "node:path";

export class StratadsReportGeneratorPro {
  constructor(auditResults) {
    this.results = auditResults;
    this.company = auditResults.meta.company || 'Non disponible';
    this.auditType = auditResults.meta.auditType || 'fast';
    this.mode = auditResults.meta.mode || 'FAST - Prospection Gratuite';
  }

  async generateReport() {
    const html = this.generateProfessionalReport();
    
    return {
      html,
      filename: `stratads-pro-${this.auditType}-${this.company.replace(/\s+/g, '-').toLowerCase()}.html`,
      type: this.auditType,
      metadata: {
        company: this.company,
        date: this.results.meta.date,
        mode: this.mode,
        score: this.results.executiveSummary.globalScore
      }
    };
  }

  generateProfessionalReport() {
    const { executiveSummary, technicalAnalysis, marketingAnalysis, recommendations, nextSteps } = this.results;
    
    return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StratAds Audit Pro - ${this.company}</title>
    <style>${this.getProfessionalStyles()}</style>
</head>
<body>
    <div class="report-container">
        ${this.generateHeader()}
        ${this.generateExecutiveSummary(executiveSummary)}
        ${this.generateTechnicalAnalysis(technicalAnalysis)}
        ${this.generateMarketingAnalysis(marketingAnalysis)}
        ${this.generateRecommendations(recommendations)}
        ${this.generateNextSteps(nextSteps)}
        ${this.generateFooter()}
    </div>
</body>
</html>`;
  }

  generateHeader() {
    return `
        <header class="report-header">
            <div class="header-content">
                <div class="logo">
                    <h1>StratAds</h1>
                    <p class="tagline">Audit Marketing Professionnel</p>
                </div>
                <div class="report-info">
                    <h2>${this.company}</h2>
                    <p class="mode">${this.mode}</p>
                    <p class="date">${new Date(this.results.meta.date).toLocaleDateString('fr-FR')}</p>
                </div>
            </div>
        </header>`;
  }

  generateExecutiveSummary(summary) {
    return `
        <section class="executive-summary">
            <div class="section-header">
                <h2>📊 Synthèse Exécutive</h2>
                <p class="section-subtitle">Vue d'ensemble stratégique pour les dirigeants</p>
            </div>
            
            <div class="summary-grid">
                <div class="summary-card primary">
                    <div class="card-header">
                        <h3>Score Global</h3>
                        <span class="score-value">${summary.globalScore}/100</span>
                    </div>
                    <div class="card-content">
                        <div class="score-bar">
                            <div class="score-fill" style="width: ${summary.globalScore}%"></div>
                        </div>
                        <p class="maturity">${summary.maturityLevel}</p>
                    </div>
                </div>
                
                <div class="summary-card">
                    <div class="card-header">
                        <h3>Score Technique</h3>
                        <span class="score-value">${summary.technicalScore}/100</span>
                    </div>
                    <div class="card-content">
                        <p>Performance et optimisations techniques</p>
                    </div>
                </div>
                
                <div class="summary-card">
                    <div class="card-header">
                        <h3>Score Marketing</h3>
                        <span class="score-value">${summary.marketingScore}/100</span>
                    </div>
                    <div class="card-content">
                        <p>Tracking et stratégie marketing</p>
                    </div>
                </div>
            </div>
            
            <div class="roi-potential">
                <h3>🎯 Potentiel ROI</h3>
                <p class="potential-text">${summary.roiPotential}</p>
            </div>
            
            ${summary.keyFindings.length > 0 ? `
            <div class="key-findings">
                <h3>🔍 Points Clés Identifiés</h3>
                <ul>
                    ${summary.keyFindings.map(finding => `<li>${finding}</li>`).join('')}
                </ul>
            </div>` : ''}
            
            ${summary.criticalIssues.length > 0 ? `
            <div class="critical-issues">
                <h3>⚠️ Points Critiques</h3>
                <ul>
                    ${summary.criticalIssues.map(issue => `<li class="critical">${issue}</li>`).join('')}
                </ul>
            </div>` : ''}
        </section>`;
  }

  generateTechnicalAnalysis(technical) {
    return `
        <section class="technical-analysis">
            <div class="section-header">
                <h2>🔧 Analyse Technique</h2>
                <p class="section-subtitle">Performance et optimisations techniques du site</p>
            </div>
            
            <div class="analysis-grid">
                <div class="analysis-card">
                    <h3>⚡ Performance</h3>
                    <div class="metrics">
                        <div class="metric">
                            <label>Temps de chargement</label>
                            <span class="value">${technical.performance.loadTime}s</span>
                            <span class="grade grade-${technical.performance.grade.toLowerCase()}">${technical.performance.grade}</span>
                        </div>
                        <div class="metric">
                            <label>Niveau de performance</label>
                            <span class="value">${technical.performance.performanceLevel}</span>
                        </div>
                    </div>
                </div>
                
                <div class="analysis-card">
                    <h3>🏗️ Structure</h3>
                    <div class="metrics">
                        <div class="metric">
                            <label>Balises H1</label>
                            <span class="value">${technical.structure.hasH1 ? '✅ Présent' : '❌ Manquant'}</span>
                        </div>
                        <div class="metric">
                            <label>Méta description</label>
                            <span class="value">${technical.structure.hasMetaDescription ? '✅ Présente' : '❌ Manquante'}</span>
                        </div>
                        <div class="metric">
                            <label>Viewport mobile</label>
                            <span class="value">${technical.structure.hasViewport ? '✅ Configuré' : '❌ Non configuré'}</span>
                        </div>
                    </div>
                </div>
                
                <div class="analysis-card">
                    <h3>🔧 Optimisations</h3>
                    <div class="metrics">
                        <div class="metric">
                            <label>HTTPS</label>
                            <span class="value">${technical.optimizations.hasHttps ? '✅ Sécurisé' : '❌ Non sécurisé'}</span>
                        </div>
                        <div class="metric">
                            <label>Données structurées</label>
                            <span class="value">${technical.optimizations.hasStructuredData ? '✅ Présentes' : '❌ Manquantes'}</span>
                        </div>
                        <div class="metric">
                            <label>Favicon</label>
                            <span class="value">${technical.optimizations.hasFavicon ? '✅ Présent' : '❌ Manquant'}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="technical-score">
                <h3>Score Technique: ${technical.score}/100</h3>
                <div class="score-bar">
                    <div class="score-fill" style="width: ${technical.score}%"></div>
                </div>
                <p>Niveau: ${this.getScoreLevel(technical.score)}</p>
            </div>
        </section>`;
  }

  generateMarketingAnalysis(marketing) {
    return `
        <section class="marketing-analysis">
            <div class="section-header">
                <h2>📡 Analyse Marketing</h2>
                <p class="section-subtitle">Tracking et stratégie marketing digitale</p>
            </div>
            
            <div class="analysis-grid">
                <div class="analysis-card">
                    <h3>📊 Tracking Détecté</h3>
                    <div class="tracking-grid">
                        ${marketing.tracking.detected.map(tracker => `
                            <div class="tracking-item detected">
                                <span class="tracker-name">${this.formatTrackerName(tracker)}</span>
                                <span class="status">✅</span>
                            </div>
                        `).join('')}
                    </div>
                    <p class="tracking-level">Niveau de tracking: ${marketing.tracking.trackingLevel}</p>
                </div>
                
                <div class="analysis-card">
                    <h3>🎯 Éléments Marketing</h3>
                    <div class="marketing-elements">
                        <div class="element">
                            <label>Appels à l'action</label>
                            <span class="value">${marketing.marketing.hasCTA ? '✅ Présents' : '❌ Manquants'}</span>
                        </div>
                        <div class="element">
                            <label>Coordonnées visibles</label>
                            <span class="value">${marketing.marketing.hasPhone || marketing.marketing.hasEmail ? '✅ Visibles' : '❌ Non visibles'}</span>
                        </div>
                        <div class="element">
                            <label>Réseaux sociaux</label>
                            <span class="value">${marketing.marketing.hasSocialLinks ? '✅ Liens présents' : '❌ Liens manquants'}</span>
                        </div>
                    </div>
                </div>
                
                <div class="analysis-card">
                    <h3>🔄 Tunnel de Conversion</h3>
                    <div class="conversion-elements">
                        <div class="element">
                            <label>Page d'atterrissage</label>
                            <span class="value">${marketing.conversion.hasLandingPage ? '✅ Optimisée' : '❌ Non optimisée'}</span>
                        </div>
                        <div class="element">
                            <label>Formulaire de contact</label>
                            <span class="value">${marketing.conversion.hasLeadForm ? '✅ Présent' : '❌ Manquant'}</span>
                        </div>
                        <div class="element">
                            <label>Page de confirmation</label>
                            <span class="value">${marketing.conversion.hasThankYouPage ? '✅ Présente' : '❌ Manquante'}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="marketing-score">
                <h3>Score Marketing: ${marketing.score}/100</h3>
                <div class="score-bar">
                    <div class="score-fill" style="width: ${marketing.score}%"></div>
                </div>
                <p>Niveau: ${this.getScoreLevel(marketing.score)}</p>
            </div>
        </section>`;
  }

  generateRecommendations(recommendations) {
    return `
        <section class="recommendations">
            <div class="section-header">
                <h2>💡 Recommandations Stratégiques</h2>
                <p class="section-subtitle">Actions prioritaires pour améliorer la performance</p>
            </div>
            
            <div class="recommendations-grid">
                ${recommendations.map((rec, index) => `
                    <div class="recommendation-card priority-${rec.priority.toLowerCase()}">
                        <div class="rec-header">
                            <span class="rec-number">${index + 1}</span>
                            <h3>${rec.title}</h3>
                            <span class="priority priority-${rec.priority.toLowerCase()}">${rec.priority}</span>
                        </div>
                        <div class="rec-content">
                            <p class="description">${rec.description}</p>
                            <div class="rec-details">
                                <div class="detail">
                                    <label>Impact attendu:</label>
                                    <span class="value">${rec.expectedImpact}</span>
                                </div>
                                <div class="detail">
                                    <label>Effort requis:</label>
                                    <span class="value">${rec.effort}</span>
                                </div>
                                <div class="detail">
                                    <label>Délai:</label>
                                    <span class="value">${rec.timeline}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </section>`;
  }

  generateNextSteps(nextSteps) {
    return `
        <section class="next-steps">
            <div class="section-header">
                <h2>🚀 Prochaines Étapes</h2>
                <p class="section-subtitle">Feuille de route pour l'amélioration continue</p>
            </div>
            
            <div class="steps-timeline">
                ${nextSteps.map((step, index) => `
                    <div class="step-item">
                        <div class="step-number">${index + 1}</div>
                        <div class="step-content">
                            <h4>${step}</h4>
                        </div>
                    </div>
                `).join('')}
            </div>
        </section>`;
  }

  generateFooter() {
    return `
        <footer class="report-footer">
            <div class="footer-content">
                <div class="company-info">
                    <h3>StratAds</h3>
                    <p>Expert en audit marketing et acquisition digitale</p>
                </div>
                <div class="contact-info">
                    <p>Pour un audit complet personnalisé:</p>
                    <p>Contactez notre équipe d'experts</p>
                </div>
                <div class="report-info">
                    <p>Rapport généré le: ${new Date().toLocaleDateString('fr-FR')}</p>
                    <p>Type d'audit: ${this.mode}</p>
                </div>
            </div>
        </footer>`;
  }

  // Méthodes utilitaires
  formatTrackerName(tracker) {
    const names = {
      googleAnalytics: 'Google Analytics',
      googleTagManager: 'Google Tag Manager',
      facebookPixel: 'Meta Pixel',
      linkedinInsight: 'LinkedIn Insight',
      tiktokPixel: 'TikTok Pixel',
      googleAds: 'Google Ads',
      hotjar: 'Hotjar',
      mixpanel: 'Mixpanel',
      segment: 'Segment'
    };
    return names[tracker] || tracker;
  }

  getScoreLevel(score) {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Bon';
    if (score >= 40) return 'Moyen';
    return 'Faible';
  }

  getProfessionalStyles() {
    return `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #2c3e50;
            background: #f8f9fa;
        }
        
        .report-container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            box-shadow: 0 0 30px rgba(0,0,0,0.1);
        }
        
        /* Header */
        .report-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
        }
        
        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .logo h1 {
            font-size: 2.5em;
            margin-bottom: 5px;
        }
        
        .tagline {
            opacity: 0.9;
            font-size: 1.1em;
        }
        
        .report-info {
            text-align: right;
        }
        
        .report-info h2 {
            font-size: 2em;
            margin-bottom: 10px;
        }
        
        .mode {
            font-size: 1.2em;
            opacity: 0.9;
            margin-bottom: 5px;
        }
        
        .date {
            opacity: 0.8;
        }
        
        /* Sections */
        section {
            padding: 40px;
            border-bottom: 1px solid #e9ecef;
        }
        
        .section-header {
            margin-bottom: 30px;
        }
        
        .section-header h2 {
            font-size: 2em;
            color: #667eea;
            margin-bottom: 10px;
        }
        
        .section-subtitle {
            color: #6c757d;
            font-size: 1.1em;
        }
        
        /* Executive Summary */
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 30px;
            margin-bottom: 30px;
        }
        
        .summary-card {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 25px;
            border-left: 4px solid #667eea;
        }
        
        .summary-card.primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-left: none;
        }
        
        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .card-header h3 {
            font-size: 1.3em;
        }
        
        .score-value {
            font-size: 2em;
            font-weight: bold;
        }
        
        .score-bar {
            background: rgba(255,255,255,0.2);
            height: 8px;
            border-radius: 4px;
            overflow: hidden;
            margin: 15px 0;
        }
        
        .summary-card:not(.primary) .score-bar {
            background: #e9ecef;
        }
        
        .score-fill {
            height: 100%;
            background: #28a745;
            transition: width 0.3s ease;
        }
        
        .maturity {
            font-weight: 500;
            margin-top: 10px;
        }
        
        /* ROI Potential */
        .roi-potential {
            background: #e8f5e8;
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 30px;
            border-left: 4px solid #28a745;
        }
        
        .roi-potential h3 {
            color: #28a745;
            margin-bottom: 10px;
        }
        
        .potential-text {
            font-size: 1.1em;
            font-weight: 500;
        }
        
        /* Key Findings */
        .key-findings, .critical-issues {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 20px;
        }
        
        .critical-issues {
            background: #ffe6e6;
            border-left: 4px solid #dc3545;
        }
        
        .key-findings h3, .critical-issues h3 {
            margin-bottom: 15px;
        }
        
        .key-findings ul, .critical-issues ul {
            list-style: none;
        }
        
        .key-findings li, .critical-issues li {
            padding: 8px 0;
            padding-left: 25px;
            position: relative;
        }
        
        .key-findings li:before, .critical-issues li:before {
            content: "•";
            position: absolute;
            left: 0;
            color: #667eea;
            font-weight: bold;
        }
        
        .critical-issues li.critical:before {
            color: #dc3545;
        }
        
        /* Analysis Grid */
        .analysis-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 30px;
            margin-bottom: 30px;
        }
        
        .analysis-card {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 25px;
        }
        
        .analysis-card h3 {
            color: #667eea;
            margin-bottom: 20px;
            font-size: 1.3em;
        }
        
        .metrics, .marketing-elements, .conversion-elements {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        
        .metric, .element {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: white;
            border-radius: 8px;
        }
        
        .metric label, .element label {
            font-weight: 500;
            color: #6c757d;
        }
        
        .metric .value, .element .value {
            font-weight: bold;
        }
        
        .grade {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.9em;
            font-weight: bold;
        }
        
        .grade-a { background: #d4edda; color: #155724; }
        .grade-b { background: #cce5ff; color: #004085; }
        .grade-c { background: #fff3cd; color: #856404; }
        .grade-d { background: #f8d7da; color: #721c24; }
        
        /* Tracking Grid */
        .tracking-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
            margin-bottom: 15px;
        }
        
        .tracking-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            background: white;
            border-radius: 6px;
            border: 1px solid #e9ecef;
        }
        
        .tracking-item.detected {
            border-color: #28a745;
            background: #d4edda;
        }
        
        .tracker-name {
            font-weight: 500;
        }
        
        .status {
            font-weight: bold;
            color: #28a745;
        }
        
        /* Scores */
        .technical-score, .marketing-score {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 25px;
            text-align: center;
        }
        
        .technical-score h3, .marketing-score h3 {
            margin-bottom: 15px;
            color: #667eea;
        }
        
        /* Recommendations */
        .recommendations-grid {
            display: grid;
            gap: 30px;
        }
        
        .recommendation-card {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 25px;
            border-left: 4px solid #667eea;
        }
        
        .recommendation-card.priority-haute {
            border-left-color: #dc3545;
        }
        
        .recommendation-card.priority-moyenne {
            border-left-color: #ffc107;
        }
        
        .rec-header {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 15px;
        }
        
        .rec-number {
            background: #667eea;
            color: white;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
        }
        
        .rec-header h3 {
            flex: 1;
            font-size: 1.2em;
        }
        
        .priority {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: bold;
            text-transform: uppercase;
        }
        
        .priority-haute {
            background: #dc3545;
            color: white;
        }
        
        .priority-moyenne {
            background: #ffc107;
            color: #212529;
        }
        
        .rec-details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        
        .rec-details .detail {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        
        .rec-details label {
            font-weight: 500;
            color: #6c757d;
            font-size: 0.9em;
        }
        
        .rec-details .value {
            font-weight: bold;
        }
        
        /* Next Steps */
        .steps-timeline {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        
        .step-item {
            display: flex;
            align-items: center;
            gap: 20px;
        }
        
        .step-number {
            background: #667eea;
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 1.1em;
        }
        
        .step-content {
            flex: 1;
            background: #f8f9fa;
            padding: 15px 20px;
            border-radius: 8px;
        }
        
        .step-content h4 {
            color: #667eea;
            font-size: 1.1em;
        }
        
        /* Footer */
        .report-footer {
            background: #2c3e50;
            color: white;
            padding: 40px;
        }
        
        .footer-content {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 30px;
        }
        
        .company-info h3 {
            margin-bottom: 10px;
        }
        
        .contact-info p, .report-info p {
            margin-bottom: 5px;
            opacity: 0.9;
        }
        
        /* Responsive */
        @media (max-width: 768px) {
            .header-content {
                flex-direction: column;
                text-align: center;
                gap: 20px;
            }
            
            .report-info {
                text-align: center;
            }
            
            .summary-grid, .analysis-grid {
                grid-template-columns: 1fr;
            }
            
            .rec-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 10px;
            }
            
            .rec-details {
                grid-template-columns: 1fr;
            }
            
            .step-item {
                flex-direction: column;
                align-items: flex-start;
            }
        }
    `;
  }
}
