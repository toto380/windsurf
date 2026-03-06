#!/usr/bin/env node
/**
 * StratAds CLI V3 - Interface en ligne de commande complète
 * Support des 4 modes + imports CSV Google Ads / Meta Ads
 */

const { Backend } = require('../src/backend/index-minimal.cjs');

function showHelp() {
  console.log(`
StratAds Audit CLI V3

Usage: node cli.js [options]

Options:
  -u, --url <url>            URL du site (requis)
  -c, --company <name>       Nom entreprise (requis)
  -t, --type <type>          Type: fast|public|private|full (defaut: fast)
  --google-ads <path>        Chemin fichier CSV Google Ads (optionnel)
  --meta-ads <path>          Chemin fichier CSV Meta Ads (optionnel)
  --help                     Affiche cette aide
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    url: '',
    company: '',
    auditType: 'fast',
    googleAdsCSV: null,
    metaAdsCSV: null
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-u':
      case '--url':
        params.url = args[++i];
        break;
      case '-c':
      case '--company':
        params.company = args[++i];
        break;
      case '-t':
      case '--type':
        params.auditType = args[++i];
        break;
      case '--google-ads':
        params.googleAdsCSV = args[++i];
        break;
      case '--meta-ads':
        params.metaAdsCSV = args[++i];
        break;
      case '--help':
        showHelp();
        process.exit(0);
        break;
      default:
        if (args[i].startsWith('-')) {
          console.error(`Option inconnue: ${args[i]}`);
          process.exit(1);
        }
        break;
    }
  }

  if (!params.url || !params.company) {
    console.error('❌ URL et nom de l\'entreprise sont requis');
    showHelp();
    process.exit(1);
  }

  return params;
}

async function main() {
  try {
    const params = parseArgs();
    const backend = new Backend();

    console.log(`🚀 Lancement audit ${params.auditType} pour ${params.company}`);
    console.log(`📍 URL: ${params.url}`);

    const result = await backend.run(params, console.log, (pct) => {
      process.stdout.write(`\r⏳ Progression: ${pct}%`);
    });

    console.log('\n');

    if (result.success) {
      console.log(`✅ Audit terminé avec succès!`);
      console.log(`📁 Rapport généré dans: ${result.outputDir}`);
      console.log(`📊 Score: ${result.results.score}/100`);
    } else {
      console.error(`❌ Erreur: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Erreur fatale: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
