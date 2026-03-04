let selectedAdsExportPaths = null;
let selectedMetaAdsExportPaths = null;
let selectedServiceAccountJsonPath = null;
let selectedOutputDir = null;
/* StratAds Audit - Premium Renderer
 * Works with preload.cjs => window.api
 */
const $ = (id) => document.getElementById(id);

const els = {
  url: $('urlInput'),
  company: $('companyInput'),
  start: $('startBtn'),
  status: $('status-area'),
  progress: $('progress'),
  logoBtn: $('logoBtn'),
  logoPath: $('logoPath'),
  openFolder: $('openFolderBtn'),
  result: $('result-panel'),
  auditProfileSelect: $('auditProfileSelect'),
  privateAccessBlock: $('privateAccessBlock'),
  saJsonBtn: $('saJsonBtn'),
  saJsonLabel: $('saJsonLabel'),
  ga4PropertyId: $('ga4PropertyId'),
  gscSiteUrl: $('gscSiteUrl'),
  gtmPublicId: $('gtmPublicId'),
      adsImportBtn: $('adsImportBtn'),
  adsImportLabel: $('adsImportLabel'),
  metaAdsImportBtn: $('metaAdsImportBtn'),
  metaAdsImportLabel: $('metaAdsImportLabel'),
  reportLoc: $('report-location'),
  copyPath: $('copyPathBtn'),
  toggleDetails: $('toggleDetailsBtn'),
  pathDetails: $('pathDetails'),

  lang: $('langSelect'),

  outputDirBtn: $('outputDirBtn'),
  outputDirLabel: $('outputDirLabel'),

};

function profileToConfig(profile){
  // Nouvelle architecture StratAds V2
  const p = String(profile || 'fast').toLowerCase();
  switch(p){
    case 'fast':
      return { auditType: 'fast', description: 'Prospection 2min - Gratuit' };
    case 'public':
      return { auditType: 'public', description: 'Public Complet - 2500€' };
    case 'private':
      return { auditType: 'private', description: 'Private Audit - 5000€' };
    case 'full':
      return { auditType: 'full', description: 'Full Audit - 7500€' };
    default:
      return { auditType: 'fast', description: 'Prospection 2min - Gratuit' };
  }
}

function togglePrivateAccessUI(){
  const cfg = profileToConfig(els.auditProfileSelect?.value);
  if (els.privateAccessBlock){
    // Afficher le bloc privé seulement pour private/full
    const show = cfg.auditType === 'private' || cfg.auditType === 'full';
    els.privateAccessBlock.style.display = show ? 'block' : 'none';
    
    // Afficher les champs selon le type
    const sa = document.getElementById('saFields');
    const ads = document.getElementById('adsFields');
    if (sa) sa.style.display = show ? 'block' : 'none';
    if (ads) ads.style.display = show ? 'block' : 'none';
  }
}


let selectedLogo = 'favicon.png'; // default

function basenamePath(p){
  const s = String(p||'').replace(/[\/\\]+$/,'');
  const parts = s.split(/[/\\]/);
  return parts[parts.length-1] || s;
}

async function copyToClipboard(text){
  try{
    if (navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(String(text||''));
      return true;
    }
  }catch(_){}
  try{
    const ta=document.createElement('textarea');
    ta.value=String(text||'');
    ta.style.position='fixed';
    ta.style.left='-9999px';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok=document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }catch(_){}
  return false;
}

function logLine(msg){
  const div = document.createElement('div');
  div.textContent = msg;
  els.status.appendChild(div);
  els.status.scrollTop = els.status.scrollHeight;
}

function setProgress(pct){
  const v = Math.max(0, Math.min(100, Number(pct)||0));
  els.progress.style.width = `${v}%`;
}

async function pickLogo(){
  if (!window.api || !window.api.selectLogo){
    logLine("⚠️ API Electron non connectée (selectLogo).");
    return;
  }
  try{
    const p = await window.api.selectLogo();
    if (p){
      selectedLogo = p;
      if (els.logoPath) els.logoPath.textContent = p;
    }
  }catch(e){
    logLine(`❌ Logo: ${e?.message || e}`);
  }
}

function validateUrl(u){
  try{
    const url = new URL(u);
    return url.href;
  }catch{
    return null;
  }
}

function buildParams(){
  const url = validateUrl((els.url.value||'').trim());
  const company = (els.company.value||'').trim() || (url ? new URL(url).hostname : '');
  const lang = (els.lang.value||'fr').trim();
  const profile = (els.auditProfileSelect?.value || 'fast');
  const cfg = profileToConfig(profile);
  
  return {
    url,
    company,
    lang,
    auditType: cfg.auditType,
    serviceAccountData: selectedServiceAccountJsonPath ? { path: selectedServiceAccountJsonPath } : null
  };
}

function setBusy(b){
  if (els.start) els.start.disabled = b;
}

