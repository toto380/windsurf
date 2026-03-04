/**
 * Report Assembler
 * Transforms raw auditResults (from orchestrator) + a ReportProfile
 * into a normalized reportModel (the "data contract").
 *
 * reportModel shape:
 * {
 *   reportMeta: { client, url, date, profile, version },
 *   scores: { global, tracking, seo, performance, security, headers, robots, schema },
 *   sections: Section[],
 *   annexes: Annex[],
 *   globalSummary: { strengths[], weaknesses[], topRisks[], top10Actions[] },
 *   stratasdRecommendation: { offer, title, why, points[], cta, nextSteps[] },
 * }
 *
 * Section shape:
 * {
 *   id, title, intro, summary: string[],
 *   findings: Finding[],
 *   actions: Action[],
 *   charts: Chart[],
 *   tables: Table[],
 *   evidence: Evidence[],
 * }
 *
 * Finding: { observation, source, importance, status: "ok"|"warn"|"bad"|"info" }
 * Action:  { title, why, evidence, impact, effort: "S"|"M"|"L", risk: "low"|"medium"|"high",
 *            owner: "client"|"StratAds", deadline: "7j"|"30j"|"90j", action }
 */

import { resolveProfile } from "./report-profiles/index.js";
import { buildGa4PerformanceDashboard } from "./report-sections/dashboard-ga4-complete.js";
import { buildAdsPerformanceComplete } from "./report-sections/dashboard-ads-complete.js";
import { buildAttributionAnalysis } from "./report-sections/section-attribution.js";
import { buildStrengthsSection } from "./report-sections/section-strengths.js";
import { buildSmartRecommendations } from "./smart-recommendations.js";
import {
  calcCPA, calcROAS, calcConvRate, calcLTV, calcCAC, calcLTVCACRatio, calcROI,
} from "./metrics-calculator.js";

const VERSION = "2.0.0";

function esc(s) {
  return String(s ?? "");
}
function num(n, def = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : def;
}
function fmt(n, d = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(d) : "—";
}
function pct(n) {
  return Math.round(num(n) * 100);
}

// ---------------------------------------------------------------------------
// Section risk level helper
// ---------------------------------------------------------------------------

/**
 * Derive section-level risk from its findings.
 * @param {object[]} findings
 * @returns {"Élevé"|"Moyen"|"Faible"}
 */
function deriveSectionRiskLevel(findings) {
  if (!Array.isArray(findings) || findings.length === 0) return "Faible";
  if (findings.some(f => f.status === "bad")) return "Élevé";
  if (findings.some(f => f.status === "warn")) return "Moyen";
  return "Faible";
}

/**
 * Remove rows from a table where all cells are blank or "—".
 */
