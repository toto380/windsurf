/**
 * STRATADS FAST AUDIT REPORT GENERATOR - Version Prospection
 * Génère le rapport HTML selon le cahier des charges
 */

import fs from "fs-extra";
import path from "node:path";

export class FastAuditReportGenerator {
  constructor(results) {
    this.results = results;
    this.company = results.meta.company;
  }

  generateHTML() {
    const { executiveSummary, acquisitionScore, performance, tracking, quickWins, growthPotential, conclusion } = this.results;
    
    return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StratAds Fast Audit - ${this.company}</title>
    <style>${this.getStyles()}</style>
</head>
<body>
    <div class="container">
        ${this.generateHeader()}
        ${this.generateExecutiveSummary(executiveSummary)}
        ${this.generateAcquisitionScore(acquisitionScore)}
        ${this.generatePerformance(performance)}
        ${this.generateTracking(tracking)}
        ${this.generateQuickWins(quickWins)}
        ${this.generateGrowthPotential(growthPotential)}
        ${this.generateConclusion(conclusion)}
    </div>
</body>
</html>`;
  }

  generateHeader() {
    return `
        <header class="header">
            <h1>🚀 StratAds Fast Audit</h1>
            <h2>${this.company}</h2>
            <p class="subtitle">Audit de prospection 2 minutes</p>
        </header>`;
  }

  generateExecutiveSummary(summary) {
    return `
        <section class="section">
            <h2>1. Résumé Exécutif</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <h3>Score Global Acquisition</h3>
                    <div class="score ${this.getScoreClass(summary.globalScore)}">${summary.globalScore}/100</div>
                    <div class="interpretation">${summary.maturityLevel}</div>
                </div>
                <div class="summary-card">
                    <h3>Niveau de Maturité</h3>
                    <div class="maturity-level">${summary.maturityLevel.toUpperCase()}</div>
                    <div class="interpretation">${this.getMaturityInterpretation(summary.maturityLevel)}</div>
                </div>
                <div class="summary-card">
                    <h3>Potentiel d'Amélioration</h3>
                    <div class="potential">${summary.potentialImprovement}</div>
                    <div class="interpretation">d'amélioration du ROI publicitaire</div>
                </div>
            </div>
            <div class="explanation">
                <p><strong>Diagnostic rapide :</strong> ${summary.potentialImprovement}</p>
            </div>
        </section>`;
  }

  generateAcquisitionScore(scores) {
    return `
        <section class="section">
            <h2>2. Score Acquisition</h2>
            <div class="score-grid">
                <div class="score-item">
                    <h4>Tracking</h4>
                    <div class="score-bar">
                        <div class="score-fill" style="width: ${scores.tracking}%"></div>
                    </div>
                    <span class="score-value">${scores.tracking}/25</span>
                </div>
                <div class="score-item">
                    <h4>Performance</h4>
                    <div class="score-bar">
                        <div class="score-fill" style="width: ${scores.performance}%"></div>
                    </div>
                    <span class="score-value">${scores.performance}/25</span>
                </div>
                <div class="score-item">
                    <h4>Conversion</h4>
                    <div class="score-bar">
                        <div class="score-fill" style="width: ${scores.conversion}%"></div>
                    </div>
                    <span class="score-value">${scores.conversion}/25</span>
                </div>
                <div class="score-item">
                    <h4>Economics</h4>
                    <div class="score-bar">
                        <div class="score-fill" style="width: ${scores.economics}%"></div>
                    </div>
                    <span class="score-value">${scores.economics}/25</span>
                </div>
            </div>
            ${this.generateRadarChart(scores)}
        </section>`;
  }

  generatePerformance(performance) {
    return `
        <section class="section">
            <h2>3. Performance du Site</h2>
            <div class="performance-grid">
                <div class="perf-card">
                    <h4>Score Performance</h4>
                    <div class="score ${this.getPerformanceClass(performance.speed)}">${performance.speed}/100</div>
                    <div class="interpretation">${performance.performanceLevel}</div>
                </div>
                <div class="perf-card">
                    <h4>Temps de Chargement</h4>
                    <div class="metric">${performance.loadTime}s</div>
                    <div class="interpretation">${this.getLoadTimeInterpretation(performance.loadTime)}</div>
                </div>
                <div class="perf-card">
                    <h4>Optimisation Mobile</h4>
                    <div class="status ${performance.mobileOptimized ? 'good' : 'bad'}">
                        ${performance.mobileOptimized ? '✅ Optimisé' : '❌ Non optimisé'}
                    </div>
                </div>
            </div>
        </section>`;
  }

  generateTracking(tracking) {
    return `
        <section class="section">
            <h2>4. Tracking Marketing</h2>
            <div class="tracking-grid">
                ${this.generateTrackingItem('Google Tag Manager', tracking.hasGTM)}
                ${this.generateTrackingItem('Google Analytics / GA4', tracking.detected.includes('ga4'))}
                ${this.generateTrackingItem('Meta Pixel', tracking.detected.includes('facebook'))}
                ${this.generateTrackingItem('Google Ads Tag', tracking.detected.includes('googleAds'))}
                ${this.generateTrackingItem('LinkedIn Insight', tracking.detected.includes('linkedin'))}
                ${this.generateTrackingItem('TikTok Pixel', tracking.detected.includes('tiktok'))}
            </div>
            <div class="tracking-impact">
                <h4>Impact du Tracking</h4>
                <p>${tracking.impact}</p>
            </div>
        </section>`;
  }

  generateQuickWins(wins) {
    return `
        <section class="section">
            <h2>5. Opportunités d'Optimisation</h2>
            <div class="wins-grid">
                ${wins.map((win, index) => `
                    <div class="win-card">
                        <div class="win-header">
                            <span class="win-number">${index + 1}</span>
                            <h4>${win.title}</h4>
                        </div>
                        <p class="win-explanation">${win.explanation}</p>
                        <div class="win-tags">
                            <span class="impact ${win.impact}">Impact: ${win.impact}</span>
                            <span class="effort ${win.effort}">Effort: ${win.effort}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </section>`;
  }

  generateGrowthPotential(potential) {
    return `
        <section class="section">
            <h2>6. Potentiel de Croissance</h2>
            <div class="growth-card">
                <h3>Potentiel Estimé d'Amélioration</h3>
                <div class="potential-value">${potential.potentialImprovement}</div>
                <div class="confidence">Confiance: ${potential.confidence}</div>
            </div>
            <div class="growth-explanation">
                <p>${potential.explanation}</p>
                <p class="note"><strong>Note :</strong> Votre système d'acquisition présente plusieurs optimisations possibles. Une amélioration du tracking, de la structure publicitaire et du funnel pourrait augmenter significativement la performance marketing.</p>
            </div>
        </section>`;
  }

  generateConclusion(conclusion) {
    return `
        <section class="section conclusion">
            <h2>7. Conclusion</h2>
            <div class="conclusion-content">
                <p>${conclusion.summary}</p>
                <div class="next-steps">
                    <h4>Prochaines Étapes</h4>
                    <ul>
                        ${conclusion.nextSteps.map(step => `<li>${step}</li>`).join('')}
                    </ul>
                </div>
                <div class="cta">
                    <h3>${conclusion.callToAction}</h3>
                    <div class="pricing-info">
                        <p><strong>Analyse complète acquisition</strong></p>
                        <p>Contactez-nous pour le tarif</p>
                    </div>
                </div>
            </div>
        </section>`;
  }

  // Composants graphiques
  generateTrackingItem(name, detected) {
    return `
            <div class="tracking-item ${detected ? 'detected' : 'missing'}">
                <span class="tracking-name">${name}</span>
                <span class="tracking-status">${detected ? '✅ Détecté' : '❌ Non détecté'}</span>
            </div>`;
  }

  generateRadarChart(scores) {
    return `
            <div class="radar-chart">
                <canvas id="radarChart" width="300" height="300"></canvas>
                <script>
                    (function() {
                        const canvas = document.getElementById('radarChart');
                        const ctx = canvas.getContext('2d');
                        
                        const data = [${scores.tracking}, ${scores.performance}, ${scores.conversion}, ${scores.economics}];
                        const labels = ['Tracking', 'Performance', 'Conversion', 'Economics'];
                        const angles = 4;
                        
                        // Simple radar chart
                        const centerX = 150;
                        const centerY = 150;
                        const radius = 100;
                        
                        // Draw grid
                        ctx.strokeStyle = '#e0e0e0';
                        ctx.lineWidth = 1;
                        
                        for (let i = 1; i <= 4; i++) {
                            ctx.beginPath();
                            for (let j = 0; j < angles; j++) {
                                const angle = (Math.PI * 2 * j) / angles - Math.PI / 2;
                                const x = centerX + Math.cos(angle) * (radius * i / 4);
                                const y = centerY + Math.sin(angle) * (radius * i / 4);
                                if (j === 0) ctx.moveTo(x, y);
                                else ctx.lineTo(x, y);
                            }
                            ctx.closePath();
                            ctx.stroke();
                        }
                        
                        // Draw data
                        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
                        ctx.strokeStyle = 'rgba(59, 130, 246, 1)';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        
                        data.forEach((value, index) => {
                            const angle = (Math.PI * 2 * index) / angles - Math.PI / 2;
                            const x = centerX + Math.cos(angle) * (radius * value / 25);
                            const y = centerY + Math.sin(angle) * (radius * value / 25);
                            
                            if (index === 0) ctx.moveTo(x, y);
                            else ctx.lineTo(x, y);
                        });
                        
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();
                    })();
                </script>
            </div>`;
  }

  // Méthodes utilitaires
  getScoreClass(score) {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'average';
    return 'poor';
  }

  getPerformanceClass(speed) {
    if (speed > 80) return 'excellent';
    if (speed > 60) return 'good';
    if (speed > 40) return 'average';
    return 'poor';
  }

  getMaturityInterpretation(level) {
    const interpretations = {
      'chaotique': 'Système désorganisé - Optimisations majeures requises',
      'structuré': 'Système fonctionnel mais inefficace - Optimisations ciblées',
      'data-driven': 'Système organisé - Optimisations fines possibles',
      'scaling ready': 'Système mature - Optimisations continues'
    };
    return interpretations[level] || 'Niveau inconnu';
  }

  getLoadTimeInterpretation(loadTime) {
    if (loadTime < 2) return 'Rapide';
    if (loadTime < 3) return 'Correct';
    if (loadTime < 4) return 'Lent';
    return 'Très lent';
  }

  getStyles() {
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
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .summary-card { text-align: center; padding: 20px; border-radius: 8px; background: #f8f9fa; }
        .score { font-size: 2em; font-weight: bold; margin: 10px 0; }
        .score.excellent { color: #22c55e; }
        .score.good { color: #3b82f6; }
        .score.average { color: #f59e0b; }
        .score.poor { color: #ef4444; }
        .maturity-level { font-size: 1.2em; font-weight: bold; margin: 10px 0; }
        .interpretation { font-size: 0.9em; color: #666; }
        .score-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .score-item { padding: 15px; border-radius: 8px; background: #f8f9fa; }
        .score-item h4 { margin-bottom: 10px; color: #333; }
        .score-bar { background: #e5e7eb; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 5px; }
        .score-fill { background: #667eea; height: 100%; transition: width 0.3s ease; }
        .score-value { font-weight: bold; color: #667eea; }
        .performance-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
        .perf-card { text-align: center; padding: 20px; border-radius: 8px; background: #f8f9fa; }
        .metric { font-size: 1.5em; font-weight: bold; margin: 10px 0; }
        .status.good { color: #22c55e; font-weight: bold; }
        .status.bad { color: #ef4444; font-weight: bold; }
        .tracking-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .tracking-item { display: flex; justify-content: space-between; align-items: center; padding: 15px; border-radius: 8px; }
        .tracking-item.detected { background: #d1fae5; }
        .tracking-item.missing { background: #fee2e2; }
        .tracking-name { font-weight: bold; }
        .tracking-impact { margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; }
        .wins-grid { display: grid; gap: 20px; }
        .win-card { padding: 20px; border-radius: 8px; background: #f8f9fa; border-left: 4px solid #667eea; }
        .win-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .win-number { background: #667eea; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; }
        .win-explanation { margin-bottom: 15px; color: #333; }
        .win-tags { display: flex; gap: 10px; }
        .impact, .effort { padding: 4px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; }
        .impact.élevé { background: #fee2e2; color: #991b1b; }
        .impact.moyen { background: #fef3c7; color: #92400e; }
        .effort.faible { background: #dbeafe; color: #1e40af; }
        .effort.moyen { background: #fef3c7; color: #92400e; }
        .growth-card { text-align: center; padding: 30px; border-radius: 8px; background: #f8f9fa; margin-bottom: 20px; }
        .potential-value { font-size: 2em; font-weight: bold; color: #667eea; margin-bottom: 10px; }
        .confidence { font-style: italic; color: #666; }
        .growth-explanation { background: #f8f9fa; padding: 20px; border-radius: 8px; }
        .note { font-style: italic; color: #666; margin-top: 15px; }
        .conclusion { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px; }
        .conclusion-content { padding: 30px; }
        .next-steps { margin: 20px 0; }
        .next-steps ul { list-style: none; padding: 0; }
        .next-steps li { margin: 10px 0; padding-left: 20px; position: relative; }
        .next-steps li:before { content: "•"; position: absolute; left: 0; color: #667eea; font-weight: bold; }
        .cta { text-align: center; margin-top: 30px; }
        .cta h3 { font-size: 1.5em; margin-bottom: 10px; }
        .pricing-info { background: rgba(255,255,255,0.1); padding: 20px; border-radius: 8px; }
        .radar-chart { display: flex; justify-content: center; margin: 20px 0; }
    `;
  }

  async saveToFile(outputPath) {
    const html = this.generateHTML();
    await fs.writeFile(outputPath, html, 'utf-8');
    return outputPath;
  }
}
