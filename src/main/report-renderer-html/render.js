/**
 * Report Renderer HTML — Premium (Cabinet Big4)
 * Converts a reportModel into a self-contained HTML string.
 *
 * Uses the premium.css stylesheet (embedded inline for PDF safety).
 * Uses SVG charts from report-charts.js.
 */

import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { donutSvg, compareBarsSvg, sparklineSvg, radarSvg, heatmapSvg } from "../report-charts.js";
import { renderHumanSummary, buildHumanSummaryFromSection } from "./components/human-summary.js";
import { renderScopePremiumPage } from "../../components/audit-scope/ScopePremiumPage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function num(n, def = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : def;
}

// -----------------------------------------------------------------------
// Content filtering utilities
// -----------------------------------------------------------------------

/**
 * Returns true if a value is non-empty (not null/undefined/""/"-"/"—").
 */
function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === "" || String(v).trim() === "—" || String(v).trim() === "-";
}

/**
 * Filter a table: removes rows where all cells are blank or "—".
 * Returns null if no rows remain.
 */
function filterTable(table) {
  if (!table) return null;
  const rows = (table.rows || []).filter(row => {
    const cells = Array.isArray(row) ? row : [row];
    return cells.some(cell => !isBlank(cell));
  });
  if (rows.length === 0) return null;
  return { ...table, rows };
}

/**
 * Filter a chart: returns null if data has no non-zero items.
 */
function filterChart(chart) {
  if (!chart) return null;
  const items = chart.data?.items || chart.data?.risks || chart.data?.series || [];
  if (Array.isArray(items) && items.length === 0) return null;
  // Keep donut/score charts even without items array
  return chart;
}

/**
 * Filter a finding: returns null if missing any required field.
 */
function filterFinding(finding) {
  if (!finding) return null;
  if (isBlank(finding.observation) || isBlank(finding.source) || isBlank(finding.status)) return null;
  return finding;
}

/**
 * Determine if a section has real content worth rendering.
 */
function hasRenderableContent(section) {
  if (!section) return false;
  if (section.dataAvailable === false) return true;
  const findings = (section.findings || []).filter(filterFinding);
  const actions = (section.actions || []).filter(a => a && !isBlank(a.title));
  const tables = (section.tables || []).map(filterTable).filter(Boolean);
  const charts = (section.charts || []).map(filterChart).filter(Boolean);
  const summary = (section.summary || []).filter(s => !isBlank(s));
  return findings.length > 0 || actions.length > 0 || tables.length > 0 || charts.length > 0 || summary.length > 0;
}

function statusChip(status) {
  const map = { ok: "✅ OK", warn: "⚠️ À vérifier", bad: "❌ KO", info: "ℹ️ Info" };
  return `<span class="chip ${esc(status)}">${map[status] || esc(status)}</span>`;
}

function effortChip(effort) {
  const map = { S: "Faible", M: "Moyen", L: "Élevé" };
  const cls = { S: "ok", M: "warn", L: "bad" };
  return `<span class="chip ${cls[effort] || "info"}">Effort ${esc(effort)} — ${map[effort] || esc(effort)}</span>`;
}

function riskChip(risk) {
  const cls = { low: "ok", medium: "warn", high: "bad" };
  const fr = { low: "Faible", medium: "Moyen", high: "Élevé" };
  return `<span class="chip ${cls[risk] || "info"}">Risque ${fr[risk] || esc(risk)}</span>`;
}

function ownerChip(owner) {
  const cls = owner === "StratAds" ? "p1" : "p2";
  return `<span class="chip ${cls}">${esc(owner)}</span>`;
}

// -----------------------------------------------------------------------
// Chart rendering
// -----------------------------------------------------------------------

function renderChart(chart) {
  if (!filterChart(chart)) return "";
  const { type, title, data } = chart;

  switch (type) {
    case "radar":
    case "pillar-radar":
      return radarSvg(esc(title), data?.items || []);

    case "heatmap":
    case "risk-heatmap":
      return heatmapSvg(esc(title), data?.risks || data?.items || []);

    case "score-donut":
      return donutSvg(num(data?.value), esc(title), num(data?.max, 100));

    case "pillar-bars":
    case "cwv-bars":
    case "event-coverage-bars":
    case "campaign-performance-bars":
    case "channel-bars":
    case "spend-value-bars":
      return compareBarsSvg(esc(title), data?.items || []);

    case "session-trend":
      return sparklineSvg(esc(title), data?.series || [], data?.unit || "");

    default:
      return `<div class="chart-card"><div class="chart-title">${esc(title)}</div><div style="color:#6b7280;font-size:12px;padding:8px">Graphique type "${esc(type)}" — données disponibles.</div></div>`;
  }
}

