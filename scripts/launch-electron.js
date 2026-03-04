/**
 * Script de test pour l'application Electron StratAds V2
 */

import { spawn } from 'child_process';
import path from 'node:path';

console.log("🚀 Lancement de l'application StratAds V2...");

const electronPath = path.join(process.cwd(), 'node_modules', '.bin', 'electron');
const mainScript = path.join(process.cwd(), 'src', 'main', 'main.js');

const child = spawn(electronPath, [mainScript], {
  stdio: 'inherit',
  shell: false // Désactivé pour éviter les problèmes avec les espaces
});

child.on('error', (error) => {
  console.error("❌ Erreur de lancement:", error.message);
});

child.on('close', (code) => {
  console.log(`📱 Application fermée avec le code: ${code}`);
});
