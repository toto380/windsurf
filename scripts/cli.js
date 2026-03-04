#!/usr/bin/env node
/**
 * StratAds CLI
 * Usage: node scripts/cli.js audit --site https://... --mode prospection|public-full|private|public-private --inputs ./inputs/
 */

import path from 'node:path';
import fs from 'fs-extra';
import { fileURLToPath } from 'node:url';
import { runAudit } from '../src/engine/orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Helpers ───────────────────────────────────────────────────────────────────

function printUsage() {
  console.log(`
StratAds CLI — Audit web premium

Usage:
  node scripts/cli.js audit [options]

Options:
  --site <url>              URL du site à auditer (obligatoire)
  --mode <mode>             Mode d'audit : prospection | public-full | private | public-private
  --inputs <dir>            Dossier contenant les fichiers d'entrée privés (JSON, CSV)
  --output <dir>            Dossier de sortie des rapports (défaut: ./reports)
  --company <name>          Nom du client/entreprise
  --lang <lang>             Langue du rapport : fr | en (défaut: fr)
  --ga4-property-id <id>    GA4 Property ID (ex: 123456789)
  --gsc-site-url <url>      Search Console site URL
  --gtm-id <id>             GTM Container ID (ex: GTM-XXXX)
  --service-account <file>  Chemin vers le JSON service account Google
  --google-ads-csv <file>   Fichier export Google Ads CSV (peut être répété)
  --meta-ads-csv <file>     Fichier export Meta Ads CSV/XLSX (peut être répété)
  --help                    Afficher cette aide

Modes:
  prospection    Mini audit public (rapide, 1-2 pages)
  public-full    Audit technique complet (sans données privées)
  private        Audit données privées uniquement (GA4/GSC/Ads)
  public-private Audit 360° complet (public + privé)

Inputs directory structure (for --inputs):
  inputs/
    service-account.json    Compte de service Google (pour modes private/public-private)
    google-ads-*.csv        Exports Google Ads
    meta-ads-*.csv          Exports Meta Ads

Examples:
  node scripts/cli.js audit --site https://example.com --mode prospection
  node scripts/cli.js audit --site https://shop.com --mode public-full --output ./reports/shop
  node scripts/cli.js audit --site https://shop.com --mode public-private \\
    --inputs ./inputs --ga4-property-id 123456789 --gsc-site-url https://shop.com/
`);
}

function parseArgs(argv) {
  const args = {};
  const googleAdsCsv = [];
  const metaAdsCsv = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];

    switch (a) {
      case '--site': args.site = next; i++; break;
      case '--mode': args.mode = next; i++; break;
      case '--inputs': args.inputs = next; i++; break;
      case '--output': args.output = next; i++; break;
      case '--company': args.company = next; i++; break;
      case '--lang': args.lang = next; i++; break;
      case '--ga4-property-id': args.ga4PropertyId = next; i++; break;
      case '--gsc-site-url': args.gscSiteUrl = next; i++; break;
      case '--gtm-id': args.gtmId = next; i++; break;
      case '--service-account': args.serviceAccount = next; i++; break;
      case '--google-ads-csv': googleAdsCsv.push(next); i++; break;
      case '--meta-ads-csv': metaAdsCsv.push(next); i++; break;
      case '--help': args.help = true; break;
      default:
        if (!a.startsWith('--') && !args.command) args.command = a;
    }
  }

  args.googleAdsCsv = googleAdsCsv;
  args.metaAdsCsv = metaAdsCsv;
  return args;
}

function modeToReportModules(mode) {
  switch (mode) {
    case 'public-full':
    case 'public_full':
      return { publicLight: false, publicFull: true, privateAds: false, privateGoogle: false };
    case 'private':
    case 'private_only':
      return { publicLight: false, publicFull: false, privateAds: true, privateGoogle: true };
    case 'public-private':
    case 'public_private':
    case 'audit_360':
      return { publicLight: false, publicFull: true, privateAds: true, privateGoogle: true };
    case 'prospection':
    default:
      return { publicLight: true, publicFull: false, privateAds: false, privateGoogle: false };
  }
}

function modeToPreset(mode) {
  switch (mode) {
    case 'public-full': return 'full';
    case 'public-private': return 'full';
    case 'private':
    case 'private_only': return 'private';
    default: return 'classic';
  }
}

