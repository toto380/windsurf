# audit-scope — Premium SaaS UI Components

A set of HTML-generating components for displaying the StratAds audit scope across **4 tiers**: FAST / PUBLIC 360 / GROWTH / 360°.

Designed to be embedded directly in HTML/PDF reports or rendered as a standalone page.

---

## File structure

```
src/components/audit-scope/
├── audit-scope-premium.css    CSS design system (tokens, components, responsive, dark mode)
├── KpiCard.js                 KPI metric card component
├── AuditTierCardPremium.js    Tier cards with gradient headers and badges
├── ScopeGrid.js               15 domains × 4 tiers comparison matrix
├── ScopeSections.js           Included/excluded panels with "Why this scope?" explanation
├── DeliverablesTable.js       Deliverables comparison table across all tiers
├── RiskHeader.js              Risk status counters (critical/high/medium/low)
├── ScopePremiumPage.js        Full showcase page assembler (standalone or embeddable)
├── index.js                   Barrel exports for all components
└── README.md                  This file
```

---

## Quick start

```js
import { renderScopePremiumPage } from './src/components/audit-scope/index.js';

// Render a standalone HTML page
const html = renderScopePremiumPage({ standalone: true });
// Write to file, serve, or embed in report
```

---

## Individual components

### KpiCard

Renders a KPI metric card with icon, value, sublabel and variation indicator.

```js
import { renderKpiCard, renderKpiRow } from './src/components/audit-scope/index.js';

// Single card
const card = renderKpiCard({
  icon: '📐',
  label: 'Domaines couverts',
  value: '15',
  sublabel: 'Sur toutes les formules',
  variation: '+3 vs FAST',
  variationType: 'up',
});

// Row of cards
const row = renderKpiRow([
  { icon: '📐', label: 'Domaines', value: '15' },
  { icon: '📋', label: 'Formules', value: '4' },
]);
```

### AuditTierCardPremium

Renders tier cards (FAST / PUBLIC / GROWTH / 360°) with gradient headers, badge, target info and section list.

```js
import { renderTierCardsRow, renderAuditTierCard, AUDIT_TIERS } from './src/components/audit-scope/index.js';

// All 4 tier cards in a grid
const grid = renderTierCardsRow();

// Single tier card using built-in definition
const card = renderAuditTierCard(AUDIT_TIERS.tier360);

// Custom tier card
const custom = renderAuditTierCard({
  key: 'fast',
  name: 'FAST',
  subtitle: 'Mon sous-titre',
  badge: 'FAST',
  target: 'Mon audience',
  pages: '8 – 14 pages',
  depth: 'lite',
  depthLabel: 'Légère',
  icon: '⚡',
  sections: ['Section 1', 'Section 2'],
});
```

### ScopeGrid

Renders a 15 domains × 4 tiers comparison matrix showing ✓ / — / ⭐ / 🔒 per cell.

```js
import { renderScopeGrid, SCOPE_DOMAINS } from './src/components/audit-scope/index.js';

// Default grid with 15 built-in domains
const grid = renderScopeGrid();

// Custom title
const grid2 = renderScopeGrid(SCOPE_DOMAINS, { title: 'Mon titre' });

// Custom domains
const grid3 = renderScopeGrid([
  { icon: '🚀', label: 'Performance', fast: 'included', public: 'included', growth: 'excluded', tier360: 'included' },
]);
```

Domain status values:
- `"included"` — ✓ domain is covered
- `"excluded"` — — domain is not covered
- `"advanced"` — ⭐ domain is covered at an advanced level
- `"private"`  — 🔒 requires private data access

### ScopeSections

Renders included/excluded item panels with an optional "Why this scope?" explanation.

```js
import { renderScopeSections } from './src/components/audit-scope/index.js';

// Use built-in tier content
const panels = renderScopeSections({ tierId: 'growth' });

// Override content
const panels2 = renderScopeSections({
  included: [{ icon: '🎯', label: 'Mon élément inclus' }],
  excluded: [{ icon: '❌', label: 'Mon élément exclu' }],
  why: 'Explication du périmètre.',
});
```

