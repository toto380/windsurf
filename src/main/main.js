// ===== StratAds Squelette =====
import pkg from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { File } from 'node:buffer';
import { Backend } from '../backend/index.js';

const { app, BrowserWindow, ipcMain, shell, dialog } = pkg;

if (typeof globalThis.File === 'undefined') {
  globalThis.File = File;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Windows cache permission hardening (avoids "Unable to move the cache: Access denied") ---
// Must run before app.whenReady()
try {
  const tmp = os.tmpdir();

  // Keep all Electron/Chromium writable paths under %TEMP%
  const safeUserData = path.join(tmp, 'stratads-audit-ultimate-userdata');
  const safeCache = path.join(tmp, 'stratads-audit-ultimate-cache');

  app.setPath('userData', safeUserData);
  app.setPath('cache', safeCache);

  // Also force Chromium disk cache dir (covers some Electron/Chromium versions)
  app.commandLine.appendSwitch('disk-cache-dir', safeCache);

  // Prevent Chromium from trying to persist GPU shader cache in protected locations
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
} catch (e) {
  // fail open
  console.warn('[cachefix] Could not set safe cache paths:', e?.message || e);
}

const projectRoot = path.resolve(__dirname, '../../');
const reportsDir = path.join(projectRoot, 'reports');

let mainWindow;

const createWindow = () => {
  const preloadPath = path.resolve(__dirname, 'preload.cjs');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1000,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    autoHideMenuBar: true,
    show: false
  });

  const rendererPath = path.join(__dirname, '../renderer/index.html');
  mainWindow.loadFile(rendererPath).then(() => {
    mainWindow.show();
  });
};

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});



ipcMain.handle('select-ads-export', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Google Ads exports', extensions: ['csv'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (result.canceled) return null;
  return result.filePaths || null;
});

ipcMain.handle('select-service-account-json', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Google Service Account JSON', extensions: ['json'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (result.canceled) return null;
  return (result.filePaths && result.filePaths[0]) ? result.filePaths[0] : null;
});

ipcMain.handle('select-logo', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg','png','svg'] }]
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('select-output-folder', async () => {
  const res = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled) return null;
  return (res.filePaths && res.filePaths[0]) ? res.filePaths[0] : null;
});

ipcMain.handle('open-report-folder', async (e, folderPath) => {
  try {
    // Accept either a direct string path, or an object returned by the audit pipeline
    let target = folderPath;

    if (target && typeof target === 'object') {
      target = target.folder || target.reportDir || target.path || target.dir || target.htmlDir || target.pdfDir || null;
    }

    if (!target || typeof target !== 'string') {
      console.error('[main] open-report-folder: invalid target', folderPath);
      // fallback to reportsDir if available
      target = (typeof reportsDir === 'string' && reportsDir) ? reportsDir : null;
    }

    if (!target) {
      return { ok: false, error: 'No folder path available' };
    }

    const result = await shell.openPath(target);
    if (result) {
      // shell.openPath returns an error string on failure, '' on success
      console.error('[main] open-report-folder: shell.openPath failed', result, { target });
      return { ok: false, error: result };
    }

    return { ok: true, path: target };
  } catch (err) {
    console.error('[main] open-report-folder error', err);
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.on('start-audit', async (event, params) => {
  try {
    const sender = event.sender;
    const log = msg => sender.send('audit-log', msg);
    const progress = pct => sender.send('audit-progress', pct);

    const backend = new Backend();
    const result = await backend.run(params, log, progress);
    
    if (result.success) {
      sender.send('audit-complete', { 
        success: true, 
        path: result.outputDir,
        reportFile: result.report.filename,
        auditType: result.metadata.auditType,
        score: result.metadata.score
      });
    } else {
      sender.send('audit-complete', { 
        success: false, 
        error: result.error 
      });
    }
  } catch (e) {
    event.sender.send('audit-complete', { 
      success: false, 
      error: e.message 
    });
  }
});