// -----------------------------------------------------------------------
// Section component renderers
// -----------------------------------------------------------------------

// -----------------------------------------------------------------------
// Looker Studio-style dashboard — rendered inside PRIVATE sections
// -----------------------------------------------------------------------

function renderLookerDashboard(db) {
  if (!db) return "";

  // KPI tiles
  const kpiCards = (db.kpis || []).map(k => {
    const trendHtml = k.trend
      ? `<span class="ls-kpi-trend ${k.trendUp === true ? "up" : k.trendUp === false ? "down" : "neutral"}">${k.trendUp === true ? "▲" : k.trendUp === false ? "▼" : "→"} ${esc(k.trend)}</span>`
      : "";
    return `
      <div class="ls-kpi-card">
        <div class="ls-kpi-label">${esc(k.label)}</div>
        <div class="ls-kpi-value">${esc(String(k.value ?? "—"))}</div>
        ${trendHtml}
      </div>`;
  }).join("");

  // Channel table with inline progress bars
  const channelTableHtml = (() => {
    if (!db.channelTable) return "";
    const headers = (db.channelTable.headers || []).map(h => `<th>${esc(h)}</th>`).join("");
    const maxSessions = Math.max(...(db.channelTable.rows || []).map(r => r.sessions || 0), 1);
    const rows = (db.channelTable.rows || []).map(r => {
      const barPct = Math.round(((r.sessions || 0) / maxSessions) * 100);
      return `<tr>
        <td><strong>${esc(r.channel)}</strong></td>
        <td>
          <div class="ls-bar-cell">
            <span style="min-width:36px;">${esc(String(r.sessions))}</span>
            <div class="ls-bar-track"><div class="ls-bar-fill" style="width:${barPct}%"></div></div>
          </div>
        </td>
        <td>${esc(String(r.share ?? "—"))}</td>
        <td>${r.convRate != null ? esc(r.convRate + "%") : "—"}</td>
        <td>${r.revenue > 0 ? esc(Number(r.revenue).toLocaleString("fr-FR") + " €") : "—"}</td>
      </tr>`;
    }).join("");
    return `
      <div class="ls-table-block">
        <div class="ls-table-title">${esc(db.channelTable.title || "Canaux d'acquisition")}</div>
        <table class="ls-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
      </div>`;
  })();

  // Conversion table with value badges
  const convTableHtml = (() => {
    if (!db.conversionTable) return "";
    const headers = (db.conversionTable.headers || []).map(h => `<th>${esc(h)}</th>`).join("");
    const rows = (db.conversionTable.rows || []).map(r => {
      const valClass = (r.value || 0) > 0 ? "positive" : "neutral";
      const valLabel = (r.value || 0) > 0 ? `${Number(r.value).toLocaleString("fr-FR")} €` : "—";
      return `<tr>
        <td><code style="font-size:12px;background:#f1f5f9;padding:1px 6px;border-radius:4px;">${esc(r.name)}</code></td>
        <td><strong>${esc(String(r.count ?? 0))}</strong></td>
        <td><span class="ls-value-badge ${valClass}">${esc(valLabel)}</span></td>
        <td>${r.rate != null ? esc(r.rate + "%") : "—"}</td>
      </tr>`;
    }).join("");
    return `
      <div class="ls-table-block">
        <div class="ls-table-title">${esc(db.conversionTable.title || "Conversions")}</div>
        <table class="ls-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
      </div>`;
  })();

  return `
    <div class="ls-dashboard">
      <div class="ls-header">
        <span class="ls-header-icon">📊</span>
        <div class="ls-header-title">${esc(db.title || "Analytics Dashboard")}</div>
        ${db.dateRange ? `<div class="ls-header-meta">📅 ${esc(db.dateRange)}</div>` : ""}
        <span class="ls-header-badge">GA4</span>
      </div>
      <div class="ls-kpi-grid">${kpiCards}</div>
      <div class="ls-tables">${channelTableHtml}${convTableHtml}</div>
    </div>`;
}

// -----------------------------------------------------------------------

function renderFindings(findings) {
  const valid = (findings || []).filter(filterFinding);
  if (valid.length === 0) return "";
  const cards = valid.map(f => `
    <div class="finding-card ${esc(f.status || "info")}">
      <div class="finding-observation">${esc(f.observation)}</div>
      <div class="finding-source">${esc(f.source)}</div>
      <div class="finding-importance">${esc(f.importance)}</div>
    </div>
  `).join("");
  return `<div class="findings-grid">${cards}</div>`;
}

