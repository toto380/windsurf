/**
 * StratAds — HTML Report Generator (Premium, HTML-only, no PDF)
 *
 * 4 output modes:
 *   prospection    — 1-2 pages: global score, 5 major issues, 5 quick wins, €-loss estimate, CTA
 *   public_full    — 7-8 sections, no private data
 *   private_only   — focused on imported data + anomalies
 *   public_private — fusion + unique executive synthesis
 */

import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import stringify from 'safe-stable-stringify';
import { estimateImpactEuro } from '../core/scoring-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Utility ───────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmt(n, d = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(d) : '—';
}

function scoreColor(score) {
  if (score >= 75) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function severityBadge(severity) {
  const colors = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#f59e0b',
    low: '#6b7280',
    info: '#3b82f6',
  };
  const c = colors[severity] || '#6b7280';
  return `<span style="background:${c};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;">${esc(severity)}</span>`;
}

function priorityBadge(priority) {
  const colors = { now: '#ef4444', next: '#f59e0b', later: '#22c55e' };
  const c = colors[priority] || '#6b7280';
  const labels = { now: 'NOW (7j)', next: 'NEXT (30j)', later: 'LATER (90j)' };
  return `<span style="background:${c};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">${esc(labels[priority] || priority)}</span>`;
}

// ── Shared CSS ────────────────────────────────────────────────────────────────

const BASE_CSS = `
:root {
  --bg: #0b1220; --surface: #0f1b31; --surface2: #0b1528;
  --border: #24324a; --text: #e5e7eb; --muted: #9ca3af;
  --primary: #3b82f6; --primary2: #2563eb;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  background: #0b1220; color: #e5e7eb; line-height: 1.6;
}
.container { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
h1 { font-size: 28px; font-weight: 900; }
h2 { font-size: 20px; font-weight: 800; margin-bottom: 12px; }
h3 { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
.section { margin-bottom: 36px; }
.card {
  background: rgba(15,27,49,.7); border: 1px solid rgba(255,255,255,.08);
  border-radius: 16px; padding: 20px; margin-bottom: 16px;
}
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap: 12px; margin-bottom: 20px; }
.kpi-card {
  background: rgba(15,27,49,.9); border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px; padding: 14px; text-align: center;
}
.kpi-value { font-size: 28px; font-weight: 900; line-height: 1.1; }
.kpi-label { font-size: 11px; color: #9ca3af; margin-top: 5px; text-transform: uppercase; letter-spacing: .5px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { background: rgba(59,130,246,.15); color: #93c5fd; padding: 9px 10px; text-align: left; font-weight: 700; }
td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.05); }
tr:hover td { background: rgba(255,255,255,.03); }
.badge-critical { background:#ef4444;color:#fff;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700; }
.badge-high { background:#f97316;color:#fff;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700; }
.badge-medium { background:#f59e0b;color:#fff;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700; }
.badge-low { background:#6b7280;color:#fff;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700; }
.badge-now { background:#ef4444;color:#fff;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700; }
.badge-next { background:#f59e0b;color:#fff;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700; }
.badge-later { background:#22c55e;color:#fff;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700; }
.score-ring { display:inline-block; }
details { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); border-radius:8px; margin-top:10px; }
details summary { padding:10px 14px; cursor:pointer; font-weight:600; color:#93c5fd; }
details[open] summary { border-bottom:1px solid rgba(255,255,255,.06); }
details .content { padding:14px; font-size:13px; color:#d1d5db; }
.confidentiel { background:#ef4444; color:#fff; text-align:center; padding:8px; font-weight:900; letter-spacing:4px; font-size:13px; }
.header-bar { display:flex; flex-wrap:wrap; align-items:center; gap:16px; padding:20px 0 16px; border-bottom:1px solid rgba(255,255,255,.08); margin-bottom:24px; }
.header-meta { flex:1; min-width:200px; }
.header-meta h1 { font-size:22px; }
.header-meta .subtitle { font-size:13px; color:#9ca3af; margin-top:4px; }
.score-cards { display:flex; gap:10px; flex-wrap:wrap; }
.score-card { background:rgba(15,27,49,.9); border:1px solid rgba(255,255,255,.1); border-radius:12px; padding:12px 16px; text-align:center; min-width:90px; }
.score-card .val { font-size:26px; font-weight:900; line-height:1.1; }
.score-card .lbl { font-size:10px; color:#9ca3af; margin-top:3px; text-transform:uppercase; letter-spacing:.5px; }
.alert-box { padding:14px 16px; border-radius:8px; margin-bottom:12px; }
.alert-error { background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.3); }
.alert-warn { background:rgba(245,158,11,.1); border:1px solid rgba(245,158,11,.3); }
.alert-info { background:rgba(59,130,246,.1); border:1px solid rgba(59,130,246,.3); }
footer { text-align:center; color:#4b5563; font-size:11px; padding:24px 0 20px; margin-top:40px; border-top:1px solid rgba(255,255,255,.06); }
@media (max-width:600px) { .kpi-grid { grid-template-columns:1fr 1fr; } .score-cards { gap:6px; } }
@media print { body { background:#fff; color:#000; } .card { border:1px solid #ccc; } }
`;

// ── Section builders ──────────────────────────────────────────────────────────

function buildHeaderBar(results, mode) {
  const meta = results.meta || {};
  const scores = results.scores || {};
  const modeLabels = {
    prospection: 'Prospection',
    public_full: 'Audit Public',
    private_only: 'Audit Privé',
    public_private: 'Audit 360°',
  };
  const date = new Date(meta.timestampIso || Date.now()).toLocaleDateString('fr-FR', { year:'numeric', month:'short', day:'numeric' });

  const publicScore = scores.publicScore;
  const privateScore = scores.privateScore;
  const globalScore = scores.global ?? 0;

  const scoreCardHtml = (label, val, color) => `
<div class="score-card">
  <div class="val" style="color:${color};">${val !== null && val !== undefined ? Math.round(val) : '—'}<span style="font-size:13px;">/100</span></div>
  <div class="lbl">${esc(label)}</div>
</div>`;

  return `
<div class="header-bar">
  <div class="header-meta">
    <h1>${esc(meta.company || meta.url || 'Audit')}</h1>
    <div class="subtitle">${esc(meta.url || '')} &nbsp;·&nbsp; ${esc(modeLabels[mode] || mode)} &nbsp;·&nbsp; ${date}</div>
  </div>
  <div class="score-cards">
    ${scoreCardHtml('Public', publicScore, scoreColor(publicScore ?? 0))}
    ${scoreCardHtml('Privé', privateScore, scoreColor(privateScore ?? 0))}
    ${scoreCardHtml('Global', globalScore, scoreColor(globalScore))}
  </div>
</div>`;
}

function buildKpiSection(results) {
  const ga4Mod = results.modules?.ga4Audit || {};
  const m = ga4Mod.metrics || {};
  const adsMod = results.modules?.adsAudit || results.modules?.adsIntelligence || {};
  const adsPlat = adsMod?.metrics?.platforms || adsMod?.platforms || {};
  const gAds = adsPlat.google || {};
  const mAds = adsPlat.meta || {};
  const adsSpend = (gAds.cost ?? gAds.spend ?? 0) + (mAds.spend ?? 0);
  const adsRevenue = (gAds.revenue ?? 0) + (mAds.revenue ?? 0);
  const roas = adsSpend > 0 && adsRevenue > 0 ? adsRevenue / adsSpend : null;

  // "% Événements manquants" is only meaningful when GA4 data is available and
  // there is real ecommerce context (sessions > 0). Show "—" otherwise.
  const ecomValue = (() => {
    if (!m.dataAvailable || !m.ecommerceCompleteness) return '—';
    if ((m.sessions || 0) === 0) return '—';
    return `${Math.round(100 - (m.ecommerceCompleteness.present.length / 4) * 100)}%`;
  })();

  const kpis = [
    { label: 'Sessions (28j)', value: m.dataAvailable ? Math.round(m.sessions || 0).toLocaleString('fr-FR') : '—', color: '#3b82f6' },
    { label: 'Conversions (28j)', value: m.dataAvailable ? String(Math.round(m.conversions || 0)) : '—', color: '#8b5cf6' },
    { label: 'Revenu (28j)', value: m.dataAvailable && (m.revenue ?? 0) > 0 ? `${Math.round(m.revenue).toLocaleString('fr-FR')}€` : '—', color: '#22c55e' },
    { label: '% Événements manquants', value: ecomValue, color: '#f59e0b' },
    { label: 'Dépenses Ads', value: adsSpend > 0 ? `${Math.round(adsSpend).toLocaleString('fr-FR')}€` : '—', color: '#f97316' },
    { label: 'ROAS', value: roas !== null ? roas.toFixed(2) : '—', color: roas !== null && roas >= 3 ? '#22c55e' : (roas !== null && roas >= 1 ? '#f59e0b' : '#ef4444') },
  ];

  const cards = kpis.map(k => `
<div class="kpi-card">
  <div class="kpi-value" style="color:${k.color};">${esc(k.value)}</div>
  <div class="kpi-label">${esc(k.label)}</div>
</div>`).join('');

  return `<div class="kpi-grid">${cards}</div>`;
}

