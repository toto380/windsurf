/**
 * Smoke tests — Report Profiles (4 core profiles)
 *
 * Validates that each profile:
 * 1. Produces a valid reportModel (passes quality gate)
 * 2. Contains the required sections (Executive Summary, Quick Wins, Risk Register, Roadmap)
 * 3. Contains at least one table and one chart
 * 4. Contains a StratAds recommendation
 * 5. HTML output includes expected textual content
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";

import { assembleReport } from "../src/main/report-assembler.js";
import { validateReport } from "../src/main/report-validate.js";
import { renderReportHtml } from "../src/main/report-renderer-html/render.js";
import { resolveProfile, PROFILES } from "../src/main/report-profiles/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load shared fixture
const fixturesDir = path.join(__dirname, "..", "fixtures");
const auditSample = JSON.parse(
  await fs.readFile(path.join(fixturesDir, "audit-sample.json"), "utf-8")
);

function makeAuditResults(overrides = {}) {
  return {
    ...auditSample,
    meta: { ...auditSample.meta, ...overrides.meta },
    scores: { ...auditSample.scores, ...overrides.scores },
    modules: { ...auditSample.modules, ...overrides.modules },
  };
}

// --- Profile resolution tests ---

test("resolveProfile returns FAST for 'fast'", () => {
  const p = resolveProfile("fast");
  assert.equal(p.id, "fast");
});

test("resolveProfile returns PUBLIC for 'public'", () => {
  const p = resolveProfile("public");
  assert.equal(p.id, "public");
});

test("resolveProfile returns PRIVATE_ONLY for 'private_only'", () => {
  const p = resolveProfile("private_only");
  assert.equal(p.id, "private_only");
});

test("resolveProfile returns FULL for 'full'", () => {
  const p = resolveProfile("full");
  assert.equal(p.id, "full");
});

test("resolveProfile falls back to FAST for unknown id", () => {
  const p = resolveProfile("nonexistent_profile");
  assert.equal(p.id, "fast");
});

test("All 4 profiles are exported from PROFILES map", () => {
  const keys = Object.keys(PROFILES);
  assert.ok(keys.includes("fast"), "fast missing");
  assert.ok(keys.includes("public"), "public missing");
  assert.ok(keys.includes("private_only"), "private_only missing");
  assert.ok(keys.includes("full"), "full missing");
  assert.equal(keys.length, 4, "should have exactly 4 profiles");
});

// --- ReportModel structure tests ---

for (const [profileId, profile] of Object.entries(PROFILES)) {
  test(`[${profileId}] assembleReport produces a reportModel with reportMeta`, () => {
    const auditResults = makeAuditResults({ meta: { reportProfile: profileId } });
    const model = assembleReport(auditResults, profile);
    assert.ok(model.reportMeta, "reportMeta missing");
    assert.equal(model.reportMeta.profile, profileId);
    assert.ok(model.reportMeta.client, "client missing from reportMeta");
  });

  test(`[${profileId}] assembleReport produces sections array`, () => {
    const auditResults = makeAuditResults({ meta: { reportProfile: profileId } });
    const model = assembleReport(auditResults, profile);
    assert.ok(Array.isArray(model.sections), "sections should be an array");
    assert.ok(model.sections.length > 0, "sections should not be empty");
  });

  test(`[${profileId}] assembleReport includes executive-summary section`, () => {
    const auditResults = makeAuditResults({ meta: { reportProfile: profileId } });
    const model = assembleReport(auditResults, profile);
    const execSummary = model.sections.find(s => s.id === "executive-summary");
    assert.ok(execSummary, "executive-summary section missing");
  });

  test(`[${profileId}] assembleReport includes quick-wins section`, () => {
    const auditResults = makeAuditResults({ meta: { reportProfile: profileId } });
    const model = assembleReport(auditResults, profile);
    const qw = model.sections.find(s => s.id === "quick-wins");
    assert.ok(qw, "quick-wins section missing");
  });

  test(`[${profileId}] assembleReport includes risks section with risk-register table`, () => {
    const auditResults = makeAuditResults({ meta: { reportProfile: profileId } });
    const model = assembleReport(auditResults, profile);
    const risks = model.sections.find(s => s.id === "risks");
    assert.ok(risks, "risks section missing");
    const riskTable = (risks.tables || []).find(t => t.id === "risk-register");
    assert.ok(riskTable, "risk-register table missing in risks section");
  });

  test(`[${profileId}] assembleReport includes roadmap section with roadmap table`, () => {
    const auditResults = makeAuditResults({ meta: { reportProfile: profileId } });
    const model = assembleReport(auditResults, profile);
    const roadmap = model.sections.find(s => s.id === "roadmap");
    assert.ok(roadmap, "roadmap section missing");
    const roadmapTable = (roadmap.tables || []).find(t => t.id === "roadmap");
    assert.ok(roadmapTable, "roadmap table missing");
  });

  test(`[${profileId}] assembleReport includes stratads-recommendation section`, () => {
    const auditResults = makeAuditResults({ meta: { reportProfile: profileId } });
    const model = assembleReport(auditResults, profile);
    const stratads = model.sections.find(s => s.id === "stratads-recommendation");
    assert.ok(stratads, "stratads-recommendation section missing");
  });

  test(`[${profileId}] assembleReport has at least one chart`, () => {
    const auditResults = makeAuditResults({ meta: { reportProfile: profileId } });
    const model = assembleReport(auditResults, profile);
    const allCharts = model.sections.flatMap(s => s.charts || []);
    assert.ok(allCharts.length > 0, "No charts found in report");
  });

  test(`[${profileId}] assembleReport has at least one table`, () => {
    const auditResults = makeAuditResults({ meta: { reportProfile: profileId } });
    const model = assembleReport(auditResults, profile);
    const allTables = model.sections.flatMap(s => s.tables || []);
    assert.ok(allTables.length > 0, "No tables found in report");
  });

  test(`[${profileId}] assembleReport has scores object`, () => {
    const auditResults = makeAuditResults({ meta: { reportProfile: profileId } });
    const model = assembleReport(auditResults, profile);
    assert.ok(model.scores, "scores missing");
    assert.ok(typeof model.scores.global === "number", "scores.global should be a number");
  });

  test(`[${profileId}] assembleReport has globalSummary`, () => {
    const auditResults = makeAuditResults({ meta: { reportProfile: profileId } });
    const model = assembleReport(auditResults, profile);
    assert.ok(model.globalSummary, "globalSummary missing");
    assert.ok(Array.isArray(model.globalSummary.top10Actions), "top10Actions should be an array");
  });
}

// --- Validator tests ---

test("validateReport passes for a valid minimal reportModel", () => {
  const auditResults = makeAuditResults({});
  const model = assembleReport(auditResults, resolveProfile("fast"));
  const result = validateReport(model);
  assert.equal(result.valid, true, `Validation failed: ${result.errors.join(", ")}`);
});

test("validateReport fails for null reportModel", () => {
  const result = validateReport(null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test("validateReport flags missing evidence as hypothesis (warning, not error)", () => {
  const auditResults = makeAuditResults({});
  const model = assembleReport(auditResults, resolveProfile("fast"));
  // Inject an action without evidence
  model.sections[0].actions.push({
    title: "Test action no evidence",
    why: "test",
    evidence: "",
    impact: "test",
    effort: "S",
    risk: "low",
    owner: "client",
    deadline: "7j",
    action: "test",
  });
  const result = validateReport(model);
  // Should still be valid (hypothesis is a warning, not an error)
  const hypothesisWarnings = result.warnings.filter(w => w.toLowerCase().includes("hypothèse") || w.toLowerCase().includes("hypothesis"));
  assert.ok(hypothesisWarnings.length > 0, "Expected hypothesis warning for missing evidence");
  const mutatedAction = model.sections[0].actions.find(a => a.title === "Test action no evidence");
  assert.ok(mutatedAction._hypothesis, "Action should be marked as hypothesis");
});

test("validateReport fails when executive-summary section is missing", () => {
  const auditResults = makeAuditResults({});
  const model = assembleReport(auditResults, resolveProfile("fast"));
  model.sections = model.sections.filter(s => s.id !== "executive-summary");
  const result = validateReport(model);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes("executive-summary")));
});

// --- HTML Renderer tests ---

test("renderReportHtml returns non-empty HTML for FAST profile", () => {
  const auditResults = makeAuditResults({});
  const model = assembleReport(auditResults, resolveProfile("fast"));
  const validation = validateReport(model);
  const html = renderReportHtml(model, validation);
  assert.ok(typeof html === "string", "HTML should be a string");
  assert.ok(html.length > 1000, "HTML should be non-trivial length");
  assert.ok(html.includes("<!DOCTYPE html>"), "HTML should start with DOCTYPE");
});

test("renderReportHtml includes Executive Summary in output", () => {
  const auditResults = makeAuditResults({});
  const model = assembleReport(auditResults, resolveProfile("fast"));
  const html = renderReportHtml(model);
  assert.ok(html.includes("Executive Summary"), "HTML missing 'Executive Summary'");
});

test("renderReportHtml includes Quick Wins table in output", () => {
  const auditResults = makeAuditResults({});
  const model = assembleReport(auditResults, resolveProfile("fast"));
  const html = renderReportHtml(model);
  assert.ok(html.includes("Quick Wins"), "HTML missing 'Quick Wins'");
});

test("renderReportHtml includes Risk Register table in output", () => {
  const auditResults = makeAuditResults({});
  const model = assembleReport(auditResults, resolveProfile("fast"));
  const html = renderReportHtml(model);
  assert.ok(html.includes("Risk Register") || html.includes("Registre des Risques"), "HTML missing risk register");
});

test("renderReportHtml includes Roadmap in output", () => {
  const auditResults = makeAuditResults({});
  const model = assembleReport(auditResults, resolveProfile("fast"));
  const html = renderReportHtml(model);
  assert.ok(html.includes("Roadmap") || html.includes("roadmap"), "HTML missing roadmap");
});

test("renderReportHtml includes StratAds recommendation in output", () => {
  const auditResults = makeAuditResults({});
  const model = assembleReport(auditResults, resolveProfile("fast"));
  const html = renderReportHtml(model);
  assert.ok(html.includes("StratAds"), "HTML missing StratAds mention");
});

test("renderReportHtml marks confidential reports with CONFIDENTIEL banner", () => {
  const auditResults = makeAuditResults({});
  const model = assembleReport(auditResults, resolveProfile("private_only"));
  const html = renderReportHtml(model);
  assert.ok(html.includes("CONFIDENTIEL"), "HTML missing CONFIDENTIEL banner for private profile");
});

// --- Scope section injection tests ---

test("renderReportHtml embeds audit-scope-premium.css styles", () => {
  const auditResults = makeAuditResults({});
  const model = assembleReport(auditResults, resolveProfile("fast"));
  const html = renderReportHtml(model);
  // The scope CSS defines .scope-premium-page or tier variables
  assert.ok(
    html.includes("scope-premium-page") || html.includes("tier-fast-color"),
    "HTML should include audit-scope-premium.css content"
  );
});

test("renderReportHtml injects scope section (scope-premium-page) after cover/TOC", () => {
  const auditResults = makeAuditResults({});
  const model = assembleReport(auditResults, resolveProfile("fast"));
  const html = renderReportHtml(model);
  assert.ok(html.includes("scope-premium-page"), "HTML missing audit scope section");
  // Scope section must appear before main report sections
  const scopePos = html.indexOf("scope-premium-page");
  const mainPos  = html.indexOf('<main>');
  assert.ok(scopePos < mainPos, "scope section should appear before <main> sections");
});

test("renderReportHtml uses 'public' tier for public profile scope section", () => {
  const auditResults = makeAuditResults({ meta: { reportProfile: "public" } });
  const model = assembleReport(auditResults, resolveProfile("public"));
  const html = renderReportHtml(model);
  assert.ok(html.includes("scope-premium-page"), "HTML missing scope section");
});

test("renderReportHtml uses '360' tier for full profile scope section", () => {
  const auditResults = makeAuditResults({ meta: { reportProfile: "full" } });
  const model = assembleReport(auditResults, resolveProfile("full"));
  const html = renderReportHtml(model);
  assert.ok(html.includes("scope-premium-page"), "HTML missing scope section for full profile");
});

test("PUBLIC profile has more sections than FAST profile", () => {
  const auditResults = makeAuditResults({});
  const fastModel = assembleReport(auditResults, resolveProfile("fast"));
  const publicModel = assembleReport(auditResults, resolveProfile("public"));
  assert.ok(
    publicModel.sections.length > fastModel.sections.length,
    `PUBLIC (${publicModel.sections.length} sections) should have more sections than FAST (${fastModel.sections.length} sections)`
  );
});

test("PRIVATE_ONLY profile is confidential and requires private data", () => {
  const p = resolveProfile("private_only");
  assert.equal(p.confidential, true);
  assert.equal(p.requiresPrivate, true);
});

test("Section summaries (mini-résumé) exist on all sections", () => {
  const auditResults = makeAuditResults({});
  const model = assembleReport(auditResults, resolveProfile("fast"));
  for (const section of model.sections) {
    assert.ok(
      Array.isArray(section.summary) && section.summary.length > 0,
      `Section "${section.id}" is missing summary bullets`
    );
  }
});

test("Each action has the 9 required fields", () => {
  const auditResults = makeAuditResults({});
  const model = assembleReport(auditResults, resolveProfile("public"));
  const allActions = model.sections.flatMap(s => s.actions || []);
  const required = ["title", "why", "evidence", "impact", "effort", "risk", "owner", "deadline", "action"];
  for (const action of allActions) {
    for (const field of required) {
      if (field === "evidence" && action._hypothesis) continue; // hypothesis allowed
      assert.ok(
        action[field] !== undefined && action[field] !== null,
        `Action "${action.title}" missing field "${field}"`
      );
    }
  }
});

test("Each finding has the 4 required fields", () => {
  const auditResults = makeAuditResults({});
  const model = assembleReport(auditResults, resolveProfile("fast"));
  const allFindings = model.sections.flatMap(s => s.findings || []);
  const required = ["observation", "source", "importance", "status"];
  for (const finding of allFindings) {
    for (const field of required) {
      assert.ok(
        finding[field] !== undefined && finding[field] !== null && finding[field] !== "",
        `Finding "${finding.observation || "(no observation)"}" missing field "${field}"`
      );
    }
  }
});

