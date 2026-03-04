/**
 * ScopeSections — Included / excluded panels with explanation
 *
 * Renders side-by-side "What's included" and "What's excluded"
 * panels for a given audit tier, with an optional "Why this scope?"
 * explanation box.
 *
 * @module ScopeSections
 */

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Default scope content per tier.
 */
export const TIER_SCOPE_CONTENT = {
  fast: {
    included: [
      { icon: "🎯", label: "Executive Summary & Score global" },
      { icon: "⚡", label: "Top 5 Quick Wins priorisés" },
      { icon: "🔴", label: "Registre des risques business" },
      { icon: "🚀", label: "Performance & Core Web Vitals" },
      { icon: "🔍", label: "SEO Essentiels (méta, structure)" },
      { icon: "🏷️", label: "Tracking GA4 — vérification de base" },
      { icon: "🗺️", label: "Roadmap 30/60/90 jours" },
    ],
    excluded: [
      { icon: "🌐", label: "DNS & Infrastructure" },
      { icon: "🛡️", label: "Audit Sécurité complet" },
      { icon: "🧩", label: "Schema & Données structurées" },
      { icon: "🧱", label: "Analyse Tech Stack" },
      { icon: "📝", label: "Backlog & Impact-Effort matrix" },
      { icon: "🔒", label: "Données Ads / Analytics privées" },
    ],
    why: "Le profil FAST couvre les signaux business essentiels en quelques heures d'analyse publique. Il fournit un plan d'action clair et priorisé, lisible par un décisionnaire non-technique, sans plonger dans la profondeur technique.",
  },
  public: {
    included: [
      { icon: "🎯", label: "Executive Summary & Scores détaillés" },
      { icon: "🚀", label: "Performance + CWV Distribution complète" },
      { icon: "🔍", label: "SEO Technique + Audit Crawler" },
      { icon: "🌐", label: "DNS & Infrastructure" },
      { icon: "🛡️", label: "Sécurité & Headers HTTP" },
      { icon: "🤖", label: "Robots, Sitemap & Indexation" },
      { icon: "🧩", label: "Schema / Données structurées" },
      { icon: "🧱", label: "Tech Stack & CMS" },
      { icon: "✅", label: "Consentement RGPD" },
      { icon: "📝", label: "Backlog & Impact-Effort matrix" },
      { icon: "📋", label: "Checklist Conformité" },
      { icon: "🗺️", label: "Roadmap priorisée complète" },
    ],
    excluded: [
      { icon: "📊", label: "GA4 / GSC données privées" },
      { icon: "💰", label: "Données Ads (Google Ads, Meta)" },
      { icon: "🏷️", label: "Tracking avancé (Event Map)" },
    ],
    why: "Le profil PUBLIC exploite exclusivement les données publiques (crawl, Lighthouse, headers, DNS) pour une couverture technique exhaustive — sans nécessiter d'accès aux outils analytics ou ads du client.",
  },
  growth: {
    included: [
      { icon: "📊", label: "Tracking Avancé GA4/GTM" },
      { icon: "🏷️", label: "Event Map & Conversion Map" },
      { icon: "🗂️", label: "Checklist Qualité Data" },
      { icon: "✅", label: "Audit Consentement RGPD" },
      { icon: "⚙️", label: "Audit GTM — conteneurs & tags" },
      { icon: "🎯", label: "Priorités d'instrumentation" },
      { icon: "🗺️", label: "Roadmap tracking" },
    ],
    excluded: [
      { icon: "🚀", label: "Performance & Core Web Vitals" },
      { icon: "🔍", label: "SEO Technique" },
      { icon: "🌐", label: "DNS & Infrastructure" },
      { icon: "🛡️", label: "Audit Sécurité" },
      { icon: "📝", label: "Backlog global" },
    ],
    why: "GROWTH est conçu pour les équipes qui doivent construire leur acquisition depuis zéro : pas de tracking en place, données structurées manquantes, GA4 absent ou instable. L'objectif est de poser des fondations data solides avant toute autre optimisation. À distinguer de PREMIUM, qui s'adresse aux équipes ayant déjà une acquisition active à optimiser.",
  },
  tier360: {
    included: [
      { icon: "🎯", label: "Executive Summary & Scores complets" },
      { icon: "⚡", label: "Quick Wins & Risques consolidés" },
      { icon: "🚀", label: "Performance complète + CWV" },
      { icon: "🔍", label: "SEO Technique approfondi + Crawler" },
      { icon: "🏷️", label: "Tracking GA4/GTM avancé" },
      { icon: "🌐", label: "DNS & Infrastructure" },
      { icon: "🛡️", label: "Sécurité & Headers HTTP" },
      { icon: "🤖", label: "Robots, Sitemap & Indexation" },
      { icon: "🧩", label: "Schema / Données structurées" },
      { icon: "✅", label: "Consentement RGPD" },
      { icon: "📝", label: "Backlog & Compliance" },
      { icon: "📎", label: "Annexes & Données brutes" },
      { icon: "🗺️", label: "Roadmap 90 jours" },
    ],
    excluded: [],
    why: "L'AUDIT 360 est la formule technique la plus complète sur données publiques : il combine l'intégralité de l'analyse technique (PUBLIC), la profondeur tracking et les livrables premium (PPTX, annexes) pour une vision exhaustive. Pour aller plus loin avec les données privées (GA4, Ads), voir l'offre PRIVATE.",
  },
  private: {
    included: [
      { icon: "🏆", label: "Toutes les sections AUDIT 360" },
      { icon: "📊", label: "GA4 — Canaux, conversions, pages de destination" },
      { icon: "🔎", label: "Search Console — Requêtes, pages, opportunités SEO" },
      { icon: "💰", label: "Google Ads / Meta Ads — Dépenses, ROAS, CPA" },
      { icon: "🔒", label: "Séparation PUBLIC / PRIVÉ avec badges CONFIDENTIEL" },
      { icon: "🗺️", label: "Roadmap 90 jours enrichie données réelles" },
    ],
    excluded: [],
    why: "L'offre PRIVATE combine l'AUDIT 360 complet avec l'analyse de vos données confidentielles (GA4, Search Console, Google Ads, Meta Ads). Chaque section privée est clairement balisée CONFIDENTIEL. Idéal pour une décision stratégique basée sur vos données réelles de performance.",
  },
};

