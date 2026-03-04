/**
 * STRATADS BACKEND - INDEX
 * Orchestrateur minimal pour les 4 modes d'audit
 */

import fs from "fs-extra";
import path from "node:path";
import { AuditEngine } from "./audit.js";
import { ReportGenerator } from "./report.js";

export class Backend {
  constructor() {
    this.engine = null;
    this.generator = null;
  }

  async run(params, log = console.log, progress = () => {}) {
    const { url, company, auditType } = params;
    
    log(`[Backend] 🚀 ${auditType.toUpperCase()} - ${company}`);
    
    try {
      progress(10);
      
      // Validation
      if (!url || !company) throw new Error("URL et company requis");
      
      progress(30);
      
      // Exécution audit
      this.engine = new AuditEngine(url, company, auditType);
      const results = await this.engine.run();
      
      progress(70);
      
      // Génération rapport
      this.generator = new ReportGenerator(results);
      const report = await this.generator.generate();
      
      progress(90);
      
      // Sauvegarde
      const outputDir = await this.save(results, report, params);
      
      progress(100);
      
      log(`[Backend] ✅ Terminé`);
      
      return {
        success: true,
        outputDir,
        report,
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
    const companySafe = params.company.replace(/\s+/g, "-").toLowerCase();
    const outputDir = path.join(process.cwd(), "tmp", `${companySafe}-${timestamp}`);
    
    await fs.ensureDir(outputDir);
    await fs.writeJson(path.join(outputDir, "results.json"), results, { spaces: 2 });
    await fs.writeFile(path.join(outputDir, report.filename), report.html, "utf-8");
    
    return outputDir;
  }
}
