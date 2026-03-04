/**
 * StratAds Option C — Ads Intelligence Layer
 * - Normalizes totals from Google Ads export + Meta Ads export
 * - Runs a Data Quality Gate (anti-bullshit)
 * - Computes metrics only when inputs exist
 * - Generates deterministic insights with confidence levels
 */
function safeNum(x){ const n = Number(x); return Number.isFinite(n) ? n : null; }
function nz(x){ const n = safeNum(x); return n === null ? 0 : n; }

function metric(name, value, inputsOk, note){
  return { name, value: inputsOk ? value : null, ok: !!inputsOk, note: inputsOk ? null : (note || "Inputs missing") };
}

function div(a,b){
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return a / b;
}

function pct(a,b){
  const x = div(a,b);
  return x === null ? null : x * 100;
}

function round(n, d=2){
  if (!Number.isFinite(n)) return null;
  const p = 10**d;
  return Math.round(n*p)/p;
}

function buildPlatformMetrics(label, totals, metaInfo){
  const spend = nz(totals?.cost ?? totals?.spend);
  const impressions = nz(totals?.impressions);
  const clicks = nz(totals?.clicks);
  const linkClicks = totals?.linkClicks != null ? nz(totals.linkClicks) : null;
  const conv = nz(totals?.conversions ?? totals?.results);
  const value = nz(totals?.value);

  const hasSpend = spend > 0;
  const hasImpr = impressions > 0;
  const hasClicks = clicks > 0;
  const hasConv = conv > 0;
  const hasValue = value > 0;

  const ctr = metric("CTR", pct(clicks, impressions), hasImpr && clicks >= 0, "Need impressions & clicks");
  const cpc = metric("CPC", div(spend, clicks), hasSpend && hasClicks, "Need spend & clicks");
  const cpm = metric("CPM", div(spend, impressions) * 1000, hasSpend && hasImpr, "Need spend & impressions");
  const cvr = metric("CVR", pct(conv, clicks), hasClicks && conv >= 0, "Need clicks & conversions/results");
  const cpa = metric("CPA", div(spend, conv), hasSpend && hasConv, "Need spend & conversions/results");
  const roas = metric("ROAS", div(value, spend), hasSpend && hasValue, "Need conversion value & spend");
  const profitAds = metric("Profit_ads", value - spend, hasSpend && (totals?.value != null), "Need value & spend");
  const roiAds = metric("ROI_ads", div((value - spend), spend), hasSpend && (totals?.value != null), "Need value & spend");

  // ROI estimate when gross margin is provided (e-commerce). This remains an estimate.
  const gm = metaInfo?.grossMargin != null ? safeNum(metaInfo.grossMargin) : null;
  const gmOk = gm != null && gm > 0 && gm <= 100;
  const roiWithMargin = metric(
    "ROI_with_margin",
    div(((value * (gm/100)) - spend), spend),
    hasSpend && (totals?.value != null) && gmOk,
    "Need value, spend & gross margin"
  );

  return {
    label,
    totals: { spend, impressions, clicks, linkClicks, conversions: conv, value },
    metrics: {
      ctr: { value: ctr.value, ok: ctr.ok },
      cpc: { value: cpc.value, ok: cpc.ok },
      cpm: { value: cpm.value, ok: cpm.ok },
      cvr: { value: cvr.value, ok: cvr.ok },
      cpa: { value: cpa.value, ok: cpa.ok },
      roas: { value: roas.value, ok: roas.ok },
      profitAds: { value: profitAds.value, ok: profitAds.ok },
      roiAds: { value: roiAds.value, ok: roiAds.ok },
      roiWithMargin: { value: roiWithMargin.value, ok: roiWithMargin.ok },
    }
  };
}

function qualityGate(google, meta){
  const issues = [];
  let score = 100;

  const check = (cond, penalty, msg) => {
    if (!cond){ score -= penalty; issues.push(msg); }
  };

  const g = google?.totals || {};
  const m = meta?.totals || {};

  // Presence
  const hasAnySpend = (g.spend > 0) || (m.spend > 0);
  check(hasAnySpend, 30, "Spend absent ou nul : impossible de calculer ROI/ROAS/CPA.");

  // Logical constraints
  if (g.impressions != null) check(g.impressions >= g.clicks, 15, "Google: clicks > impressions (mapping colonnes suspect).");
  if (m.impressions != null) check(m.impressions >= m.clicks, 15, "Meta: clicks > impressions (mapping colonnes suspect).");

  // Obvious mapping mistakes: CTR>100%
  const gCtr = div(g.clicks, g.impressions);
  if (g.impressions > 0 && gCtr != null) check(gCtr <= 1.2, 10, "Google: CTR > 120% (mapping/mauvais export).");
  const mCtr = div(m.clicks, m.impressions);
  if (m.impressions > 0 && mCtr != null) check(mCtr <= 1.2, 10, "Meta: CTR > 120% (mapping/mauvais export).");

  // Value without conversions (can happen, but flag)
  if (g.value > 0 && g.conversions === 0) { score -= 5; issues.push("Google: valeur > 0 mais conversions = 0 (définition conversion/value à vérifier)."); }
  if (m.value > 0 && m.conversions === 0) { score -= 5; issues.push("Meta: valeur > 0 mais results = 0 (définition results/value à vérifier)."); }

  // Completeness score booster / reducer
  const completeness = () => {
    let c = 0;
    if (hasAnySpend) c += 25;
    if ((g.impressions>0) || (m.impressions>0)) c += 15;
    if ((g.clicks>0) || (m.clicks>0)) c += 15;
    if ((g.conversions>0) || (m.conversions>0)) c += 25;
    if ((g.value>0) || (m.value>0)) c += 20;
    return c;
  };
  const comp = completeness();
  // Blend: quality score cannot exceed completeness too much
  score = Math.min(score, Math.max(comp, 30));

  const level = score >= 85 ? "Élevé" : (score >= 70 ? "Modéré" : (score >= 50 ? "Partiel" : "Risque"));
  return { score, level, issues, completeness: comp };
}