/**
 * Render included/excluded scope panels for a given tier.
 *
 * @param {object} opts
 * @param {string}   opts.tierId        - Tier id: "fast" | "public" | "growth" | "tier360"
 * @param {Array}    [opts.included]    - Custom included items [{icon, label}]
 * @param {Array}    [opts.excluded]    - Custom excluded items [{icon, label}]
 * @param {string}   [opts.why]         - Explanation text for "Why this scope?"
 * @param {boolean}  [opts.showWhy]     - Whether to show the "Why?" box (default: true)
 * @returns {string} HTML string
 */
export function renderScopeSections({ tierId, included, excluded, why, showWhy = true } = {}) {
  const defaults = TIER_SCOPE_CONTENT[tierId] || {};
  const incItems = included || defaults.included || [];
  const excItems = excluded || defaults.excluded || [];
  const whyText  = why || defaults.why || "";

  const incList = incItems.map(item => `
    <li class="scope-item included-item">
      <span class="scope-item-icon">${esc(item.icon)}</span>
      ${esc(item.label)}
    </li>
  `).join("");

  const excList = excItems.length
    ? excItems.map(item => `
      <li class="scope-item excluded-item">
        <span class="scope-item-icon">${esc(item.icon)}</span>
        ${esc(item.label)}
      </li>
    `).join("")
    : `<li class="scope-item included-item" style="font-style:italic;opacity:.7;">Aucune exclusion — couverture complète</li>`;

  const whyBox = showWhy && whyText
    ? `<div class="scope-why-box">
        <strong>💡 Pourquoi ce périmètre ?</strong>
        ${esc(whyText)}
       </div>`
    : "";

  return `
    <div class="scope-sections-grid">
      <div class="scope-panel">
        <div class="scope-panel-header included-header">
          <div class="scope-panel-icon included-icon">✅</div>
          <div class="scope-panel-title">Périmètre inclus</div>
          <div class="scope-panel-count">${incItems.length} éléments</div>
        </div>
        <div class="scope-panel-body">
          <ul class="scope-item-list">${incList}</ul>
          ${whyBox}
        </div>
      </div>

      <div class="scope-panel">
        <div class="scope-panel-header excluded-header">
          <div class="scope-panel-icon excluded-icon">🚫</div>
          <div class="scope-panel-title">Non inclus dans cette formule</div>
          <div class="scope-panel-count">${excItems.length} éléments</div>
        </div>
        <div class="scope-panel-body">
          <ul class="scope-item-list">${excList}</ul>
        </div>
      </div>
    </div>
  `;
}
