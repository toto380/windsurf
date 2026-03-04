/**
 * Smart Recommendations Engine
 * Generates actionable recommendations based on computed metrics and data.
 *
 * Rules are evaluated deterministically — no ML, pure logic.
 * Each recommendation includes: id, title, priority, proof, action, roi, effort.
 */

// ---------------------------------------------------------------------------
// Priority levels
// ---------------------------------------------------------------------------
export const PRIORITY = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

// ---------------------------------------------------------------------------
// Rule evaluators
// ---------------------------------------------------------------------------

/**
 * Evaluate all rules against the provided metrics context.
 *
 * @param {object} ctx - metrics context:
 *   {
 *     roas?: number|null,                    // overall ROAS
 *     convRate?: number|null,                // overall conv rate (%)
 *     cpa?: number|null,                     // overall CPA
 *     cacTarget?: number|null,               // target CAC
 *     ltvCACRatio?: number|null,             // LTV/CAC
 *     mobileConvRate?: number|null,          // mobile conv rate (%)
 *     desktopConvRate?: number|null,         // desktop conv rate (%)
 *     pctConvMissingAttribution?: number|null, // % conversions w/o source/medium
 *     dataFreshnessDays?: number|null,       // days since last data update
 *     campaigns?: object[],                  // enriched campaign array
 *     channels?: object[],                   // enriched channel array
 *     ga4DataAvailable?: boolean,
 *     adsDataAvailable?: boolean,
 *   }
 * @returns {object[]} sorted recommendations (CRITICAL first)
 */