function buildInsights(google, meta, q){
  const insights = [];
  const add = (id, title, proof, action, priority="P1", confidence="High", impact="Medium") => {
    insights.push({ id, title, proof, action, priority, confidence, impact });
  };

  const platforms = [
    { key:"google", label:"Google Ads", data:google },
    { key:"meta", label:"Meta Ads", data:meta },
  ];

  for (const p of platforms){
    const t = p.data?.totals || {};
    if (t.spend <= 0) continue;

    if (t.conversions === 0){
      add(
        `${p.key}_no_conv`,
        `${p.label}: dépenses sans résultats`,
        `Dépenses : ${round(t.spend,2)} ; Résultats : 0. Cela indique soit un problème de tracking, soit une campagne non performante.`,
        `Isoler les campagnes/ensembles/annonces responsables, vérifier le tracking (pixel/GA4), et couper/optimiser les segments avant de scaler.`,
        "P0",
        q.level === "Risque" ? "Medium" : "High",
        "High"
      );
    }

    if (t.impressions > 0 && t.clicks > 0){
      const ctr = t.clicks / t.impressions;
      if (ctr < 0.008){
        add(
          `${p.key}_low_ctr`,
          `${p.label}: CTR faible`,
          `CTR ≈ ${round(ctr*100,2)}% (faible).`,
          `Renouveler créas (Meta) / annonces & assets (Google), resserrer ciblage, tester angles/offres. Vérifier la cohérence annonce → landing.`,
          "P1",
          "High",
          "Medium"
        );
      }
    }

    if (t.clicks > 0){
      const cvr = t.conversions / t.clicks;
      if (cvr > 0 && cvr < 0.01){
        add(
          `${p.key}_low_cvr`,
          `${p.label}: taux de conversion bas`,
          `CVR ≈ ${round(cvr*100,2)}% : clics présents mais peu de conversions.`,
          `Prioriser CRO (landing), alignement offre, vitesse, friction formulaire/checkout. Vérifier que l’événement de conversion est correctement défini.`,
          "P1",
          q.level === "Risque" ? "Medium" : "High",
          "High"
        );
      }
    }

    if (t.value > 0 && t.spend > 0){
      const roas = t.value / t.spend;
      if (roas < 1){
        add(
          `${p.key}_roas_lt1`,
          `${p.label}: ROAS < 1`,
          `ROAS ≈ ${round(roas,2)} : la valeur attribuée est inférieure aux dépenses (sans COGS).`,
          `Identifier les campagnes déficitaires, ajuster ciblage/bidding, améliorer conversion et AOV. Si leadgen: valeur = 0 → exporter un rapport avec valeur de conversion.`,
          "P0",
          "High",
          "High"
        );
      }
    } else if (t.spend > 0 && t.value === 0){
      add(
        `${p.key}_no_value`,
        `${p.label}: valeur/CA absent`,
        `Dépenses détectées (${round(t.spend,2)}) mais aucune valeur de conversion dans l’export.`,
        `Si e-commerce: exporter un rapport incluant “Conversion value / Purchase value”. Sinon, configurer une valeur de lead (même estimée) pour piloter au ROAS/ROI.`,
        "P2",
        "High",
        "Medium"
      );
    }
  }

  if (q.level === "Risque"){
    add(
      "quality_risk",
      "Fiabilité des données: risque",
      `Score confiance = ${q.score}/100. Des incohérences empêchent certains KPI “business”.`,
      "Re-exporter depuis Google Ads/Meta Ads avec colonnes standard (Date, Spend/Cost, Impr, Clicks, Conversions/Results, Value) et relancer l’audit.",
      "P0",
      "High",
      "High"
    );
  }

  return insights;
}

export function buildAdsIntelligence(imports, meta){
  const gRaw = imports?.google || {};
  const mRaw = imports?.meta || {};

  const googleOk = !!gRaw.ok;
  const metaOk = !!mRaw.ok;

  const google = buildPlatformMetrics("Google Ads", googleOk ? (gRaw.totals30d || {}) : {}, meta);
  const metaP  = buildPlatformMetrics("Meta Ads", metaOk ? (mRaw.totals30d || {}) : {}, meta);

  const q = qualityGate(google, metaP);
  const insights = buildInsights(google, metaP, q);

  const ok = (googleOk || metaOk);
  return {
    ok,
    sources: {
      google: googleOk ? { ok:true, files: gRaw.files?.length || 0 } : { ok:false, reason: gRaw.reason || "not provided" },
      meta: metaOk ? { ok:true, files: mRaw.files?.length || 0 } : { ok:false, reason: mRaw.reason || "not provided" },
    },
    quality: q,
    platforms: { google, meta: metaP },
    insights,
    notes: {
      attribution: "Les exports Ads peuvent différer de GA4 (attribution, fenêtres, définitions). Les KPI sont calculés uniquement si les champs requis sont présents.",
      roiDefinition: "ROI_ads et Profit_ads sont calculés sans COGS par défaut (valeur - spend).",
    }
  };
}
