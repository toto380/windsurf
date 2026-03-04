/**
 * STRATADS ORCHESTRATOR - Nouvel orchestrateur business-oriented
 * Remplace l'ancien orchestrator technique par une approche commerciale
 */

import { StratadsAuditEngine } from "./stratads-engine.js";
import { StratadsReportGenerator } from "../main/stratads-report-generator.js";
import fs from "fs-extra";
import path from "node:path";

export class StratadsOrchestrator {
  constructor() {
    this.engine = null;
    this.generator = null;
  }

  async runAudit(params, log = console.log, progress = () => {}) {
    const { url, company, auditType, serviceAccountData } = params;
    
    log(`[StratAds] 🚀 Lancement audit ${auditType.toUpperCase()} pour ${company}`);
    log(`[StratAds] 🌐 URL: ${url}`);
    
    try {
      // Initialisation du moteur
      this.engine = new StratadsAuditEngine(url, company, { auditType });
      progress(10);
      
      // Exécution de l'audit selon le type
      let auditResults;
      switch (auditType) {
        case 'fast':
          log(`[StratAds] ⚡ Mode Fast Audit (2min) - Prospection`);
          auditResults = await this.engine.runFastAudit();
          progress(50);
          break;
          
        case 'public':
          log(`[StratAds] 📊 Mode Public Complet (2500€)`);
          auditResults = await this.engine.runPublicComplete();
          progress(50);
          break;
          
        case 'private':
          if (!serviceAccountData) {
            throw new Error('Données service account requises pour audit private');
          }
          log(`[StratAds] 🔐 Mode Private Audit (5000€)`);
          auditResults = await this.engine.runPrivateAudit(serviceAccountData);
          progress(50);
          break;
          
        case 'full':
          if (!serviceAccountData) {
            throw new Error('Données service account requises pour audit full');
          }
          log(`[StratAds] 👑 Mode Full Audit (Premium)`);
          auditResults = await this.engine.runFullAudit(serviceAccountData);
          progress(50);
          break;
          
        default:
          throw new Error(`Type d'audit non reconnu: ${auditType}`);
      }
      
      progress(80);
      
      // Génération du rapport
      log(`[StratAds] 📝 Génération du rapport...`);
      this.generator = new StratadsReportGenerator(auditResults);
      const report = await this.generator.generateReport();
      
      progress(90);
      
      // Sauvegarde des résultats
      const outputDir = await this.saveResults(auditResults, report, params);
      
      progress(100);
      log(`[StratAds] ✅ Audit terminé avec succès`);
      log(`[StratAds] 📁 Rapport sauvegardé dans: ${outputDir}`);
      
      return {
        success: true,
        outputDir,
        report,
        auditResults,
        type: auditType
      };
      
    } catch (error) {
      log(`[StratAds] ❌ Erreur lors de l'audit: ${error.message}`);
      return {
        success: false,
        error: error.message,
        type: auditType
      };
    }
  }

  async saveResults(auditResults, report, params) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputDir = path.join(process.cwd(), 'tmp', `stratads-audit-${params.company.replace(/\s+/g, '-').toLowerCase()}-${timestamp}`);
    
    await fs.ensureDir(outputDir);
    
    // Sauvegarde des résultats bruts
    await fs.writeJson(
      path.join(outputDir, 'audit-results.json'),
      auditResults,
      { spaces: 2 }
    );
    
    // Sauvegarde du rapport HTML
    await fs.writeFile(
      path.join(outputDir, report.filename),
      report.html,
      'utf-8'
    );
    
    // Métadonnées
    await fs.writeJson(
      path.join(outputDir, 'metadata.json'),
      {
        company: params.company,
        url: params.url,
        auditType: params.auditType,
        timestamp: new Date().toISOString(),
        reportFile: report.filename,
        pricing: this.getPricing(params.auditType)
      },
      { spaces: 2 }
    );
    
    return outputDir;
  }

  getPricing(auditType) {
    const pricing = {
      fast: { price: 0, description: 'Gratuit - Prospection 2min' },
      public: { price: 2500, description: 'Public Complet' },
      private: { price: 5000, description: 'Private Audit' },
      full: { price: 7500, description: 'Full Audit Premium' }
    };
    
    return pricing[auditType] || { price: 0, description: 'Non défini' };
  }

  // Validation des paramètres
  validateParams(params) {
    const { url, company, auditType } = params;
    
    if (!url || !this.isValidUrl(url)) {
      throw new Error('URL invalide ou manquante');
    }
    
    if (!company || company.trim().length === 0) {
      throw new Error('Nom de l\'entreprise manquant');
    }
    
    const validTypes = ['fast', 'public', 'private', 'full'];
    if (!validTypes.includes(auditType)) {
      throw new Error(`Type d'audit invalide. Types valides: ${validTypes.join(', ')}`);
    }
    
    if ((auditType === 'private' || auditType === 'full') && !params.serviceAccountData) {
      throw new Error('Données service account requises pour les audits privés');
    }
    
    return true;
  }

  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Méthode utilitaire pour lancer un audit rapide
  static async quickAudit(url, company) {
    const orchestrator = new StratadsOrchestrator();
    
    return await orchestrator.runAudit({
      url,
      company,
      auditType: 'fast'
    });
  }

  // Méthode utilitaire pour lancer tous les types d'audits
  static async fullAuditSuite(url, company, serviceAccountData) {
    const orchestrator = new StratadsOrchestrator();
    const results = {};
    
    // Lancement de tous les types d'audits
    for (const auditType of ['fast', 'public']) {
      console.log(`\n[StratAds] Lancement audit ${auditType}...`);
      results[auditType] = await orchestrator.runAudit({
        url,
        company,
        auditType
      });
    }
    
    // Audits privés si service account disponible
    if (serviceAccountData) {
      for (const auditType of ['private', 'full']) {
        console.log(`\n[StratAds] Lancement audit ${auditType}...`);
        results[auditType] = await orchestrator.runAudit({
          url,
          company,
          auditType,
          serviceAccountData
        });
      }
    }
    
    return results;
  }
}
