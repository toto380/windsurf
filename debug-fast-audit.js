/**
 * Debug du Fast Audit pour identifier l'erreur
 */

import { StratadsOrchestrator } from "./src/engine/stratads-orchestrator.js";

async function debugFastAudit() {
  console.log("🔍 Debug Fast Audit...");
  
  try {
    const orchestrator = new StratadsOrchestrator();
    
    const params = {
      url: "https://www.stratads.fr/",
      company: "StratAds",
      auditType: "fast"
    };
    
    console.log("📋 Params:", params);
    
    const result = await orchestrator.runAudit(params, 
      (msg) => console.log("LOG:", msg),
      (pct) => console.log("PROGRESS:", pct)
    );
    
    console.log("✅ Résultat:", result);
    
  } catch (error) {
    console.error("❌ Erreur:", error.message);
    console.error("Stack:", error.stack);
  }
}

debugFastAudit();