async function discoverInputs(inputsDir, args) {
  const discovered = {
    serviceAccount: args.serviceAccount || null,
    googleAdsCsv: [...args.googleAdsCsv],
    metaAdsCsv: [...args.metaAdsCsv],
  };

  if (!inputsDir) return discovered;

  const dir = path.resolve(inputsDir);
  if (!await fs.pathExists(dir)) {
    console.warn(`⚠️  Inputs directory not found: ${dir}`);
    return discovered;
  }

  const files = await fs.readdir(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (file.endsWith('.json') && (file.includes('service') || file.includes('sa-') || file.includes('service-account'))) {
      if (!discovered.serviceAccount) {
        discovered.serviceAccount = fullPath;
        console.log(`📄 Service account JSON found: ${file}`);
      }
    }
    if (/google.*ads.*\.csv$/i.test(file) || /gads.*\.csv$/i.test(file)) {
      discovered.googleAdsCsv.push(fullPath);
      console.log(`📊 Google Ads CSV found: ${file}`);
    }
    if (/meta.*ads.*\.(csv|xlsx)$/i.test(file) || /facebook.*\.(csv|xlsx)$/i.test(file)) {
      discovered.metaAdsCsv.push(fullPath);
      console.log(`📊 Meta Ads file found: ${file}`);
    }
  }

  return discovered;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  const args = parseArgs(argv);

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (args.command !== 'audit') {
    console.error(`❌ Unknown command: ${args.command || '(none)'}. Use 'audit'.`);
    printUsage();
    process.exit(1);
  }

  if (!args.site) {
    console.error('❌ --site is required. Example: --site https://example.com');
    process.exit(1);
  }

  let url;
  try {
    url = new URL(args.site).href;
  } catch {
    console.error(`❌ Invalid URL: ${args.site}`);
    process.exit(1);
  }

  const mode = args.mode || 'prospection';
  const validModes = ['prospection', 'public-full', 'private', 'public-private'];
  if (!validModes.includes(mode)) {
    console.error(`❌ Invalid mode: ${mode}. Valid: ${validModes.join(', ')}`);
    process.exit(1);
  }

  const inputs = await discoverInputs(args.inputs, args);
  const reportModules = modeToReportModules(mode);

  // Validate private requirements
  const needsPrivate = reportModules.privateGoogle || reportModules.privateAds;
  if (reportModules.privateGoogle && !inputs.serviceAccount) {
    console.error('❌ Private Google access requires a service account JSON. Use --service-account or --inputs directory.');
    process.exit(1);
  }
  if (reportModules.privateAds && inputs.googleAdsCsv.length === 0 && inputs.metaAdsCsv.length === 0) {
    console.warn('⚠️  Private Ads mode selected but no CSV exports found. Continuing without Ads data.');
  }

  const outputDir = args.output
    ? path.resolve(args.output)
    : path.join(process.cwd(), 'reports');

  const params = {
    url,
    company: args.company || new URL(url).hostname,
    lang: args.lang || 'fr',
    mode,
    reportModules,
    preset: modeToPreset(mode),
    accessMode: needsPrivate ? (reportModules.publicFull ? 'mixed' : 'private') : 'public',
    outputDir,
    serviceAccountJsonPath: inputs.serviceAccount,
    ga4PropertyId: args.ga4PropertyId || '',
    gscSiteUrl: args.gscSiteUrl || '',
    gtmPublicId: args.gtmId || '',
    adsExportPaths: inputs.googleAdsCsv.length ? inputs.googleAdsCsv : null,
    metaAdsExportPaths: inputs.metaAdsCsv.length ? inputs.metaAdsCsv : null,
    logo: 'favicon.png',
  };

  console.log('\n🚀 StratAds Audit CLI');
  console.log(`   URL    : ${url}`);
  console.log(`   Mode   : ${mode}`);
  console.log(`   Output : ${outputDir}`);
  console.log('');

  function log(msg) {
    if (typeof msg === 'object') {
      console.log('  ', JSON.stringify(msg));
    } else {
      console.log(' ', String(msg));
    }
  }

  let lastProgress = 0;
  function progress(pct) {
    const p = Math.round(pct);
    if (p - lastProgress >= 10) {
      console.log(`  [${String(p).padStart(3)}%] ▓`.padEnd(20, '░') + ` ${p}%`);
      lastProgress = p;
    }
  }

  try {
    const auditDir = await runAudit(params, log, progress, null);
    console.log('\n✅ Audit terminé !');
    console.log(`📁 Rapports : ${auditDir}`);
    process.exit(0);
  } catch (e) {
    console.error('\n❌ Erreur lors de l\'audit :', e?.message || e);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
