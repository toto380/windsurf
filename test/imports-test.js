/**
 * Test simple pour valider les imports de la nouvelle architecture
 */

console.log("🧪 Test des imports StratAds V2...");

try {
  // Test import du nouvel orchestrator
  const { StratadsOrchestrator } = await import("../src/engine/stratads-orchestrator.js");
  console.log("✅ StratadsOrchestrator importé avec succès");
  
  // Test création de l'orchestrator
  const orchestrator = new StratadsOrchestrator();
  console.log("✅ StratadsOrchestrator instancié avec succès");
  
  // Test pricing
  const pricing = orchestrator.getPricing('fast');
  console.log("✅ Pricing fast:", pricing);
  
  // Test validation
  const validation = orchestrator.validateParams({
    url: "https://example.com",
    company: "Test Company",
    auditType: "fast"
  });
  console.log("✅ Validation params:", validation);
  
  console.log("\n🎉 Tous les imports StratAds V2 fonctionnent !");
  
} catch (error) {
  console.error("❌ Erreur lors des imports:", error.message);
  console.error("Stack:", error.stack);
}
