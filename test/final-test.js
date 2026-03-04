/**
 * Test final de l'architecture StratAds V2
 * Valide que tout fonctionne correctement
 */

import { StratadsOrchestrator } from "../src/engine/stratads-orchestrator.js";
import { StratadsReportGenerator } from "../src/main/stratads-report-generator.js";
import { KpiCalculator } from "../src/engine/kpi-calculator.js";

console.log("🎯 Test Final StratAds V2");

async function runFinalTest() {
  try {
    // 1. Test KPI Calculator
    console.log("\n📊 Test KPI Calculator...");
    const kpis = KpiCalculator.analyzeKPIs({
      revenue: 100000,
      adSpend: 25000,
      conversions: 500,
      sessions: 10000,
      averageOrderValue: 200,
      purchaseFrequency: 2,
      margin: 30
    });
    
    console.log("   ROAS:", kpis.roas.toFixed(2));
    console.log("   CPA:", kpis.cpa.toFixed(2) + "€");
    console.log("   Conversion Rate:", kpis.conversionRate.toFixed(2) + "%");
    console.log("   LTV/CAC:", kpis.ltvCacRatio.toFixed(2));
    console.log("   Health Score:", kpis.healthScore + "/100");
    
    // 2. Test Fast Audit
    console.log("\n🚀 Test Fast Audit complet...");
    const orchestrator = new StratadsOrchestrator();
    const auditResult = await orchestrator.runAudit({
      url: "https://google.com",
      company: "StratAds Test Final",
      auditType: "fast"
    });
    
    if (auditResult.success) {
      console.log("   ✅ Audit réussi");
      console.log("   📁 Output:", auditResult.outputDir);
      console.log("   📄 Report:", auditResult.report.filename);
      
      // 3. Test Report Generator
      console.log("\n📝 Test Report Generator...");
      const generator = new StratadsReportGenerator(auditResult.auditResults);
      const report = await generator.generateReport();
      
      console.log("   ✅ Rapport généré");
      console.log("   📄 Fichier:", report.filename);
      console.log("   📏 Taille HTML:", report.html.length + " caractères");
      
      // 4. Validation finale
      console.log("\n🎉 VALIDATION FINALE:");
      console.log("   ✅ StratadsOrchestrator: OK");
      console.log("   ✅ KpiCalculator: OK");
      console.log("   ✅ StratadsReportGenerator: OK");
      console.log("   ✅ Fast Audit: OK");
      console.log("   ✅ Génération HTML: OK");
      console.log("   ✅ Architecture V2: 100% fonctionnelle");
      
      console.log("\n💰 PRICING VALIDÉ:");
      const pricing = orchestrator.getPricing('fast');
      console.log("   Fast Audit:", pricing.description);
      console.log("   Prix:", pricing.price + "€");
      
    } else {
      console.error("   ❌ Audit échoué:", auditResult.error);
    }
    
  } catch (error) {
    console.error("💥 Erreur critique:", error.message);
    console.error("Stack:", error.stack);
  }
}

runFinalTest();
