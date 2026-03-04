/**
 * STRATADS CLI - Interface en ligne de commande pour les audits StratAds
 * Remplace l'ancien CLI par une approche commerciale
 */

import { StratadsOrchestrator } from "../src/engine/stratads-orchestrator.js";
import fs from "fs-extra";
import path from "node:path";

class StratadsCLI {
  constructor() {
    this.orchestrator = new StratadsOrchestrator();
  }

  async run(args) {
    try {
      const params = this.parseArgs(args);
      
      if (params.help) {
        this.showHelp();
        return;
      }
      
      if (params.version) {
        this.showVersion();
        return;
      }

      // Validation des paramètres
      this.orchestrator.validateParams(params);
      
      // Lancement de l'audit
      const result = await this.orchestrator.runAudit(
        params,
        this.log.bind(this),
        this.progress.bind(this)
      );
      
      if (result.success) {
        this.showSuccess(result);
      } else {
        this.showError(result.error);
        process.exit(1);
      }
      
    } catch (error) {
      this.showError(error.message);
      process.exit(1);
    }
  }

  parseArgs(args) {
    const params = {
      url: null,
      company: null,
      auditType: 'fast',
      serviceAccountPath: null,
      output: null,
      help: false,
      version: false
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const nextArg = args[i + 1];
      
      switch (arg) {
        case '--url':
        case '-u':
          params.url = nextArg;
          i++;
          break;
          
        case '--company':
        case '-c':
          params.company = nextArg;
          i++;
          break;
          
        case '--type':
        case '-t':
          if (['fast', 'public', 'private', 'full'].includes(nextArg)) {
            params.auditType = nextArg;
          } else {
            throw new Error(`Type d'audit invalide: ${nextArg}`);
          }
          i++;
          break;
          
        case '--service-account':
        case '-s':
          params.serviceAccountPath = nextArg;
          i++;
          break;
          
        case '--output':
        case '-o':
          params.output = nextArg;
          i++;
          break;
          
        case '--help':
        case '-h':
          params.help = true;
          break;
          
        case '--version':
        case '-v':
          params.version = true;
          break;
          
        default:
          if (arg.startsWith('--')) {
            throw new Error(`Argument inconnu: ${arg}`);
          }
      }
    }

    // Chargement du service account si spécifié
    if (params.serviceAccountPath) {
      try {
        params.serviceAccountData = fs.readJsonSync(params.serviceAccountPath);
      } catch (error) {
        throw new Error(`Impossible de lire le fichier service account: ${error.message}`);
      }
    }

    return params;
  }

  showHelp() {
    console.log(`
🚀 STRATADS AUDIT CLI - Outil d'audit business-oriented

USAGE:
  node scripts/stratads-cli.js [options]

OPTIONS:
  -u, --url <url>              URL du site à auditer (requis)
  -c, --company <nom>           Nom de l'entreprise (requis)
  -t, --type <type>            Type d'audit:
                                fast     - Gratuit, prospection 2min
                                public   - 2500€, complet public
                                private  - 5000€, avec données privées
                                full     - 7500€, premium
                                (défaut: fast)
  -s, --service-account <file>  Chemin vers le fichier JSON du service account
                                (requis pour private/full)
  -o, --output <dir>           Répertoire de sortie (défaut: ./tmp/)
  -h, --help                   Affiche cette aide
  -v, --version                Affiche la version

EXEMPLES:
  # Audit rapide de prospection (gratuit)
  node scripts/stratads-cli.js -u https://example.com -c "Ma Société"

  # Audit public complet (2500€)
  node scripts/stratads-cli.js -u https://example.com -c "Ma Société" -t public

  # Audit privé avec données Google (5000€)
  node scripts/stratads-cli.js -u https://example.com -c "Ma Société" -t private -s service-account.json

  # Audit premium complet (7500€)
  node scripts/stratads-cli.js -u https://example.com -c "Ma Société" -t full -s service-account.json

PRICING:
  Fast Audit     : Gratuit     (2min, prospection)
  Public Complet : 2500€       (analyse détaillée publique)
  Private Audit  : 5000€       (+ données Google APIs)
  Full Audit     : 7500€       (+ benchmarks & projections)

OUTPUT:
  Chaque audit génère:
  - Rapport HTML visuel pour CEO/Marketing
  - Données JSON brutes
  - Métadonnées et pricing

📞 Contact: contact@stratads.com
`);
  }

  showVersion() {
    console.log('StratAds Audit CLI v2.0.0');
    console.log('Business-oriented audit tool');
  }

  showSuccess(result) {
    const pricing = this.orchestrator.getPricing(result.type);
    
    console.log(`
✅ AUDIT TERMINÉ AVEC SUCCÈS

📊 Type: ${result.type.toUpperCase()}
🏢 Entreprise: ${result.auditResults.meta.company}
🌐 URL: ${result.auditResults.meta.url}
💰 Prix: ${pricing.description} (${pricing.price > 0 ? pricing.price + '€' : 'Gratuit'})

📁 Rapport généré: ${path.join(result.outputDir, result.report.filename)}
📂 Dossier complet: ${result.outputDir}

📈 Scores clés:
   Score Acquisition: ${result.auditResults.acquisitionScore?.global || 'N/A'}/100
   Performance Web: ${result.auditResults.performance?.speed || 'N/A'}/100
   Tracking Score: ${result.auditResults.tracking?.score || 'N/A'}/100

🚀 Pour une analyse complète, contactez-nous !
   Email: contact@stratads.com
   Tel: +33 1 23 45 67 89
`);
  }

  showError(message) {
    console.log(`
❌ ERREUR
${message}

💡 Utilisez --help pour voir l'aide complète
   node scripts/stratads-cli.js --help
`);
  }

  log(message) {
    console.log(message);
  }

  progress(percent) {
    const bar = '█'.repeat(Math.floor(percent / 5));
    const empty = '░'.repeat(20 - Math.floor(percent / 5));
    process.stdout.write(`\r⏳ Progression: [${bar}${empty}] ${percent}%`);
    
    if (percent === 100) {
      console.log('\n');
    }
  }
}

// Point d'entrée
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = new StratadsCLI();
  cli.run(process.argv.slice(2));
}

export default StratadsCLI;
