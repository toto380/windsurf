export function clamp(n, a=0, b=100){ return Math.max(a, Math.min(b, n)); }

export function serializeError(source, err, extra = {}){
  const e = err || {};
  return {
    source,
    code: e.code || null,
    status: e.status || e.statusCode || null,
    message: e.message || String(e),
    responseData: e.responseData || e.data || null,
    stack: e.stack || null,
    ...extra
  };
}

function confidenceFromVolume(kind, v){
  const x = Number(v);
  if(!Number.isFinite(x)) return "low";
  if(kind === "ga4"){
    if(x < 20) return "low";
    if(x < 100) return "medium";
    return "high";
  }
  if(kind === "gsc"){
    if(x < 50) return "low";
    if(x < 500) return "medium";
    return "high";
  }
  return "na";
}

function badge(score){
  if(score == null) return { label:"N/A", tone:"gray" };
  if(score >= 80) return { label:"Solide", tone:"green" };
  if(score >= 60) return { label:"Fragile", tone:"orange" };
  return { label:"Critique", tone:"red" };
}

function pct(n){ return (Number(n)*100).toFixed(0) + "%"; }

export function buildCabinetAuditV21(results, params){
  const g = results?.modules?.privateGoogle || {};
  const ga4 = g.ga4?.totals || g.ga4Totals?.totals || null;
  const gsc = g.gsc?.totals || g.gscTotals?.totals || null;

  const sessions = ga4?.sessions ?? null;
  const impr = gsc?.impressions ?? null;

  const confGa4 = confidenceFromVolume("ga4", sessions);
  const confGsc = confidenceFromVolume("gsc", impr);
  const confGtm = results?.modules?.gtmAudit?.audited ? "high" : "na";
  const overallConf = (confGa4==="low" || confGsc==="low") ? "low" : ((confGa4==="medium" || confGsc==="medium") ? "medium" : "high");
  const confFactor = overallConf==="low" ? 0.85 : (overallConf==="medium" ? 0.95 : 1.0);
  // Confidence index (0-100) used for cabinet-style readability
  const confidenceIndex = overallConf==="low" ? 35 : (overallConf==="medium" ? 65 : 90);

  // N vs N-1 deltas (best-effort, null-safe)
  const ga4Prev = g.ga4TotalsPrev?.totals || g.ga4?.totalsPrev || null;
  const gscPrev = g.gscTotalsPrev?.totals || g.gsc?.totalsPrev || null;

  const delta = (cur, prev) => {
    const c = Number(cur); const p = Number(prev);
    if(!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
    return (c - p) / p;
  };

  const deltas = {
    ga4: ga4 ? {
      sessions: delta(ga4.sessions, ga4Prev?.sessions),
      users: delta(ga4.users, ga4Prev?.users),
      conversions: delta(ga4.conversions, ga4Prev?.conversions),
      revenue: delta(ga4.revenue, ga4Prev?.revenue),
    } : null,
    gsc: gsc ? {
      clicks: delta(gsc.clicks, gscPrev?.clicks),
      impressions: delta(gsc.impressions, gscPrev?.impressions),
      ctr: delta(gsc.ctr, gscPrev?.ctr),
      position: (gsc.position!=null && gscPrev?.position!=null) ? (Number(gsc.position)-Number(gscPrev.position)) : null,
    } : null
  };


  // derive shares from GA4 lists if present
  const channels = g.ga4Channels?.rows || g.ga4?.channels || [];
  const srcMed = g.ga4SourceMedium?.rows || g.ga4?.sourceMedium || [];
  const totalSess = Number(ga4?.sessions || 0) || channels.reduce((a,r)=>a+Number(r.sessions||0),0) || 0;

  const findSess = (arr, key, val) => Number(arr.find(r=>String(r[key]||"").toLowerCase()===val)?.sessions || 0);
  const directSess = findSess(channels, "channel", "direct");
  const unassignedSess = findSess(channels, "channel", "unassigned");
  const notSetSess = findSess(srcMed, "sourceMedium", "(not set)");

  const directShare = totalSess ? directSess/totalSess : null;
  const unassignedShare = totalSess ? unassignedSess/totalSess : null;
  const notSetShare = totalSess ? notSetSess/totalSess : null;

  const signals = [];
  const add = (s)=>signals.push(s);

  // P0 conversions
  if(ga4 && Number(ga4.conversions||0) === 0 && Number(ga4.sessions||0) > 10){
    add({
      severity:"P0", type:"negative", source:"GA4",
      title:"Aucune conversion exploitable détectée",
      summary:"Sans conversions, l’optimisation ROI (Ads/SEO/CRO) n’est pas pilotable.",
      evidence:[{ metric:"conversions", value:String(ga4.conversions), threshold:"> 0", source:"GA4 Data API" }],
      actions:["Déclarer 2–3 Key Events (ex: generate_lead).","Tester via DebugView + Tag Assistant.","Ajouter paramètres business (lead_type, value) via dataLayer."]
    });
  }

  if(notSetShare != null && notSetShare > 0.15){
    add({
      severity:"P0", type:"negative", source:"GA4",
      title:"Attribution dégradée : (not set) élevé",
      summary:"Une part significative des sessions n’a pas de source/medium exploitable.",
      evidence:[{ metric:"notSetShare", value:pct(notSetShare), threshold:"<= 15%", source:"GA4 Data API" }],
      actions:["Normaliser les UTMs.","Contrôler redirections + referrer stripping.","Vérifier consent/cross-domain si applicable."]
    });
  }

  if(directShare != null && directShare > 0.70){
    add({
      severity:"P1", type:"negative", source:"GA4",
      title:"Dépendance au canal Direct",
      summary:"Le trafic Direct masque l’acquisition réelle et rend l’attribution fragile.",
      evidence:[{ metric:"directShare", value:pct(directShare), threshold:"< 70%", source:"GA4 Data API" }],
      actions:["Mettre une convention UTM et l’appliquer.","Exclure trafic interne + vérifier auto-tagging si Ads."]
    });
  }

  if(unassignedShare != null && unassignedShare > 0.10){
    add({
      severity:"P1", type:"negative", source:"GA4",
      title:"Canal Unassigned élevé",
      summary:"Signale des sources non reconnues ou des UTMs non standards.",
      evidence:[{ metric:"unassignedShare", value:pct(unassignedShare), threshold:"<= 10%", source:"GA4 Data API" }],
      actions:["Uniformiser utm_medium/utm_source.","Vérifier gclid/dclid et redirections."]
    });
  }

  const gtm = results?.modules?.gtmAudit || null;
  if(gtm?.audited && (gtm.collisions?.length || 0) > 0){
    add({
      severity:"P0", type:"negative", source:"GTM",
      title:"Double comptage probable (collisions d’eventName GTM)",
      summary:"Plusieurs tags envoient le même eventName, ce qui peut gonfler les événements et fausser les conversions.",
      evidence:[{ metric:"collisions", value:String(gtm.collisions.length), threshold:"0", source:"Tag Manager API" }],
      actions:["Identifier les tags en doublon et en désactiver un.","Vérifier triggers All Pages / History Change.","Re-tester en Preview GTM + DebugView GA4."]
    });
  }

  // Positive: access ok
  if(g.ga4?.ok) add({ severity:"P2", type:"positive", source:"GA4", title:"Accès GA4 validé", summary:"Les requêtes API GA4 répondent correctement.", evidence:[{metric:"status", value:"ok", threshold:"ok", source:"GA4 Data API"}], actions:["Conserver ce setup service account en lecture."]});
  if(g.gsc?.ok) add({ severity:"P2", type:"positive", source:"GSC", title:"Accès Search Console validé", summary:"Les requêtes API GSC répondent correctement.", evidence:[{metric:"status", value:"ok", threshold:"ok", source:"GSC API"}], actions:["Conserver ce setup service account en lecture."]});
  if(gtm?.audited) add({ severity:"P2", type:"positive", source:"GTM", title:"Accès GTM validé", summary:"L’API Tag Manager est accessible en lecture.", evidence:[{metric:"status", value:"ok", threshold:"ok", source:"Tag Manager API"}], actions:["Conserver ce setup Viewer."]});

  // scoring
  let tracking = 100, attribution = 100, funnel = 100, seo = 100, paid = null;

  if(ga4 && Number(ga4.conversions||0)===0 && Number(ga4.sessions||0)>10) tracking -= 25;
  if(notSetShare != null && notSetShare > 0.15) tracking -= 20;
  if(directShare != null && directShare > 0.70) tracking -= 15;
  if(gtm?.audited && (gtm.collisions?.length||0) > 0) tracking -= 15;

  if(notSetShare != null && notSetShare > 0.15) attribution -= 25;
  if(directShare != null && directShare > 0.70) attribution -= 20;
  if(unassignedShare != null && unassignedShare > 0.10) attribution -= 15;

  if(ga4 && Number(ga4.conversions||0)===0) funnel -= 40;

  // SEO KPI-driven with low-volume caps
  if(gsc){
    const impressions = Number(gsc.impressions||0);
    const position = (gsc.position==null) ? null : Number(gsc.position);
    const ctr = Number(gsc.ctr||0);

    const vol = impressions < 20 ? 40 : (impressions < 50 ? 60 : (impressions < 500 ? 75 : 90));
    const posScore = position==null ? 50 : (position <= 3 ? 90 : (position <= 10 ? 70 : 40));
    const ctrScore = ctr >= 0.05 ? 75 : (ctr >= 0.02 ? 60 : 45);

    seo = Math.round(vol*0.2 + posScore*0.4 + ctrScore*0.4);
  }else{
    seo = 50;
  }

  tracking = clamp(Math.round(tracking));
  attribution = clamp(Math.round(attribution));
  funnel = clamp(Math.round(funnel));
  seo = clamp(Math.round(seo));

  let global = Math.round(tracking*0.33 + attribution*0.22 + funnel*0.22 + seo*0.23);
  global = clamp(Math.round(global * confFactor));

  // Risk index
  let risk = 0;
  if(ga4 && Number(ga4.conversions||0)===0) risk += 30;
  if(directShare != null && directShare > 0.70) risk += 20;
  if(notSetShare != null && notSetShare > 0.15) risk += 15;
  if(gsc && Number(gsc.impressions||0) < 50) risk += 10;
  if(paid == null) risk += 10;
  risk = clamp(risk);

  const scores = { tracking, attribution, funnel, seo, paid, global, risk };

  const pillars = [
    { name:"Tracking", score:tracking, ...badge(tracking), summary: tracking>=80 ? "Instrumentation globalement stable." : "Fiabilité tracking à renforcer (P0/P1)." },
    { name:"Attribution", score:attribution, ...badge(attribution), summary: attribution>=80 ? "Attribution lisible." : "Attribution fragile (UTMs / (not set) / Direct)." },
    { name:"Funnel", score:funnel, ...badge(funnel), summary: funnel>=80 ? "Funnel pilotable." : "Funnel non pilotable sans conversions." },
    { name:"SEO", score:seo, ...badge(seo), summary: seo>=80 ? "SEO exploitable." : "SEO à confirmer (volume/deltas)." },
    { name:"GTM", score: gtm?.audited ? 80 : null, ...badge(gtm?.audited ? 80 : null), summary: gtm?.audited ? "Contrôle tags via API." : "Non audité (accès Viewer requis)." },
  ];

  const executive = (() => {
    const issues = signals.filter(s=>s.type==="negative").slice(0,2).map(s=>s.title);
    const pos = signals.filter(s=>s.type==="positive").slice(0,2).map(s=>s.title);
    const parts = [];
    if(funnel < 60) parts.push("Le site est mesurable, mais il n’est pas pilotable en ROI : les conversions exploitables ne sont pas en place.");
    else parts.push("Les fondations de mesure permettent une lecture initiale des performances.");
    if(issues.length) parts.push(`Priorités : ${issues.join(" ; ")}.`);
    if(pos.length) parts.push(`Points solides : ${pos.join(" ; ")}.`);
    if(overallConf === "low") parts.push("Prudence : volume faible sur la période, conclusions performance à confirmer.");
    return parts.join(" ");
  })();

  const plan = [];
  for(const s of signals.filter(s=>s.type==="negative" && s.severity==="P0").slice(0,4)){
    plan.push({ horizon:"0–7j", priority:"P0", action:(s.actions?.[0]||s.title), owner:"Tracking", effort:"M", impact:"High" });
  }
  for(const s of signals.filter(s=>s.type==="negative" && s.severity==="P1").slice(0,4)){
    plan.push({ horizon:"30j", priority:"P1", action:(s.actions?.[0]||s.title), owner:"Growth", effort:"M", impact:"Medium" });
  }
  plan.push({ horizon:"90j", priority:"P2", action:"Mettre en place un cycle d’amélioration (sanity checks hebdo, CRO/SEO itératif).", owner:"Growth", effort:"M", impact:"Medium" });

  const closingSummary = `État global : ${badge(global).label} (score ${global}). Priorité absolue : conversions (Key Events) + attribution (UTM). Risque : pilotage ROI impossible tant que les conversions ne sont pas fiables.`;

  const glossary = [
    { term:"GA4", definition:"Google Analytics 4 — mesure du trafic et des événements."},
    { term:"GSC", definition:"Google Search Console — performance SEO (clics, impressions, CTR, position)."},
    { term:"GTM", definition:"Google Tag Manager — gestion des tags et déclencheurs."},
    { term:"CTR", definition:"Click-through rate — clics / impressions."},
    { term:"(not set)", definition:"Valeur manquante, signe d’attribution dégradée."},
    { term:"Key event", definition:"Événement marqué comme conversion dans GA4."},
  ];

  const methodology = `Sources: GA4 Data API, Search Console API, Tag Manager API (si accès). Périodes: 30j (N) vs 30j-1. Confidence: ${overallConf}.`;

  return {
    cabinetVersion: "v22.1",
    periods: g?.ga4?.range ? { N: g.ga4.range, N_1: g.ga4.prevRange } : null,
    confidence: { ga4: confGa4, gsc: confGsc, gtm: confGtm, overall: overallConf, index: confidenceIndex },
    deltas,
    scores,
    pillars,
    signals,
    plan,
    closingSummary,
    executive,
    glossary,
    methodology
  };
}