/**
 * Build a Looker Studio-style data availability status table.
 * Shows which modules have real data vs. are unavailable, with reasons.
 */
function buildDataAvailabilityTable(results) {
  const modules = results.modules || {};
  const privateGoogle = modules.privateGoogle || {};
  const ga4Audit = modules.ga4Audit || {};
  const gtmAudit = modules.gtmAudit || {};
  const adsGoogle = modules.adsGoogle || {};
  const adsMeta = modules.adsMeta || {};
  const trackingInfra = modules.trackingInfrastructure || modules.tracking || {};
  const seo = modules.seo || {};
  const secHeaders = modules.securityHeaders || {};
  const lighthouse = modules.lighthouse || {};

  const rows = [
    {
      module: 'GA4 Analytics',
      detected: (privateGoogle.ok || privateGoogle.status === 'PARTIAL') ? '✅ Configuré' : '⚠️ Non configuré',
      data: ga4Audit.metrics?.dataAvailable ? '✅ Disponible' : '❌ Indisponible',
      reason: ga4Audit.metrics?.dataAvailable ? '—'
        : (privateGoogle.errors?.[0]?.actionableMessage
          || privateGoogle.errors?.[0]?.message
          || 'Service account non fourni ou accès refusé'),
    },
    {
      module: 'GTM API',
      detected: (!gtmAudit.skipped && gtmAudit.ok) ? '✅ Configuré' : (gtmAudit.skipped ? '⚠️ Non configuré' : '❌ Erreur API'),
      data: (!gtmAudit.skipped && gtmAudit.ok) ? '✅ Disponible' : '❌ Indisponible',
      reason: (!gtmAudit.skipped && gtmAudit.ok) ? '—' : (gtmAudit.reason || 'Service account + GTM Container ID requis'),
    },
    {
      module: 'Google Ads (export CSV)',
      detected: adsGoogle.ok ? '✅ Importé' : (adsGoogle.skipped ? '⚠️ Non fourni' : '❌ Erreur'),
      data: adsGoogle.ok ? '✅ Disponible' : '❌ Indisponible',
      reason: adsGoogle.ok ? '—' : (adsGoogle.reason || 'Export CSV Google Ads non importé'),
    },
    {
      module: 'Meta Ads (export CSV)',
      detected: adsMeta.ok ? '✅ Importé' : (adsMeta.skipped ? '⚠️ Non fourni' : '❌ Erreur'),
      data: adsMeta.ok ? '✅ Disponible' : '❌ Indisponible',
      reason: adsMeta.ok ? '—' : (adsMeta.reason || 'Export CSV Meta Ads non importé'),
    },
    {
      module: 'Tracking public (scraping)',
      detected: !trackingInfra.skipped ? '✅ Exécuté' : '⚠️ Non exécuté',
      data: (!trackingInfra.skipped && (trackingInfra.metrics || typeof trackingInfra.score === 'number')) ? '✅ Disponible' : '❌ Indisponible',
      reason: trackingInfra.skipped ? (trackingInfra.reason || 'Non activé pour ce profil') : (trackingInfra.error || '—'),
    },
    {
      module: 'SEO & Crawl',
      detected: !seo.skipped ? '✅ Exécuté' : '⚠️ Non exécuté',
      data: (!seo.skipped && seo.score != null) ? '✅ Disponible' : '❌ Indisponible',
      reason: seo.skipped ? (seo.reason || 'Non activé pour ce profil') : (seo.error || '—'),
    },
    {
      module: 'Security Headers',
      detected: !secHeaders.skipped ? '✅ Exécuté' : '⚠️ Non exécuté',
      data: !secHeaders.skipped ? '✅ Disponible' : '❌ Indisponible',
      reason: secHeaders.skipped ? (secHeaders.reason || 'Non activé pour ce profil') : '—',
    },
    {
      module: 'Lighthouse (Performance)',
      detected: !lighthouse.skipped ? '✅ Exécuté' : '⚠️ Non exécuté',
      data: !lighthouse.skipped ? '✅ Disponible' : '❌ Indisponible',
      reason: lighthouse.skipped ? (lighthouse.reason || 'Non activé pour ce profil') : '—',
    },
  ];

  const rowsHtml = rows.map(r => {
    const dataStyle = r.data.startsWith('✅') ? 'color:#22c55e;font-weight:700;' : 'color:#ef4444;font-weight:700;';
    const detectedStyle = r.detected.startsWith('✅') ? 'color:#22c55e;' : (r.detected.startsWith('⚠️') ? 'color:#f59e0b;' : 'color:#ef4444;');
    return `<tr>
      <td><b>${esc(r.module)}</b></td>
      <td style="${detectedStyle}">${esc(r.detected)}</td>
      <td style="${dataStyle}">${esc(r.data)}</td>
      <td style="color:#9ca3af;font-size:12px;">${esc(r.reason)}</td>
    </tr>`;
  }).join('');

  return `
<div class="card" style="margin-bottom:20px;">
  <h3 style="margin-bottom:12px;color:#93c5fd;">📋 État des Sources de Données (Looker Studio)</h3>
  <table>
    <thead><tr>
      <th>Module</th>
      <th>Statut</th>
      <th>Données</th>
      <th>Raison (si indisponible)</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div style="margin-top:10px;font-size:11px;color:#6b7280;">✅ Disponible = données réelles utilisées &nbsp;·&nbsp; ❌ Indisponible = section affichée avec "—" &nbsp;·&nbsp; ⚠️ Non configuré = module non activé pour ce profil</div>
</div>`;
}

function buildDiagnosticBlock(results) {
  const privateErrors = results.meta?.privateErrors || [];
  const pipelineLog = results.modules?.privateGoogle?.pipelineLog || [];
  const actionableMessages = pipelineLog
    .filter(e => e.status === 'FAIL' && e.actionableMessage)
    .map(e => e.actionableMessage);
  const warnings = results.modules?.privateGoogle?.warnings || [];

  if (!privateErrors.length && !actionableMessages.length && !warnings.length) return '';

  const errorItems = [...actionableMessages, ...privateErrors.filter(e => e.actionableMessage ? !actionableMessages.includes(e.actionableMessage) : true).map(e => e.actionableMessage || e.message || String(e))];
  const warnItems = warnings.map(w => w.message || String(w));

  let html = '';
  if (errorItems.length) {
    html += `<div class="alert-box alert-error">
      <b style="color:#ef4444;">⚠️ Problèmes d'accès — Actions requises</b>
      <ul style="margin-top:8px;padding-left:18px;color:#fca5a5;">
        ${errorItems.map(m => `<li style="margin-bottom:4px;">${esc(m)}</li>`).join('')}
      </ul>
    </div>`;
  }
  if (warnItems.length) {
    html += `<div class="alert-box alert-warn">
      <b style="color:#f59e0b;">ℹ️ Avertissements</b>
      <ul style="margin-top:8px;padding-left:18px;color:#fcd34d;">
        ${warnItems.map(m => `<li style="margin-bottom:4px;">${esc(m)}</li>`).join('')}
      </ul>
    </div>`;
  }
  return html;
}

