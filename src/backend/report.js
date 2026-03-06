/**
 * STRATADS BACKEND - REPORT
 * Générateur de rapports HTML minimal
 */

class ReportGenerator {
  constructor(results) {
    this.results = results;
    this.company = results.meta.company;
    this.type = results.meta.auditType;
  }

  async generate() {
    const html = this.buildHTML();
    
    return {
      html,
      filename: `audit-${this.type}-${this.company.replace(/\s+/g, "-").toLowerCase()}.html`
    };
  }

  buildHTML() {
    const { scores, technical, marketing, recommendations } = this.results;
    
    return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Audit ${this.company}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f8f9fa; }
        .container { max-width: 1000px; margin: 0 auto; background: white; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
        header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; }
        header h1 { font-size: 2em; margin-bottom: 5px; }
        header p { opacity: 0.9; }
        section { padding: 30px; border-bottom: 1px solid #e9ecef; }
        h2 { color: #667eea; margin-bottom: 20px; }
        .score-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .score-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .score-card.primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
        .score-value { font-size: 2em; font-weight: bold; margin: 10px 0; }
        .metric { display: flex; justify-content: space-between; padding: 10px; background: #f8f9fa; margin-bottom: 10px; border-radius: 4px; }
        .rec { background: #f8f9fa; padding: 15px; margin-bottom: 10px; border-radius: 8px; border-left: 4px solid #667eea; }
        .rec.priority-haute { border-left-color: #dc3545; }
        .priority { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; text-transform: uppercase; }
        .priority-haute { background: #dc3545; color: white; }
        footer { background: #2c3e50; color: white; padding: 20px; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>StratAds Audit</h1>
            <p>${this.company} - ${this.type.toUpperCase()}</p>
        </header>
        
        <section>
            <h2>📊 Scores</h2>
            <div class="score-grid">
                <div class="score-card primary">
                    <h3>Global</h3>
                    <div class="score-value">${scores.global}/100</div>
                    <p>${scores.maturity}</p>
                </div>
                <div class="score-card">
                    <h3>Technique</h3>
                    <div class="score-value">${scores.technical}/100</div>
                </div>
                <div class="score-card">
                    <h3>Marketing</h3>
                    <div class="score-value">${scores.marketing}/100</div>
                </div>
            </div>
        </section>
        
        <section>
            <h2>⚡ Performance</h2>
            <div class="metric">
                <span>Temps de chargement</span>
                <strong>${technical.performance.loadTime}s (${technical.performance.grade})</strong>
            </div>
            <div class="metric">
                <span>HTTPS</span>
                <strong>${technical.structure.hasHttps ? "✅" : "❌"}</strong>
            </div>
            <div class="metric">
                <span>Mobile</span>
                <strong>${technical.structure.hasViewport ? "✅" : "❌"}</strong>
            </div>
        </section>
        
        <section>
            <h2>📡 Tracking</h2>
            <div class="metric">
                <span>Outils détectés</span>
                <strong>${marketing.tracking.detected.length}</strong>
            </div>
            ${marketing.tracking.detected.map(t => `<div class="metric"><span>${t}</span><strong>✅</strong></div>`).join("")}
        </section>
        
        <!-- ANALYTICS DASHBOARD -->
        ${this.generateAnalyticsDashboard()}
        
        <!-- GROWTH FORECAST -->
        ${this.generateGrowthForecastSection()}
        
        <!-- QUICK WINS -->
        ${this.generateQuickWinsEngineSection()}
        
        <!-- SCALING PLAN -->
        ${this.generateScalingPlanSection()}
        
        <section>
            <h2>💡 Recommandations</h2>
            ${recommendations.map(rec => `
                <div class="rec priority-${rec.priority.toLowerCase()}">
                    <span class="priority priority-${rec.priority.toLowerCase()}">${rec.priority}</span>
                    <h4>${rec.title}</h4>
                    <p>Impact: ${rec.impact}</p>
                </div>
            `).join("")}
        </section>
        
        <footer>
            <p>StratAds - Audit Marketing Professionnel</p>
        </footer>
    </div>
</body>
</html>`;
  }

  /**
   * Generate Analytics Dashboard with data sources and real metrics
   */
  generateAnalyticsDashboard() {
    const forecastInputs = this.results.forecastInputsFinal;
    const baseline = forecastInputs?.baseline || {};
    
    // Helper to format metric with source
    const formatMetric = (metric, label, format = 'number') => {
      if (!metric || metric.value === null || metric.value === undefined) {
        return `<div style="text-align: center; padding: 15px; background: #f8fafc; border-radius: 10px; border: 1px dashed #cbd5e1;">
          <div style="font-size: 1.8em; font-weight: 700; color: #94a3b8;">N/A</div>
          <div style="font-size: 0.75em; color: #64748b; margin-top: 5px;">${label}</div>
          <div style="font-size: 0.7em; color: #94a3b8; margin-top: 3px;">${metric?.reason || 'Non disponible'}</div>
        </div>`;
      }
      const value = format === 'currency' ? `€${metric.value.toLocaleString()}` : 
                   format === 'percent' ? `${metric.value.toFixed(2)}%` :
                   format === 'decimal' ? metric.value.toFixed(2) :
                   metric.value.toLocaleString();
      const color = metric.confidence === 'HIGH' ? '#10b981' : metric.confidence === 'MEDIUM' ? '#f59e0b' : '#ef4444';
      return `<div style="text-align: center; padding: 15px; background: white; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-top: 3px solid ${color};">
        <div style="font-size: 1.8em; font-weight: 700; color: #1e293b;">${value}</div>
        <div style="font-size: 0.75em; color: #64748b; margin-top: 5px;">${label}</div>
        <div style="font-size: 0.7em; color: ${color}; margin-top: 3px;">📊 ${metric.source || 'Unknown'}</div>
      </div>`;
    };
    
    // Data Sources Info Panel
    const analysisWindow = forecastInputs?.analysisWindow;
    const dataSourcesInfo = analysisWindow ? `
    <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 25px; border: 1px solid #e2e8f0;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h4 style="margin: 0; color: #1e293b; font-size: 1em;">📅 Période d'analyse</h4>
        <span style="font-size: 0.85em; color: #64748b;">${analysisWindow.days} jours</span>
      </div>
      <div style="display: flex; gap: 20px; font-size: 0.85em; color: #64748b;">
        <span>Du: ${new Date(analysisWindow.startDate).toLocaleDateString('fr-FR')}</span>
        <span>Au: ${new Date(analysisWindow.endDate).toLocaleDateString('fr-FR')}</span>
      </div>
      ${forecastInputs?.dataCoverage !== undefined ? `
      <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.85em; color: #64748b;">Couverture données:</span>
          <span style="font-size: 0.85em; font-weight: 600; color: ${forecastInputs.dataCoverage >= 75 ? '#10b981' : forecastInputs.dataCoverage >= 50 ? '#f59e0b' : '#ef4444'};">${forecastInputs.dataCoverage}%</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px;">
          <span style="font-size: 0.85em; color: #64748b;">Confiance globale:</span>
          <span style="font-size: 0.85em; font-weight: 600; color: ${forecastInputs.confidenceGlobal === 'HIGH' ? '#10b981' : forecastInputs.confidenceGlobal === 'MEDIUM' ? '#f59e0b' : '#ef4444'};">${forecastInputs.confidenceGlobal}</span>
        </div>
      </div>` : ''}
    </div>` : '';
    
    // Real Data KPIs from baseline
    const realDataKPIs = baseline.sessions ? `
    <div style="margin-bottom: 25px;">
      <h4 style="margin: 0 0 15px 0; color: #1e293b; font-size: 1em;">📊 Métriques réelles (Baseline)</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px; margin-bottom: 20px;">
        ${formatMetric(baseline.sessions, 'Sessions')}
        ${formatMetric(baseline.conversions, 'Conversions')}
        ${formatMetric(baseline.conversionRate, 'Taux conversion', 'percent')}
        ${formatMetric(baseline.revenue, 'Revenus', 'currency')}
        ${formatMetric(baseline.spend, 'Dépenses Ads', 'currency')}
        ${formatMetric(baseline.aov, 'Panier moyen', 'currency')}
        ${formatMetric(baseline.roas, 'ROAS', 'decimal')}
        ${formatMetric(baseline.cac, 'CAC', 'currency')}
      </div>
    </div>` : '';
    
    return `
    <section class="section page-break">
        <h2>📊 Dashboard Analytics</h2>
        <p style="color: #64748b; margin-bottom: 25px; font-size: 0.95em;">Vue d'ensemble des performances et opportunités d'optimisation</p>
        
        ${dataSourcesInfo}
        ${realDataKPIs}
    </section>`;
  }

  /**
   * Generate Quick Wins Engine Section
   */
  generateQuickWinsEngineSection() {
    const quickWins = this.results.quickWins || [];
    
    if (quickWins.length === 0) {
      return '';
    }
    
    const quickWinsHTML = quickWins.map(qw => `
      <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-left: 4px solid ${qw.confidence === 'HIGH' ? '#10b981' : qw.confidence === 'MEDIUM' ? '#f59e0b' : '#ef4444'};">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h4 style="margin: 0; color: #1e293b;">${qw.title}</h4>
          <span style="font-size: 0.75em; padding: 4px 8px; border-radius: 4px; background: ${qw.source === 'private' ? '#dbeafe' : '#f3f4f6'}; color: ${qw.source === 'private' ? '#1d4ed8' : '#6b7280'};">${qw.source === 'private' ? 'Données privées' : 'Données publiques'}</span>
        </div>
        <p style="color: #64748b; margin-bottom: 10px;">${qw.problem}</p>
        <div style="display: flex; gap: 15px; font-size: 0.85em;">
          <span style="color: #10b981;">Impact: ${qw.impactScore}/10</span>
          <span style="color: #f59e0b;">Effort: ${qw.effortScore}/10</span>
          ${qw.expectedGain ? `<span style="color: #667eea;">Gain: ${qw.expectedGain}</span>` : ''}
        </div>
      </div>
    `).join('');
    
    return `
    <section class="section page-break">
        <h2>⚡ Quick Wins Data-Driven</h2>
        <p style="color: #64748b; margin-bottom: 25px; font-size: 0.95em;">Opportunités identifiées basées sur les données réelles</p>
        ${quickWinsHTML}
    </section>`;
  }

  /**
   * Generate Scaling Plan Section
   */
  generateScalingPlanSection() {
    const scalingPlan = this.results.scalingPlan;
    
    if (!scalingPlan) {
      return '';
    }
    
    const phasesHTML = scalingPlan.phases?.map(phase => `
      <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <h4 style="margin: 0 0 15px 0; color: #1e293b;">${phase.name} (${phase.duration})</h4>
        <ul style="margin: 0; padding-left: 20px; color: #64748b;">
          ${phase.actions.map(action => `<li style="margin-bottom: 8px;">${action}</li>`).join('')}
        </ul>
      </div>
    `).join('') || '';
    
    return `
    <section class="section page-break">
        <h2>📈 Plan de Scaling</h2>
        <p style="color: #64748b; margin-bottom: 25px; font-size: 0.95em;">Plan basé sur ${scalingPlan.mode === 'private' ? 'données privées' : 'données publiques'}</p>
        ${phasesHTML}
    </section>`;
  }

  /**
   * Generate Growth Forecast Section
   */
  generateGrowthForecastSection() {
    const forecast = this.results.forecast;
    
    if (!forecast || forecast.status === 'disabled') {
      return `
      <section class="section page-break">
          <h2>📈 Prévisions de Croissance</h2>
          <div style="background: #fef3c7; border-radius: 12px; padding: 25px; border: 1px solid #f59e0b30;">
            <p style="color: #92400e; margin: 0;"><strong>Prévisions indisponibles:</strong> ${forecast?.reason || 'Données insuffisantes. Connectez GA4 ou GSC pour obtenir des prévisions.'}</p>
          </div>
      </section>`;
    }
    
    const projection = forecast.projection;
    const objective = forecast.objective;
    
    let projectionHTML = '';
    if (projection) {
      projectionHTML = `
        <div style="background: white; border-radius: 12px; padding: 25px; margin-bottom: 25px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <h4 style="margin: 0 0 20px 0; color: #1e293b;">📊 Scénarios de Projection</h4>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
            <div style="text-align: center; padding: 15px; background: #f8fafc; border-radius: 8px;">
              <div style="font-size: 1.2em; font-weight: 700; color: #64748b;">Conservateur</div>
              <div style="font-size: 1.5em; color: #1e293b; margin-top: 10px;">${projection.scenarios?.conservative?.traffic?.toLocaleString() || 'N/A'}</div>
              <div style="font-size: 0.8em; color: #64748b;">sessions</div>
            </div>
            <div style="text-align: center; padding: 15px; background: #dbeafe; border-radius: 8px;">
              <div style="font-size: 1.2em; font-weight: 700; color: #1d4ed8;">Réaliste</div>
              <div style="font-size: 1.5em; color: #1e293b; margin-top: 10px;">${projection.scenarios?.realistic?.traffic?.toLocaleString() || 'N/A'}</div>
              <div style="font-size: 0.8em; color: #64748b;">sessions</div>
            </div>
            <div style="text-align: center; padding: 15px; background: #dcfce7; border-radius: 8px;">
              <div style="font-size: 1.2em; font-weight: 700; color: #16a34a;">Ambitieux</div>
              <div style="font-size: 1.5em; color: #1e293b; margin-top: 10px;">${projection.scenarios?.ambitious?.traffic?.toLocaleString() || 'N/A'}</div>
              <div style="font-size: 0.8em; color: #64748b;">sessions</div>
            </div>
          </div>
          ${projection.assumptions ? `
          <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
            <h5 style="margin: 0 0 10px 0; color: #64748b; font-size: 0.9em;">Hypothèses:</h5>
            <ul style="margin: 0; padding-left: 20px; color: #64748b; font-size: 0.85em;">
              ${projection.assumptions.map(a => `<li>${a}</li>`).join('')}
            </ul>
          </div>
          ` : ''}
        </div>
      `;
    }
    
    return `
    <section class="section page-break">
        <h2>📈 Prévisions de Croissance</h2>
        <p style="color: #64748b; margin-bottom: 25px; font-size: 0.95em;">Projections basées sur les données réelles du baseline</p>
        ${projectionHTML}
    </section>`;
  }
}

module.exports = { ReportGenerator };