function filterTableRows(table) {
  if (!table) return table;
  const rows = (table.rows || []).filter(row => {
    const cells = Array.isArray(row) ? row : [row];
    return cells.some(c => c !== null && c !== undefined && String(c).trim() !== "" && String(c).trim() !== "—");
  });
  return { ...table, rows };
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

/**
 * Strict module data validation.
 * Used by PRIVATE / 360 sections to ensure zero mockdata is rendered.
 *
 * @param {object|null|undefined} module — raw module from auditResults.modules
 * @param {string[]} requiredFields — array fields that must be non-empty arrays
 * @returns {{ isValid: boolean, data: object|null, reason: string|null }}
 */
export function validateModuleData(module, requiredFields = []) {
  if (!module?.ok) {
    return {
      isValid: false,
      data: null,
      reason: module?.error || module?.reason || "API non configurée ou accès refusé",
    };
  }
  for (const field of requiredFields) {
    if (!Array.isArray(module[field]) || module[field].length === 0) {
      return {
        isValid: false,
        data: null,
        reason: `Aucune donnée réelle dans '${field}' — vérifiez les exports ou l'accès API`,
      };
    }
  }
  return { isValid: true, data: module, reason: null };
}

function buildExecutiveSummary(auditResults, profile, scores) {
  const meta = auditResults.meta || {};
  const lh = auditResults.modules?.lighthouse || {};
  const trk = auditResults.modules?.tracking || {};
  const seo = auditResults.modules?.seo || {};
  const sec = auditResults.modules?.security || {};
  const globalScore = num(scores.global);

  const findings = [];
  const actions = [];

  // Global score finding
  findings.push({
    observation: `Score global d'acquisition : ${globalScore}/100`,
    source: "Calcul pondéré multi-modules (tracking 34%, SEO 22%, perf 18%, séc. 20%, robots/schema 6%)",
    importance: "Baromètre synthétique de la santé acquisition. En dessous de 60, le ROI media est structurellement dégradé.",
    status: globalScore >= 80 ? "ok" : globalScore >= 60 ? "warn" : "bad",
  });

  // Tracking
  const trkScore = num(scores.tracking);
  if (!trk.skipped) {
    findings.push({
      observation: `Score tracking : ${trkScore}/100`,
      source: "Module tracking-lite / playwright (détection tags, events, consent)",
      importance: "Un tracking défaillant biaise toutes les décisions d'allocation budget.",
      status: trkScore >= 70 ? "ok" : trkScore >= 50 ? "warn" : "bad",
    });
    if (trkScore < 70) {
      actions.push({
        title: "Corriger les lacunes de tracking",
        why: `Score tracking ${trkScore}/100 — mesure partielle ou absente.`,
        evidence: "Module tracking-lite : tags manquants, events non résolus, consent non conforme.",
        impact: "Rétablir une mesure fiable améliore l'efficacité des campagnes de 15–30% (meilleur ROAS, moins de budget gaspillé).",
        effort: "M",
        risk: "high",
        owner: "StratAds",
        deadline: "30j",
        action: "Auditer le plan de taggage, corriger les events clés (purchase, lead), valider consent.",
      });
    }
  }

  // Performance
  const perfScore = num(scores.performance);
  if (!lh.skipped) {
    findings.push({
      observation: `Score performance web : ${perfScore}/100 (Lighthouse)`,
      source: `Lighthouse audit — Performance ${pct(lh.performance)}, FCP ${fmt(lh.firstContentfulPaint, 1)}s, LCP ${fmt(lh.largestContentfulPaint, 1)}s`,
      importance: "La performance impacte directement la conversion, le Quality Score Google Ads et le classement SEO.",
      status: perfScore >= 70 ? "ok" : perfScore >= 50 ? "warn" : "bad",
    });
    if (perfScore < 60) {
      actions.push({
        title: "Optimiser les Core Web Vitals",
        why: `Performance ${perfScore}/100 — impacte conversion et coût publicitaire.`,
        evidence: `LCP : ${fmt(lh.largestContentfulPaint, 1)}s (cible < 2.5s), CLS : ${fmt(lh.cumulativeLayoutShift, 3)} (cible < 0.1)`,
        impact: "Améliorer LCP de 0.5s peut augmenter les conversions de 5–8% (études Chrome/Google).",
        effort: "M",
        risk: "medium",
        owner: "client",
        deadline: "30j",
        action: "Compresser images, différer JS non critique, configurer cache CDN.",
      });
    }
  }

  // SEO
  const seoScore = num(scores.seo);
  findings.push({
    observation: `Score SEO : ${seoScore}/100`,
    source: "Module crawler SEO — titres, meta descriptions, liens, indexabilité",
    importance: "Le SEO génère du trafic qualifié sans coût direct. Des erreurs d'indexation éliminent des pages.",
    status: seoScore >= 70 ? "ok" : seoScore >= 50 ? "warn" : "bad",
  });

  // Security
  const secScore = num(scores.security);
  const hdrsScore = num(scores.headers);
  if (!sec.skipped) {
    findings.push({
      observation: `Score sécurité : ${secScore}/100 (DNS/DMARC/SPF) — En-têtes HTTP : ${hdrsScore}/100`,
      source: "Modules dns-infra et security-headers",
      importance: "SPF/DMARC manquants exposent au spoofing email. CSP absent augmente le risque de fuite de données.",
      status: secScore >= 70 && hdrsScore >= 70 ? "ok" : "warn",
    });
  }

  // Top 5 ROI actions (subset of all actions)
  const top5 = actions.slice(0, 5);

  const strengths = findings.filter(f => f.status === "ok").map(f => f.observation);
  const weaknesses = findings.filter(f => f.status === "bad" || f.status === "warn").map(f => f.observation);

  const summary = [
    `Score global ${globalScore}/100 — ${globalScore >= 80 ? "Fiable" : globalScore >= 60 ? "À optimiser" : "Risque élevé"}.`,
    strengths.length ? `Points forts : ${strengths.slice(0, 3).join(" | ")}` : "Aucun point fort majeur identifié.",
    weaknesses.length ? `Points faibles : ${weaknesses.slice(0, 3).join(" | ")}` : "Aucun point faible critique identifié.",
    `${actions.length} action(s) prioritaire(s) identifiée(s).`,
  ];

  const charts = [
    { type: "score-donut", title: "Score global", data: { value: globalScore, max: 100 } },
    {
      type: "pillar-radar",
      title: "Radar — 5 piliers acquisition",
      data: {
        items: [
          { label: "Tracking", value: trkScore },
          { label: "SEO", value: seoScore },
          { label: "Perf", value: perfScore },
          { label: "Sécurité", value: secScore },
          { label: "Infra", value: num(scores.robots) },
        ],
      },
    },
    {
      type: "pillar-bars",
      title: "Scores par pilier",
      data: {
        items: [
          { label: "Tracking", value: trkScore },
          { label: "SEO", value: seoScore },
          { label: "Perf", value: perfScore },
          { label: "Sécurité", value: secScore },
        ],
      },
    },
  ];

  const tables = [
    {
      id: "exec-findings",
      title: "Synthèse des constats",
      headers: ["Domaine", "Observation", "Statut", "Source"],
      rows: findings.map(f => [f.observation.split(":")[0], f.observation, f.status, f.source]),
    },
  ];

  return {
    id: "executive-summary",
    title: "Executive Summary",
    intro:
      "Ce rapport synthétise l'état de santé de l'acquisition digitale du site audité. " +
      "Chaque constat est documenté par une preuve mesurable et chaque recommandation est accompagnée d'un impact business estimé.",
    summary,
    findings,
    actions: top5,
    charts,
    tables,
    evidence: [],
    riskLevel: deriveSectionRiskLevel(findings),
  };
}

function buildScorecards(auditResults, scores) {
  const lh = auditResults.modules?.lighthouse || {};
  const trk = auditResults.modules?.tracking || {};
  const rob = auditResults.modules?.robots || {};
  const sec = auditResults.modules?.security || {};

  const cards = [
    {
      domain: "Performance Web",
      score: num(scores.performance),
      status: scores.performance >= 70 ? "ok" : scores.performance >= 50 ? "warn" : "bad",
      proof: `Lighthouse — FCP ${fmt(lh.firstContentfulPaint, 1)}s, LCP ${fmt(lh.largestContentfulPaint, 1)}s`,
    },
    {
      domain: "SEO",
      score: num(scores.seo),
      status: scores.seo >= 70 ? "ok" : scores.seo >= 50 ? "warn" : "bad",
      proof: "Module crawler SEO",
    },
    {
      domain: "Tracking",
      score: num(scores.tracking),
      status: !trk.skipped ? (scores.tracking >= 70 ? "ok" : scores.tracking >= 50 ? "warn" : "bad") : "info",
      proof: trk.skipped ? "Non évalué (preset fast)" : "Module tracking-lite",
    },
    {
      domain: "Sécurité",
      score: num(scores.security),
      status: scores.security >= 70 ? "ok" : scores.security >= 50 ? "warn" : "bad",
      proof: "Modules dns-infra + security-headers",
    },
    {
      domain: "Infra / DNS",
      score: num(scores.robots),
      status: scores.robots >= 70 ? "ok" : scores.robots >= 50 ? "warn" : "bad",
      proof: "Module robots-sitemap + dns-infra",
    },
  ];

  const findings = cards.map(c => ({
    observation: `${c.domain} : ${c.score}/100`,
    source: c.proof,
    importance: "Pilier fondamental de la performance acquisition.",
    status: c.status,
  }));

  const tables = [
    {
      id: "scorecards",
      title: "Tableau de bord des scores",
      headers: ["Domaine", "Score", "Statut", "Preuve"],
      rows: cards.map(c => [c.domain, `${c.score}/100`, c.status.toUpperCase(), c.proof]),
    },
  ];

  return {
    id: "scorecards",
    title: "Tableau de bord (Scorecards)",
    intro: "Vue synthétique des 5 piliers de l'acquisition. Chaque score est calculé automatiquement à partir des modules d'audit.",
    summary: cards.map(c => `${c.domain} : ${c.score}/100 — ${c.status === "ok" ? "✅" : c.status === "warn" ? "⚠️" : "❌"}`),
    findings,
    actions: [],
    charts: [
      {
        type: "pillar-bars",
        title: "Vue consolidée des piliers",
        data: { items: cards.map(c => ({ label: c.domain, value: c.score })) },
      },
    ],
    tables,
    evidence: [],
    riskLevel: deriveSectionRiskLevel(findings),
  };
}

function buildQuickWins(auditResults, profile, scores) {
  const lh = auditResults.modules?.lighthouse || {};
  const trk = auditResults.modules?.tracking || {};
  const seo = auditResults.modules?.seo || {};
  const sec = auditResults.modules?.security || {};
  const rob = auditResults.modules?.robots || {};

  const wins = [];

  // Performance quick wins
  const perf = pct(lh.performance);
  if (!lh.skipped && perf < 70) {
    wins.push({
      action: "Optimiser les images (WebP + lazy loading)",
      why: "Images non compressées = LCP élevé = pénalité SEO + coût pub",
      evidence: `LCP ${fmt(lh.largestContentfulPaint, 1)}s — Lighthouse audit`,
      effort: "S",
      impact: "Élevé",
    });
    wins.push({
      action: "Différer le JavaScript non critique",
      why: "JS bloquant retarde le rendu et dégrade l'expérience utilisateur",
      evidence: `TBT ${fmt(lh.totalBlockingTime, 0)}ms — Lighthouse audit`,
      effort: "S",
      impact: "Moyen",
    });
  }

  // SEO quick wins
  if (!seo.skipped) {
    const seoScore = num(scores.seo);
    if (seoScore < 70) {
      wins.push({
        action: "Corriger les titres et méta descriptions manquants",
        why: "Pages sans titre/meta sont sous-classées dans les SERP",
        evidence: "Module crawler — pages sans balises optimales",
        effort: "S",
        impact: "Moyen",
      });
    }
  }

  // Tracking quick wins
  if (!trk.skipped && num(scores.tracking) < 70) {
    wins.push({
      action: "Configurer les conversions GA4 (purchase / lead)",
      why: "Sans conversions trackées, l'optimisation automatique des campagnes est aveugle",
      evidence: "Module tracking-lite — events de conversion absents ou non validés",
      effort: "M",
      impact: "Très élevé",
    });
  }

  // Security quick wins
  if (!sec.skipped && num(scores.security) < 70) {
    wins.push({
      action: "Configurer SPF, DKIM et DMARC",
      why: "Sans ces enregistrements DNS, les emails sont vulnérables au spoofing",
      evidence: "Module dns-infra — enregistrements SPF/DMARC manquants",
      effort: "S",
      impact: "Moyen",
    });
  }

  // Robots / sitemap
  if (!rob.skipped && num(scores.robots) < 60) {
    wins.push({
      action: "Soumettre le sitemap XML dans Google Search Console",
      why: "Un sitemap non soumis ralentit l'indexation des nouvelles pages",
      evidence: "Module robots-sitemap",
      effort: "S",
      impact: "Moyen",
    });
  }

  // Ensure at least 3 items
  if (wins.length === 0) {
    wins.push({
      action: "Mettre en place un monitoring de performance hebdomadaire",
      why: "Prévenir la dégradation silencieuse des Core Web Vitals",
      evidence: "Bonne pratique cabinet",
      effort: "S",
      impact: "Moyen",
    });
  }

  const tables = [
    {
      id: "quick-wins",
      title: "Quick Wins (actions à fort ROI)",
      headers: ["Action", "Pourquoi", "Preuve", "Effort", "Impact"],
      rows: wins.map(w => [w.action, w.why, w.evidence, w.effort, w.impact]),
    },
  ];

  return {
    id: "quick-wins",
    title: "Quick Wins",
    intro: "Actions à fort retour sur investissement identifiées lors de l'audit. Classées par effort croissant.",
    summary: wins.slice(0, 5).map(w => `${w.action} — Effort ${w.effort} / Impact ${w.impact}`),
    findings: wins.map(w => ({
      observation: w.action,
      source: w.evidence,
      importance: w.why,
      status: "warn",
    })),
    actions: wins.map(w => ({
      title: w.action,
      why: w.why,
      evidence: w.evidence,
      impact: w.impact,
      effort: w.effort,
      risk: w.effort === "S" ? "low" : "medium",
      owner: "client",
      deadline: w.effort === "S" ? "7j" : "30j",
      action: w.action,
    })),
    charts: [],
    tables,
    evidence: [],
    riskLevel: deriveSectionRiskLevel(wins.map(w => ({ status: "warn" }))),
  };
}

function buildRisks(auditResults, scores) {
  const lh = auditResults.modules?.lighthouse || {};
  const trk = auditResults.modules?.tracking || {};
  const sec = auditResults.modules?.security || {};
  const hdr = auditResults.modules?.securityHeaders || {};

  const risks = [];

  if (num(scores.tracking) < 50 && !trk.skipped) {
    risks.push({
      risk: "Tracking défaillant — données de conversion non fiables",
      probability: "Élevée",
      severity: "Critique",
      evidence: `Score tracking ${num(scores.tracking)}/100 — module tracking-lite`,
      mitigation: "Audit plan de taggage + QA events de conversion",
    });
  }

  const perf = pct(lh.performance);
  if (!lh.skipped && perf < 50) {
    risks.push({
      risk: "Performance dégradée — perte de conversions et Quality Score bas",
      probability: "Élevée",
      severity: "Élevée",
      evidence: `Lighthouse performance ${perf}/100`,
      mitigation: "Optimisation images, JS, cache CDN",
    });
  }

  if (num(scores.security) < 60) {
    risks.push({
      risk: "Vulnérabilité DNS — spoofing email possible (SPF/DMARC manquant)",
      probability: "Moyenne",
      severity: "Élevée",
      evidence: `Score sécurité ${num(scores.security)}/100 — module dns-infra`,
      mitigation: "Configurer SPF, DKIM, DMARC",
    });
  }

  if (num(scores.headers) < 50) {
    risks.push({
      risk: "En-têtes de sécurité HTTP manquants (CSP, HSTS, X-Frame-Options)",
      probability: "Moyenne",
      severity: "Moyenne",
      evidence: `Score headers ${num(scores.headers)}/100 — module security-headers`,
      mitigation: "Configurer les en-têtes via le serveur / CDN",
    });
  }

  if (num(scores.seo) < 50) {
    risks.push({
      risk: "SEO technique dégradé — pages mal indexées ou invisibles",
      probability: "Haute",
      severity: "Élevée",
      evidence: `Score SEO ${num(scores.seo)}/100 — module crawler`,
      mitigation: "Corriger titres, canonicals, redirections, sitemap",
    });
  }

  if (risks.length === 0) {
    risks.push({
      risk: "Aucun risque critique détecté — maintenir la surveillance",
      probability: "Faible",
      severity: "Faible",
      evidence: "Scores globalement au-dessus de 60/100",
      mitigation: "Audit trimestriel de maintenance",
    });
  }

  const tables = [
    {
      id: "risk-register",
      title: "Risk Register",
      headers: ["Risque", "Probabilité", "Sévérité", "Preuve", "Mitigation"],
      rows: risks.map(r => [r.risk, r.probability, r.severity, r.evidence, r.mitigation]),
    },
  ];

  return {
    id: "risks",
    title: "Registre des Risques",
    intro:
      "Identification des risques majeurs pour l'acquisition. Chaque risque est évalué en probabilité et sévérité, avec une preuve documentée.",
    summary: risks.map(r => `${r.risk} — Sévérité : ${r.severity}`),
    findings: risks.map(r => ({
      observation: r.risk,
      source: r.evidence,
      importance: r.mitigation,
      status: r.severity === "Critique" ? "bad" : r.severity === "Élevée" ? "warn" : "info",
    })),
    actions: risks
      .filter(r => r.severity === "Critique" || r.severity === "Élevée")
      .map(r => ({
        title: `Traiter : ${r.risk}`,
        why: r.risk,
        evidence: r.evidence,
        impact: "Réduction du risque d'acquisition",
        effort: "M",
        risk: r.severity === "Critique" ? "high" : "medium",
        owner: "client",
        deadline: "30j",
        action: r.mitigation,
      })),
    charts: [
      {
        type: "risk-heatmap",
        title: "Heatmap des risques (Probabilité × Sévérité)",
        data: {
          risks: risks.map(r => ({
            label: r.risk.slice(0, 30),
            probability: r.probability,
            severity: r.severity,
          })),
        },
      },
    ],
    tables,
    evidence: [],
    riskLevel: risks.some(r => r.severity === "Critique" || r.severity === "Élevée") ? "Élevé"
      : risks.some(r => r.severity === "Moyenne") ? "Moyen" : "Faible",
  };
}

function buildPerformance(auditResults, scores) {
  const lh = auditResults.modules?.lighthouse || {};

  if (lh.skipped) return null;

  const perf = pct(lh.performance);
  const a11y = pct(lh.accessibility);
  const bp = pct(lh.bestPractices);
  const lseo = pct(lh.seo);
  const fcp = num(lh.firstContentfulPaint);
  const lcp = num(lh.largestContentfulPaint);
  const cls = num(lh.cumulativeLayoutShift);
  const tbt = num(lh.totalBlockingTime);
  const ttfb = num(lh.timeToFirstByte);
  const si = num(lh.speedIndex);

  const findings = [];
  const actions = [];

  // LCP
  const lcpStatus = lcp <= 2.5 ? "ok" : lcp <= 4.0 ? "warn" : "bad";
  findings.push({
    observation: `LCP (Largest Contentful Paint) : ${fmt(lcp, 2)}s — ${lcpStatus === "ok" ? "Bon" : lcpStatus === "warn" ? "À améliorer" : "Mauvais"}`,
    source: `Lighthouse audit — URL ${auditResults.meta?.url || "—"}`,
    importance: "Le LCP mesure le temps d'affichage du plus grand élément visible. Google le pénalise au-delà de 2.5s.",
    status: lcpStatus,
  });

  // CLS
  const clsStatus = cls <= 0.1 ? "ok" : cls <= 0.25 ? "warn" : "bad";
  findings.push({
    observation: `CLS (Cumulative Layout Shift) : ${fmt(cls, 3)} — ${clsStatus === "ok" ? "Stable" : clsStatus === "warn" ? "À surveiller" : "Instable"}`,
    source: "Lighthouse audit",
    importance: "Un CLS élevé indique des sauts de mise en page visibles qui dégradent l'expérience utilisateur.",
    status: clsStatus,
  });

  // TBT (proxy for FID/INP)
  const tbtStatus = tbt <= 200 ? "ok" : tbt <= 600 ? "warn" : "bad";
  findings.push({
    observation: `TBT (Total Blocking Time) : ${fmt(tbt, 0)}ms — ${tbtStatus === "ok" ? "Réactif" : tbtStatus === "warn" ? "Lent" : "Très lent"}`,
    source: "Lighthouse audit",
    importance: "Le TBT est le proxy de l'interactivité. Un TBT élevé impacte les conversions et le Quality Score Ads.",
    status: tbtStatus,
  });

  if (lcpStatus !== "ok") {
    actions.push({
      title: "Réduire le LCP sous 2.5s",
      why: `LCP actuel : ${fmt(lcp, 2)}s — dépasse le seuil Google "Good" de 2.5s.`,
      evidence: `Lighthouse audit — LCP ${fmt(lcp, 2)}s`,
      impact: "Amélioration du classement SEO, réduction du taux de rebond, hausse du Quality Score Google Ads.",
      effort: "M",
      risk: "medium",
      owner: "client",
      deadline: "30j",
      action: "Optimiser l'image hero (WebP + preload), réduire le TTFB serveur, activer CDN.",
    });
  }

  const cwvItems = [
    { label: "LCP", value: lcp },
    { label: "CLS", value: cls * 100 },
    { label: "TBT", value: tbt / 100 },
    { label: "FCP", value: fcp },
  ];

  return {
    id: "performance",
    title: "Performance Web (Core Web Vitals)",
    intro:
      "Analyse Lighthouse des indicateurs de performance. Les Core Web Vitals (LCP, CLS, FID/INP) sont des facteurs de classement SEO et impactent directement les conversions.",
    summary: [
      `Lighthouse performance : ${perf}/100`,
      `LCP : ${fmt(lcp, 2)}s (cible < 2.5s) — ${lcpStatus === "ok" ? "✅" : "❌"}`,
      `CLS : ${fmt(cls, 3)} (cible < 0.1) — ${clsStatus === "ok" ? "✅" : "❌"}`,
      `TBT : ${fmt(tbt, 0)}ms (cible < 200ms) — ${tbtStatus === "ok" ? "✅" : "❌"}`,
      `Accessibilité : ${a11y}/100 — Best Practices : ${bp}/100`,
    ],
    findings,
    actions,
    charts: [
      { type: "cwv-bars", title: "Core Web Vitals (échelle relative)", data: { items: cwvItems } },
      {
        type: "score-donut",
        title: "Performance Lighthouse",
        data: { value: perf, max: 100 },
      },
    ],
    tables: [
      {
        id: "cwv-table",
        title: "Core Web Vitals — Détail",
        headers: ["Métrique", "Valeur", "Seuil", "Statut"],
        rows: [
          ["LCP", `${fmt(lcp, 2)}s`, "< 2.5s", lcpStatus.toUpperCase()],
          ["CLS", `${fmt(cls, 3)}`, "< 0.1", clsStatus.toUpperCase()],
          ["TBT", `${fmt(tbt, 0)}ms`, "< 200ms", tbtStatus.toUpperCase()],
          ["FCP", `${fmt(fcp, 2)}s`, "< 1.8s", fcp <= 1.8 ? "OK" : "WARN"],
          ["TTFB", `${fmt(ttfb, 2)}s`, "< 0.8s", ttfb <= 0.8 ? "OK" : "WARN"],
          ["Speed Index", `${fmt(si, 2)}s`, "< 3.4s", si <= 3.4 ? "OK" : "WARN"],
          ["Accessibilité", `${a11y}/100`, "> 90", a11y >= 90 ? "OK" : "WARN"],
          ["Best Practices", `${bp}/100`, "> 90", bp >= 90 ? "OK" : "WARN"],
          ["SEO Lighthouse", `${lseo}/100`, "> 90", lseo >= 90 ? "OK" : "WARN"],
        ],
      },
    ],
    evidence: [
      { label: "Outil d'audit", source: "Google Lighthouse v11", value: `Performance ${perf}/100` },
    ],
    riskLevel: deriveSectionRiskLevel(findings),
  };
}

function buildSeoBasics(auditResults, scores) {
  const seo = auditResults.modules?.seo || {};
  const rob = auditResults.modules?.robots || {};
  const schema = auditResults.modules?.schema || {};

  const findings = [];
  const actions = [];

  // Robots.txt
  if (!rob.skipped) {
    const robotsOk = !rob.error && (rob.allowed !== false);
    findings.push({
      observation: `robots.txt : ${robotsOk ? "Présent et valide" : "Absent ou bloquant"}`,
      source: `Module robots-sitemap — ${auditResults.meta?.url || ""}`,
      importance: "Un robots.txt mal configuré peut bloquer l'indexation de pages importantes.",
      status: robotsOk ? "ok" : "bad",
    });
    if (!robotsOk) {
      actions.push({
        title: "Corriger le robots.txt",
        why: "robots.txt absent ou bloquant l'indexation",
        evidence: "Module robots-sitemap",
        impact: "Restaurer l'indexation des pages clés",
        effort: "S",
        risk: "high",
        owner: "client",
        deadline: "7j",
        action: "Vérifier et corriger le fichier robots.txt. S'assurer que les pages clés ne sont pas bloquées.",
      });
    }
  }

  // Sitemap
  const sitemapOk = rob?.sitemap && rob.sitemap !== "absent";
  findings.push({
    observation: `Sitemap XML : ${sitemapOk ? "Détecté" : "Non détecté"}`,
    source: "Module robots-sitemap",
    importance: "Le sitemap facilite l'indexation complète du site par les moteurs de recherche.",
    status: sitemapOk ? "ok" : "warn",
  });

  // SEO scores
  const seoScore = num(scores.seo);
  findings.push({
    observation: `Score SEO on-page : ${seoScore}/100`,
    source: "Module crawler SEO",
    importance: "Les erreurs SEO on-page (titres manquants, H1 multiples, etc.) pénalisent le classement organique.",
    status: seoScore >= 70 ? "ok" : seoScore >= 50 ? "warn" : "bad",
  });

  // Schema
  if (!schema.skipped) {
    const hasSchema = schema.score > 0 || schema.types?.length > 0;
    findings.push({
      observation: `Schema.org / Rich Snippets : ${hasSchema ? "Détecté" : "Absent"}`,
      source: "Module schema — JSON-LD détection",
      importance: "Le balisage Schema améliore le CTR via les rich snippets Google (étoiles, FAQ, etc.).",
      status: hasSchema ? "ok" : "info",
    });
  }

  const seoChecks = [
    { check: "robots.txt valide", status: rob.skipped ? "N/A" : (!rob.error ? "OK" : "KO") },
    { check: "sitemap.xml détecté", status: sitemapOk ? "OK" : "KO" },
    { check: "score SEO > 70", status: seoScore >= 70 ? "OK" : "KO" },
    { check: "schema.org présent", status: !schema.skipped && schema.score > 0 ? "OK" : "INFO" },
  ];

  return {
    id: "seo-basics",
    title: "SEO Basics",
    intro:
      "Vérification des fondamentaux SEO : indexabilité, sitemap, robots, on-page et structured data.",
    summary: seoChecks.map(c => `${c.check} : ${c.status}`),
    findings,
    actions,
    charts: [],
    tables: [
      {
        id: "seo-checks",
        title: "Checklist SEO",
        headers: ["Vérification", "Statut"],
        rows: seoChecks.map(c => [c.check, c.status]),
      },
    ],
    evidence: [],
    riskLevel: deriveSectionRiskLevel(findings),
  };
}

function buildTrackingLite(auditResults, scores) {
  const trk = auditResults.modules?.tracking || {};

  if (trk.skipped) return null;

  const trkScore = num(scores.tracking);
  const arch = trk.stackArchitecture || {};
  const pixels = Array.isArray(trk.pixels) ? trk.pixels : [];
  const tags = Array.isArray(trk.tags) ? trk.tags : [];

  // ---- Stack architecture state ----
  const GA4_MODE_LABELS = {
    gtm:    { label: "GA4 via GTM (Optimal ✅)", status: "ok" },
    direct: { label: "GA4 hardcodé sans GTM (⚠️ Acceptable)", status: "warn" },
    dual:   { label: "GA4 + GTM + Direct (❌ Doublon détecté)", status: "bad" },
    none:   { label: "GA4 absent (❌ KO)", status: "bad" },
  };
  const modeInfo = GA4_MODE_LABELS[arch.ga4Mode] || GA4_MODE_LABELS.none;

  const findings = [];

  // Finding 1: global tracking score with proof
  findings.push({
    observation: `Score tracking : ${trkScore}/100 — Architecture : ${modeInfo.label}`,
    source: `Module tracking-lite — scraping HTML page (captureMode: ${trk.captureMode || 'http'})`,
    importance: "Le score tracking détermine la qualité de la mesure pour piloter les campagnes d'acquisition.",
    status: modeInfo.status,
  });

  // Finding 2: stack architecture evidence
  if (arch.evidence) {
    findings.push({
      observation: `Preuve architecture : ${arch.evidence}`,
      source: `Analyse HTML — ID GTM: ${arch.gtmId || '—'} | ID GA4: ${arch.ga4Id || '—'}`,
      importance: "L'architecture GTM→GA4 est la référence pour éviter les doublons et centraliser le taggage.",
      status: arch.duplicateRisk ? "bad" : arch.ga4Mode === "gtm" ? "ok" : "warn",
    });
  }

  // Finding 3: duplicate risk (critical if detected)
  if (arch.duplicateRisk) {
    findings.push({
      observation: `⚠️ Doublon détecté : GA4 chargé à la fois via GTM et en hardcodé — risque de double comptage des sessions et conversions`,
      source: `Preuve : GTM (${arch.gtmId || '?'}) + GA4 direct (${arch.ga4Id || '?'}) présents simultanément dans le HTML`,
      importance: "Un doublon GA4 gonfle artificiellement les sessions (+15 à +50 %) et biaise toutes les décisions d'allocation budget.",
      status: "bad",
    });
  }

  // Finding 4: CMP / consent
  const hasCMP = pixels.some(p => p.category === 'Consent / RGPD');
  findings.push({
    observation: hasCMP
      ? `CMP détecté : ${pixels.filter(p => p.category === 'Consent / RGPD').map(p => p.name).join(', ')}`
      : "Aucune CMP (Consent Management Platform) détectée — risque de non-conformité RGPD",
    source: "Module tracking-lite — patterns HTML (Cookiebot, OneTrust, Didomi, Axeptio, Tarteaucitron)",
    importance: "Sans CMP, le tracking peut collecter des données sans consentement valide (amendes CNIL jusqu'à 4 % du CA).",
    status: hasCMP ? "ok" : "bad",
  });

  // ---- Tables ----

  // Stack architecture table
  const architectureRows = [
    ["Architecture", modeInfo.label, arch.evidence || "—"],
    ["ID GTM", arch.gtmId || "Non détecté", `Pattern: /GTM-[A-Z0-9]+/`],
    ["ID GA4 (Measurement ID)", arch.ga4Id || "Non détecté", `Pattern: /G-[A-Z0-9]{6,}/`],
    ["Risque de doublon", arch.duplicateRisk ? "⚠️ OUI — double comptage probable" : "Non détecté", arch.evidence || "—"],
    ["Score tracking", `${trkScore}/100`, `Calcul : GA4+GTM=90, GA4-direct=58, GTM-seul=42, aucun=0, +CMP=+8`],
  ];

  // Third-party pixels inventory
  const pixelRows = pixels.length > 0
    ? pixels.map(p => [p.name, p.category, "✅ Détecté", p.evidence])
    : [["Aucun pixel tiers détecté", "—", "❌", "HTML scanné — aucune correspondance"]];

  // Status table (all known stacks)
  const ALL_STACKS = [
    { name: "Google Analytics 4 (GA4)", match: (arch.hasGA4 || tags.some(t => /GA4|Google Analytics/i.test(t))) },
    { name: "Google Tag Manager (GTM)", match: (arch.hasGTM || tags.some(t => /GTM/i.test(t))) },
    { name: "Meta Pixel (Facebook)", match: tags.some(t => /Meta Pixel/i.test(t)) || pixels.some(p => /Meta/i.test(p.name)) },
    { name: "Google Ads (gTag/AW)", match: pixels.some(p => /Google Ads/i.test(p.name)) },
    { name: "CMP (Cookiebot / OneTrust / Didomi / Axeptio)", match: hasCMP },
    { name: "Microsoft Ads / Bing UET", match: pixels.some(p => /Microsoft|Bing/i.test(p.name)) },
    { name: "LinkedIn Insight Tag", match: pixels.some(p => /LinkedIn/i.test(p.name)) },
    { name: "TikTok Pixel", match: pixels.some(p => /TikTok/i.test(p.name)) },
    { name: "Hotjar / Clarity", match: pixels.some(p => /Hotjar|Clarity/i.test(p.name)) },
  ];
  const statusRows = ALL_STACKS.map(s => [
    s.name,
    s.match ? "✅ Détecté" : "❌ Non détecté",
    "Scraping HTML — module tracking-lite",
  ]);

  // Summary (non-repetitive based on actual state)
  const summary = [];
  summary.push(`Score tracking : ${trkScore}/100 — ${modeInfo.label}`);
  summary.push(`Architecture : ${arch.evidence || 'Non analysée'}`);
  if (arch.duplicateRisk) summary.push("⚠️ Doublon GA4 détecté — double comptage probable, correction prioritaire");
  if (!hasCMP) summary.push("CMP absente — conformité RGPD à risque");
  else summary.push(`CMP : ${pixels.filter(p => p.category === 'Consent / RGPD').map(p => p.name).join(', ')}`);
  const adPixels = pixels.filter(p => p.category.includes('Ads') || p.category.includes('Retargeting'));
  if (adPixels.length > 0) summary.push(`Pixels Ads détectés : ${adPixels.map(p => p.name).join(', ')}`);

  return {
    id: "tracking-lite",
    title: "Tracking — Inventaire & Architecture",
    intro:
      "Détection de l'architecture de tracking (GA4, GTM, pixels tiers) par analyse du HTML public. " +
      "Chaque constat est accompagné de sa preuve (pattern détecté, ID extrait).",
    summary,
    findings,
    actions: [
      ...(arch.duplicateRisk ? [{
        title: "Corriger le doublon GA4 (suppression du tag hardcodé)",
        why: `GA4 ${arch.ga4Id || ''} chargé à la fois via GTM ET en direct — double comptage confirmé`,
        evidence: arch.evidence || "GTM + GA4 direct détectés simultanément dans le HTML",
        impact: "Suppression des sessions artificielles (+15–50 %) — fiabilisation de toutes les métriques",
        effort: "S",
        risk: "high",
        owner: "StratAds",
        deadline: "7j",
        action: "Retirer le snippet GA4 hardcodé — ne garder que le tag GTM. Vérifier via GA4 DebugView après correction.",
      }] : []),
      ...(trkScore < 70 ? [{
        title: "Compléter le plan de taggage (events + conversions)",
        why: `Score tracking ${trkScore}/100 — dispositif de mesure incomplet`,
        evidence: `Architecture actuelle : ${arch.evidence || modeInfo.label}`,
        impact: "Activation des enchères automatiques Google Ads (tCPA, tROAS) — pilotage basé sur les données",
        effort: "M",
        risk: "high",
        owner: "StratAds",
        deadline: "30j",
        action: "Implémenter les events de conversion (purchase, generate_lead), valider le consent mode, documenter le plan de taggage.",
      }] : []),
      ...(!hasCMP ? [{
        title: "Installer une CMP (Consent Management Platform)",
        why: "Aucune CMP détectée — collecte de données sans consentement valide",
        evidence: "Module tracking-lite — aucun pattern CMP détecté (Cookiebot, OneTrust, Didomi, Axeptio, Tarteaucitron)",
        impact: "Conformité RGPD — suppression du risque d'amende CNIL (jusqu'à 4 % du CA annuel)",
        effort: "S",
        risk: "high",
        owner: "StratAds",
        deadline: "7j",
        action: "Installer Cookiebot, Axeptio ou OneTrust. Configurer le consent mode v2 GA4 + Meta.",
      }] : []),
    ],
    charts: [],
    tables: [
      {
        id: "tracking-architecture",
        title: "Architecture de tracking détectée",
        headers: ["Paramètre", "Valeur", "Preuve / Source"],
        rows: architectureRows,
      },
      {
        id: "tracking-tags",
        title: "Inventaire des tags — statut de détection",
        headers: ["Tag / Outil", "Statut", "Source"],
        rows: statusRows,
      },
      {
        id: "tracking-pixels",
        title: "Pixels & trackers tiers détectés",
        headers: ["Outil", "Catégorie", "Statut", "Preuve HTML"],
        rows: pixelRows,
      },
    ],
    evidence: [],
    riskLevel: deriveSectionRiskLevel(findings),
  };
}

function buildRoadmap(auditResults, profile, scores) {
  const globalScore = num(scores.global);

  const roadmap = [
    // 7 days
    {
      horizon: "7 jours",
      action: "Corriger robots.txt + sitemap",
      owner: "client",
      effort: "S",
      priority: "P1",
    },
    {
      horizon: "7 jours",
      action: "Configurer SPF/DMARC si manquants",
      owner: "client",
      effort: "S",
      priority: "P1",
    },
    // 30 days
    {
      horizon: "30 jours",
      action: "Optimiser LCP + images (WebP)",
      owner: "client",
      effort: "M",
      priority: "P1",
    },
    {
      horizon: "30 jours",
      action: "Compléter le plan de taggage GA4 + events clés",
      owner: "StratAds",
      effort: "M",
      priority: "P1",
    },
    {
      horizon: "30 jours",
      action: "Corriger les balises SEO manquantes (titres, H1, meta)",
      owner: "client",
      effort: "S",
      priority: "P2",
    },
    // 90 days
    {
      horizon: "90 jours",
      action: "Implémenter le consent mode v2 (RGPD)",
      owner: "StratAds",
      effort: "M",
      priority: "P2",
    },
    {
      horizon: "90 jours",
      action: "Lancer une campagne de test (A/B) sur les pages clés",
      owner: "client",
      effort: "L",
      priority: "P3",
    },
    {
      horizon: "90 jours",
      action: "Configurer le reporting automatisé (Data Studio / Looker)",
      owner: "StratAds",
      effort: "M",
      priority: "P3",
    },
  ];

  return {
    id: "roadmap",
    title: "Roadmap 7 / 30 / 90 jours",
    intro:
      "Plan d'action priorisé sur 3 horizons temporels. P1 = critique, P2 = important, P3 = amélioration.",
    summary: [
      "7 jours : corrections immédiates (sécurité, indexabilité)",
      "30 jours : performance et tracking",
      "90 jours : conformité et optimisation avancée",
    ],
    findings: [],
    actions: roadmap.map(r => ({
      title: r.action,
      why: "Voir section dédiée pour la justification complète",
      evidence: "Voir sections Performance, SEO, Tracking",
      impact: r.priority === "P1" ? "Élevé" : r.priority === "P2" ? "Moyen" : "Faible",
      effort: r.effort,
      risk: r.priority === "P1" ? "high" : r.priority === "P2" ? "medium" : "low",
      owner: r.owner,
      deadline: r.horizon,
      action: r.action,
    })),
    charts: [],
    tables: [
      {
        id: "roadmap",
        title: "Roadmap 7 / 30 / 90 jours",
        headers: ["Horizon", "Action", "Owner", "Effort", "Priorité"],
        rows: roadmap.map(r => [r.horizon, r.action, r.owner, r.effort, r.priority]),
      },
    ],
    evidence: [],
    riskLevel: "Faible",
  };
}

function buildTrackingAdvanced(auditResults, scores) {
  const trk = auditResults.modules?.tracking || {};
  const gtm = auditResults.modules?.gtmAudit || {};
  const consent = auditResults.modules?.consent || {};

  const trkScore = num(scores.tracking);
  const arch = trk.stackArchitecture || {};
  const pixels = Array.isArray(trk.pixels) ? trk.pixels : [];
  const hasCMP = pixels.some(p => p.category === 'Consent / RGPD') || !!consent.hasCMP;
  const hasConsentModeV2 = !!consent.consentModeV2 || !!gtm.consentModeV2;

  // ---- Event map from real data or annotated placeholder ----
  const eventMap = [];

  if (trk.events && Array.isArray(trk.events) && trk.events.length > 0) {
    for (const ev of trk.events) {
      eventMap.push({
        event: ev.name || ev.event || "—",
        params: ev.params ? (typeof ev.params === 'object' ? Object.keys(ev.params).join(", ") : String(ev.params)) : "—",
        source: ev.source || "tracking-lite",
        status: ev.ok ? "✅ Validé" : "⚠️ À valider",
        evidence: ev.evidence || ev.source || "Détecté via dataLayer sample",
        action: ev.ok ? "Surveiller en continu" : "Valider via GA4 DebugView + GTM Preview",
      });
    }
  }

  // Annotated defaults with evidence labels (only if no real data)
  if (eventMap.length === 0) {
    const pageViewStatus = arch.hasGA4 ? "⚠️ Supposé (à valider)" : "❌ Non détecté";
    const pageViewEv = arch.hasGA4 ? `GA4 ${arch.ga4Id || ''} détecté — event page_view non confirmé sans DebugView` : "GA4 absent";
    eventMap.push({ event: "page_view", params: "page_location, page_title", source: arch.ga4Mode === 'gtm' ? `GTM (${arch.gtmId || '?'})` : "GA4 direct", status: pageViewStatus, evidence: pageViewEv, action: "Confirmer via GA4 DebugView → Realtime Events" });
    eventMap.push({ event: "purchase", params: "transaction_id, value, currency, items[]", source: "GA4 / GTM", status: "⚠️ Non confirmé", evidence: "Aucun event e-commerce détecté dans le dataLayer", action: "Créer trigger GTM sur dataLayer push 'purchase', valider en staging" });
    eventMap.push({ event: "generate_lead", params: "form_id, form_name", source: "GTM", status: "⚠️ Non confirmé", evidence: "Aucun trigger formulaire détecté dans le GTM public", action: "Créer déclencheur GTM sur soumission formulaire" });
    eventMap.push({ event: "add_to_cart", params: "item_id, item_name, value, currency", source: "GA4 / GTM", status: "⚠️ Non confirmé", evidence: "dataLayerSample non accessible en HTTP-only", action: "Vérifier dataLayer push add_to_cart en navigation produit" });
    eventMap.push({ event: "view_item", params: "item_id, item_name, price", source: "GA4 / GTM", status: "⚠️ Non confirmé", evidence: "Non observable sans accès privé GA4", action: "Implémenter si e-commerce — contribue au ROAS Google Ads" });
  }

  // ---- Conversion map ----
  const hasGoogleAds = pixels.some(p => /Google Ads/i.test(p.name));
  const hasMeta = pixels.some(p => /Meta Pixel/i.test(p.name));

  const convMap = [
    {
      conversion: "Achat / Purchase",
      event: "purchase",
      platform: [arch.hasGA4 ? "GA4" : null, hasGoogleAds ? "Google Ads" : null].filter(Boolean).join(" + ") || "Non configuré",
      status: arch.duplicateRisk ? "⚠️ Doublon détecté" : arch.hasGA4 ? "⚠️ À valider" : "❌ Non configuré",
      action: arch.duplicateRisk ? "Supprimer le tag GA4 hardcodé — garder uniquement GTM" : "Configurer conversion purchase dans Google Ads + GA4",
    },
    {
      conversion: "Lead / Formulaire",
      event: "generate_lead",
      platform: arch.hasGA4 ? "GA4" + (hasGoogleAds ? " + Google Ads" : "") : "Non configuré",
      status: "⚠️ À implémenter",
      action: "Créer déclencheur GTM sur soumission formulaire, importer dans Google Ads",
    },
    {
      conversion: "Appel téléphonique",
      event: "phone_click",
      platform: hasGoogleAds ? "Google Ads" : "—",
      status: "❌ Non tracké",
      action: "Configurer conversion appel Google Ads (numéro de transfert ou clic tel:)",
    },
    {
      conversion: "Micro-conversion (scroll, vidéo, etc.)",
      event: "scroll / video_progress",
      platform: arch.hasGA4 ? "GA4" : "—",
      status: "⚠️ Non confirmé",
      action: "Activer les mesures améliorées GA4 (Enhanced Measurement)",
    },
    ...(hasMeta ? [{
      conversion: "Événement Meta Pixel",
      event: "Purchase / Lead",
      platform: `Meta Pixel (${pixels.find(p => /Meta/i.test(p.name))?.evidence || 'détecté'})`,
      status: hasCMP ? "⚠️ À valider avec CMP" : "⚠️ Sans CMP — risque RGPD",
      action: hasCMP ? "Valider que Meta Pixel respecte le consentement (consent mode)" : "Installer CMP avant d'activer le pixel Meta",
    }] : []),
  ];

  // ---- Data Quality Checklist (evidence-driven, non-repetitive) ----
  const dqChecks = [
    {
      check: "Architecture : GA4 via GTM (recommandé)",
      status: arch.ga4Mode === 'gtm' ? "✅ OK" : arch.ga4Mode === 'dual' ? "❌ Doublon" : arch.ga4Mode === 'direct' ? "⚠️ GA4 direct" : "❌ KO",
      evidence: arch.evidence || "—",
      action: arch.ga4Mode === 'gtm' ? "Maintenir — architecture optimale" : arch.ga4Mode === 'dual' ? "Supprimer GA4 hardcodé — garder GTM uniquement" : "Migrer vers GTM pour centraliser le taggage",
    },
    {
      check: "Doublon GA4 (double comptage)",
      status: arch.duplicateRisk ? "❌ DOUBLON DÉTECTÉ" : "✅ Non détecté",
      evidence: arch.duplicateRisk ? `GTM (${arch.gtmId || '?'}) + GA4 direct (${arch.ga4Id || '?'}) simultanés` : arch.evidence || "Un seul chargement GA4 détecté",
      action: arch.duplicateRisk ? "PRIORITAIRE : retirer le snippet GA4 hardcodé" : "Surveiller si ajout de code GA4 externe",
    },
    {
      check: "CMP (Consent Management Platform)",
      status: hasCMP ? `✅ ${pixels.filter(p => p.category === 'Consent / RGPD').map(p => p.name).join(', ')}` : "❌ Absente",
      evidence: hasCMP ? `Pattern CMP détecté dans le HTML : ${pixels.filter(p => p.category === 'Consent / RGPD').map(p => p.evidence).join(' | ')}` : "Aucun pattern CMP détecté (Cookiebot, OneTrust, Didomi, Axeptio, Tarteaucitron)",
      action: hasCMP ? "Valider la configuration du consent mode v2" : "Installer une CMP — obligatoire RGPD",
    },
    {
      check: "Consent Mode v2 (GA4 + Ads)",
      status: hasConsentModeV2 ? "✅ Configuré" : "⚠️ À vérifier",
      evidence: hasConsentModeV2 ? "Consent mode v2 détecté via module consent-sim" : "Non confirmé sans test CMP actif",
      action: hasConsentModeV2 ? "Surveiller les taux de consentement dans GA4 → Reporting → Consentement" : "Configurer consent mode v2 dans GTM avec les signaux CMP",
    },
    {
      check: "Déduplication GA4 ↔ Google Ads",
      status: arch.duplicateRisk ? "❌ Risque élevé" : hasGoogleAds && arch.hasGA4 ? "⚠️ À valider" : "N/A",
      evidence: arch.duplicateRisk ? `Double tag détecté : ${arch.evidence}` : hasGoogleAds ? `Google Ads et GA4 tous deux présents — vérifier que la conversion est comptée une seule fois` : "Google Ads non détecté",
      action: "Dans Google Ads → Conversions → Source : utiliser GA4 (import) OU tag Ads direct, pas les deux",
    },
    {
      check: "UTMs cohérents dans les campagnes",
      status: "⚠️ Non vérifiable (données privées)",
      evidence: "Nécessite accès aux données GA4 (Source/Medium rapport) — non disponible en audit public",
      action: "Auditer les liens dans Ads Manager + Google Campaign URL Builder pour standardiser utm_source/medium/campaign",
    },
    {
      check: "Exclusion du trafic interne",
      status: "⚠️ Non vérifiable (données privées)",
      evidence: "Nécessite accès GA4 → Admin → Filtres de données internes",
      action: "Configurer filtre IP interne dans GA4 → Admin → Propriété → Filtres de données",
    },
    {
      check: "Enhanced Conversions (Google Ads)",
      status: hasGoogleAds ? "⚠️ Non confirmé" : "N/A",
      evidence: hasGoogleAds ? `Google Ads tag détecté (${pixels.find(p => /Google Ads/i.test(p.name))?.evidence || '—'}) — enhanced conversions non vérifiable sans accès compte` : "Google Ads absent",
      action: hasGoogleAds ? "Activer Enhanced Conversions dans Google Ads → Paramètres → Conversions — améliore le taux de comptage de +15 à +30 %" : "Activer Google Ads tag puis configurer Enhanced Conversions",
    },
  ];

  // ---- Findings (non-repetitive, evidence-based) ----
  const findings = [
    {
      observation: `Score tracking : ${trkScore}/100 — Architecture : ${arch.ga4Mode === 'gtm' ? 'GA4 via GTM (optimal)' : arch.ga4Mode === 'dual' ? 'Doublon GA4+GTM+Direct (critique)' : arch.ga4Mode === 'direct' ? 'GA4 direct sans GTM' : 'Tracking absent'}`,
      source: `Module tracking-lite (captureMode: ${trk.captureMode || 'http'}) — ID GTM: ${arch.gtmId || '—'} | ID GA4: ${arch.ga4Id || '—'}`,
      importance: "Score tracking < 70 = enchères automatiques Google/Meta dégradées, attribution inexacte.",
      status: trkScore >= 70 ? "ok" : trkScore >= 50 ? "warn" : "bad",
    },
    ...(arch.duplicateRisk ? [{
      observation: `CRITIQUE — Doublon GA4 : ${arch.evidence}`,
      source: `HTML page — GTM (${arch.gtmId || '?'}) + tag GA4 hardcodé (${arch.ga4Id || '?'}) simultanés`,
      importance: "Double chargement GA4 = sessions gonflées artificiellement de +15 à +50 % selon les outils de mesure.",
      status: "bad",
    }] : []),
    {
      observation: hasCMP
        ? `CMP active : ${pixels.filter(p => p.category === 'Consent / RGPD').map(p => p.name).join(', ')} — consent mode v2 : ${hasConsentModeV2 ? 'configuré' : 'à valider'}`
        : "CMP absente — tout tracking actif collecte des données sans consentement valide",
      source: hasCMP ? `Patterns CMP détectés dans le HTML : ${pixels.filter(p => p.category === 'Consent / RGPD').map(p => p.evidence).join(' | ')}` : "Module tracking-lite — aucun pattern CMP dans le HTML",
      importance: "RGPD Art. 7 — le consentement doit être libre, éclairé et préalable. Amende CNIL : jusqu'à 4 % du CA mondial.",
      status: hasCMP ? (hasConsentModeV2 ? "ok" : "warn") : "bad",
    },
  ];

  return {
    id: "tracking-advanced",
    title: "Audit Tracking Avancé — Plan de Taggage & Qualité Data",
    intro:
      "Analyse approfondie du dispositif de tracking : architecture GA4/GTM, event map, conversions, qualité des données. " +
      "Chaque constat est fondé sur des preuves extraites de l'analyse publique du site.",
    summary: [
      `Score tracking : ${trkScore}/100 — ${arch.ga4Mode === 'gtm' ? 'GA4 via GTM (optimal)' : arch.ga4Mode === 'dual' ? '⚠️ DOUBLON GA4 détecté' : arch.ga4Mode === 'direct' ? 'GA4 direct (sans GTM)' : 'Tracking absent'}`,
      arch.duplicateRisk ? `⚠️ DOUBLON : ${arch.evidence}` : `Architecture : ${arch.evidence || 'Non analysée'}`,
      `${eventMap.length} events dans la event map — ${eventMap.filter(e => e.status.includes('Validé')).length} validés`,
      `CMP : ${hasCMP ? pixels.filter(p => p.category === 'Consent / RGPD').map(p => p.name).join(', ') : 'Absente — risque RGPD'}`,
      `Pixels Ads tiers : ${pixels.filter(p => p.category.includes('Ads')).map(p => p.name).join(', ') || 'Aucun détecté'}`,
    ],
    findings,
    actions: [
      ...(arch.duplicateRisk ? [{
        title: `PRIORITÉ 0 — Supprimer le doublon GA4 (${arch.ga4Id || ''})`,
        why: `Double chargement confirmé : GTM (${arch.gtmId || '?'}) + tag hardcodé simultanément`,
        evidence: arch.evidence,
        impact: "Correction immédiate des données GA4 — suppression des sessions et conversions artificielles",
        effort: "S",
        risk: "high",
        owner: "StratAds",
        deadline: "7j",
        action: "Retirer le snippet gtag.js/G-XXXX hardcodé du HTML. Conserver uniquement le tag GA4 déployé par GTM.",
      }] : []),
      {
        title: "Compléter et documenter la Event Map",
        why: `${eventMap.filter(e => !e.status.includes('Validé')).length} events non validés sur ${eventMap.length}`,
        evidence: "Event map ci-dessus — statuts 'À valider' ou 'Non confirmé'",
        impact: "Activation des Smart Bidding Google Ads (tCPA, tROAS) — nécessite ≥30 conversions/mois fiables",
        effort: "M",
        risk: "high",
        owner: "StratAds",
        deadline: "30j",
        action: "Pour chaque event critique : créer le trigger GTM, valider via GA4 DebugView, documenter avec captures d'écran.",
      },
      ...(!hasCMP ? [{
        title: "Installer une CMP et configurer le consent mode v2",
        why: "Aucune CMP détectée — collecte de données non conforme RGPD",
        evidence: "Module tracking-lite — aucun pattern CMP (Cookiebot, OneTrust, Didomi, Axeptio) dans le HTML public",
        impact: "Conformité légale + maintien de la collecte GA4/Ads post-consentement via modélisation",
        effort: "S",
        risk: "high",
        owner: "StratAds",
        deadline: "7j",
        action: "Sélectionner CMP (Axeptio recommandé pour FR), configurer consent mode v2, tester refus/acceptation.",
      }] : []),
    ],
    charts: [
      {
        type: "event-coverage-bars",
        title: "Couverture de la Event Map",
        data: {
          items: [
            { label: "Validé", value: eventMap.filter(e => e.status.includes("Validé")).length },
            { label: "À valider", value: eventMap.filter(e => e.status.includes("valider") || e.status.includes("confirmer")).length },
            { label: "Non configuré", value: eventMap.filter(e => e.status.includes("Non") || e.status.includes("KO")).length },
          ],
        },
      },
    ],
    tables: [
      {
        id: "event-map",
        title: "Event Map — Plan de taggage",
        headers: ["Event", "Paramètres", "Source", "Statut", "Preuve", "Action"],
        rows: eventMap.map(e => [e.event, e.params, e.source, e.status, e.evidence, e.action]),
      },
      {
        id: "conversion-map",
        title: "Conversion Map — Plateformes & statuts",
        headers: ["Conversion", "Event GA4", "Plateforme", "Statut", "Action"],
        rows: convMap.map(c => [c.conversion, c.event, c.platform, c.status, c.action]),
      },
      {
        id: "data-quality-checklist",
        title: "Data Quality Checklist — avec preuves",
        headers: ["Vérification", "Statut", "Preuve", "Action"],
        rows: dqChecks.map(c => [c.check, c.status, c.evidence, c.action]),
      },
    ],
    evidence: [],
    isPrivate: false,
    riskLevel: arch.duplicateRisk ? "Élevé" : trkScore < 50 ? "Élevé" : trkScore < 70 ? "Moyen" : "Faible",
  };
}

function buildSituationAnalysis(auditResults, profile, scores) {
  const meta = auditResults.meta || {};
  const globalScore = num(scores.global);
  const trkScore = num(scores.tracking);
  const seoScore = num(scores.seo);
  const perfScore = num(scores.performance);
  const secScore = num(scores.security);

  const situation = globalScore >= 80
    ? "Votre site présente une bonne santé digitale globale. L'acquisition est opérationnelle."
    : globalScore >= 60
    ? "Votre site présente des opportunités d'amélioration significatives. Des actions ciblées peuvent rapidement améliorer vos performances."
    : "Votre site présente des lacunes importantes qui freinent votre acquisition digitale. Une intervention rapide est nécessaire.";

  const opportunities = [];
  if (trkScore < 70) opportunities.push("Fiabiliser le tracking pour activer les enchères intelligentes Google Ads");
  if (seoScore < 70) opportunities.push("Améliorer le référencement naturel pour réduire le coût d'acquisition");
  if (perfScore < 70) opportunities.push("Optimiser les performances pour augmenter le taux de conversion");
  if (secScore < 70) opportunities.push("Renforcer la sécurité pour protéger la réputation de la marque");
  if (opportunities.length === 0) opportunities.push("Maintenir l'excellence actuelle et scaler les campagnes performantes");

  const risks = [];
  if (trkScore < 50) risks.push({ observation: "Tracking défaillant — toutes les décisions media sont biaisées", source: "Module tracking", importance: "Impact direct sur le ROI media", status: "bad" });
  if (perfScore < 50) risks.push({ observation: "Performances trop faibles — taux de rebond élevé et conversions perdues", source: "Module lighthouse", importance: "Chaque seconde de chargement = -7% de conversions", status: "bad" });
  if (seoScore < 60) risks.push({ observation: "Visibilité SEO insuffisante — dépendance excessive aux campagnes payantes", source: "Module SEO", importance: "Coût d'acquisition élevé et non-diversifié", status: "warn" });

  return {
    id: "situation-analysis",
    title: "Analyse de Situation",
    intro: "Vue d'ensemble de votre situation digitale actuelle — points forts, risques majeurs et opportunités prioritaires.",
    summary: [
      `Score global : ${globalScore}/100`,
      situation,
      `${opportunities.length} opportunité(s) identifiée(s)`,
      `${risks.length} risque(s) majeur(s)`,
    ],
    findings: [
      {
        observation: situation,
        source: "Analyse multi-modules StratAds",
        importance: "Vue synthétique de la santé digitale",
        status: globalScore >= 80 ? "ok" : globalScore >= 60 ? "warn" : "bad",
      },
      ...risks,
    ],
    actions: opportunities.map((opp, i) => ({
      title: opp,
      why: "Opportunité identifiée pour améliorer les performances d'acquisition",
      evidence: `Score ${["tracking", "seo", "performance", "security"][i] || "global"} < 70`,
      impact: "Amélioration du ROI media et réduction du coût d'acquisition",
      effort: i === 0 ? "S" : "M",
      risk: "medium",
      owner: "StratAds",
      deadline: "30j",
      action: opp,
    })),
    charts: [
      { type: "score-donut", title: "Score global", data: { value: globalScore, max: 100 } },
      {
        type: "pillar-bars",
        title: "Scores par pilier",
        data: {
          items: [
            { label: "Tracking", value: trkScore },
            { label: "SEO", value: seoScore },
            { label: "Performance", value: perfScore },
            { label: "Sécurité", value: secScore },
          ],
        },
      },
    ],
    tables: [
      {
        id: "situation-opportunities",
        title: "Opportunités prioritaires (30 jours)",
        headers: ["Opportunité", "Impact estimé", "Effort"],
        rows: opportunities.map((opp, i) => [opp, "Élevé", i === 0 ? "S" : "M"]),
      },
    ],
    evidence: [],
    riskLevel: globalScore < 60 ? "Élevé" : globalScore < 80 ? "Moyen" : "Faible",
  };
}

function buildGa4Detailed(auditResults, scores) {
  const ga4Raw = auditResults.modules?.privateGoogle?.ga4 || {};
  const gsc = auditResults.modules?.privateGoogle?.gsc || {};
  const trkScore = num(scores.tracking);

  // Strict validation — no mockdata in PRIVATE sections
  const ga4Validation = validateModuleData(ga4Raw, []);
  const channels = ga4Raw?.channels || [];
  const conversions = ga4Raw?.conversions || [];
  const topPages = (ga4Raw?.topPages || []).slice(0, 10);
  const hasRealData = channels.length > 0 || conversions.length > 0 || topPages.length > 0;

  if (!ga4Validation.isValid || !hasRealData) {
    return {
      id: "ga4-detailed",
      title: "GA4 — Analyse Détaillée (CONFIDENTIEL)",
      dataAvailable: false,
      reason: hasRealData
        ? ga4Validation.reason
        : "Données GA4 indisponibles — accès API (service account) requis pour cette section.",
      intro: "Données indisponibles. Configurez l'accès via service account pour afficher les données réelles.",
      summary: ["⚠️ Données GA4 non disponibles"],
      findings: [],
      actions: [],
      charts: [],
      tables: [],
      evidence: [],
      isPrivate: true,
      riskLevel: "Élevé",
    };
  }

  const totalSessions = channels.reduce((s, c) => s + (c.sessions || 0), 0);
  const totalConversions = conversions.reduce((s, c) => s + (c.count || 0), 0);
  const totalRevenue = conversions.reduce((s, c) => s + (c.value || 0), 0);
  const avgConvRate = channels.length > 0
    ? (channels.reduce((s, c) => s + (c.convRate || 0), 0) / channels.length).toFixed(1)
    : "—";

  // Looker Studio-style dashboard data (rendered as a rich visual block in PRIVATE sections)
  const lookerDashboard = {
    title: "GA4 Analytics Dashboard",
    dateRange: "30 derniers jours",
    kpis: [
      { label: "Sessions totales", value: totalSessions.toLocaleString("fr-FR"), trend: null },
      { label: "Conversions", value: totalConversions, trend: null },
      { label: "Revenus", value: totalRevenue > 0 ? `${totalRevenue.toLocaleString("fr-FR")} €` : "—", trend: null },
      { label: "Conv. rate moyen", value: `${avgConvRate}%`, trend: null },
    ],
    channelTable: {
      title: "Acquisition par canal",
      headers: ["Canal", "Sessions", "Part", "Conv. Rate", "Revenus"],
      rows: channels.map(c => ({
        channel: c.channel,
        sessions: c.sessions || 0,
        share: totalSessions > 0 ? `${Math.round(((c.sessions || 0) / totalSessions) * 100)}%` : "—",
        convRate: c.convRate,
        revenue: c.revenue || 0,
      })),
    },
    conversionTable: {
      title: "Événements de conversion",
      headers: ["Événement", "Occurrences", "Valeur totale", "Taux"],
      rows: conversions.map(c => ({
        name: c.name,
        count: c.count || 0,
        value: c.value || 0,
        rate: c.rate,
      })),
    },
  };

  return {
    id: "ga4-detailed",
    title: "GA4 — Analyse Détaillée (CONFIDENTIEL)",
    intro: "Analyse approfondie des données GA4 : canaux d'acquisition, pages de destination, conversions et chemins de conversion. Données confidentielles.",
    summary: [
      `${channels.length} canaux d'acquisition analysés`,
      `${conversions.length} type(s) de conversion suivi(s)`,
      `Score tracking : ${trkScore}/100`,
      "⚠️ Section confidentielle — ne pas diffuser",
    ],
    findings: [
      {
        observation: `${totalConversions} conversions totales sur la période`,
        source: "GA4 — données propriétaires",
        importance: "Base de référence pour les décisions d'allocation budget media",
        status: trkScore >= 70 ? "ok" : "warn",
      },
      {
        observation: `Canal top performance : ${[...channels].sort((a, b) => (b.revenue || 0) - (a.revenue || 0))[0]?.channel || "—"}`,
        source: "GA4 — rapport canaux",
        importance: "Canal générant le plus de revenus — à prioriser dans les investissements",
        status: "ok",
      },
    ],
    actions: [
      {
        title: "Activer les rapports Enhanced Conversions dans GA4",
        why: "Les données first-party améliorent la modélisation des conversions post-iOS 14",
        evidence: "GA4 — rapport conversions",
        impact: "Amélioration de la précision des conversions de +15-30%",
        effort: "S",
        risk: "low",
        owner: "StratAds",
        deadline: "30j",
        action: "Configurer Enhanced Conversions dans GA4 et Google Ads via GTM",
      },
    ],
    charts: [
      {
        type: "channel-bars",
        title: "Sessions par canal d'acquisition",
        data: { items: channels.map(c => ({ label: c.channel, value: c.sessions })) },
      },
    ],
    tables: [
      {
        id: "acquisition-channels-detail",
        title: "Performance par canal d'acquisition",
        headers: ["Canal", "Sessions", "Taux conversion", "Revenus (€)"],
        rows: channels.map(c => [c.channel, c.sessions, `${c.convRate}%`, `${c.revenue || "—"} €`]),
      },
      {
        id: "conversions-detail",
        title: "Événements de conversion",
        headers: ["Conversion", "Occurrences", "Valeur totale (€)", "Taux"],
        rows: conversions.map(c => [c.name, c.count, c.value ? `${c.value} €` : "—", `${c.rate}%`]),
      },
      {
        id: "top-landing-pages",
        title: "Top pages de destination",
        headers: ["Page", "Sessions", "Taux de rebond", "Temps moyen"],
        rows: topPages.map(p => [p.page, p.sessions, `${p.bounceRate}%`, p.avgTime]),
      },
    ],
    evidence: [],
    isPrivate: true,
    lookerDashboard,
    riskLevel: trkScore < 50 ? "Élevé" : trkScore < 70 ? "Moyen" : "Faible",
  };
}

function buildGlobalSummary(auditResults, profile, scores, allSections) {
  const globalScore = num(scores.global);

  const strengths = [];
  const weaknesses = [];
  const topRisks = [];
  const top10Actions = [];

  for (const section of allSections) {
    for (const f of section.findings || []) {
      if (f.status === "ok") strengths.push(f.observation);
      if (f.status === "bad") {
        weaknesses.push(f.observation);
        topRisks.push({ risk: f.observation, source: f.source });
      }
    }
    for (const a of section.actions || []) {
      top10Actions.push(a);
    }
  }

  const top10 = top10Actions.slice(0, 10);
  const top5Risks = topRisks.slice(0, 5);

  // Top 5 ROI opportunities: actions with high impact sorted by effort asc
  const effortOrder = { S: 0, M: 1, L: 2 };
  const top5ROI = [...top10Actions]
    .filter(a => a.impact && (String(a.impact).toLowerCase().includes("élevé") || String(a.impact).toLowerCase().includes("fort") || String(a.impact).toLowerCase().includes("très")))
    .sort((a, b) => (effortOrder[a.effort] ?? 1) - (effortOrder[b.effort] ?? 1))
    .slice(0, 5)
    .map(a => `${a.title} — Effort ${a.effort}, ${a.impact}`);

  const decisionRecommandee = globalScore >= 80
    ? "Optimisation continue — le dispositif est sain. Passer à l'offre PREMIUM pour scaler."
    : globalScore >= 60
    ? "Action requise sous 30 jours — des lacunes importantes existent. Prioriser le tracking et la performance."
    : "Action urgente — le dispositif est défaillant. Démarrer immédiatement avec l'offre FAST ou GROWTH.";

  const globalFindings = [
    {
      observation: `Score global ${globalScore}/100`,
      source: "Calcul pondéré multi-modules",
      importance: "Baromètre de la santé acquisition",
      status: globalScore >= 80 ? "ok" : globalScore >= 60 ? "warn" : "bad",
    },
  ];

  return {
    id: "global-summary",
    title: "Résumé Global",
    intro:
      "Synthèse finale de l'audit. Ce résumé consolide les forces, faiblesses, risques majeurs et les 10 actions prioritaires identifiées.",
    summary: [
      `Score global : ${globalScore}/100`,
      `${strengths.length} force(s) identifiée(s)`,
      `${weaknesses.length} faiblesse(s) critique(s)`,
      `Top 5 risques : ${top5Risks.slice(0, 3).map(r => r.risk.slice(0, 40)).join(" | ") || "—"}`,
      `Décision : ${decisionRecommandee}`,
    ],
    findings: globalFindings,
    actions: top10,
    decisionRecommandee,
    top5Risks,
    top5ROI,
    charts: [
      { type: "score-donut", title: "Score final", data: { value: globalScore, max: 100 } },
    ],
    tables: [
      filterTableRows({
        id: "top10-actions",
        title: "Top 10 Actions Prioritaires",
        headers: ["Action", "Effort", "Impact", "Owner", "Échéance"],
        rows: top10.map(a => [a.title, a.effort, a.impact, a.owner, a.deadline]),
      }),
      filterTableRows({
        id: "top5-risques",
        title: "Top 5 Risques Majeurs",
        headers: ["Risque", "Source"],
        rows: top5Risks.map(r => [r.risk, r.source]),
      }),
      filterTableRows({
        id: "forces-faiblesses",
        title: "Forces & Faiblesses",
        headers: ["Catégorie", "Observation"],
        rows: [
          ...strengths.slice(0, 5).map(s => ["✅ Force", s]),
          ...weaknesses.slice(0, 5).map(w => ["❌ Faiblesse", w]),
        ],
      }),
    ].filter(t => t && (t.rows || []).length > 0),
    evidence: [],
    riskLevel: globalScore < 60 ? "Élevé" : globalScore < 80 ? "Moyen" : "Faible",
  };
}

function buildStratadsRecommendation(profile) {
  const offerDefs = {
    fast: {
      offer: "fast",
      title: "Offre FAST — Diagnostic & Quick Wins",
      why:
        "Votre site présente des lacunes identifiées en quelques heures d'audit public. " +
        "L'offre FAST vous livre un plan d'action clair et priorisé, orienté business, " +
        "sans investissement lourd et sans jargon technique.",
      points: [
        "Identification rapide des freins à la conversion",
        "Plan d'action 7/30 jours clair et priorisé",
        "Estimation d'impact business pour chaque action",
        "Idéal pour valider le potentiel avant un engagement plus large",
      ],
      cta: "Externalisez votre acquisition avec StratAds — Réserver votre appel sur stratads.fr",
      ctaUrl: "https://stratads.fr",
      nextSteps: [
        "Appel de 30 min pour cadrer les priorités",
        "Livraison d'un plan d'action détaillé sous 5 jours",
        "Mise en œuvre des quick wins (7 jours)",
      ],
    },
    growth: {
      offer: "growth",
      title: "Offre GROWTH — Tracking Foundations & Data Quality",
      why:
        "Votre tracking est neuf ou instable. Sans une base de données fiable, " +
        "toute campagne d'acquisition est aveugle. L'offre GROWTH pose les fondations : " +
        "GA4 propre, GTM structuré, events validés, consent conforme. " +
        "À choisir quand l'acquisition est à construire depuis zéro.",
      points: [
        "Audit complet du plan de taggage (GA4/GTM/Meta/Ads)",
        "Implémentation et QA de chaque event de conversion",
        "Mise en conformité RGPD (consent mode v2)",
        "Base stable pour lancer ou scaler les campagnes",
        "⚠️ GROWTH = construire l'acquisition. PREMIUM = optimiser une acquisition déjà active.",
      ],
      cta: "Externalisez votre acquisition avec StratAds — Réserver votre appel sur stratads.fr",
      ctaUrl: "https://stratads.fr",
      nextSteps: [
        "Atelier plan de taggage (2h)",
        "Implémentation GTM + QA (2 semaines)",
        "Validation et recette finale",
        "Passation vers l'offre PREMIUM quand la base est stable",
      ],
    },
    premium: {
      offer: "premium",
      title: "Offre PREMIUM — Acquisition & Performance Management",
      why:
        "Votre tracking est en place. Il est temps d'optimiser : Google Ads, Meta Ads, " +
        "arbitrages budgets, ROAS, MER, scaling. L'offre PREMIUM pilote votre acquisition " +
        "comme un cabinet Big4 : reporting, alertes, recommandations stratégiques. " +
        "À choisir quand vous avez déjà une acquisition active à améliorer.",
      points: [
        "Pilotage complet des campagnes Google Ads et Meta Ads",
        "Optimisation des budgets et arbitrages ROAS/MER",
        "Reporting hebdomadaire cabinet (dashboard + commentaires)",
        "Scaling structuré basé sur les données first-party",
        "⚠️ PREMIUM = optimiser une acquisition existante. GROWTH = construire depuis zéro.",
      ],
      cta: "Externalisez votre acquisition avec StratAds — Réserver votre appel sur stratads.fr",
      ctaUrl: "https://stratads.fr",
      nextSteps: [
        "Audit des comptes Google Ads + Meta Ads (1 semaine)",
        "Optimisation structure campagnes + enchères (2 semaines)",
        "Mise en place du reporting cabinet",
        "Pilotage mensuel avec revue stratégique",
      ],
    },
    mini: {
      offer: "mini",
      title: "Offre FAST — Diagnostic & Quick Wins 30 jours",
      why:
        "Cet audit express identifie les 3 à 5 actions à impact immédiat pour votre acquisition digitale. " +
        "En 8 à 10 pages, vous disposez d'un plan clair, actionnable et orienté business — sans jargon technique.",
      points: [
        "Diagnostic express de la situation digitale actuelle",
        "Top 5 quick wins activables sous 30 jours",
        "Estimation d'impact business pour chaque action",
        "Pitch StratAds personnalisé selon votre contexte",
      ],
      cta: "Externalisez votre acquisition avec StratAds — Réserver votre appel sur stratads.fr",
      ctaUrl: "https://stratads.fr",
      nextSteps: [
        "Appel de découverte (30 min)",
        "Livraison du rapport FAST sous 48h",
        "Mise en œuvre des quick wins J+7 à J+30",
        "Transition vers PUBLIC ou AUDIT 360 si besoin",
      ],
    },
    public_360: {
      offer: "public_360",
      title: "Offre PUBLIC — Diagnostic Technique Complet",
      why:
        "Votre site mérite un diagnostic approfondi basé sur des données 100 % publiques. " +
        "L'offre PUBLIC couvre 7 dimensions clés : performance, SEO, tracking de base, " +
        "sécurité, conformité, priorisation et roadmap — sans accès confidentiel requis.",
      points: [
        "7 sections techniques détaillées (performance, SEO, tracking, sécurité, conformité, priorisation, roadmap)",
        "Tableaux et graphiques au standard cabinet Big4",
        "Matrice impact/effort pour prioriser les investissements",
        "Roadmap 90 jours prête à implémenter",
        "Idéal pour une décision stratégique documentée",
      ],
      cta: "Externalisez votre acquisition avec StratAds — Réserver votre appel sur stratads.fr",
      ctaUrl: "https://stratads.fr",
      nextSteps: [
        "Atelier de cadrage (1h)",
        "Livraison du rapport PUBLIC sous 5 jours ouvrés",
        "Présentation des résultats à l'équipe (1h)",
        "Suivi roadmap mensuel en option",
      ],
    },
    full: {
      offer: "full",
      title: "Offre PRIVATE — Audit 360° + Données Confidentielles",
      why:
        "L'offre PRIVATE combine l'intégralité du diagnostic public (AUDIT 360) avec l'analyse " +
        "approfondie de vos données privées (GA4, Search Console, Google Ads). " +
        "Une vision complète et confidentielle pour des décisions stratégiques basées sur vos données réelles.",
      points: [
        "Toutes les sections AUDIT 360 (performance, SEO, tracking, sécurité, roadmap)",
        "Analyse GA4 détaillée : canaux, conversions, pages de destination",
        "Search Console : requêtes, pages, opportunités SEO",
        "Données Ads (Google Ads, Meta Ads) : dépenses, ROAS, CPA",
        "Séparation visuelle PUBLIC (bleu) / PRIVÉ (rouge) — badges CONFIDENTIEL",
        "Rapport 50-80 pages — niveau cabinet Big4",
      ],
      cta: "Externalisez votre acquisition avec StratAds — Réserver votre appel sur stratads.fr",
      ctaUrl: "https://stratads.fr",
      nextSteps: [
        "Partage des accès GA4 + GSC + Ads (sécurisé)",
        "Atelier de cadrage (1h30)",
        "Livraison du rapport PRIVATE sous 7 jours ouvrés",
        "Présentation comité de direction (1h)",
        "Suivi trimestriel recommandé",
      ],
    },
  };

  const offerId = profile.stratasdOffer || "fast";
  const def = offerDefs[offerId] || offerDefs.fast;

  // Recruitment vs Outsourcing comparison table
  const recrutementVsExternalisation = {
    id: "recrutement-vs-externalisation",
    title: "Pourquoi externaliser votre acquisition plutôt que recruter ?",
    headers: ["Critère", "Recrutement interne", "Externalisation StratAds"],
    rows: [
      ["Coût annuel (chargé)", "55 000 – 90 000 €/an (salaire + charges + outils)", "Abonnement mensuel fixe, sans surprise"],
      ["Délai opérationnel", "3 – 6 mois (recrutement + onboarding)", "Opérationnel en 1 semaine"],
      ["Expertise disponible", "1 profil généraliste ou spécialiste unique", "Équipe multi-expertises (Tracking / SEO / Ads / Data)"],
      ["Risque", "Départ, maladie, montée en compétence longue", "Continuité garantie, SLA contractuel"],
      ["Outils & technologies", "Budget outils à prévoir séparément (5 000 – 15 000 €/an)", "Stack complète incluse (GA4, GTM, Looker, etc.)"],
      ["Scalabilité", "Rigide — liée à 1 personne", "Flexible — ressources ajustées selon les besoins"],
      ["ROI mesurable", "Difficile à isoler en interne", "Reporting cabinet hebdomadaire avec KPIs business"],
      ["Plan 90 jours", "Onboarding, pas encore de valeur produite", "Résultats mesurables dès J+30"],
    ],
  };

  return {
    id: "stratads-recommendation",
    title: "Recommandation d'accompagnement StratAds",
    intro:
      "StratAds est un cabinet spécialisé en acquisition digitale. Basé sur les résultats de cet audit, " +
      "voici l'offre la mieux adaptée à votre situation.",
    summary: [
      `Offre recommandée : ${def.title}`,
      ...def.points.slice(0, 3),
      def.cta,
    ],
    findings: [],
    actions: [],
    charts: [],
    tables: [
      {
        id: "stratads-offers",
        title: "Comparaison des offres StratAds",
        headers: ["Offre", "Cible", "Focus", "Idéal quand"],
        rows: [
          ["FAST", "Décisionnaire non-tech", "Quick wins, plan d'action 30j", "Premier diagnostic, validation du potentiel"],
          ["PUBLIC", "Équipe marketing/direction", "Diagnostic technique complet (données publiques)", "Décision stratégique documentée sans accès privés"],
          ["AUDIT 360", "Direction + équipes tech/marketing", "Vision technique exhaustive multi-dimensions", "Analyse complète avant un investissement majeur"],
          ["PRIVATE", "Direction + équipe data", "AUDIT 360 + données privées GA4/GSC/Ads", "Vision 360° avec données réelles de performance"],
          ["GROWTH", "Équipe technique — tracking absent", "Tracking, data quality, instrumentation", "Acquisition à construire depuis zéro (pas de tracking)"],
          ["PREMIUM", "Direction + équipe marketing", "Performance, ROAS, scaling campagnes", "Tracking actif, acquisition existante à optimiser"],
        ],
      },
      recrutementVsExternalisation,
    ],
    evidence: [],
    stratasdOffer: def,
    riskLevel: "Faible",
  };
}

function buildAnnexes(auditResults) {
  const annexes = [];
  const lh = auditResults.modules?.lighthouse || {};
  const sec = auditResults.modules?.security || {};
  const seo = auditResults.modules?.seo || {};

  if (!lh.skipped && lh.audits) {
    annexes.push({
      id: "annex-lighthouse",
      title: "Annexe A — Détail Lighthouse",
      content: "Rapport Lighthouse complet disponible en JSON. Les métriques principales sont documentées dans la section Performance.",
    });
  }

  if (!sec.skipped) {
    annexes.push({
      id: "annex-dns",
      title: "Annexe B — Enregistrements DNS",
      content: `SPF : ${sec.spf || "—"} | DMARC : ${sec.dmarc || "—"} | MX : ${sec.mx ? "OK" : "—"}`,
    });
  }

  return annexes;
}

// ---------------------------------------------------------------------------
// Smart Recommendations Section
// ---------------------------------------------------------------------------

function buildSmartRecommendationsSection(auditResults, scores) {
  const ga4 = auditResults.modules?.privateGoogle?.ga4 || {};
  const adsGoogle = auditResults.modules?.adsGoogle || {};
  const adsMeta = auditResults.modules?.adsMeta || {};
  const business = auditResults.modules?.business || {};
  const trkScore = num(scores.tracking);

  const rawChannels = ga4.channels || ga4.rows || [];
  const totals = ga4.totals || {};
  const totalSessions = num(totals.sessions, rawChannels.reduce((s, c) => s + num(c.sessions), 0));
  const totalConversions = num(totals.conversions, rawChannels.reduce((s, c) => s + num(c.conversions), 0));
  const totalRevenue = num(totals.revenue, rawChannels.reduce((s, c) => s + num(c.revenue), 0));

  const overallConvRate = totalSessions > 0 ? calcConvRate(totalConversions, totalSessions) : null;
  const convRateBenchmark = num(business.industryBenchmark?.convRate, 0.025) * 100;

  const gAdsTotals = adsGoogle.totals30d || {};
  const mAdsTotals = adsMeta.totals30d || {};
  const totalAdSpend = num(gAdsTotals.cost, 0) + num(mAdsTotals.cost, 0);
  const totalAdsRevenue = num(gAdsTotals.value, 0) + num(mAdsTotals.value, 0);
  const overallROAS = totalAdSpend > 0 ? calcROAS(totalAdsRevenue, totalAdSpend) : null;
  const totalAdsConv = num(gAdsTotals.conversions, 0) + num(mAdsTotals.conversions, 0);
  const overallCPA = totalAdsConv > 0 ? calcCPA(totalAdSpend, totalAdsConv) : null;
  const aov = num(business.aov, totalConversions > 0 ? totalRevenue / totalConversions : 0);
  const purchaseFreq = num(business.purchaseFrequency, 2.0);
  const retentionRate = num(business.retentionRate, 0.6);
  const ltv = aov > 0 && retentionRate > 0 && retentionRate < 1
    ? calcLTV(aov, purchaseFreq, retentionRate) : null;
  const overallCAC = totalAdSpend > 0 && totalAdsConv > 0 ? calcCAC(totalAdSpend, totalAdsConv) : null;
  const ltvCACRatio = ltv !== null && overallCAC !== null ? calcLTVCACRatio(ltv, overallCAC) : null;

  const ctx = {
    roas: overallROAS,
    convRate: overallConvRate,
    convRateBenchmark,
    cpa: overallCPA,
    cacTarget: num(business.industryBenchmark?.cpa, null) || null,
    ltvCACRatio,
    ga4DataAvailable: !!ga4.ok && (rawChannels.length > 0 || !!totals.sessions),
    adsDataAvailable: !!(adsGoogle.ok || adsMeta.ok),
  };

  const recs = buildSmartRecommendations(ctx);

  const findings = recs.map(r => ({
    observation: r.title,
    source: r.proof,
    importance: r.action + (r.roi ? ` — ROI estimé : ${r.roi}` : ""),
    status: r.priority === "CRITICAL" ? "bad" : r.priority === "HIGH" ? "warn" : "info",
  }));

  const actions = recs.slice(0, 5).map(r => ({
    title: r.title,
    why: r.proof,
    evidence: r.proof,
    impact: r.roi || "Impact business à mesurer",
    effort: r.effort || "M",
    risk: r.priority === "CRITICAL" ? "high" : r.priority === "HIGH" ? "medium" : "low",
    owner: "StratAds",
    deadline: r.effort === "S" ? "7j" : "30j",
    action: r.action,
  }));

  const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const recTableRows = recs.map(r => [
    r.title,
    r.priority,
    r.proof,
    r.action,
    r.roi || "—",
    r.effort || "M",
  ]);

  return {
    id: "smart-recommendations-engine",
    title: "Smart Recommendations Engine",
    intro: "Recommandations automatiques basées sur les données réelles. Chaque recommandation est priorisée par impact business et accompagnée d'une preuve mesurable.",
    summary: [
      `${recs.filter(r => r.priority === "CRITICAL").length} recommandation(s) CRITIQUE(S)`,
      `${recs.filter(r => r.priority === "HIGH").length} recommandation(s) HAUTE PRIORITÉ`,
      `${recs.length} recommandation(s) au total`,
    ],
    findings,
    actions,
    charts: [],
    tables: recs.length > 0 ? [{
      id: "smart-recs-table",
      title: "Recommandations priorisées",
      headers: ["Recommandation", "Priorité", "Preuve", "Action", "ROI estimé", "Effort"],
      rows: recTableRows,
    }] : [],
    evidence: [],
    smartRecommendations: recs,
    riskLevel: recs.some(r => r.priority === "CRITICAL") ? "Élevé"
      : recs.some(r => r.priority === "HIGH") ? "Moyen" : "Faible",
  };
}

// ---------------------------------------------------------------------------
// Section routing
// ---------------------------------------------------------------------------

function buildSection(sectionId, auditResults, profile, scores, allSections) {
  switch (sectionId) {
    case "executive-summary":
      return buildExecutiveSummary(auditResults, profile, scores);
    case "scorecards":
      return buildScorecards(auditResults, scores);
    case "quick-wins":
      return buildQuickWins(auditResults, profile, scores);
    case "risks":
      return buildRisks(auditResults, scores);
    case "performance":
      return buildPerformance(auditResults, scores);
    case "seo-basics":
      return buildSeoBasics(auditResults, scores);
    case "tracking-lite":
      return buildTrackingLite(auditResults, scores);
    case "tracking-advanced":
    case "event-map":
    case "conversion-map":
    case "data-quality-checklist":
    case "consent-audit":
    case "gtm-audit":
    case "instrumentation-priorities":
      return buildTrackingAdvanced(auditResults, scores);
    case "roadmap":
      return buildRoadmap(auditResults, profile, scores);
    case "situation-analysis":
      return buildSituationAnalysis(auditResults, profile, scores);
    case "ga4-detailed":
    case "acquisition-channels":
    case "landing-pages":
    case "conversion-paths":
    case "gsc-queries":
    case "gsc-pages":
    case "opportunities":
      return buildGa4Detailed(auditResults, scores);
    case "ga4-performance-dashboard":
      return buildGa4PerformanceDashboard(auditResults, scores);
    case "ads-performance-complete":
    case "ads-campaign-structure":
    case "ads-spend-performance":
    case "ads-tracking-mismatch":
    case "ads-anomalies":
    case "ads-budget-recommendations":
      return buildAdsPerformanceComplete(auditResults, scores);
    case "smart-recommendations-engine":
      return buildSmartRecommendationsSection(auditResults, scores);
    case "attribution-analysis":
      return buildAttributionAnalysis(auditResults, scores);
    case "strengths":
    case "ce-qui-est-bien":
      return buildStrengthsSection(auditResults, profile, scores);
    case "global-summary":
      return buildGlobalSummary(auditResults, profile, scores, allSections || []);
    case "stratads-recommendation":
      return buildStratadsRecommendation(profile);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Main assembler
// ---------------------------------------------------------------------------

/**
 * Assemble a reportModel from raw auditResults and a profile.
 * @param {object} auditResults — output of orchestrator.runAudit()
 * @param {object|string} profileOrId — ReportProfile or profile id string
 * @returns {object} reportModel
 */
export function assembleReport(auditResults, profileOrId) {
  const profile =
    typeof profileOrId === "string"
      ? resolveProfile(profileOrId)
      : profileOrId || resolveProfile("fast");

  const meta = auditResults?.meta || {};
  const scores = auditResults?.scores || {};

  const reportMeta = {
    client: meta.company || meta.client || "—",
    url: meta.url || "—",
    date: meta.timestampIso || new Date().toISOString(),
    profile: profile.id,
    profileName: profile.name,
    version: VERSION,
    confidential: !!profile.confidential,
    humanSummaries: !!profile.humanSummaries,
    auditId: meta.auditId || `${meta.company || "client"}__${profile.id}__${meta.timestampSafe || Date.now()}`,
  };

  // Build sections in two passes: first all except global-summary (needs allSections)
  const sections = [];
  const deferred = [];
  const builtSectionIds = new Set(); // track by returned section.id to avoid duplicates

  for (const sectionId of profile.sections || []) {
    if (sectionId === "global-summary" || sectionId === "stratads-recommendation") {
      deferred.push(sectionId);
      continue;
    }

    const section = buildSection(sectionId, auditResults, profile, scores, sections);
    if (!section) continue;
    // Deduplicate: only add once per returned section id
    if (builtSectionIds.has(section.id)) continue;
    builtSectionIds.add(section.id);
    sections.push(section);
  }

  // Deferred sections (need allSections built)
  for (const sectionId of deferred) {
    const section = buildSection(sectionId, auditResults, profile, scores, sections);
    if (section) sections.push(section);
  }

  // Global summary (always last before stratads)
  const hasGlobalSummary = sections.find(s => s.id === "global-summary");
  if (!hasGlobalSummary && profile.sections?.includes("global-summary")) {
    sections.push(buildGlobalSummary(auditResults, profile, scores, sections));
  }

  const annexes = profile.annexes ? buildAnnexes(auditResults) : [];

  // Build global summary data
  const allFindings = sections.flatMap(s => s.findings || []);
  const allActions = sections.flatMap(s => s.actions || []);
  const globalSummary = {
    strengths: allFindings.filter(f => f.status === "ok").map(f => f.observation).slice(0, 5),
    weaknesses: allFindings.filter(f => f.status === "bad").map(f => f.observation).slice(0, 5),
    topRisks: allFindings.filter(f => f.status === "bad" || f.status === "warn").slice(0, 5),
    top10Actions: allActions.slice(0, 10),
  };

  // Find stratads recommendation section
  const stratasdSection = sections.find(s => s.id === "stratads-recommendation");
  const stratasdRecommendation = stratasdSection?.stratasdOffer || buildStratadsRecommendation(profile).stratasdOffer;

  return {
    reportMeta,
    scores,
    sections,
    annexes,
    globalSummary,
    stratasdRecommendation,
  };
}