export function buildSmartRecommendations(ctx = {}) {
  const recs = [];

  function add(id, title, priority, proof, action, roi = null, effort = "M") {
    recs.push({ id, title, priority, proof, action, roi, effort });
  }

  // ── ROAS rules ────────────────────────────────────────────────────────────
  const roas = ctx.roas ?? null;
  if (roas !== null && roas < 1.0) {
    add(
      "roas_negative",
      "ROAS < 1 : dépenses supérieures aux revenus générés",
      PRIORITY.CRITICAL,
      `ROAS actuel : ${roas.toFixed(2)}x — chaque €1 dépensé génère €${roas.toFixed(2)} de revenus.`,
      "Auditer toutes les campagnes, pauser les segments non rentables, revoir offre/audience/créas.",
      "Récupération immédiate du budget gaspillé",
      "S"
    );
  } else if (roas !== null && roas < 1.5) {
    add(
      "roas_low",
      "ROAS faible (< 1.5) : rentabilité insuffisante",
      PRIORITY.HIGH,
      `ROAS actuel : ${roas.toFixed(2)}x (cible recommandée : ≥ 3.5x).`,
      "Pauser ou tester de nouveaux créatifs sur les campagnes ROAS < 1.5. Réallouer budget vers meilleures campagnes.",
      "Réduction du budget gaspillé, amélioration du ROAS global",
      "M"
    );
  }

  // ── Conversion Rate rules ─────────────────────────────────────────────────
  const convRate = ctx.convRate ?? null;
  const convBenchmark = ctx.convRateBenchmark ?? 2.5;
  if (convRate !== null && convRate < convBenchmark * 0.5) {
    add(
      "conv_rate_low",
      `Taux de conversion très bas (${convRate.toFixed(1)}% vs benchmark ${convBenchmark}%)`,
      PRIORITY.HIGH,
      `Conv. rate : ${convRate.toFixed(1)}% — moins de la moitié du benchmark secteur (${convBenchmark}%).`,
      "Audit UX des landing pages, simplification du tunnel, tests A/B sur CTA et formulaires.",
      `+${(convBenchmark - convRate).toFixed(1)}% conv rate = revenus additionnels significatifs`,
      "M"
    );
  }

  // ── CPA / CAC target rules ────────────────────────────────────────────────
  const cpa = ctx.cpa ?? null;
  const cacTarget = ctx.cacTarget ?? null;
  if (cpa !== null && cacTarget !== null && cpa > cacTarget * 1.2) {
    add(
      "cpa_above_target",
      `CPA au-dessus de la cible (€${cpa.toFixed(0)} vs cible €${cacTarget.toFixed(0)})`,
      PRIORITY.MEDIUM,
      `CPA actuel : €${cpa.toFixed(0)} — dépasse de ${Math.round(((cpa - cacTarget) / cacTarget) * 100)}% la cible fixée.`,
      "Réduire les enchères sur les campagnes CPA élevé OU améliorer les landing pages pour augmenter le taux de conversion.",
      `Économie potentielle : €${(cpa - cacTarget).toFixed(0)}/conversion`,
      "M"
    );
  }

  // ── LTV/CAC rules ─────────────────────────────────────────────────────────
  const ltvCAC = ctx.ltvCACRatio ?? null;
  if (ltvCAC !== null && ltvCAC < 3) {
    add(
      "ltv_cac_low",
      `LTV/CAC ratio insuffisant (${ltvCAC.toFixed(1)}x — cible : ≥ 3x)`,
      PRIORITY.CRITICAL,
      `LTV/CAC : ${ltvCAC.toFixed(1)}x — en dessous du seuil critique de 3x.`,
      "Améliorer la rétention client (emails post-achat, fidélisation) ET/OU réduire le CAC via un meilleur tracking/ciblage.",
      "Santé économique de l'acquisition à long terme",
      "L"
    );
  }

  // ── Mobile vs Desktop gap ─────────────────────────────────────────────────
  const mobileCR = ctx.mobileConvRate ?? null;
  const desktopCR = ctx.desktopConvRate ?? null;
  if (mobileCR !== null && desktopCR !== null && desktopCR > 0) {
    if (mobileCR < desktopCR * 0.75) {
      add(
        "mobile_gap",
        `Écart mobile/desktop : mobile ${mobileCR.toFixed(1)}% vs desktop ${desktopCR.toFixed(1)}%`,
        PRIORITY.HIGH,
        `Mobile : ${mobileCR.toFixed(1)}% conv — Desktop : ${desktopCR.toFixed(1)}% conv. Écart de ${((desktopCR - mobileCR) / desktopCR * 100).toFixed(0)}%.`,
        "Audit UX mobile complet : vitesse de chargement, formulaires adaptatifs, CTA visibles, checkout mobile-first.",
        "Récupération de ~30% du trafic mobile non converti",
        "M"
      );
    }
  }

  // ── Attribution gap ───────────────────────────────────────────────────────
  const pctMissing = ctx.pctConvMissingAttribution ?? null;
  if (pctMissing !== null && pctMissing > 25) {
    add(
      "attribution_incomplete",
      `Attribution incomplète : ${pctMissing.toFixed(0)}% des conversions sans source/medium`,
      PRIORITY.CRITICAL,
      `${pctMissing.toFixed(0)}% des conversions n'ont pas de données source/medium — allocation budget aveugle.`,
      "Implémenter GA4 Enhanced Conversions + standardiser les UTMs sur toutes les campagnes.",
      "+15-25% de précision ROAS, meilleure allocation budget",
      "S"
    );
  }

  // ── Data freshness ────────────────────────────────────────────────────────
  const freshness = ctx.dataFreshnessDays ?? null;
  if (freshness !== null && freshness > 2) {
    add(
      "data_stale",
      `Données obsolètes : dernier update il y a ${freshness} jour(s)`,
      PRIORITY.MEDIUM,
      `Les données ont ${freshness} jours — les décisions media peuvent être basées sur des informations périmées.`,
      "Vérifier le pipeline de données GA4/Ads, activer les rapports automatiques quotidiens.",
      "Décisions media plus réactives et précises",
      "S"
    );
  }

  // ── Campaign-level rules ──────────────────────────────────────────────────
  const campaigns = ctx.campaigns ?? [];
  const killCampaigns = campaigns.filter(c => c.badge === "KILL");
  const pauseCampaigns = campaigns.filter(c => c.badge === "PAUSE");
  const scaleCampaigns = campaigns.filter(c => c.badge === "SCALE");

  if (killCampaigns.length > 0) {
    const wastedBudget = killCampaigns.reduce((s, c) => s + (Number(c.cost) || 0), 0);
    add(
      "campaigns_kill",
      `${killCampaigns.length} campagne(s) à couper (ROAS < 1) — budget gaspillé`,
      PRIORITY.HIGH,
      `Campagnes à couper : ${killCampaigns.map(c => c.name).join(", ")} — Budget mensuel estimé : €${wastedBudget.toFixed(0)}.`,
      "Pauser immédiatement ces campagnes. Réallouer le budget aux campagnes SCALE.",
      `Récupération potentielle : €${wastedBudget.toFixed(0)}/mois`,
      "S"
    );
  }

  if (pauseCampaigns.length > 0 && scaleCampaigns.length > 0) {
    add(
      "campaigns_rebalance",
      `Rééquilibrage budget : ${pauseCampaigns.length} campagne(s) PAUSE → ${scaleCampaigns.length} SCALE`,
      PRIORITY.MEDIUM,
      `${pauseCampaigns.length} campagne(s) avec ROAS < 2x. ${scaleCampaigns.length} campagne(s) avec ROAS ≥ 3x sous-financée(s).`,
      `Réduire le budget des campagnes : ${pauseCampaigns.slice(0, 3).map(c => c.name).join(", ")}. Augmenter pour : ${scaleCampaigns.slice(0, 3).map(c => c.name).join(", ")}.`,
      "Amélioration du ROAS global sans augmenter le budget total",
      "S"
    );
  }

  // ── No Ads data ───────────────────────────────────────────────────────────
  if (!ctx.adsDataAvailable) {
    add(
      "no_ads_data",
      "Données Ads non disponibles — pilotage ROAS impossible",
      PRIORITY.HIGH,
      "Aucune donnée Google Ads / Meta Ads importée dans ce rapport.",
      "Exporter les données Ads (Google Ads CSV ou Meta Ads CSV) et réimporter dans l'outil.",
      "Visibilité complète sur le ROI des campagnes payantes",
      "S"
    );
  }

  // ── No GA4 data ───────────────────────────────────────────────────────────
  if (!ctx.ga4DataAvailable) {
    add(
      "no_ga4_data",
      "Données GA4 non disponibles — analyse de trafic limitée",
      PRIORITY.MEDIUM,
      "Aucune donnée GA4 disponible (accès service account requis).",
      "Configurer l'accès GA4 via service account pour obtenir les données de trafic et de conversion.",
      "Analyse complète des canaux, entonnoirs et conversions",
      "M"
    );
  }

  // Sort: CRITICAL > HIGH > MEDIUM > LOW
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  recs.sort((a, b) => (order[a.priority] ?? 99) - (order[b.priority] ?? 99));

  return recs;
}
