#!/usr/bin/env node
/**
 * StratAds CLI - Interface en ligne de commande minimale
 */

import { Backend } from '../src/backend/index.js';

function showHelp() {
  console.log(`
StratAds Audit CLI

Usage: node cli.js [options]

Options:
  -u, --url <url>       URL du site (requis)
  -c, --company <name>  Nom entreprise (requis)
  -t, --type <type>     Type: fast|public|private|full (defaut: fast)
  -h, --help            Affiche cette aide

Types:
  fast     - Prospection gratuite (2 min)
  public   - Audit technique (2500€)
  private  - Audit data marketing (5000€)
  full     - Audit premium 360° (7500€)

Exemple:
  node cli.js -u https://example.com -c "Example" -t fast
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const params = { url: null, company: null, auditType: 'fast' };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-u': case '--url': params.url = args[++i]; break;
      case '-c': case '--company': params.company = args[++i]; break;
      case '-t': case '--type': params.auditType = args[++i]; break;
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
  
  const backend = new Backend();
  const result = await backend.run(
    params,
    msg => console.log(msg),
    pct => console.log(`Progress: ${pct}%`)
  );
  
  if (result.success) {
    console.log(`\n✅ Terminé !`);
    console.log(`📁 Rapport: ${result.outputDir}/${result.report.filename}`);
    console.log(`📊 Score: ${result.results.scores.global}/100`);
    console.log(`🎯 Maturité: ${result.results.scores.maturity}\n`);
  } else {
    console.error(`\n❌ Erreur: ${result.error}\n`);
    process.exit(1);
  }
}

main();
