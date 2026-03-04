/**
 * Test de l'interface Electron avec la nouvelle architecture StratAds
 */

console.log("🧪 Test de l'interface Electron StratAds V2...");

// Simulation de l'API Electron pour tester
window.api = {
  onLog: (callback) => {
    console.log("📝 Log handler registered");
  },
  onProgress: (callback) => {
    console.log("📊 Progress handler registered");
  },
  onComplete: (callback) => {
    console.log("✅ Complete handler registered");
    
    // Simulation d'un résultat réussi
    setTimeout(() => {
      callback({
        success: true,
        folder: "C:\\test\\stratads-audit",
        pricing: {
          description: "Prospection 2min - Gratuit",
          price: 0
        }
      });
    }, 2000);
  },
  startAudit: (params) => {
    console.log("🚀 Start audit appelé avec:", params);
    
    // Simulation de progression
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      if (window.api.onProgress) {
        window.api.onProgress(progress);
      }
      
      if (progress >= 100) {
        clearInterval(interval);
        if (window.api.onComplete) {
          window.api.onComplete({
            success: true,
            folder: "C:\\test\\stratads-audit-result",
            pricing: {
              description: params.auditType === 'fast' ? "Prospection 2min - Gratuit" : 
                           params.auditType === 'public' ? "Public Complet - 2500€" :
                           params.auditType === 'private' ? "Private Audit - 5000€" :
                           "Full Audit - 7500€",
              price: params.auditType === 'fast' ? 0 : 
                     params.auditType === 'public' ? 2500 :
                     params.auditType === 'private' ? 5000 : 7500
            }
          });
        }
      }
    }, 300);
  }
};

console.log("✅ API Electron simulée - L'interface peut maintenant être testée");
