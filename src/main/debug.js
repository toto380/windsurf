// Debug: Test what require('electron') returns
console.log('[DEBUG] Testing require(electron)...');

try {
  const electron = require('electron');
  console.log('[DEBUG] electron type:', typeof electron);
  console.log('[DEBUG] electron keys:', Object.keys(electron));
  console.log('[DEBUG] app:', typeof electron.app);
  console.log('[DEBUG] BrowserWindow:', typeof electron.BrowserWindow);
  
  if (electron.app) {
    console.log('[DEBUG] app.whenReady:', typeof electron.app.whenReady);
    electron.app.whenReady().then(() => {
      console.log('[DEBUG] Electron app ready!');
      process.exit(0);
    });
  } else {
    console.log('[ERROR] electron.app is undefined!');
    process.exit(1);
  }
} catch (e) {
  console.error('[ERROR]', e.message);
  process.exit(1);
}