### DeliverablesTable

Renders a deliverables comparison table across all 4 tiers.

```js
import { renderDeliverablesTable, DEFAULT_DELIVERABLES } from './src/components/audit-scope/index.js';

// Default table (20 deliverables)
const table = renderDeliverablesTable();

// Custom
const table2 = renderDeliverablesTable(DEFAULT_DELIVERABLES, {
  title: 'Mes livrables',
  subtitle: 'Ce que vous recevez',
});
```

### RiskHeader

Renders a risk counter bar (critical / high / medium / low anomaly counts).

```js
import { renderRiskHeader, buildRiskCountsFromModel } from './src/components/audit-scope/index.js';

// Static counts
const header = renderRiskHeader({ critical: 2, high: 7, medium: 11, low: 5 });

// Derive from a report model
const counts = buildRiskCountsFromModel(reportModel);
const header2 = renderRiskHeader(counts);
```

### ScopePremiumPage

Assembles all components into a complete showcase page.

```js
import { renderScopePremiumPage } from './src/components/audit-scope/index.js';

// Standalone HTML page
const html = renderScopePremiumPage({
  standalone: true,
  activeTierId: 'growth',   // which tier to show in "Détail" panel
  reportModel: myModel,     // optional: derive real risk counts
});

// Embeddable fragment (no <html>/<head>)
const fragment = renderScopePremiumPage({ standalone: false });
```

---

## CSS Design System

The `audit-scope-premium.css` file provides a complete design system that reuses the same CSS variable tokens as `premium.css`:

| Variable group       | Description                            |
|----------------------|----------------------------------------|
| `--tier-fast-*`      | Blue palette for FAST tier             |
| `--tier-public-*`    | Purple palette for PUBLIC 360 tier     |
| `--tier-growth-*`    | Green palette for GROWTH tier          |
| `--tier-360-*`       | Gold palette for 360° tier             |
| `--scope-included-*` | Green for included scope items         |
| `--scope-excluded-*` | Grey for excluded scope items          |
| `--scope-advanced-*` | Purple for advanced-level coverage     |
| `--scope-private-*`  | Red for private data items             |
| `--risk-critical-*`  | Critical risk counter colours          |
| `--risk-high-*`      | High risk counter colours              |
| `--risk-medium-*`    | Medium risk counter colours            |
| `--risk-low-*`       | Low risk counter colours               |

Key CSS classes:

| Class                         | Component            |
|-------------------------------|----------------------|
| `.scope-kpi-row`              | KPI card grid row    |
| `.scope-kpi-card`             | Single KPI card      |
| `.scope-tiers-row`            | Tier cards grid row  |
| `.scope-tier-card`            | Single tier card     |
| `.scope-grid-wrapper`         | Scope grid wrapper   |
| `.scope-grid-table`           | Grid table           |
| `.scope-status-icon`          | Grid cell status icon|
| `.scope-sections-grid`        | Sections panel grid  |
| `.scope-panel`                | Single panel card    |
| `.scope-deliverables-wrapper` | Deliverables table   |
| `.scope-risk-header`          | Risk counter bar     |
| `.scope-risk-counter`         | Single risk counter  |
| `.scope-cta-panel`            | CTA decision panel   |
| `.scope-premium-page`         | Full page wrapper    |

---

## Integration in existing reports

To embed the scope page inside an existing HTML report, call `renderScopePremiumPage` with `standalone: false` and inject the CSS manually:

```js
import fs from 'fs-extra';
import { renderScopePremiumPage } from './src/components/audit-scope/index.js';

const scopeFragment = renderScopePremiumPage({ standalone: false });
// Inject <style> for audit-scope-premium.css in <head>
// Inject scopeFragment wherever needed in the report body
```

---

## Accessibility

- Semantic HTML (`<table>`, `<ul>`, `<nav>`)
- WCAG-compliant colour contrast ratios
- `title` attributes on status icons for screen readers
- Responsive layout (desktop → tablet → mobile)
- Dark mode support via `@media (prefers-color-scheme: dark)`
