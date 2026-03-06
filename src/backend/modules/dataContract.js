/**
 * STRATADS BACKEND - DATA CONTRACT V3
 * Contrat de données unifié pour tous les modes d'audit
 * Règles: zéro NaN/undefined, valeurs manquantes = "Non disponible"
 */

const DataContract = {
  version: '3.0.0',
  
  // Modèles de données par section
  schemas: {
    meta: {
      url: '',
      company: '',
      auditType: 'fast', // fast | public | private | full
      date: '',
      version: '3.0.0',
      duration: 0 // secondes
    },
    
    scores: {
      global: 0,
      technical: 0,
      marketing: 0,
      data: 0, // PRIVATE/FULL only
      maturity: 'Débutant' // Débutant | Intermédiaire | Avancé
    },
    
    technical: {
      crawl: {
        pagesAnalyzed: 0,
        pages: [],
        errors: [],
        redirects: [],
        canonicals: [],
        robots: { present: false, url: '', valid: false },
        sitemap: { present: false, url: '', valid: false },
        securityHeaders: { hsts: false, csp: false, xframe: false, xcontent: false, raw: {} }
      },
      performance: {
        loadTime: 0,
        fcp: 'Non disponible', // First Contentful Paint
        lcp: 'Non disponible', // Largest Contentful Paint
        cls: 'Non disponible', // Cumulative Layout Shift
        ttfb: 'Non disponible', // Time to First Byte
        grade: 'C' // A | B | C | D | F
      },
      seo: {
        indexability: { score: 0, issues: [] },
        title: { present: false, optimal: false, text: '' },
        meta: { present: false, optimal: false, description: '' },
        headings: { h1: 0, h2: 0, h3: 0 },
        schema: { present: false, types: [] },
        hreflang: { present: false, tags: [] }
      },
      security: {
        https: false,
        headers: {
          hsts: false,
          csp: false,
          xframe: false
        }
      }
    },
    
    marketing: {
      tracking: {
        gtm: { present: false, containerId: '' },
        ga4: { present: false, propertyId: '' },
        meta: { present: false, pixelId: '' },
        tiktok: { present: false, pixelId: '' },
        linkedin: { present: false, insightTag: false },
        googleAds: { present: false, conversionTracking: false },
        detected: []
      },
      conversion: {
        ctas: { count: 0, elements: [], score: 0 },
        forms: { count: 0, elements: [], score: 0 },
        friction: { score: 0, issues: [] },
        heuristicScore: 0
      },
      elements: {
        hasCTA: false,
        hasForms: false,
        hasPhone: false,
        hasEmail: false,
        hasChat: false
      }
    },
    
    privateData: {
      // PRIVATE/FULL only - API integrations
      ga4: {
        status: 'error', // ok | error
        property: { name: '', id: '' },
        dateRange: '',
        metrics: {
          sessions: 0,
          conversions: 0,
          revenue: 0
        },
        topPages: [],
        channels: [],
        evidence: '',
        confidence: 'LOW' // LOW | MEDIUM | HIGH
      },
      gsc: {
        status: 'error',
        site: { url: '', permissionLevel: '' },
        dateRange: '',
        metrics: {
          clicks: 0,
          impressions: 0,
          ctr: 0,
          position: 0
        },
        topQueries: [],
        topPages: [],
        evidence: '',
        confidence: 'LOW'
      },
      gtm: {
        status: 'error',
        account: { name: '', id: '' },
        container: { name: '', id: '', version: '' },
        tags: {
          total: 0,
          statusCounts: { enabled: 0, disabled: 0, paused: 0 },
          issues: []
        },
        triggers: {
          total: 0,
          typeCounts: {},
          issues: []
        },
        variables: {
          total: 0,
          typeCounts: {},
          issues: []
        },
        evidence: '',
        confidence: 'LOW'
      },
      googleAds: {
        status: 'error',
        customerId: '',
        dateRange: '',
        metrics: {
          cost: 0,
          clicks: 0,
          impressions: 0,
          conversions: 0,
          value: 0,
          ctr: 0,
          cpc: 0,
          cpa: 0,
          roas: 0
        },
        topCampaigns: [],
        topAdGroups: [],
        topSearchQueries: [],
        evidence: '',
        confidence: 'LOW'
      },
      metaAds: {
        status: 'error',
        account: { name: '', id: '', status: '' },
        dateRange: '',
        metrics: {
          spend: 0,
          clicks: 0,
          impressions: 0,
          conversions: 0,
          value: 0,
          ctr: 0,
          cpc: 0,
          cpa: 0,
          roas: 0
        },
        topCampaigns: [],
        topAdSets: [],
        topAds: [],
        evidence: '',
        confidence: 'LOW'
      },
      kpis: {
        roas: 'Non disponible',
        cpa: 'Non disponible',
        cpc: 'Non disponible',
        cpm: 'Non disponible',
        ctr: 'Non disponible',
        cr: 'Non disponible'
      }
    },
    
    ads: {
      csv: {
        google: { imported: false, campaigns: [], totals: {}, error: null },
        meta: { imported: false, campaigns: [], totals: {}, error: null }
      },
      api: {
        google: { status: 'error', campaigns: [], totals: {}, error: null },
        meta: { status: 'error', campaigns: [], totals: {}, error: null }
      },
      normalized: {
        campaigns: [],
        totals: { impressions: 0, clicks: 0, spend: 0, conversions: 0, value: 0 },
        kpis: { roas: null, cpa: null, cpc: null, ctr: null, cr: null }
      },
      kpis: {
        roas: 'Non disponible',
        cpa: 'Non disponible',
        cpc: 'Non disponible',
        cpm: 'Non disponible',
        ctr: 'Non disponible',
        cr: 'Non disponible'
      }
    },
    
    recommendations: {
      item: {
        id: '',
        priority: 'Moyenne', // Haute | Moyenne | Basse
        category: '',
        action: '',
        why: '',
        impact: '',
        effort: 'Moyen', // Faible | Moyen | Élevé
        gain: '', // qualitatif
        status: 'À faire' // À faire | En cours | Fait
      }
    },
    
    roadmap: {
      quick: [], // 0-30j
      medium: [], // 30-90j
      long: [] // 90-180j
    },

    dataAvailability: {
      sources: [],
      coverage: 0,
      lastUpdated: '',
      missing: [],
      confidence: 'LOW'
    },

    metricsConfig: {
      averageConversionValue: null, // €
    },

    qualityGate: {
      passed: false,
      dataCoverage: 0,
      confidenceLevel: 'LOW',
      sourcesUsed: [],
      issues: [],
      scoreAdjustments: [],
      forecastBlockedReason: null,
      validationDate: ''
    },

    evidence: [],

    unifiedData: {
      traffic: { sources: [], total: 0, byChannel: {} },
      conversions: { total: 0, bySource: {} },
      revenue: { total: 0, bySource: {} },
      keywords: { top: [], count: 0 },
      pages: { top: [], performance: [] }
    },

    forecast: {}
  },

  forecastTemplate: {
    dataStatus: 'non mesuré',
    settings: {
      period: '3m',
      optimizationType: 'full_growth',
      effort: 'modéré',
      budget: null,
      sector: ''
    },
    baselineTraffic: 0,
    projectedTrafficLow: 0,
    projectedTrafficBase: 0,
    projectedTrafficHigh: 0,
    projectedConversions: {
      baseline: 0,
      low: 0,
      base: 0,
      high: 0
    },
    trafficForecast: {
      labels: [],
      baseline: [],
      low: [],
      base: [],
      high: []
    },
    conversionForecast: {
      labels: [],
      baseline: [],
      projected: []
    },
    performanceImpact: {
      scoreGain: 0,
      lcpGain: 0,
      clsGain: 0,
      ttfbGain: 0
    },
    roiEstimate: {
      budget: null,
      estimatedRevenueIncrease: null,
      estimatedROI: null,
      paybackPeriod: 'Non disponible'
    },
    confidenceScore: 'LOW',
    assumptions: []
  },

  initForecastSchema() {
    this.schemas.forecast = { ...this.forecastTemplate };
  },
  
  // Fonctions de normalisation
  normalize(value, defaultValue = 'Non disponible') {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return defaultValue;
    }
    return value;
  },
  
  normalizeNumber(value, defaultValue = 0) {
    const num = Number(value);
    if (Number.isNaN(num) || !Number.isFinite(num)) {
      return defaultValue;
    }
    return num;
  },
  
  // Créer une structure vide conforme
  createEmpty(auditType = 'fast', url = '', company = '') {
    const now = new Date().toISOString();
    
    return {
      meta: {
        url: this.normalize(url),
        company: this.normalize(company),
        auditType: this.normalize(auditType, 'fast'),
        date: now,
        version: this.version,
        duration: 0,
        scope: {
          sampledPages: [],
          totalPages: 0,
          crawlLimit: this.getCrawlLimit(auditType)
        }
      },
      scores: {
        global: 0,
        technical: 0,
        marketing: 0,
        data: auditType === 'private' || auditType === 'full' ? 0 : undefined,
        maturity: 'Débutant'
      },
      technical: this.schemas.technical,
      marketing: this.schemas.marketing,
      data: auditType === 'private' || auditType === 'full' ? this.schemas.privateData : undefined,
      ads: { ...this.schemas.ads },
      recommendations: [],
      roadmap: { quick: [], medium: [], long: [] },
      dataAvailability: { ...this.schemas.dataAvailability },
      metricsConfig: { ...this.schemas.metricsConfig },
      qualityGate: { ...this.schemas.qualityGate },
      evidence: [],
      unifiedData: { ...this.schemas.unifiedData },
      forecast: { ...this.forecastTemplate }
    };
  },
  
  // Valider et nettoyer un résultat
  validate(result) {
    const cleaned = JSON.parse(JSON.stringify(result)); // Deep clone
    
    // S'assurer que tous les champs numériques sont valides
    const cleanNumeric = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'number' && Number.isNaN(obj[key])) {
          obj[key] = 0;
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          cleanNumeric(obj[key]);
        }
      }
    };
    
    cleanNumeric(cleaned);
    return cleaned;
  },

  // Get crawl limit by audit type
  getCrawlLimit(auditType) {
    const limits = {
      fast: 20,
      public: 200,
      private: 200,
      full: 1000
    };
    return limits[auditType] || 20;
  }
};

DataContract.initForecastSchema();

module.exports = { DataContract };
