// ===== StratAds Backend - Minimal CJS Version =====
const fs = require('fs-extra');
const path = require('path');

function sanitizeFilename(str) {
  return str
    .replace(/[<>:"\/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 50);
}

class Backend {
  constructor() {
    this.engine = null;
    this.generator = null;
    this.pdfExporter = null;
  }

  async testConnections(params, log = console.log) {
    log('[Backend] 🔧 Testing API connections...');
    
    try {
      // For now, just return a mock success
      log('[Backend] ✅ Connection tests completed (mock)');
      return { success: true, results: { google: 'ok', meta: 'ok' } };
    } catch (error) {
      log(`[Backend] ❌ Connection test error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async run(params, log = console.log, progress = () => {}) {
    const { url, company, auditType } = params;
    
    log(`[Backend] 🚀 ${auditType.toUpperCase()} - ${company}`);
    
    try {
      progress(5);
      
      // Mock audit results for UI testing
      const results = {
        url,
        company,
        auditType,
        score: Math.floor(Math.random() * 30) + 70,
        timestamp: new Date().toISOString(),
        issues: [],
        recommendations: []
      };
      
      progress(50);
      
      // Mock report
      const report = {
        html: `<!DOCTYPE html>
<html>
<head><title>${company} - Audit Report</title></head>
<body>
<h1>Audit Report for ${company}</h1>
<p>URL: ${url}</p>
<p>Type: ${auditType}</p>
<p>Score: ${results.score}/100</p>
<p>Generated: ${results.timestamp}</p>
</body>
</html>`,
        metadata: {
          auditType,
          score: results.score,
          company,
          url
        }
      };
      
      progress(80);
      
      const outputDir = await this.save(results, report, params);
      progress(95);
      
      progress(100);
      
      return {
        success: true,
        outputDir,
        report,
        pdfPath: null, // Skip PDF for now
        results,
      };
    } catch (error) {
      log(`[Backend] ❌ Audit failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async save(results, report, params) {
    const { company, auditType } = params;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = sanitizeFilename(company);
    const dirName = `${safeName}-${auditType}-${timestamp}`;
    
    const outputDir = path.join(process.cwd(), 'reports', dirName);
    await fs.ensureDir(outputDir);
    
    const htmlPath = path.join(outputDir, 'report.html');
    await fs.writeFile(htmlPath, report.html);
    
    const jsonPath = path.join(outputDir, 'audit-data.json');
    await fs.writeFile(jsonPath, JSON.stringify({ results, metadata: report.metadata }, null, 2));
    
    return outputDir;
  }
}

module.exports = { Backend };
