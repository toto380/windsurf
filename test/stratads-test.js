/**
 * Test simple pour valider la nouvelle architecture StratAds
 */

import { StratadsOrchestrator } from "../src/engine/stratads-orchestrator.js";

async function testStratads() {
  console.log("🧪 Test de la nouvelle architecture StratAds...");
  
  try {
    const orchestrator = new StratadsOrchestrator();
    
    // Test Fast Audit
    console.log("\n📊 Test Fast Audit...");
    const result = await orchestrator.runAudit({
      url: "https://example.com",
      company: "Test Company",
      auditType: "fast"
    });
    
    if (result.success) {
      console.log("✅ Fast Audit réussi !");
      console.log(`📁 Output: ${result.outputDir}`);
      console.log(`📄 Report: ${result.report.filename}`);
      
      // Vérification des résultats
      const { auditResults } = result;
      console.log("\n📈 Résultats clés:");
      console.log(`   Score Acquisition: ${auditResults.acquisitionScore?.global || 'N/A'}/100`);
      console.log(`   Performance Web: ${auditResults.performance?.speed || 'N/A'}/100`);
      console.log(`   Tracking Score: ${auditResults.tracking?.score || 'N/A'}/100`);
      console.log(`   Potentiel Croissance: ${auditResults.growthPotential?.growthMultiplier || 'N/A'}x`);
      
    } else {
      console.log("❌ Fast Audit échoué:", result.error);
    }
    
  } catch (error) {
    console.error("💥 Erreur critique:", error.message);
  }
}

testStratads();
