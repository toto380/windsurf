#!/usr/bin/env node
/**
 * StratAds CLI V3 - Interface en ligne de commande complète
 * Support des 4 modes + imports CSV Google Ads / Meta Ads
 */

import { Backend } from '../src/backend/index.js';

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
  --output <path>            Dossier de sortie (defaut: ./tmp)
  -h, --help                 Affiche cette aide

Types:
  fast     - Prospection gratuite (2 min)
  public   - Audit technique complet (~2500€)
  private  - Audit data marketing (~3500-4000€) + CSV Ads
  full     - Audit premium 360° (~5000€) + CSV Ads

Exemples:
  node cli.js -u https://example.com -c "Example" -t fast
  node cli.js -u https://example.com -c "Example" -t private --google-ads ./ads.csv
  node cli.js -u https://example.com -c "Example" -t full --google-ads ./gads.csv --meta-ads ./meta.csv
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const params = { 
    url: null, 
    company: null, 
    auditType: 'fast',
    googleAdsCSV: null,
    metaAdsCSV: null,
    output: null
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-u': case '--url': params.url = args[++i]; break;
      case '-c': case '--company': params.company = args[++i]; break;
      case '-t': case '--type': params.auditType = args[++i]; break;
      case '--google-ads': params.googleAdsCSV = args[++i]; break;
      case '--meta-ads': params.metaAdsCSV = args[++i]; break;
      case '--output': params.output = args[++i]; break;
      case '-h': case '--help': showHelp(); process.exit(0);
    }
  }
  
  return params;
}

async function main() {
  const params = parseArgs();
  
  if (!params.url || !params.company) {
    console.error('❌ URL et company requis');
    showHelp();
    process.exit(1);
  }
  
  console.log(`\n🚀 StratAds ${params.auditType.toUpperCase()} - ${params.company}\n`);
  
  if (params.googleAdsCSV) {
    console.log(`📥 Google Ads CSV: ${params.googleAdsCSV}`);
  }
  if (params.metaAdsCSV) {
    console.log(`📥 Meta Ads CSV: ${params.metaAdsCSV}`);
  }
  
  const backend = new Backend();
  const result = await backend.run(
    params,
    msg => console.log(msg),
    pct => console.log(`Progress: ${pct}%`)
  );
  
  if (result.success) {
    console.log(`\n✅ Audit terminé !`);
    console.log(`📁 Dossier: ${result.outputDir}`);
    console.log(`📄 HTML: ${result.outputDir}/report.html`);
    if (result.pdfPath) {
      console.log(`📄 PDF: ${result.pdfPath}`);
    }
    console.log(`📊 Score Global: ${result.results.scores.global}/100`);
    console.log(`🔧 Score Technique: ${result.results.scores.technical}/100`);
    console.log(`� Score Marketing: ${result.results.scores.marketing}/100`);
    if (result.results.scores.data !== undefined) {
      console.log(`📈 Score Data: ${result.results.scores.data}/100`);
    }
    console.log(`🎯 Maturité: ${result.results.scores.maturity}\n`);
  } else {
    console.error(`\n❌ Erreur: ${result.error}\n`);
    process.exit(1);
  }
}

main();
