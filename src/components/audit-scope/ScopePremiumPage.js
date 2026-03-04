/**
 * ScopePremiumPage — Full audit scope showcase page
 *
 * Assembles all audit-scope components into a complete,
 * self-contained HTML page showcasing the FAST / PUBLIC /
 * GROWTH / 360° tier comparison.
 *
 * Can be embedded into the main report HTML or rendered standalone.
 *
 * @module ScopePremiumPage
 */

import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderKpiRow } from "./KpiCard.js";
import { renderTierCardsRow } from "./AuditTierCardPremium.js";
import { renderScopeGrid, SCOPE_DOMAINS } from "./ScopeGrid.js";
import { renderScopeSections } from "./ScopeSections.js";
import { renderDeliverablesTable } from "./DeliverablesTable.js";
import { renderRiskHeader, buildRiskCountsFromModel } from "./RiskHeader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// -----------------------------------------------------------------------
// CSS loading
// -----------------------------------------------------------------------

let _cssCache = null;
function getScopeCss() {
  if (_cssCache) return _cssCache;
  try {
    _cssCache = fs.readFileSync(path.join(__dirname, "audit-scope-premium.css"), "utf-8");
    return _cssCache;
  } catch {
    return "/* audit-scope-premium.css not found */";
  }
}

// -----------------------------------------------------------------------
// Default KPI cards
// -----------------------------------------------------------------------

const DEFAULT_KPI_CARDS = [
  {
    icon: "📐",
    label: "Domaines couverts",
    value: "15",
    sublabel: "Sur toutes les formules",
    accentColor: "linear-gradient(90deg,#2563eb,#3b82f6)",
    iconBg: "#eff6ff",
    valueColor: "#1e40af",
  },
  {
    icon: "📋",
    label: "Formules disponibles",
    value: "4",
    sublabel: "FAST · PUBLIC · GROWTH · 360°",
    accentColor: "linear-gradient(90deg,#7c3aed,#8b5cf6)",
    iconBg: "#f5f3ff",
    valueColor: "#5b21b6",
  },
  {
    icon: "📄",
    label: "Pages max (360°)",
    value: "60",
    sublabel: "Rapport complet avec annexes",
    accentColor: "linear-gradient(90deg,#d97706,#f59e0b)",
    iconBg: "#fffbeb",
    valueColor: "#92400e",
  },
  {
    icon: "⚡",
    label: "Livrables inclus",
    value: "20",
    sublabel: "Rapport · PDF · PPTX · Roadmap",
    accentColor: "linear-gradient(90deg,#059669,#10b981)",
    iconBg: "#ecfdf5",
    valueColor: "#065f46",
  },
];

// -----------------------------------------------------------------------
// CTA Decision Panel
// -----------------------------------------------------------------------

function renderCtaPanel({ title, subtitle, primaryCta, secondaryCta } = {}) {
  const t  = title       || "Quelle formule choisir pour votre projet ?";
  const st = subtitle    || "Nos experts StratAds vous orientent vers la formule la plus adaptée à votre situation.";
  const pc = primaryCta  || "Demander une recommandation gratuite";
  const sc = secondaryCta|| "Voir tous les livrables en détail";

  return `
    <div class="scope-cta-panel">
      <div class="scope-cta-title">${t}</div>
      <div class="scope-cta-subtitle">${st}</div>
      <div class="scope-cta-buttons">
        <a href="#contact" class="scope-cta-btn primary">🎯 ${pc}</a>
        <a href="#deliverables" class="scope-cta-btn secondary">📋 ${sc}</a>
      </div>
    </div>
  `;
}

// -----------------------------------------------------------------------
// Main page renderer
// -----------------------------------------------------------------------

/**
 * Render the full audit scope premium page.
 *
 * @param {object} [opts]
 * @param {object} [opts.reportModel]    - Optional report model to derive risk counts from
 * @param {string} [opts.activeTierId]   - Active tier id for scope sections (default: "fast")
 * @param {Array}  [opts.kpiCards]       - Override KPI cards
 * @param {Array}  [opts.domains]        - Override scope grid domains
 * @param {Array}  [opts.deliverables]   - Override deliverables
 * @param {string} [opts.title]          - Page title override
 * @param {string} [opts.subtitle]       - Page subtitle override
 * @param {boolean}[opts.standalone]     - If true, wraps in full HTML document with embedded CSS
 * @returns {string} HTML string
 */
export function renderScopePremiumPage({
  reportModel,
  activeTierId = "fast",
  kpiCards,
  domains,
  deliverables,
  title,
  subtitle,
  standalone = true,
} = {}) {
  const pageTitle    = title    || "Formules d'Audit — Périmètre & Livrables";
  const pageSubtitle = subtitle || "Comparez les 4 formules d'audit StratAds et identifiez celle qui correspond à votre besoin.";

  // KPI section
  const kpiHtml = renderKpiRow(kpiCards || DEFAULT_KPI_CARDS);

  // Tier cards
  const tierCardsHtml = renderTierCardsRow();

  // Risk header (from reportModel if provided, else sample data)
  const riskCounts = reportModel
    ? buildRiskCountsFromModel(reportModel)
    : { critical: 2, high: 7, medium: 11, low: 5 };
  const riskHtml = renderRiskHeader({ ...riskCounts });

  // Scope grid
  const gridHtml = renderScopeGrid(domains || SCOPE_DOMAINS);

  // Scope sections (for active tier)
  const scopeSectionsHtml = renderScopeSections({ tierId: activeTierId });

  // Deliverables table
  const deliverablesHtml = renderDeliverablesTable(deliverables);

  // CTA panel
  const ctaHtml = renderCtaPanel();

  const innerHtml = `
    <div class="scope-premium-page">
      <h1 class="scope-page-title">${pageTitle}</h1>
      <p class="scope-page-subtitle">${pageSubtitle}</p>

      <div class="scope-section-heading">Vue d'ensemble</div>
      ${kpiHtml}

      <div class="scope-section-heading" style="margin-top:8px;">Anomalies — Exemple de restitution</div>
      ${riskHtml}

      <div class="scope-section-heading">Formules d'audit</div>
      ${tierCardsHtml}

      <div class="scope-section-heading" id="scope-grid">Périmètre comparatif (15 domaines × 4 formules)</div>
      ${gridHtml}

      <div class="scope-section-heading">Détail de la formule — ${activeTierId.toUpperCase()}</div>
      ${scopeSectionsHtml}

      <div class="scope-section-heading" id="deliverables">Livrables par formule</div>
      ${deliverablesHtml}

      ${ctaHtml}
    </div>
  `;

  if (!standalone) return innerHtml;

  const css = getScopeCss();
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StratAds — ${pageTitle}</title>
  <style>
${css}
  </style>
</head>
<body style="background:#f8fafc;margin:0;padding:0;">
  ${innerHtml}
</body>
</html>`;
}