function buildTagInventoryTable(results) {
  const trackingInfra = results.modules?.trackingInfrastructure || results.modules?.tracking || {};
  const m = trackingInfra.metrics || {};
  const privateGoogle = results.modules?.privateGoogle || {};
  const ga4PrivateOk = !!(privateGoogle?.ga4?.ok);

  const tags = [];

  // GA4
  const ga4Ids = m.ga4Ids || [];
  if (ga4Ids.length > 0) {
    tags.push({ type: 'GA4', status: ga4PrivateOk ? 'Vérifié ✅' : 'Détecté 🔍', id: ga4Ids.join(', '), source: 'Public scraping' + (ga4PrivateOk ? ' + API privée' : '') });
  } else {
    tags.push({ type: 'GA4', status: 'Manquant ❌', id: '—', source: 'Public scraping' });
  }

  // GTM Web
  const gtmIds = m.gtmIds || [];
  if (gtmIds.length > 0) {
    tags.push({ type: 'GTM Web', status: 'Détecté 🔍', id: gtmIds.join(', '), source: 'Public scraping' });
  } else {
    tags.push({ type: 'GTM Web', status: 'Manquant ❌', id: '—', source: 'Public scraping' });
  }

  // sGTM
  if (m.serverSideDetected) {
    tags.push({ type: 'GTM Server-side', status: 'Détecté 🔍', id: (m.serverSideDomains || []).join(', ') || '—', source: 'Public scraping' });
  }

  // Ads pixels
  for (const pixel of (m.adsPixels || [])) {
    tags.push({ type: pixel, status: 'Détecté 🔍', id: '—', source: 'Public scraping' });
  }

  // CMP
  if (m.consentDetected) {
    tags.push({ type: 'CMP / Consentement', status: 'Détecté 🔍', id: (m.consentProviders || []).join(', ') || '—', source: 'Public scraping' });
  } else {
    tags.push({ type: 'CMP / Consentement', status: 'Manquant ❌', id: '—', source: 'Public scraping' });
  }

  if (!tags.length) return '<div style="color:#9ca3af;">Aucun tag détecté.</div>';

  const rows = tags.map(t => `<tr>
    <td><b>${esc(t.type)}</b></td>
    <td>${esc(t.status)}</td>
    <td style="font-family:monospace;font-size:12px;">${esc(t.id)}</td>
    <td style="color:#9ca3af;font-size:12px;">${esc(t.source)}</td>
  </tr>`).join('');

  return `<table>
    <thead><tr><th>Tag</th><th>Statut</th><th>ID</th><th>Source</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildCampaignTable(results) {
  const ga4Mod = results.modules?.ga4Audit || {};
  const campaigns = ga4Mod.tables?.campaigns || results.modules?.privateGoogle?.ga4?.campaigns || [];
  const adsIntel = results.modules?.adsIntelligence || {};
  const adsCampaigns = adsIntel?.campaigns || [];

  if (!campaigns.length && !adsCampaigns.length) {
    return '<div style="color:#9ca3af;">Données de campagnes non disponibles — accès GA4 privé requis.</div>';
  }

  if (campaigns.length > 0) {
    const rows = campaigns.map(c => `<tr>
      <td>${esc(c.source || '—')}</td>
      <td>${esc(c.medium || '—')}</td>
      <td>${esc(c.campaign || '—')}</td>
      <td style="text-align:right;">${c.sessions?.toLocaleString('fr-FR') || '—'}</td>
      <td style="text-align:right;">${c.users?.toLocaleString('fr-FR') || '—'}</td>
      <td style="text-align:right;">${c.conversions?.toLocaleString('fr-FR') || '—'}</td>
      <td style="text-align:right;">${c.revenue > 0 ? c.revenue.toFixed(0) + '€' : '—'}</td>
    </tr>`).join('');
    return `<table>
      <thead><tr><th>Source</th><th>Medium</th><th>Campagne</th><th style="text-align:right;">Sessions</th><th style="text-align:right;">Users</th><th style="text-align:right;">Conv.</th><th style="text-align:right;">Revenu</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  if (adsCampaigns.length > 0) {
    const rows = adsCampaigns.slice(0, 20).map(c => `<tr>
      <td>${esc(c.name || '—')}</td>
      <td>${esc(c.platform || '—')}</td>
      <td style="text-align:right;">${c.spend != null ? c.spend.toFixed(0) + '€' : '—'}</td>
      <td style="text-align:right;">${c.conversions?.toLocaleString('fr-FR') || '—'}</td>
      <td style="text-align:right;">${c.roas != null ? c.roas.toFixed(2) : '—'}</td>
    </tr>`).join('');
    return `<table>
      <thead><tr><th>Campagne</th><th>Plateforme</th><th style="text-align:right;">Dépense</th><th style="text-align:right;">Conv.</th><th style="text-align:right;">ROAS</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  return '<div style="color:#9ca3af;">Aucune donnée de campagne.</div>';
}

function buildIssuesTable(issues, maxIssues) {
  if (!issues || issues.length === 0) return '<div style="color:#9ca3af;">Aucun problème détecté.</div>';
  const rows = issues.slice(0, maxIssues).map(issue => `
<tr>
  <td>${severityBadge(issue.severity)}</td>
  <td><b>${esc(issue.title)}</b><br><span style="color:#9ca3af;font-size:12px;">${esc(issue.description || '')}</span></td>
  <td style="color:#9ca3af;font-size:12px;">${esc(issue.effort || '—')}</td>
</tr>`).join('');
  return `<table><thead><tr><th>Sévérité</th><th>Problème</th><th>Effort</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function buildRecommendationsTable(recs, maxRecs) {
  if (!recs || recs.length === 0) return '<div style="color:#9ca3af;">Aucune recommandation.</div>';
  const rows = recs.slice(0, maxRecs).map(r => `
<tr>
  <td>${priorityBadge(r.priority)}</td>
  <td><b>${esc(r.title)}</b><br><span style="color:#9ca3af;font-size:12px;">${esc(r.details || '')}</span></td>
  <td style="color:#9ca3af;font-size:12px;">${esc(r.effort || '—')}</td>
  <td style="color:#9ca3af;font-size:12px;">${esc(r.impact || '—')}</td>
</tr>`).join('');
  return `<table><thead><tr><th>Priorité</th><th>Action</th><th>Effort</th><th>Impact</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function collectAllIssues(results) {
  const all = [];
  for (const [key, mod] of Object.entries(results.modules || {})) {
    if (!mod || mod.skipped) continue;
    const issues = Array.isArray(mod.issues) ? mod.issues : [];
    for (const issue of issues) {
      all.push({ ...issue, _module: key });
    }
  }
  return all.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
  });
}

function collectAllRecommendations(results) {
  const all = [];
  for (const [key, mod] of Object.entries(results.modules || {})) {
    if (!mod || mod.skipped) continue;
    const recs = Array.isArray(mod.recommendations) ? mod.recommendations : [];
    for (const rec of recs) {
      all.push({ ...rec, _module: key });
    }
  }
  return all.sort((a, b) => {
    const order = { now: 0, next: 1, later: 2 };
    return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
  });
}

// ── SEO & Public data section builders ───────────────────────────────────────

function buildSeoAuthoritySection(results) {
  const seo = results.modules?.seo || {};
  const techstack = results.modules?.techstack || {};
  const indexedPages = seo.pages != null ? seo.pages : '—';
  const NA = '<span style="color:#9ca3af;font-size:12px;">N/A — API externe requise</span>';

  const rows = [
    ['Domain Authority (Moz DA)', NA, 'Moz API'],
    ['Domain Rating (Ahrefs DR)', NA, 'Ahrefs API'],
    ['Trust Flow (Majestic)', NA, 'Majestic API'],
    ['Citation Flow (Majestic)', NA, 'Majestic API'],
    ['Spam Score', NA, 'Moz API'],
    ['Pages indexées Google', indexedPages !== '—' ? `<b style="color:#93c5fd;">${esc(String(indexedPages))}</b>` : NA, 'Crawl interne'],
    ['Nombre total de backlinks', NA, 'Ahrefs / Majestic'],
    ['Domaines référents', NA, 'Ahrefs / Majestic'],
  ];

  const rowsHtml = rows.map(([metric, value, source]) => `<tr>
    <td><b>${esc(metric)}</b></td>
    <td>${value}</td>
    <td style="color:#9ca3af;font-size:12px;">${esc(source)}</td>
  </tr>`).join('');

  return `
<div id="seo-authority" class="section">
  <h2>🏆 Domain Authority &amp; Autorité SEO</h2>
  <div class="card">
    <div class="alert-box alert-info" style="margin-bottom:12px;">
      <b style="color:#93c5fd;">ℹ️ Données publiques externes</b> — Les métriques DA/DR/Trust Flow nécessitent une connexion aux APIs Moz, Ahrefs ou Majestic. Les données de crawl interne sont disponibles ci-dessous.
    </div>
    <table>
      <thead><tr><th>Métrique</th><th>Valeur</th><th>Source</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
</div>`;
}

function buildOrganicVisibilitySection(results) {
  const seo = results.modules?.seo || {};
  const lighthouse = results.modules?.lighthouse || {};
  const lhSeo = lighthouse.seo != null ? Math.round(lighthouse.seo * 100) : null;
  const NA = '<span style="color:#9ca3af;font-size:12px;">N/A — outil SEO externe requis</span>';

  const kpiCards = [
    { label: 'Keywords classés (top 50)', value: NA },
    { label: 'Position moyenne', value: NA },
    { label: 'Trafic organique estimé', value: NA },
    { label: 'Featured snippets', value: NA },
    { label: 'Score SEO Lighthouse', value: lhSeo !== null ? `<b style="color:${scoreColor(lhSeo)};">${lhSeo}/100</b>` : NA },
    { label: 'Pages indexées', value: seo.pages != null ? `<b style="color:#93c5fd;">${esc(String(seo.pages))}</b>` : NA },
  ];

  const cardsHtml = kpiCards.map(k => `
<div class="kpi-card">
  <div class="kpi-value" style="font-size:18px;">${k.value}</div>
  <div class="kpi-label">${esc(k.label)}</div>
</div>`).join('');

  const issueItems = [];
  if (seo.issuesMissingTitle) issueItems.push(`${seo.issuesMissingTitle} pages sans balise title`);
  if (seo.issuesDuplicateH1) issueItems.push(`${seo.issuesDuplicateH1} pages avec H1 dupliqué`);
  if (seo.issuesBrokenLinks) issueItems.push(`${seo.issuesBrokenLinks} liens brisés détectés`);

  return `
<div id="organic-visibility" class="section">
  <h2>🔎 Classement &amp; Visibilité Organique</h2>
  <div class="card">
    <div class="kpi-grid">${cardsHtml}</div>
    ${issueItems.length ? `
    <details>
      <summary>⚠️ Problèmes SEO détectés (${issueItems.length})</summary>
      <div class="content">
        <ul style="padding-left:18px;">
          ${issueItems.map(i => `<li style="margin-bottom:4px;color:#fca5a5;">${esc(i)}</li>`).join('')}
        </ul>
      </div>
    </details>` : ''}
    <div style="margin-top:12px;font-size:12px;color:#6b7280;">⚠️ Positions et volumes de recherche nécessitent Google Search Console ou un outil SEO (Semrush, Ahrefs, Sistrix).</div>
  </div>
</div>`;
}

function buildBacklinksSection(results) {
  const NA = '<span style="color:#9ca3af;font-size:12px;">N/A</span>';

  const refDomains = [
    ['—', '—', '—', '—', '—'],
  ];
  const anchorRows = [
    ['Brand', '—', '—'],
    ['Exact match', '—', '—'],
    ['Partial match', '—', '—'],
    ['Naked URL', '—', '—'],
    ['Generic', '—', '—'],
  ];

  return `
<div id="backlinks" class="section">
  <h2>🔗 Backlinks &amp; Profil de Liens</h2>
  <div class="card">
    <div class="alert-box alert-info" style="margin-bottom:12px;">
      <b style="color:#93c5fd;">ℹ️ API externe requise</b> — Connectez Ahrefs, Majestic ou Semrush pour afficher les données de backlinks réelles.
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px;">
      <div class="kpi-card"><div class="kpi-value" style="font-size:20px;">${NA}</div><div class="kpi-label">Total backlinks</div></div>
      <div class="kpi-card"><div class="kpi-value" style="font-size:20px;">${NA}</div><div class="kpi-label">Domaines référents</div></div>
      <div class="kpi-card"><div class="kpi-value" style="font-size:20px;">${NA}</div><div class="kpi-label">Dofollow %</div></div>
      <div class="kpi-card"><div class="kpi-value" style="font-size:20px;">${NA}</div><div class="kpi-label">Nofollow %</div></div>
      <div class="kpi-card"><div class="kpi-value" style="font-size:20px;">${NA}</div><div class="kpi-label">Gagnés (30j)</div></div>
      <div class="kpi-card"><div class="kpi-value" style="font-size:20px;">${NA}</div><div class="kpi-label">Perdus (30j)</div></div>
    </div>
    <details>
      <summary>📋 Top domaines référents</summary>
      <div class="content">
        <table>
          <thead><tr><th>Domaine</th><th>DA</th><th>Backlinks</th><th>Dofollow</th><th>Anchor principal</th></tr></thead>
          <tbody>
            ${refDomains.map(r => `<tr>${r.map(c => `<td style="color:#9ca3af;">${esc(c)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
        <div style="margin-top:8px;font-size:11px;color:#6b7280;">Données non disponibles — API Ahrefs/Majestic requise</div>
      </div>
    </details>
    <details style="margin-top:8px;">
      <summary>🔤 Distribution Anchor Text</summary>
      <div class="content">
        <table>
          <thead><tr><th>Type d'anchor</th><th>Nombre</th><th>% du total</th></tr></thead>
          <tbody>
            ${anchorRows.map(r => `<tr>${r.map(c => `<td style="color:#9ca3af;">${esc(c)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
        <div style="margin-top:8px;font-size:11px;color:#6b7280;">Données non disponibles — API Ahrefs/Majestic requise</div>
      </div>
    </details>
  </div>
</div>`;
}

function buildLighthouseCwvSection(results) {
  const lh = results.modules?.lighthouse || {};
  const robots = results.modules?.robots || {};
  const security = results.modules?.security || {};
  const hasLh = !lh.skipped && lh.performance != null;

  const cwvBadge = (value, goodThreshold, badThreshold, unit = '') => {
    if (value == null) return '<span style="color:#9ca3af;">—</span>';
    const color = value <= goodThreshold ? '#22c55e' : (value <= badThreshold ? '#f59e0b' : '#ef4444');
    return `<b style="color:${color};">${fmt(value, 2)}${unit}</b>`;
  };

  const lhScoreCard = (label, val) => {
    const score = val != null ? Math.round(val * 100) : null;
    return `<div class="kpi-card">
      <div class="kpi-value" style="color:${scoreColor(score ?? 0)};">${score !== null ? score : '—'}<span style="font-size:13px;">/100</span></div>
      <div class="kpi-label">${esc(label)}</div>
    </div>`;
  };

  const sslValid = security.ssl !== false;
  const robotsValid = robots.allowed !== false;
  const sitemapUrl = robots.sitemap || null;

  return `
<div id="lighthouse-cwv" class="section">
  <h2>⚡ Analyse Technique — Core Web Vitals &amp; Lighthouse</h2>
  <div class="card">
    ${hasLh ? `
    <h3 style="margin-bottom:12px;">Scores Lighthouse</h3>
    <div class="kpi-grid">
      ${lhScoreCard('Performance', lh.performance)}
      ${lhScoreCard('Accessibilité', lh.accessibility)}
      ${lhScoreCard('Best Practices', lh.bestPractices)}
      ${lhScoreCard('SEO', lh.seo)}
    </div>
    <details open>
      <summary>📐 Core Web Vitals détaillés</summary>
      <div class="content">
        <table>
          <thead><tr><th>Métrique</th><th>Valeur</th><th>Seuil Good</th><th>Seuil Poor</th><th>Statut</th></tr></thead>
          <tbody>
            <tr>
              <td><b>LCP</b> (Largest Contentful Paint)</td>
              <td>${cwvBadge(lh.largestContentfulPaint, 2.5, 4.0, 's')}</td>
              <td style="color:#22c55e;">≤ 2.5s</td><td style="color:#ef4444;">&gt; 4.0s</td>
              <td>${lh.largestContentfulPaint != null ? (lh.largestContentfulPaint <= 2.5 ? '✅ Good' : lh.largestContentfulPaint <= 4.0 ? '⚠️ À améliorer' : '❌ Poor') : '—'}</td>
            </tr>
            <tr>
              <td><b>CLS</b> (Cumulative Layout Shift)</td>
              <td>${cwvBadge(lh.cumulativeLayoutShift, 0.1, 0.25, '')}</td>
              <td style="color:#22c55e;">≤ 0.1</td><td style="color:#ef4444;">&gt; 0.25</td>
              <td>${lh.cumulativeLayoutShift != null ? (lh.cumulativeLayoutShift <= 0.1 ? '✅ Good' : lh.cumulativeLayoutShift <= 0.25 ? '⚠️ À améliorer' : '❌ Poor') : '—'}</td>
            </tr>
            <tr>
              <td><b>TBT</b> (Total Blocking Time — proxy FID)</td>
              <td>${cwvBadge(lh.totalBlockingTime, 200, 600, 'ms')}</td>
              <td style="color:#22c55e;">≤ 200ms</td><td style="color:#ef4444;">&gt; 600ms</td>
              <td>${lh.totalBlockingTime != null ? (lh.totalBlockingTime <= 200 ? '✅ Good' : lh.totalBlockingTime <= 600 ? '⚠️ À améliorer' : '❌ Poor') : '—'}</td>
            </tr>
            <tr>
              <td><b>FCP</b> (First Contentful Paint)</td>
              <td>${cwvBadge(lh.firstContentfulPaint, 1.8, 3.0, 's')}</td>
              <td style="color:#22c55e;">≤ 1.8s</td><td style="color:#ef4444;">&gt; 3.0s</td>
              <td>${lh.firstContentfulPaint != null ? (lh.firstContentfulPaint <= 1.8 ? '✅ Good' : lh.firstContentfulPaint <= 3.0 ? '⚠️ À améliorer' : '❌ Poor') : '—'}</td>
            </tr>
            <tr>
              <td><b>TTFB</b> (Time to First Byte)</td>
              <td>${cwvBadge(lh.timeToFirstByte, 0.8, 1.8, 's')}</td>
              <td style="color:#22c55e;">≤ 0.8s</td><td style="color:#ef4444;">&gt; 1.8s</td>
              <td>${lh.timeToFirstByte != null ? (lh.timeToFirstByte <= 0.8 ? '✅ Good' : lh.timeToFirstByte <= 1.8 ? '⚠️ À améliorer' : '❌ Poor') : '—'}</td>
            </tr>
            <tr>
              <td><b>Speed Index</b></td>
              <td>${cwvBadge(lh.speedIndex, 3.4, 5.8, 's')}</td>
              <td style="color:#22c55e;">≤ 3.4s</td><td style="color:#ef4444;">&gt; 5.8s</td>
              <td>${lh.speedIndex != null ? (lh.speedIndex <= 3.4 ? '✅ Good' : lh.speedIndex <= 5.8 ? '⚠️ À améliorer' : '❌ Poor') : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>` : '<div style="color:#9ca3af;">Lighthouse non exécuté pour ce profil.</div>'}
    <details style="margin-top:8px;">
      <summary>🤖 Robots, Sitemap &amp; SSL</summary>
      <div class="content">
        <table>
          <thead><tr><th>Vérification</th><th>Statut</th><th>Détail</th></tr></thead>
          <tbody>
            <tr>
              <td><b>Robots.txt</b></td>
              <td style="color:${robotsValid ? '#22c55e' : '#ef4444'};">${robotsValid ? '✅ Valide' : '❌ Bloqué / absent'}</td>
              <td style="color:#9ca3af;font-size:12px;">${robotsValid ? 'Indexation autorisée' : 'Vérifier robots.txt'}</td>
            </tr>
            <tr>
              <td><b>Sitemap.xml</b></td>
              <td style="color:${sitemapUrl ? '#22c55e' : '#f59e0b'};">${sitemapUrl ? '✅ Détecté' : '⚠️ Non détecté'}</td>
              <td style="color:#9ca3af;font-size:12px;">${sitemapUrl ? esc(sitemapUrl) : 'Ajouter un sitemap.xml'}</td>
            </tr>
            <tr>
              <td><b>Certificat SSL</b></td>
              <td style="color:${sslValid ? '#22c55e' : '#ef4444'};">${sslValid ? '✅ Valide' : '❌ Invalide / absent'}</td>
              <td style="color:#9ca3af;font-size:12px;">${sslValid ? 'HTTPS actif' : 'Certificat SSL requis'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </div>
</div>`;
}

function buildContentArchitectureSection(results) {
  const seo = results.modules?.seo || {};
  const totalPages = seo.pages != null ? seo.pages : null;
  const missingTitles = seo.issuesMissingTitle ?? null;
  const dupH1 = seo.issuesDuplicateH1 ?? null;
  const brokenLinks = seo.issuesBrokenLinks ?? null;
  const NA = '<span style="color:#9ca3af;">—</span>';

  const metrics = [
    { label: 'Pages totales crawlées', value: totalPages !== null ? `<b style="color:#93c5fd;">${esc(String(totalPages))}</b>` : NA },
    { label: 'Pages sans title', value: missingTitles !== null ? `<b style="color:${missingTitles > 0 ? '#f59e0b' : '#22c55e'};">${esc(String(missingTitles))}</b>` : NA },
    { label: 'H1 dupliqués', value: dupH1 !== null ? `<b style="color:${dupH1 > 0 ? '#f59e0b' : '#22c55e'};">${esc(String(dupH1))}</b>` : NA },
    { label: 'Liens brisés', value: brokenLinks !== null ? `<b style="color:${brokenLinks > 0 ? '#ef4444' : '#22c55e'};">${esc(String(brokenLinks))}</b>` : NA },
    { label: 'Pages orphelines estimées', value: NA },
    { label: 'Contenu dupliqué', value: NA },
    { label: 'Longueur moyenne contenu', value: NA },
  ];

  const cardsHtml = metrics.map(m => `
<div class="kpi-card">
  <div class="kpi-value" style="font-size:18px;">${m.value}</div>
  <div class="kpi-label">${esc(m.label)}</div>
</div>`).join('');

  return `
<div id="content-architecture" class="section">
  <h2>📄 Contenu &amp; Architecture</h2>
  <div class="card">
    <div class="kpi-grid">${cardsHtml}</div>
    <details style="margin-top:8px;">
      <summary>🏆 Top 20 pages par trafic potentiel</summary>
      <div class="content">
        <div style="color:#9ca3af;font-size:12px;">Données non disponibles — Google Search Console ou outil de crawl SEO requis pour identifier les pages à fort potentiel.</div>
      </div>
    </details>
    <div style="margin-top:10px;font-size:12px;color:#6b7280;">Pages orphelines, duplicate content et longueur de contenu nécessitent un crawl complet (Screaming Frog, Sitebulb ou équivalent).</div>
  </div>
</div>`;
}

function buildCompetitionSection(results) {
  const compRows = [1, 2, 3, 4, 5].map(i => `<tr>
    <td style="color:#9ca3af;">${i}</td>
    <td style="color:#9ca3af;">— (outil SEO requis)</td>
    <td style="color:#9ca3af;">—</td>
    <td style="color:#9ca3af;">—</td>
    <td style="color:#9ca3af;">—</td>
    <td style="color:#9ca3af;">—</td>
  </tr>`).join('');

  return `
<div id="competition" class="section">
  <h2>🏁 Analyse Concurrence</h2>
  <div class="card">
    <div class="alert-box alert-info" style="margin-bottom:12px;">
      <b style="color:#93c5fd;">ℹ️ Analyse concurrentielle</b> — Connectez Semrush, Ahrefs ou Sistrix pour identifier automatiquement vos concurrents organiques et les keyword gaps.
    </div>
    <details open>
      <summary>🔍 Top 5 concurrents identifiés</summary>
      <div class="content">
        <table>
          <thead><tr><th>#</th><th>Domaine concurrent</th><th>DA</th><th>DR</th><th>Keywords communs</th><th>Trafic estimé</th></tr></thead>
          <tbody>${compRows}</tbody>
        </table>
      </div>
    </details>
    <details style="margin-top:8px;">
      <summary>🔑 Keyword Gaps (keywords concurrents non classés)</summary>
      <div class="content">
        <div style="color:#9ca3af;font-size:12px;">Analyse keyword gap non disponible — outil SEO externe requis (Semrush Keyword Gap, Ahrefs Content Gap).</div>
      </div>
    </details>
    <details style="margin-top:8px;">
      <summary>📊 Benchmark sectoriel DA/DR</summary>
      <div class="content">
        <div style="color:#9ca3af;font-size:12px;">Benchmark sectoriel non disponible — nécessite une analyse comparative manuelle ou via outil SEO.</div>
      </div>
    </details>
  </div>
</div>`;
}

function buildSecurityProtocolSection(results) {
  const sec = results.modules?.security || {};
  const secH = results.modules?.securityHeaders || {};

  const checks = [
    { label: 'SPF', value: sec.spf ? '✅ Configuré' : '❌ Manquant', detail: sec.spf ? esc(String(sec.spf).substring(0, 60)) : 'Ajouter un enregistrement SPF', ok: !!sec.spf },
    { label: 'DMARC', value: sec.dmarc ? '✅ Configuré' : '❌ Manquant', detail: sec.dmarc ? esc(String(sec.dmarc).substring(0, 60)) : 'Ajouter un enregistrement DMARC', ok: !!sec.dmarc },
    { label: 'DKIM', value: sec.dkim ? '✅ Configuré' : '⚠️ Non vérifié', detail: sec.dkim ? 'Signature DKIM présente' : 'Vérifier la configuration DKIM', ok: !!sec.dkim },
    { label: 'HSTS', value: secH.hsts ? '✅ Actif' : '❌ Absent', detail: secH.hsts ? 'HTTP Strict Transport Security configuré' : 'Ajouter Strict-Transport-Security header', ok: !!secH.hsts },
    { label: 'CSP (Content-Security-Policy)', value: secH.csp ? '✅ Configuré' : '❌ Absent', detail: secH.csp ? 'Politique CSP définie' : 'Définir une politique Content-Security-Policy', ok: !!secH.csp },
    { label: 'X-Frame-Options', value: secH.xfo ? '✅ Configuré' : '❌ Absent', detail: secH.xfo ? 'Protection clickjacking active' : 'Ajouter X-Frame-Options: DENY/SAMEORIGIN', ok: !!secH.xfo },
    { label: 'X-Content-Type-Options', value: secH.xcto ? '✅ Configuré' : '❌ Absent', detail: secH.xcto ? 'MIME sniffing désactivé' : 'Ajouter X-Content-Type-Options: nosniff', ok: !!secH.xcto },
    { label: 'Referrer-Policy', value: secH.rp ? '✅ Configuré' : '⚠️ Absent', detail: secH.rp ? 'Politique Referrer définie' : 'Ajouter Referrer-Policy header', ok: !!secH.rp },
    { label: 'Certificate Transparency', value: '<span style="color:#9ca3af;font-size:12px;">N/A — vérification CT log requise</span>', detail: 'Vérifier sur crt.sh', ok: null },
    { label: 'SSL/TLS version', value: '<span style="color:#9ca3af;font-size:12px;">N/A — scan SSL requis</span>', detail: 'Utiliser SSLLabs pour audit complet', ok: null },
  ];

  const rowsHtml = checks.map(c => `<tr>
    <td><b>${esc(c.label)}</b></td>
    <td style="color:${c.ok === true ? '#22c55e' : c.ok === false ? '#ef4444' : '#9ca3af'};">${c.value}</td>
    <td style="color:#9ca3af;font-size:12px;">${c.detail}</td>
  </tr>`).join('');

  const passCount = checks.filter(c => c.ok === true).length;
  const failCount = checks.filter(c => c.ok === false).length;

  return `
<div id="security-protocol" class="section">
  <h2>🔒 Sécurité &amp; Protocole</h2>
  <div class="card">
    <div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
      <div class="kpi-card" style="min-width:120px;"><div class="kpi-value" style="color:#22c55e;">${passCount}</div><div class="kpi-label">Contrôles OK</div></div>
      <div class="kpi-card" style="min-width:120px;"><div class="kpi-value" style="color:#ef4444;">${failCount}</div><div class="kpi-label">Contrôles KO</div></div>
    </div>
    <details open>
      <summary>📋 Détail des contrôles de sécurité</summary>
      <div class="content">
        <table>
          <thead><tr><th>Contrôle</th><th>Statut</th><th>Action / Détail</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </details>
  </div>
</div>`;
}

function buildWebPublicDataSection(results) {
  const robots = results.modules?.robots || {};
  const lh = results.modules?.lighthouse || {};
  const meta = results.meta || {};
  const sitemapUrl = robots.sitemap || null;
  const NA = '<span style="color:#9ca3af;font-size:12px;">N/A — API WHOIS requise</span>';

  const perfScore = lh.performance != null ? Math.round(lh.performance * 100) : null;

  return `
<div id="web-public-data" class="section">
  <h2>🌐 Données Web Publiques</h2>
  <div class="card">
    <table>
      <thead><tr><th>Donnée</th><th>Valeur</th><th>Source</th></tr></thead>
      <tbody>
        <tr>
          <td><b>Ancienneté du domaine</b></td>
          <td>${NA}</td>
          <td style="color:#9ca3af;font-size:12px;">WHOIS / whois.domaintools.com</td>
        </tr>
        <tr>
          <td><b>Date de création (WHOIS)</b></td>
          <td>${NA}</td>
          <td style="color:#9ca3af;font-size:12px;">WHOIS lookup</td>
        </tr>
        <tr>
          <td><b>Archive.org (première capture)</b></td>
          <td><a href="https://web.archive.org/web/*/${esc(meta.url || '')}" target="_blank" style="color:#93c5fd;font-size:12px;" rel="noopener noreferrer">Vérifier sur Wayback Machine ↗</a></td>
          <td style="color:#9ca3af;font-size:12px;">archive.org</td>
        </tr>
        <tr>
          <td><b>Sitemap.xml</b></td>
          <td style="color:${sitemapUrl ? '#22c55e' : '#f59e0b'};">${sitemapUrl ? `<a href="${esc(sitemapUrl)}" target="_blank" style="color:#22c55e;" rel="noopener noreferrer">${esc(sitemapUrl)}</a>` : '⚠️ Non détecté'}</td>
          <td style="color:#9ca3af;font-size:12px;">Crawl interne</td>
        </tr>
        <tr>
          <td><b>PageSpeed Insights (mobile)</b></td>
          <td>${perfScore !== null ? `<b style="color:${scoreColor(perfScore)};">${perfScore}/100</b>` : NA}</td>
          <td style="color:#9ca3af;font-size:12px;">Lighthouse / PageSpeed API</td>
        </tr>
        <tr>
          <td><b>PageSpeed Insights (desktop)</b></td>
          <td><a href="https://pagespeed.web.dev/report?url=${encodeURIComponent(meta.url || '')}" target="_blank" style="color:#93c5fd;font-size:12px;" rel="noopener noreferrer">Analyser sur PageSpeed ↗</a></td>
          <td style="color:#9ca3af;font-size:12px;">Google PageSpeed Insights</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>`;
}

// ── HTML wrapper ──────────────────────────────────────────────────────────────

function wrapHtml(title, isPrivate, bodyContent) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
${isPrivate ? '<div class="confidentiel">⚠️ CONFIDENTIEL — Usage interne uniquement</div>' : ''}
<div class="container">
${bodyContent}
<footer>StratAds — Cabinet d'acquisition & tracking — Rapport généré automatiquement — CONFIDENTIEL</footer>
</div>
</body>
</html>`;
}

// ── Mode renderers ────────────────────────────────────────────────────────────

function renderProspection(results) {
  const allIssues = collectAllIssues(results);
  const allRecs = collectAllRecommendations(results);
  const impactEuro = estimateImpactEuro(allIssues.slice(0, 5));
  const meta = results.meta || {};

  const body = `
${buildHeaderBar(results, 'prospection')}

<div id="data-availability" class="section">
  <h2>📋 État des Sources de Données</h2>
  ${buildDataAvailabilityTable(results)}
</div>

<div id="kpis" class="section">
  ${buildKpiSection(results)}
</div>

<div id="issues" class="section">
  <h2>🚨 5 Problèmes majeurs détectés</h2>
  <div class="card">
    ${buildIssuesTable(allIssues, 5)}
    ${impactEuro > 0 ? `<div style="margin-top:14px;padding:10px 14px;background:rgba(245,158,11,.08);border-radius:8px;border:1px solid rgba(245,158,11,.3);">
      <b style="color:#f59e0b;">💶 Impact estimé : ${impactEuro.toLocaleString('fr-FR')}€</b><br>
      <span style="color:#9ca3af;font-size:12px;">⚠️ Estimation heuristique (critical=5 000€, high=2 000€, medium=500€) — non basée sur des données revenue réelles. Fournir un accès GA4 pour un calcul précis.</span>
    </div>` : ''}
  </div>
</div>

<div id="quickwins" class="section">
  <h2>⚡ 5 Quick Wins</h2>
  <div class="card">
    ${buildRecommendationsTable(allRecs.filter(r => r.priority === 'now'), 5)}
  </div>
</div>

<div id="cta" class="section">
  <div class="card" style="text-align:center;padding:28px;">
    <h2 style="color:#3b82f6;">🎯 Prochaines étapes</h2>
    <p style="color:#9ca3af;margin:10px 0 18px;">Un audit complet permettrait d'identifier l'ensemble des fuites de données et d'optimiser votre ROI publicitaire.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
      <div style="background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.3);border-radius:10px;padding:14px;">
        <b>Audit Public Complet</b><br><span style="color:#9ca3af;font-size:12px;">7-8 sections techniques</span>
      </div>
      <div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:10px;padding:14px;">
        <b>Audit 360° Privé</b><br><span style="color:#9ca3af;font-size:12px;">GA4 + Ads + GTM privé</span>
      </div>
    </div>
  </div>
</div>`;

  return wrapHtml(`Prospection — ${meta.company || meta.url || 'Audit'}`, false, body);
}

function renderPublicFull(results) {
  const allIssues = collectAllIssues(results);
  const allRecs = collectAllRecommendations(results);
  const meta = results.meta || {};
  const modules = results.modules || {};

  const trackingInfra = modules.trackingInfrastructure || modules.tracking || {};
  const infraMetrics = trackingInfra.metrics || {};
  const secHeaders = modules.securityHeaders || {};
  const seo = modules.seo || {};
  const lighthouse = modules.lighthouse || {};

  const body = `
${buildHeaderBar(results, 'public_full')}

<div id="data-availability" class="section">
  <h2>📋 État des Sources de Données</h2>
  ${buildDataAvailabilityTable(results)}
</div>

<div id="kpis" class="section">
  ${buildKpiSection(results)}
</div>

<div id="tracking-infra" class="section">
  <h2>🔍 Infrastructure Tracking & Inventaire des Tags</h2>
  <div class="card">
    ${buildTagInventoryTable(results)}
    <div style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
      <div style="background:rgba(59,130,246,.1);border-radius:8px;padding:10px;font-size:13px;">
        <b>Pixels Ads :</b><br>${(infraMetrics.adsPixels||[]).join(', ') || 'Aucun détecté'}
      </div>
    </div>
  </div>
</div>

<div id="security" class="section">
  <h2>🛡️ Sécurité & Headers</h2>
  <div class="card">
    ${secHeaders.issues?.length ? buildIssuesTable(secHeaders.issues, 10) : '<div style="color:#22c55e;margin-top:8px;">✅ Aucun problème de sécurité critique détecté.</div>'}
  </div>
</div>

${buildSeoAuthoritySection(results)}

${buildOrganicVisibilitySection(results)}

${buildBacklinksSection(results)}

${buildLighthouseCwvSection(results)}

${buildContentArchitectureSection(results)}

${buildCompetitionSection(results)}

${buildSecurityProtocolSection(results)}

${buildWebPublicDataSection(results)}

<div id="issues" class="section">
  <h2>🚨 Problèmes & Risques</h2>
  <div class="card">
    ${buildIssuesTable(allIssues, 20)}
  </div>
</div>

<div id="roadmap" class="section">
  <h2>🗺️ Plan d'action</h2>
  <div class="card">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
      ${['now','next','later'].map(p => {
        const recs = allRecs.filter(r => r.priority === p);
        const label = {now:'NOW (7j)',next:'NEXT (30j)',later:'LATER (90j)'}[p];
        const color = {now:'#ef4444',next:'#f59e0b',later:'#22c55e'}[p];
        return `<div style="background:rgba(255,255,255,.03);border-radius:8px;padding:10px;border-top:3px solid ${color};">
          <b style="color:${color};font-size:12px;">${label}</b>
          <ul style="margin-top:8px;padding-left:14px;color:#d1d5db;font-size:12px;">
            ${recs.slice(0,5).map(r=>`<li style="margin-bottom:3px;">${esc(r.title)}</li>`).join('') || '<li style="color:#9ca3af;">—</li>'}
          </ul>
        </div>`;
      }).join('')}
    </div>
  </div>
</div>`;

  return wrapHtml(`Audit Complet — ${meta.company || meta.url || 'Rapport'}`, false, body);
}

function renderPrivateOnly(results) {
  const allIssues = collectAllIssues(results);
  const allRecs = collectAllRecommendations(results);
  const meta = results.meta || {};
  const modules = results.modules || {};

  const ga4Mod = modules.ga4Audit || {};
  const adsMod = modules.adsAudit || modules.adsIntelligence || {};
  const dqMod = modules.dataQuality || {};
  const privateGoogle = modules.privateGoogle || {};
  const isPartial = ga4Mod.status === 'PARTIAL' || privateGoogle.status === 'PARTIAL';

  const body = `
${buildHeaderBar(results, 'private_only')}

${buildDiagnosticBlock(results)}

<div id="data-availability" class="section">
  <h2>📋 État des Sources de Données</h2>
  ${buildDataAvailabilityTable(results)}
</div>

<div id="kpis" class="section">
  <h2>📊 KPIs Clés (28 jours)</h2>
  ${buildKpiSection(results)}
</div>

<div id="ga4" class="section">
  <h2>📈 GA4 & Événements</h2>
  <div class="card">
    ${isPartial ? `<div class="alert-box alert-warn" style="margin-bottom:12px;"><b style="color:#f59e0b;">ℹ️ Données partielles</b> — Certaines dimensions GA4 sont indisponibles.</div>` : ''}
    ${ga4Mod?.metrics?.dataAvailable ? `
    <div class="kpi-grid" style="margin-bottom:16px;">
      <div class="kpi-card"><div class="kpi-value">${Math.round(ga4Mod.metrics.sessions||0).toLocaleString('fr-FR')}</div><div class="kpi-label">Sessions</div></div>
      <div class="kpi-card"><div class="kpi-value">${Math.round(ga4Mod.metrics.users||0).toLocaleString('fr-FR')}</div><div class="kpi-label">Users</div></div>
      <div class="kpi-card"><div class="kpi-value">${Math.round(ga4Mod.metrics.conversions||0)}</div><div class="kpi-label">Conversions</div></div>
      <div class="kpi-card"><div class="kpi-value">${ga4Mod.metrics.revenue > 0 ? Math.round(ga4Mod.metrics.revenue).toLocaleString('fr-FR') + '€' : '—'}</div><div class="kpi-label">Revenu</div></div>
    </div>
    ${buildIssuesTable(ga4Mod.issues, 10)}` : '<div style="color:#9ca3af;">Données GA4 non disponibles.</div>'}
  </div>
</div>

<div id="campaigns" class="section">
  <h2>📣 Campagnes / Source / Medium</h2>
  <div class="card" style="overflow-x:auto;">
    ${buildCampaignTable(results)}
  </div>
</div>

<div id="tags" class="section">
  <h2>🏷️ Inventaire des Tags</h2>
  <div class="card" style="overflow-x:auto;">
    ${buildTagInventoryTable(results)}
  </div>
</div>

<div id="ads" class="section">
  <h2>💰 Ads & Attribution</h2>
  <div class="card">
    ${adsMod?.metrics?.dataAvailable ? `
    ${buildIssuesTable(adsMod.issues, 10)}
    ${buildRecommendationsTable(adsMod.recommendations, 10)}` : '<div style="color:#9ca3af;">Données Ads non disponibles — importer des exports CSV.</div>'}
  </div>
</div>

<div id="data-quality" class="section">
  <h2>🔬 Qualité des données</h2>
  <div class="card">
    ${dqMod?.issues?.length ? buildIssuesTable(dqMod.issues, 10) : '<div style="color:#9ca3af;">Analyse de qualité non disponible.</div>'}
  </div>
</div>

<div id="roadmap" class="section">
  <h2>🗺️ Plan d'action</h2>
  <div class="card">
    ${buildRecommendationsTable(allRecs, 20)}
  </div>
</div>`;

  return wrapHtml(`Rapport Privé — ${meta.company || meta.url || 'Confidentiel'}`, true, body);
}

function renderPublicPrivate(results) {
  const allIssues = collectAllIssues(results);
  const allRecs = collectAllRecommendations(results);
  const meta = results.meta || {};
  const impactEuro = estimateImpactEuro(allIssues);
  // Only show impact when GA4 revenue data is real and available
  const ga4Metrics = results.modules?.ga4Audit?.metrics || {};
  const hasRealRevenue = ga4Metrics.dataAvailable && (ga4Metrics.revenue ?? 0) > 0;

  const body = `
${buildHeaderBar(results, 'public_private')}

${buildDiagnosticBlock(results)}

<div id="data-availability" class="section">
  <h2>📋 État des Sources de Données</h2>
  ${buildDataAvailabilityTable(results)}
</div>

<div id="kpis" class="section">
  <h2>📊 KPIs Clés</h2>
  ${buildKpiSection(results)}
</div>

<div id="executive" class="section">
  <h2>🏆 Synthèse Executive 360°</h2>
  <div class="card">
    ${hasRealRevenue && impactEuro > 0 ? `<div style="margin-bottom:14px;padding:12px 16px;background:rgba(245,158,11,.08);border-radius:8px;border:1px solid rgba(245,158,11,.3);">
      <b style="color:#f59e0b;font-size:16px;">💶 Impact estimé : ${impactEuro.toLocaleString('fr-FR')}€</b><br>
      <span style="color:#9ca3af;font-size:12px;">⚠️ Estimation heuristique (critical=5 000€, high=2 000€, medium=500€) — basée sur les problèmes détectés.</span>
    </div>` : `<div style="margin-bottom:14px;padding:12px 16px;background:rgba(107,114,128,.08);border-radius:8px;border:1px solid rgba(107,114,128,.3);">
      <b style="color:#9ca3af;font-size:14px;">💶 Impact estimé : N/A</b><br>
      <span style="color:#9ca3af;font-size:12px;">Données revenue GA4 non disponibles — fournir un accès service account pour calculer l'impact réel.</span>
    </div>`}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div>
        <b style="font-size:13px;">Top 5 issues</b>
        ${buildIssuesTable(allIssues.slice(0,5), 5)}
      </div>
      <div>
        <b style="font-size:13px;">Top 5 quick wins</b>
        ${buildRecommendationsTable(allRecs.filter(r=>r.priority==='now').slice(0,5), 5)}
      </div>
    </div>
  </div>
</div>

<div id="tracking-infra" class="section">
  <h2>🔍 Infrastructure Tracking & Inventaire des Tags</h2>
  <div class="card" style="overflow-x:auto;">
    ${buildTagInventoryTable(results)}
  </div>
</div>

<div id="ga4-events" class="section">
  <h2>📈 GA4 & Événements</h2>
  ${(() => {
    const mod = results.modules?.ga4Audit || {};
    const m = mod.metrics || {};
    const isPartial = mod.status === 'PARTIAL';
    if (!m.dataAvailable) return `<div class="card" style="color:#9ca3af;">Données GA4 non disponibles.</div>`;
    return `<div class="card">
      ${isPartial ? `<div class="alert-box alert-warn" style="margin-bottom:12px;"><b style="color:#f59e0b;">ℹ️ Données partielles</b> — Certaines dimensions GA4 sont indisponibles.</div>` : ''}
      <div class="kpi-grid" style="margin-bottom:14px;">
        <div class="kpi-card"><div class="kpi-value">${Math.round(m.sessions||0).toLocaleString('fr-FR')}</div><div class="kpi-label">Sessions</div></div>
        <div class="kpi-card"><div class="kpi-value">${Math.round(m.conversions||0)}</div><div class="kpi-label">Conversions</div></div>
        <div class="kpi-card"><div class="kpi-value">${m.revenue > 0 ? Math.round(m.revenue).toLocaleString('fr-FR') + '€' : '—'}</div><div class="kpi-label">Revenu</div></div>
        <div class="kpi-card"><div class="kpi-value" style="color:${scoreColor(mod.score_contrib?.score||0)}">${mod.score_contrib?.score||0}/100</div><div class="kpi-label">Score GA4</div></div>
      </div>
      ${buildIssuesTable(mod.issues, 10)}
    </div>`;
  })()}
</div>

<div id="campaigns" class="section">
  <h2>📣 Campagnes / Source / Medium</h2>
  <div class="card" style="overflow-x:auto;">
    ${buildCampaignTable(results)}
  </div>
</div>

<div id="ads" class="section">
  <h2>💰 Attribution Ads</h2>
  ${(() => {
    const mod = results.modules?.adsAudit || results.modules?.adsIntelligence || {};
    if (!mod?.metrics?.dataAvailable && !mod?.ok) return '<div class="card" style="color:#9ca3af;">Données Ads non disponibles.</div>';
    const platforms = mod?.metrics?.platforms || mod?.platforms || {};
    const g = platforms.google || {};
    const m2 = platforms.meta || {};
    return `<div class="card">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
        <div><b>Google Ads</b><br>Dépense: ${fmt(g.cost||g.spend,0)}€ — ROAS: ${g.roas!=null?fmt(g.roas,2):'N/A'}</div>
        <div><b>Meta Ads</b><br>Dépense: ${fmt(m2.spend,0)}€ — ROAS: ${m2.roas!=null?fmt(m2.roas,2):'N/A'}</div>
      </div>
      ${buildIssuesTable(mod.issues, 10)}
    </div>`;
  })()}
</div>

<div id="data-quality" class="section">
  <h2>🔬 Qualité des données</h2>
  ${(() => {
    const mod = results.modules?.dataQuality || {};
    if (!mod?.metrics?.dataAvailable) return '<div class="card" style="color:#9ca3af;">Analyse qualité non disponible.</div>';
    return `<div class="card">${buildIssuesTable(mod.issues, 10)}</div>`;
  })()}
</div>

${buildSeoAuthoritySection(results)}

${buildOrganicVisibilitySection(results)}

${buildBacklinksSection(results)}

${buildLighthouseCwvSection(results)}

${buildContentArchitectureSection(results)}

${buildCompetitionSection(results)}

${buildSecurityProtocolSection(results)}

${buildWebPublicDataSection(results)}

<div id="looker-studio-section" class="section">
  <h2>📊 Tableau de Bord Looker Studio — Données Privées</h2>
  <div class="card" style="border:2px solid rgba(245,158,11,.3);">
    <div style="text-align:center;padding:40px;color:#6b7280;">
      <div style="font-size:24px;margin-bottom:12px;">📊</div>
      <div style="font-size:16px;font-weight:600;margin-bottom:8px;">Tableau de Bord Looker Studio</div>
      <div style="font-size:14px;line-height:1.6;">
        Configurez un service account Google pour accéder aux données GA4, Search Console et Ads.<br>
        Les données apparaîtront ici en temps réel une fois l'accès configuré.<br>
        <strong style="color:#f59e0b;">🧹 Nettoyage effectué: plus de données mock</strong>
      </div>
    </div>
  </div>
</div>

<div id="roadmap" class="section">
  <h2>🗺️ Roadmap Now / Next / Later</h2>
  <div class="card">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
      ${['now','next','later'].map(p => {
        const recs = allRecs.filter(r => r.priority === p);
        const label = {now:'NOW (7j)',next:'NEXT (30j)',later:'LATER (90j)'}[p];
        const color = {now:'#ef4444',next:'#f59e0b',later:'#22c55e'}[p];
        return `<div style="background:rgba(255,255,255,.03);border-radius:8px;padding:10px;border-top:3px solid ${color};">
          <b style="color:${color};font-size:12px;">${label}</b>
          <ul style="margin-top:8px;padding-left:14px;color:#d1d5db;font-size:12px;">
            ${recs.slice(0,8).map(r=>`<li style="margin-bottom:4px;">${esc(r.title)}</li>`).join('')||'<li style="color:#9ca3af;">—</li>'}
          </ul>
        </div>`;
      }).join('')}
    </div>
  </div>
</div>`;

  return wrapHtml(`Audit 360° — ${meta.company || meta.url || 'Rapport Complet'}`, true, body);
}

// ── Renderer dispatch ─────────────────────────────────────────────────────────

const RENDERERS = {
  prospection: renderProspection,
  public_full: renderPublicFull,
  private_only: renderPrivateOnly,
  public_private: renderPublicPrivate,
};

/**
 * Determine the report mode from audit results.
 */
function resolveReportMode(results) {
  const rm = results?.meta?.reportModules || {};
  if ((rm.publicFull || rm.publicLight) && (rm.privateAds || rm.privateGoogle)) return 'public_private';
  if (rm.privateAds || rm.privateGoogle) return 'private_only';
  if (rm.publicFull) return 'public_full';
  // Legacy fallback
  const am = String(results?.meta?.accessMode || '').toLowerCase();
  if (am === 'mixed') return 'public_private';
  if (am === 'private') return 'private_only';
  if (results?.meta?.auditMode === 'fast') return 'prospection';
  return 'public_full';
}

/**
 * Generate HTML report(s) from audit results.
 *
 * @param {object} results - Full audit results
 * @param {string} outputDir - Directory to write files into
 * @param {string} baseName - Base filename prefix
 * @returns {Promise<{ htmlPath: string, mode: string }>}
 */
export async function generateHtmlReport(results, outputDir, baseName) {
  await fs.ensureDir(outputDir);

  const mode = resolveReportMode(results);
  const renderer = RENDERERS[mode] || renderPublicFull;
  const html = renderer(results);

  const filename = `${baseName}_${mode}.html`;
  const htmlPath = path.join(outputDir, filename);
  await fs.writeFile(htmlPath, html, 'utf-8');

  return { htmlPath, mode, filename };
}

/**
 * Generate all 4 report modes (useful for demo/sample generation).
 *
 * @param {object} results
 * @param {string} outputDir
 * @param {string} baseName
 * @returns {Promise<object[]>}
 */
export async function generateAllHtmlReports(results, outputDir, baseName) {
  await fs.ensureDir(outputDir);
  const outputs = [];
  for (const [mode, renderer] of Object.entries(RENDERERS)) {
    const html = renderer(results);
    const filename = `${baseName}_${mode}.html`;
    const htmlPath = path.join(outputDir, filename);
    await fs.writeFile(htmlPath, html, 'utf-8');
    outputs.push({ mode, htmlPath, filename });
  }
  return outputs;
}