function setupEvents(){
if (els.auditProfileSelect){
  els.auditProfileSelect.addEventListener('change', () => {
    togglePrivateAccessUI();
  });
  // initial
  togglePrivateAccessUI();
}

  if (els.outputDirBtn){
    els.outputDirBtn.addEventListener('click', async () => {
      try{
        const p = await window.api?.selectOutputFolder?.();
        if (p){
          selectedOutputDir = p;
          if (els.outputDirLabel) els.outputDirLabel.textContent = p;
        }
      }catch(e){
        logLine(`❌ Dossier sortie: ${e?.message || e}`);
      }
    });
  }

if (els.adsImportBtn){
  els.adsImportBtn.addEventListener('click', async () => {
    try{
      const paths = await window.api.selectAdsExport();
      if (!paths || !paths.length){
        selectedAdsExportPaths = null;
        if (els.adsImportLabel) els.adsImportLabel.textContent = "Aucun fichier";
        logLine("ℹ️ Aucun export Google Ads importé.");
        return;
      }
      selectedAdsExportPaths = paths;
      const label = paths.length === 1 ? paths[0] : `${paths.length} fichiers sélectionnés`;
      if (els.adsImportLabel) els.adsImportLabel.textContent = label;
      logLine(`📦 Export Google Ads importé: ${label}`);
    }catch(e){
      logLine(`❌ Import Google Ads: ${e.message || e}`);
    }
  });
}


if (els.metaAdsImportBtn){
  els.metaAdsImportBtn.addEventListener('click', async () => {
    try{
      const paths = await window.api.selectMetaAdsExport();
      if (!paths || !paths.length){
        selectedMetaAdsExportPaths = null;
        if (els.metaAdsImportLabel) els.metaAdsImportLabel.textContent = "Aucun fichier";
        logLine("ℹ️ Aucun export Meta Ads importé.");
        return;
      }
      selectedMetaAdsExportPaths = paths;
      const label = paths.length === 1 ? paths[0] : `${paths.length} fichiers sélectionnés`;
      if (els.metaAdsImportLabel) els.metaAdsImportLabel.textContent = label;
      logLine(`📦 Export Meta Ads importé: ${label}`);
    }catch(e){
      logLine(`❌ Import Meta Ads: ${e.message || e}`);
    }
  });
}

if (els.saJsonBtn){
  els.saJsonBtn.addEventListener('click', async () => {
    try{
      const p = await window.api.selectServiceAccountJson();
      if (!p){
        selectedServiceAccountJsonPath = null;
        if (els.saJsonLabel) els.saJsonLabel.textContent = "Aucun fichier";
        logLine("ℹ️ Aucun JSON sélectionné.");
        return;
      }
      selectedServiceAccountJsonPath = p;
      if (els.saJsonLabel) els.saJsonLabel.textContent = p;
      logLine("🔐 Service account JSON sélectionné.");
    }catch(e){
      logLine(`❌ JSON service account: ${e.message || e}`);
    }
  });
}

if (els.logoBtn){
    els.logoBtn.addEventListener('click', pickLogo);
  }

  if (els.start){
    els.start.addEventListener('click', () => {
      const params = buildParams();
      if (!params.url){
        logLine("❌ URL invalide. Exemple: https://example.com");
        return;
      }
      if (!window.api || !window.api.startAudit){
        logLine("❌ API Electron non connectée. Vérifie preload.cjs et main.js.");
        return;
      }
      els.status.innerHTML = "";
      setProgress(2);
      setBusy(true);
      try{
        window.api.startAudit(params);
      }catch(e){
        logLine(`❌ Start: ${e?.message || e}`);
        setBusy(false);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (els.logoPath) els.logoPath.textContent = "favicon.png (par défaut)";
  setupEvents();

  if (!window.api){
    logLine("❌ API Electron non connectée (window.api absent).");
    return;
  }

  window.api.onLog((msg) => logLine(msg));
  window.api.onProgress((pct) => setProgress(pct));
  window.api.onComplete((res) => {
    setBusy(false);
    setProgress(100);
    if (els.result) els.result.classList.remove('hidden');
    const folder = res?.folder || res?.path || res?.outputDir;
    if (els.reportLoc){
      const base = folder ? basenamePath(folder) : '';
      els.reportLoc.textContent = base ? base : (folder ? folder : 'Rapports générés.');
      els.reportLoc.title = folder || '';
    }
    if (els.pathDetails){
      els.pathDetails.textContent = folder || '';
    }
    if (els.copyPath){
      els.copyPath.onclick = async () => {
        if (!folder) return;
        const ok = await copyToClipboard(folder);
        if (ok) logLine('📋 Chemin copié.');
        else logLine('⚠️ Copie impossible sur ce système.');
      };
    }
    if (els.toggleDetails && els.pathDetails){
      els.toggleDetails.onclick = () => {
        els.pathDetails.classList.toggle('hidden');
      };
    }

    if (els.openFolder){
      els.openFolder.onclick = async () => {
        try{
          if (window.api.openReportFolder) await window.api.openReportFolder(folder);
        }catch(e){
          logLine(`❌ Open folder: ${e?.message || e}`);
        }
      };
    }

    // Afficher les informations de pricing
    if (res.pricing) {
      logLine(`💰 ${res.pricing.description}`);
      if (res.pricing.price > 0) {
        logLine(`💵 Prix: ${res.pricing.price}€`);
      }
    }
  });
});
