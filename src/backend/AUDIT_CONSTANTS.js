/**
 * STRATADS AUDIT ENGINE - Constants and Global Rules
 * 
 * Ce fichier définit les constantes et règles globales qui doivent être respectées
 * par tous les modules du moteur d'audit StratAds.
 */

// STATUTS DES DONNÉES
const DATA_STATUS = {
  DETECTED: 'Détecté',
  NOT_DETECTED: 'Non détecté', 
  NOT_VERIFIABLE: 'Non vérifiable'
};

// MESSAGES GÉNÉRIQUES INTERDITS
const FORBIDDEN_PHRASES = [
  'Améliorer le marketing',
  'Optimiser le SEO',
  'Améliorer le tracking', 
  'Augmenter les conversions',
  'Améliorer la performance',
  'Optimiser le site'
];

// MESSAGES PAR DÉFAUT QUAND DONNÉE INDISPONIBLE
const DEFAULT_MESSAGES = {
  NOT_ANALYZED: 'Non analysé dans ce mode',
  NOT_AVAILABLE: 'Non disponible',
  NOT_VERIFIABLE: 'Non vérifiable',
  NO_DATA: 'Aucune donnée collectée'
};

// STRUCTURE O-P-I-R POUR LES DIAGNOSTICS
const DIAGNOSTIC_STRUCTURE = {
  OBSERVATION: 'Observation',
  PROOF: 'Preuve', 
  IMPACT: 'Impact business',
  RECOMMENDATION: 'Recommandation'
};

// RÈGLES ANTI FAUX POSITIFS
const ANTI_FALSE_POSITIVE_RULES = {
  // Si GTM détecté, ne pas conclure absence de GA4
  GTM_GA4: {
    condition: 'gtm.present',
    conclusion: 'GA4 non visible dans le code source. Peut être déployé via Google Tag Manager.'
  },
  // Si CDN détecté, ne pas conclure absence de serveur optimisé
  CDN_SERVER: {
    condition: 'cdn.present', 
    conclusion: 'CDN détecté mais configuration serveur non vérifiable.'
  }
};

// SEUILS DE SCORES
const SCORE_THRESHOLDS = {
  TRACKING: {
    GOOD: 70,
    MEDIUM: 50,
    LOW: 30
  },
  PERFORMANCE: {
    GOOD: 70,
    MEDIUM: 50, 
    LOW: 30
  },
  SEO: {
    GOOD: 70,
    MEDIUM: 50,
    LOW: 30
  },
  CONVERSION: {
    GOOD: 70,
    MEDIUM: 50,
    LOW: 30
  }
};

// TEMPLATES D'INSIGHTS BUSINESS
const BUSINESS_INSIGHT_TEMPLATES = {
  TRACKING_INCOMPLETE: 'Tracking analytics incomplet : absence d\'outil de mesure visible empêchant l\'analyse précise des performances',
  TRACKING_ABSENT: 'Absence de tracking analytics : impossible de mesurer le ROI des campagnes marketing',
  PERFORMANCE_POOR: 'Performance web sous-optimale : risque de perte de trafic et d\'expérience utilisateur dégradée',
  PERFORMANCE_SLOW: 'Performance web faible : temps de chargement élevé risquant d\'augmenter le taux de rebond',
  CONVERSION_NO_CTA: 'Absence d\'appels à l\'action : parcours client non optimé limitant la génération de leads',
  CONVERSION_NO_FORMS: 'Parcours conversion incomplet : absence de formulaires de contact réduisant la collecte de prospects',
  SEO_INCOMPLETE: 'Structure SEO incomplète : impact négatif sur la visibilité et le trafic organique',
  SECURITY_HTTP: 'Site non sécurisé (HTTP) : risque de perte de confiance utilisateur et impact SEO négatif',
  
  // OPPORTUNITÉS
  GTM_OPPORTUNITY: 'Google Tag Manager détecté : infrastructure déjà en place pour déploiement rapide des outils marketing',
  MULTIPLE_CTA_OPPORTUNITY: 'Plusieurs points d\'entrée détectés : optimisation possible du taux de conversion avec A/B testing',
  HTTPS_OPPORTUNITY: 'Site sécurisé HTTPS : avantage pour la confiance utilisateur et le référencement naturel',
  GOOD_PERFORMANCE_OPPORTUNITY: 'Excellentes performances web : atout majeur pour l\'expérience utilisateur et le référencement',
  SEO_GOOD_OPPORTUNITY: 'Fondements SEO solides : potentiel d\'amélioration du trafic organique',
  TECHNOLOGY_OPPORTUNITY: 'Technologie moderne détectée : agilité pour les évolutions futures'
};

// VALIDATION RULES
const VALIDATION_RULES = {
  // Chaque insight doit être basé sur une donnée détectée
  INSIGHT_MUST_HAVE_DATA: true,
  // Les scores doivent être cohérents avec les preuves
  SCORES_MUST_MATCH_PROOFS: true,
  // Pas de phrases génériques
  NO_GENERIC_PHRASES: true,
  // Les preuves doivent être vérifiables
  PROOFS_MUST_BE_VERIFIABLE: true
};

/**
 * Fonction utilitaire pour valider qu'un insight respecte les règles
 */
function validateInsight(insight, dataSource) {
  const errors = [];
  
  // Vérifier que l'insight n'est pas une phrase générique
  if (FORBIDDEN_PHRASES.some(phrase => insight.includes(phrase))) {
    errors.push('Insight contient une phrase générique interdite');
  }
  
  // Vérifier que l'insight est basé sur des données
  if (!dataSource || Object.keys(dataSource).length === 0) {
    errors.push('Insight non basé sur des données détectées');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Fonction utilitaire pour générer un message par défaut
 */
function getDefaultMessage(type) {
  return DEFAULT_MESSAGES[type] || DEFAULT_MESSAGES.NOT_AVAILABLE;
}

module.exports = {
  DATA_STATUS,
  FORBIDDEN_PHRASES,
  DEFAULT_MESSAGES,
  DIAGNOSTIC_STRUCTURE,
  ANTI_FALSE_POSITIVE_RULES,
  SCORE_THRESHOLDS,
  BUSINESS_INSIGHT_TEMPLATES,
  VALIDATION_RULES,
  validateInsight,
  getDefaultMessage
};