function renderActions(actions) {
  if (!actions || actions.length === 0) return "";
  return actions.map(a => {
    const isHyp = !!a._hypothesis;
    return `
      <div class="action-card${isHyp ? " hypothesis" : ""}">
        <div class="action-header">
          <div class="action-title">${esc(a.title)}</div>
          <div class="action-chips">
            ${effortChip(a.effort)}
            ${riskChip(a.risk)}
            ${ownerChip(a.owner)}
            <span class="chip info">${esc(a.deadline)}</span>
          </div>
        </div>
        ${isHyp ? `<div class="hypothesis-warning">⚠️ Hypothèse — Preuve manquante. Cette recommandation est indicative.</div>` : ""}
        <div class="action-grid">
          <div class="action-field"><div class="action-field-label">Pourquoi</div>${esc(a.why)}</div>
          <div class="action-field"><div class="action-field-label">Preuve</div>${esc(a.evidence)}</div>
          <div class="action-field"><div class="action-field-label">Impact business</div>${esc(a.impact)}</div>
          <div class="action-field"><div class="action-field-label">Action</div>${esc(a.action)}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderTable(table) {
  const cleaned = filterTable(table);
  if (!cleaned) return "";
  const headerRow = (cleaned.headers || []).map(h => `<th>${esc(h)}</th>`).join("");
  const bodyRows = (cleaned.rows || []).map(row =>
    `<tr>${(Array.isArray(row) ? row : [row]).map(cell => `<td>${esc(String(cell ?? "—"))}</td>`).join("")}</tr>`
  ).join("");
  return `
    <div class="table-wrapper">
      ${cleaned.title ? `<div class="table-title">${esc(cleaned.title)}</div>` : ""}
      <table class="premium-table">
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

function riskLevelBadge(riskLevel) {
  if (!riskLevel) return "";
  const cls = riskLevel === "Élevé" ? "bad" : riskLevel === "Moyen" ? "warn" : "ok";
  const icon = riskLevel === "Élevé" ? "🔴" : riskLevel === "Moyen" ? "🟡" : "🟢";
  return `<span class="chip ${cls}" style="font-size:12px;padding:4px 12px;">${icon} Risque section : ${esc(riskLevel)}</span>`;
}

function renderSectionSummary(summary, riskLevel) {
  if (!summary || summary.length === 0) return "";
  const items = summary.map(s => `<li>${esc(s)}</li>`).join("");
  const badge = riskLevel ? `<div style="margin-bottom:8px;">${riskLevelBadge(riskLevel)}</div>` : "";
  return `
    <div class="section-summary">
      <div class="section-summary-title">Mini-résumé</div>
      ${badge}
      <ul>${items}</ul>
    </div>
  `;
}

const SECTION_ICONS = {
  "executive-summary": "🎯",
  "scorecards": "📊",
  "quick-wins": "⚡",
  "risks": "🔴",
  "performance": "🚀",
  "seo-basics": "🔍",
  "tracking-lite": "🏷️",
  "tracking-advanced": "🏷️",
  "roadmap": "🗺️",
  "global-summary": "🏆",
  "stratads-recommendation": "💼",
  "dns-infra": "🌐",
  "security-headers": "🛡️",
  "robots-sitemap": "🤖",
  "schema": "🧩",
  "techstack": "🧱",
  "crawler": "🕸️",
  "consent": "✅",
  "backlog": "📝",
  "ga4-performance-dashboard": "📊",
  "ads-performance-complete": "📣",
  "smart-recommendations-engine": "🧠",
  "attribution-analysis": "🔗",
  "strengths": "✅",
  "ce-qui-est-bien": "✅",
};

// -----------------------------------------------------------------------
// Smart Recommendations block renderer
// -----------------------------------------------------------------------

const PRIORITY_MAP = {
  CRITICAL: { cls: "bad",  icon: "🔴", label: "CRITIQUE" },
  HIGH:     { cls: "warn", icon: "🟠", label: "HAUTE" },
  MEDIUM:   { cls: "info", icon: "🟡", label: "MOYENNE" },
  LOW:      { cls: "ok",   icon: "🟢", label: "FAIBLE" },
};

const BADGE_MAP = {
  SCALE: { cls: "badge-scale", label: "✅ SCALE" },
  TEST:  { cls: "badge-test",  label: "⚠️ TEST" },
  PAUSE: { cls: "badge-pause", label: "🟡 PAUSE" },
  KILL:  { cls: "badge-kill",  label: "❌ KILL" },
};

function adsBadge(badge) {
  if (!badge) return "";
  const b = BADGE_MAP[badge];
  if (!b) return `<span class="ads-badge">${esc(badge)}</span>`;
  return `<span class="ads-badge ${b.cls}">${b.label}</span>`;
}

function priorityBadge(priority) {
  const p = PRIORITY_MAP[priority] || PRIORITY_MAP.MEDIUM;
  return `<span class="chip ${p.cls}" style="font-size:10px;letter-spacing:.05em;">${p.icon} ${p.label}</span>`;
}

function renderSmartRecommendations(recs) {
  if (!Array.isArray(recs) || recs.length === 0) return "";
  const cards = recs.map(r => `
    <div class="smart-rec-card priority-${(r.priority || "MEDIUM").toLowerCase()}">
      <div class="smart-rec-header">
        ${priorityBadge(r.priority)}
        <div class="smart-rec-title">${esc(r.title)}</div>
        ${r.effort ? `<span class="chip ${r.effort === "S" ? "ok" : r.effort === "M" ? "warn" : "bad"}" style="font-size:10px;">Effort ${esc(r.effort)}</span>` : ""}
      </div>
      <div class="smart-rec-body">
        <div class="smart-rec-proof"><strong>Preuve :</strong> ${esc(r.proof)}</div>
        <div class="smart-rec-action"><strong>Action :</strong> ${esc(r.action)}</div>
        ${r.roi ? `<div class="smart-rec-roi"><strong>ROI estimé :</strong> ${esc(r.roi)}</div>` : ""}
      </div>
    </div>
  `).join("");
  return `
    <div class="smart-recs-block">
      <div class="smart-recs-header">
        <span class="smart-recs-icon">🧠</span>
        <div class="smart-recs-title">Smart Recommendations</div>
        <span class="smart-recs-count">${recs.length} recommandation${recs.length > 1 ? "s" : ""}</span>
      </div>
      <div class="smart-recs-list">${cards}</div>
    </div>
  `;
}

// -----------------------------------------------------------------------
// Ads badge cell renderer (for table cells with SCALE/TEST/PAUSE/KILL)
// -----------------------------------------------------------------------

function renderTableWithAdsBadges(table) {
  const cleaned = filterTable(table);
  if (!cleaned) return "";
  const headerRow = (cleaned.headers || []).map(h => `<th>${esc(h)}</th>`).join("");
  const bodyRows = (cleaned.rows || []).map(row => {
    const cells = (Array.isArray(row) ? row : [row]).map(cell => {
      const s = String(cell ?? "—");
      // Detect ads badge strings
      if (s.includes("✅ SCALE") || s.includes("⚠️ TEST") || s.includes("🟡 PAUSE") || s.includes("❌ KILL")) {
        const badgeKey = s.includes("SCALE") ? "SCALE" : s.includes("TEST") ? "TEST" : s.includes("PAUSE") ? "PAUSE" : "KILL";
        return `<td>${adsBadge(badgeKey)}</td>`;
      }
      return `<td>${esc(s)}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `
    <div class="table-wrapper">
      ${cleaned.title ? `<div class="table-title">${esc(cleaned.title)}</div>` : ""}
      <table class="premium-table">
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

// IDs of tables that may contain ads badges
const ADS_BADGE_TABLE_IDS = new Set([
  "google-campaigns", "meta-campaigns", "microsoft-campaigns",
  "budget-allocation-optimization", "ads-platform-summary",
]);

function renderSection(section, idx, options = {}) {
  if (!section) return "";
  if (!hasRenderableContent(section)) return "";

  const icon = SECTION_ICONS[section.id] || "📄";
  const isStratads = section.id === "stratads-recommendation";
  const isPrivate = !!section.isPrivate;
  const showHumanSummary = !!options.humanSummaries;
  const sectionBlockClass = isPrivate ? "section-block private" : "section-block public";

  // Scope badge: PUBLIC (blue) or PRIVATE (red) — not shown on recommendation/neutral sections
  const scopeBadge = isStratads
    ? ""
    : isPrivate
      ? `<span class="private-badge">🔒 Section PRIVATE</span>`
      : `<span class="public-badge">🌐 Section PUBLIC</span>`;

  // Data unavailable callout — shown when the section has no real API data
  if (section.dataAvailable === false) {
    return `
      <section class="section ${sectionBlockClass}" id="${esc(section.id)}">
        <div class="section-header">
          <div class="section-icon">${icon}</div>
          <div class="section-header-text">
            <h2>${esc(idx + 1)}. ${esc(section.title)}</h2>
            ${scopeBadge}
          </div>
        </div>
        <div class="unavailable-callout">
          <span class="unavailable-callout-icon">ℹ️</span>
          <div>
            <strong>${esc(section.title)}</strong> — Données indisponibles
            <p>${esc(section.reason || "Données non disponibles pour cette section.")}</p>
          </div>
        </div>
      </section>
    `;
  }

  // Special rendering for StratAds recommendation
  if (isStratads && section.stratasdOffer) {
    const offer = section.stratasdOffer;
    const extraTables = (section.tables || []).slice(1).map(t => renderTable(t)).join("");
    const ctaLink = offer.ctaUrl
      ? `<a class="stratads-cta" href="${esc(offer.ctaUrl)}" target="_blank" rel="noopener">${esc(offer.cta)}</a>`
      : `<span class="stratads-cta">${esc(offer.cta)}</span>`;
    return `
      <section class="section" id="${esc(section.id)}">
        <div class="stratads-block">
          <h2>${esc(section.title)}</h2>
          <p style="opacity:.8;font-size:14px;margin-bottom:24px;">${esc(section.intro)}</p>
          <div class="stratads-offer-title">${esc(offer.title)}</div>
          <div class="stratads-why">${esc(offer.why)}</div>
          <ul class="stratads-points">
            ${(offer.points || []).map(p => `<li>${esc(p)}</li>`).join("")}
          </ul>
          ${renderTable(section.tables?.[0])}
          ${offer.nextSteps?.length ? `
            <div style="margin-top:20px;">
              <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;opacity:.7;margin-bottom:8px;">Prochaines étapes</div>
              <ol style="padding-left:20px;">
                ${offer.nextSteps.map(s => `<li style="font-size:13px;opacity:.85;margin-bottom:4px;">${esc(s)}</li>`).join("")}
              </ol>
            </div>
          ` : ""}
          <div style="margin-top:32px;">
            ${ctaLink}
          </div>
        </div>
        ${extraTables ? `<div style="margin-top:24px;">${extraTables}</div>` : ""}
      </section>
    `;
  }

  const chartsHtml = (section.charts || []).map(filterChart).filter(Boolean).map(c => `<div class="chart-card">${renderChart(c)}</div>`).join("");
  const chartRow = chartsHtml ? `<div class="chart-row chart-section">${chartsHtml}</div>` : "";

  const tablesHtml = (section.tables || []).map(t =>
    ADS_BADGE_TABLE_IDS.has(t?.id) ? renderTableWithAdsBadges(t) : renderTable(t)
  ).join("");

  const humanSummaryHtml = showHumanSummary
    ? renderHumanSummary(section.humanSummary || buildHumanSummaryFromSection(section))
    : "";

  const smartRecsHtml = section.smartRecommendations?.length
    ? renderSmartRecommendations(section.smartRecommendations)
    : "";

  return `
    <section class="section ${sectionBlockClass}" id="${esc(section.id)}">
      <div class="section-header">
        <div class="section-icon">${icon}</div>
        <div class="section-header-text">
          <h2>${esc(idx + 1)}. ${esc(section.title)}</h2>
          ${scopeBadge}
        </div>
      </div>
      ${section.intro ? `<p class="section-intro">${esc(section.intro)}</p>` : ""}
      ${section.lookerDashboard ? renderLookerDashboard(section.lookerDashboard) : ""}
      ${renderFindings(section.findings)}
      ${chartRow}
      ${tablesHtml}
      ${renderActions(section.actions)}
      ${smartRecsHtml}
      ${renderSectionSummary(section.summary, section.riskLevel)}
      ${humanSummaryHtml}
    </section>
  `;
}

// -----------------------------------------------------------------------
// Cover page
// -----------------------------------------------------------------------

function renderCover(reportModel) {
  const meta = reportModel.reportMeta || {};
  const scores = reportModel.scores || {};
  const globalScore = num(scores.global);
  const isConfidential = !!meta.confidential;
  const profileName = meta.profileName || meta.profile || "—";
  const date = meta.date ? new Date(meta.date).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" }) : "—";

  return `
    <div class="cover">
      <div class="cover-accent-line"></div>
      ${isConfidential ? `<div style="position:absolute;top:24px;right:24px;z-index:2;"><span class="cover-badge confidential">🔒 CONFIDENTIEL</span></div>` : ""}
      <div style="position:relative;z-index:1;">
        <div class="cover-badge">${esc(profileName)}</div>
        <div class="cover-title">Audit Acquisition Digitale</div>
        <div class="cover-subtitle">Rapport stratégique — Cabinet StratAds</div>
        <div class="cover-meta">
          <div class="cover-meta-item">
            <span class="cover-meta-label">Client</span>
            <span class="cover-meta-value">${esc(meta.client)}</span>
          </div>
          <div class="cover-meta-item">
            <span class="cover-meta-label">URL</span>
            <span class="cover-meta-value">${esc(meta.url)}</span>
          </div>
          <div class="cover-meta-item">
            <span class="cover-meta-label">Date</span>
            <span class="cover-meta-value">${esc(date)}</span>
          </div>
          <div class="cover-meta-item">
            <span class="cover-meta-label">Profil</span>
            <span class="cover-meta-value">${esc(profileName)}</span>
          </div>
        </div>
      </div>
      <div class="cover-score" style="z-index:1;">
        <div class="cover-score-value">${globalScore}</div>
        <div class="cover-score-label">Score global /100</div>
      </div>
    </div>
  `;
}

// -----------------------------------------------------------------------
// Table of contents
// -----------------------------------------------------------------------

function renderTOC(sections) {
  const items = sections.map((s, i) => {
    const isPrivate = !!s.isPrivate;
    const isStratads = s.id === "stratads-recommendation";
    const scopeBadge = isStratads
      ? ""
      : isPrivate
        ? `<span class="private-badge" style="font-size:9px;padding:1px 7px;margin-left:6px;">PRIVATE</span>`
        : `<span class="public-badge" style="font-size:9px;padding:1px 7px;margin-left:6px;">PUBLIC</span>`;
    return `
      <li>
        <span class="toc-num">${i + 1}.</span>
        <a href="#${esc(s.id)}">${esc(s.title)}</a>${scopeBadge}
      </li>
    `;
  }).join("");
  return `
    <nav class="toc">
      <h2>Table des matières</h2>
      <ol>${items}</ol>
    </nav>
  `;
}

// -----------------------------------------------------------------------
// Validation warnings block
// -----------------------------------------------------------------------

function renderValidationWarnings(validationResult) {
  if (!validationResult) return "";
  const { errors = [], warnings = [] } = validationResult;
  if (errors.length === 0 && warnings.length === 0) return "";

  const errList = errors.length
    ? `<div style="font-weight:800;color:#dc2626;margin-bottom:4px;">Erreurs (${errors.length})</div><ul>${errors.map(e => `<li>${esc(e)}</li>`).join("")}</ul>`
    : "";
  const warnList = warnings.length
    ? `<div style="font-weight:800;color:#d97706;margin-top:8px;margin-bottom:4px;">Avertissements (${warnings.length})</div><ul>${warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul>`
    : "";

  return `
    <div class="validation-block">
      <div class="validation-block-title">⚙️ Rapport de validation (Quality Gate)</div>
      ${errList}
      ${warnList}
    </div>
  `;
}

// -----------------------------------------------------------------------
// Scope summaries (PUBLIC / PRIVATE / Global) — rendered at report end
// -----------------------------------------------------------------------

/**
 * Build a consolidated scope summary block for all sections of a given scope.
 * @param {object[]} sections
 * @param {"public"|"private"} scope
 * @returns {string} HTML
 */
function renderScopeSummaryBlock(sections, scope) {
  const isPrivateScope = scope === "private";
  const relevant = sections.filter(s =>
    s && s.id !== "stratads-recommendation" && !!s.isPrivate === isPrivateScope && hasRenderableContent(s)
  );
  if (relevant.length === 0) return "";

  const icon = isPrivateScope ? "🔒" : "🌐";
  const label = isPrivateScope ? "PRIVATE" : "PUBLIC";
  const badgeClass = isPrivateScope ? "private-badge" : "public-badge";
  const headerClass = isPrivateScope ? "scope-summary-header private" : "scope-summary-header public";

  const rows = relevant.map(s => {
    const summaryItems = (s.summary || []).filter(x => !isBlank(x));
    const riskLevel = s.riskLevel || "";
    const riskCls = riskLevel === "Élevé" ? "bad" : riskLevel === "Moyen" ? "warn" : "ok";
    const riskCell = riskLevel
      ? `<span class="chip ${riskCls}" style="font-size:10px;">${riskLevel}</span>`
      : `<span class="chip info" style="font-size:10px;">—</span>`;
    const summaryText = summaryItems.length
      ? summaryItems.map(t => `<li>${esc(t)}</li>`).join("")
      : `<li style="color:var(--ink-faint);font-style:italic;">Aucun résumé disponible</li>`;
    return `
      <tr>
        <td style="font-weight:700;color:var(--ink);vertical-align:top;white-space:nowrap;">${esc(s.title)}</td>
        <td style="vertical-align:top;">${riskCell}</td>
        <td style="vertical-align:top;"><ul style="padding-left:16px;margin:0;">${summaryText}</ul></td>
      </tr>`;
  }).join("");

  return `
    <section class="section scope-summary-block" id="summary-${scope}">
      <div class="${headerClass}">
        <span class="${badgeClass}">${icon} ${label}</span>
        <h2>Résumé des sections ${label}</h2>
      </div>
      <div class="table-wrapper" style="margin-top:0;">
        <table class="premium-table">
          <thead><tr>
            <th style="width:200px;">Section</th>
            <th style="width:90px;">Risque</th>
            <th>Points clés</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

/**
 * Render end-of-report scope summaries: PUBLIC then PRIVATE (if any) then Global.
 */
function renderEndSummaries(reportModel) {
  const sections = reportModel.sections || [];
  const hasPrivate = sections.some(s => s && s.isPrivate && hasRenderableContent(s));

  const publicSummary = renderScopeSummaryBlock(sections, "public");
  const privateSummary = hasPrivate ? renderScopeSummaryBlock(sections, "private") : "";
  const globalSummary = renderFinalSummaryBlock(reportModel);

  return [publicSummary, privateSummary, globalSummary].filter(Boolean).join("\n");
}

// -----------------------------------------------------------------------
// Final summary block (rendered at the end of every report)
// -----------------------------------------------------------------------

/**
 * Render a final summary block consolidating all scores, strengths,
 * weaknesses and top actions. Always rendered regardless of profile.
 */
function renderFinalSummaryBlock(reportModel) {
  const globalSummary = reportModel.globalSummary;
  const scores = reportModel.scores || {};
  const meta = reportModel.reportMeta || {};
  if (!globalSummary) return "";

  const globalScore = num(scores.global);
  const scoreClass = globalScore >= 80 ? "ok" : globalScore >= 60 ? "warn" : "bad";
  const scoreLabel = globalScore >= 80 ? "Fiable" : globalScore >= 60 ? "À optimiser" : "Risque élevé";

  const strengths = (globalSummary.strengths || []).filter(s => !isBlank(s)).slice(0, 5);
  const weaknesses = (globalSummary.weaknesses || []).filter(w => !isBlank(w)).slice(0, 5);
  const top10 = (globalSummary.top10Actions || []).filter(a => a && !isBlank(a.title)).slice(0, 10);

  const strengthsHtml = strengths.length
    ? `<div class="final-summary-col">
        <div class="final-summary-col-title">✅ Points forts</div>
        <ul>${strengths.map(s => `<li>${esc(s)}</li>`).join("")}</ul>
       </div>`
    : "";

  const weaknessesHtml = weaknesses.length
    ? `<div class="final-summary-col">
        <div class="final-summary-col-title">❌ Points à corriger</div>
        <ul>${weaknesses.map(w => `<li>${esc(w)}</li>`).join("")}</ul>
       </div>`
    : "";

  const actionsRows = top10.map((a, i) => `
    <tr>
      <td style="font-weight:700;color:#0f172a;">${i + 1}. ${esc(a.title)}</td>
      <td><span class="chip ${a.effort === "S" ? "ok" : a.effort === "M" ? "warn" : "bad"}">Effort ${esc(a.effort)}</span></td>
      <td>${esc(a.impact)}</td>
      <td><span class="chip ${a.risk === "high" ? "bad" : a.risk === "medium" ? "warn" : "ok"}">${a.risk === "high" ? "Élevé" : a.risk === "medium" ? "Moyen" : "Faible"}</span></td>
      <td>${esc(a.owner)}</td>
      <td><span class="chip info">${esc(a.deadline)}</span></td>
    </tr>
  `).join("");

  const actionsTableHtml = top10.length ? `
    <div class="table-wrapper" style="margin-top:20px;">
      <div class="table-title">Top ${top10.length} Actions Prioritaires</div>
      <table class="premium-table">
        <thead><tr>
          <th>Action</th><th>Effort</th><th>Impact</th><th>Risque</th><th>Owner</th><th>Échéance</th>
        </tr></thead>
        <tbody>${actionsRows}</tbody>
      </table>
    </div>
  ` : "";

  return `
    <section class="report-final-summary" id="final-summary">
      <div class="final-summary-header">
        <div class="final-summary-icon">🏆</div>
        <div>
          <h2 class="final-summary-title">Résumé Final de l'Audit</h2>
          <p class="final-summary-subtitle">Synthèse complète — ${esc(meta.client || "")} · Profil ${esc(meta.profileName || meta.profile || "")}</p>
        </div>
        <div class="final-summary-score ${scoreClass}">
          <div class="final-summary-score-value">${globalScore}</div>
          <div class="final-summary-score-label">Score global /100</div>
          <div class="final-summary-score-status">${scoreLabel}</div>
        </div>
      </div>
      ${(strengthsHtml || weaknessesHtml) ? `<div class="final-summary-sw-grid">${strengthsHtml}${weaknessesHtml}</div>` : ""}
      ${actionsTableHtml}
    </section>
  `;
}


function renderFooter(reportModel) {
  const meta = reportModel.reportMeta || {};
  const date = meta.date ? new Date(meta.date).toLocaleDateString("fr-FR") : "—";
  return `
    <footer class="report-footer">
      <p>StratAds — Cabinet d'acquisition digitale &nbsp;·&nbsp; ${esc(meta.auditId || "")} &nbsp;·&nbsp; v${esc(meta.version || "—")} &nbsp;·&nbsp; ${esc(date)}</p>
      ${meta.confidential ? `<p style="color:var(--bad);font-weight:800;letter-spacing:.06em;">🔒 DOCUMENT CONFIDENTIEL — Ne pas diffuser</p>` : `<p style="color:var(--ink-faint);">© StratAds ${new Date().getFullYear()} — Tous droits réservés</p>`}
    </footer>
  `;
}

// -----------------------------------------------------------------------
// CSS loading
// -----------------------------------------------------------------------

let _cssCache = null;
function getPremiumCss() {
  if (_cssCache) return _cssCache;
  try {
    _cssCache = fs.readFileSync(path.join(__dirname, "premium.css"), "utf-8");
    return _cssCache;
  } catch {
    return "/* premium.css not found */";
  }
}

let _scopeCssCache = null;
function getScopeCss() {
  if (_scopeCssCache) return _scopeCssCache;
  try {
    _scopeCssCache = fs.readFileSync(
      path.join(__dirname, "../../components/audit-scope/audit-scope-premium.css"),
      "utf-8"
    );
    return _scopeCssCache;
  } catch {
    return "/* audit-scope-premium.css not found */";
  }
}

// -----------------------------------------------------------------------
// Main render function
// -----------------------------------------------------------------------

/**
 * Render a reportModel as a complete, self-contained HTML string.
 * @param {object} reportModel — normalized report model from assembler
 * @param {object} [validationResult] — optional result from validateReport()
 * @returns {string} Complete HTML
 */
export function renderReportHtml(reportModel, validationResult = null) {
  const meta = reportModel.reportMeta || {};
  const sections = reportModel.sections || [];
  const isConfidential = !!meta.confidential;

  const css = getPremiumCss();
  const scopeCss = getScopeCss();

  // Map profile id → scope tier id for the audit-scope section display.
  const PROFILE_TO_TIER = {
    fast: "fast",
    premium: "public",
    growth: "growth",
    full: "360",
    private_analytics: "360",
    private_ads_upload: "360",
    mini: "fast",
    public_360: "public",
  };
  const activeTierId = PROFILE_TO_TIER[meta.profile] || "fast";
  const scopeHtml = renderScopePremiumPage({ reportModel, activeTierId, standalone: false });

  const coverHtml = renderCover(reportModel);
  const tocHtml = renderTOC(sections);
  const validationHtml = renderValidationWarnings(validationResult);
  const renderOptions = { humanSummaries: !!meta.humanSummaries };
  const sectionsHtml = sections.map((s, i) => renderSection(s, i, renderOptions)).join("\n");
  const endSummariesHtml = renderEndSummaries(reportModel);
  const footerHtml = renderFooter(reportModel);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Audit StratAds — ${esc(meta.client)} — ${esc(meta.profileName || meta.profile)}</title>
  <style>
${css}
${scopeCss}
  </style>
</head>
<body>
  ${isConfidential ? `<div class="confidential-banner">🔒 Document confidentiel — Usage strictement interne</div>` : ""}
  ${coverHtml}
  ${tocHtml}
  ${scopeHtml}
  ${validationHtml}
  <main>
    ${sectionsHtml}
  </main>
  ${endSummariesHtml}
  ${footerHtml}
</body>
</html>`;
}
