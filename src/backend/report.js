/**
 * STRATADS BACKEND - REPORT
 * Générateur de rapports HTML minimal
 */

export class ReportGenerator {
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
}
