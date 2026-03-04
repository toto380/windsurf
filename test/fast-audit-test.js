/**
 * Test du Fast Audit Prospection selon le cahier des charges
 */

import fs from "fs-extra";
import { FastAuditProspection } from "../src/engine/fast-audit-prospection.js";
import { FastAuditReportGenerator } from "../src/main/fast-audit-report-generator.js";

async function testFastAudit() {
  console.log("🧪 Test Fast Audit Prospection...");
  
  try {
    // Test avec un site réel
    const fastAudit = new FastAuditProspection("https://google.com", "Google Test");
    const results = await fastAudit.run();
    
    console.log("✅ Fast Audit terminé !");
    console.log("📊 Résultats clés :");
    console.log(`   Score Global: ${results.executiveSummary.globalScore}/100`);
    console.log(`   Maturité: ${results.executiveSummary.maturityLevel}`);
    console.log(`   Potentiel: ${results.growthPotential.potentialImprovement}`);
    console.log(`   Quick Wins: ${results.quickWins.length} identifiés`);
    
    // Génération du rapport
    const reportGenerator = new FastAuditReportGenerator(results);
    const report = await reportGenerator.generateHTML();
    
    // Sauvegarde
    const outputPath = `./tmp/fast-audit-test-${Date.now()}.html`;
    await fs.writeFile(outputPath, report, 'utf-8');
    
    console.log(`📄 Rapport généré: ${outputPath}`);
    console.log(`📏 Taille: ${report.length} caractères`);
    
    // Validation du contenu
    const hasNoFinancialData = !report.includes('€') && !report.includes('1.2M') && !report.includes('chiffre d\'affaires');
    const hasOnlyPercentages = report.includes('%') && !report.includes('€');
    const hasScores = report.includes('/100') && report.includes('/25');
    
    console.log("\n🎯 Validation contraintes :");
    console.log(`   ✅ Pas de chiffres financiers: ${hasNoFinancialData}`);
    console.log(`   ✅ Estimations en % uniquement: ${hasOnlyPercentages}`);
    console.log(`   ✅ Scores présents: ${hasScores}`);
    
    if (hasNoFinancialData && hasOnlyPercentages && hasScores) {
      console.log("\n🎉 Fast Audit 100% conforme au cahier des charges !");
    } else {
      console.log("\n⚠️ Attention: Le rapport ne respecte pas toutes les contraintes");
    }
    
  } catch (error) {
    console.error("❌ Erreur:", error.message);
  }
}

testFastAudit();
