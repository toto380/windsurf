// ===== StratAds Preload Bridge (ACTIVE) =====
// IMPORTANT: This file is .cjs => CommonJS syntax (require).
// If you use ESM import here, the preload will fail and window.api will be undefined.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startAudit: (params) => ipcRenderer.send('start-audit', params),

  onLog: (cb) => ipcRenderer.on('audit-log', (_e, msg) => cb(msg)),
  onProgress: (cb) => ipcRenderer.on('audit-progress', (_e, pct) => cb(pct)),
  onComplete: (cb) => ipcRenderer.on('audit-complete', (_e, res) => cb(res)),

  selectLogo: () => ipcRenderer.invoke('select-logo'),
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
  selectServiceAccountJson: () => ipcRenderer.invoke('select-service-account-json'),
  selectAdsExport: () => ipcRenderer.invoke('select-ads-export'),
  selectMetaAdsExport: () => ipcRenderer.invoke('select-meta-ads-export'),
  openReportFolder: (folderPath) => ipcRenderer.invoke('open-report-folder', folderPath)
});
