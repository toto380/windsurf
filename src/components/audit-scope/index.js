/**
 * audit-scope — Barrel exports
 *
 * Re-exports all public API from the audit-scope UI components.
 *
 * Usage:
 *   import { renderScopePremiumPage, renderKpiCard, ... } from './src/components/audit-scope/index.js';
 *
 * @module audit-scope
 */

// KPI Cards
export { renderKpiCard, renderKpiRow } from "./KpiCard.js";

// Tier Cards
export { renderAuditTierCard, renderTierCardsRow, AUDIT_TIERS } from "./AuditTierCardPremium.js";

// Scope Grid
export { renderScopeGrid, SCOPE_DOMAINS } from "./ScopeGrid.js";

// Scope Sections (included / excluded panels)
export { renderScopeSections, TIER_SCOPE_CONTENT } from "./ScopeSections.js";

// Deliverables Table
export { renderDeliverablesTable, DEFAULT_DELIVERABLES } from "./DeliverablesTable.js";

// Risk Header
export { renderRiskHeader, buildRiskCountsFromModel } from "./RiskHeader.js";

// Full showcase page
export { renderScopePremiumPage } from "./ScopePremiumPage.js";
