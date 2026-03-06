/**
 * STRATADS - TRACKING MODULE
 * Détection GTM, GA4, Meta Pixel, TikTok, LinkedIn
 * Sans OAuth - uniquement détection côté client
 */

const { chromium } = require('playwright');
const { DATA_STATUS, BUSINESS_INSIGHT_TEMPLATES, ANTI_FALSE_POSITIVE_RULES } = require('../AUDIT_CONSTANTS.js');

class TrackingAnalyzer {
  constructor(url) {
    this.url = url;
    this.results = {
      gtm: { present: false, containerId: '' },
      ga4: { present: false, confirmed: false, viaGTM: false, propertyId: '', measurementId: '' },
      meta: { present: false, pixelId: '' },
      tiktok: { present: false, pixelId: '' },
      linkedin: { present: false, insightTag: false },
      googleAds: { present: false, conversionTracking: false },
      hotjar: { present: false },
      clarity: { present: false },
      detected: [],
      score: 0,
      // Nouveaux champs pour le master prompt
      detectedTools: {},
      evidence: {},
      notConfirmed: [],
      contradictions: [],
      verdict: ''
    };
  }

  async analyze() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    try {
      // NOUVEAU: Stratégie de timeout adaptatif
      let response = null;
      
      // Phase 1: 15s avec domcontentloaded (rapide)
      try {
        response = await page.goto(this.url, { 
          waitUntil: 'domcontentloaded',
          timeout: 15000 
        });
        console.log('[Tracking] Phase 1 réussie - domcontentloaded');
      } catch (error1) {
        console.log('[Tracking] Phase 1 échouée, tentative Phase 2...');
        
        // Phase 2: 30s avec networkidle (standard)
        try {
          response = await page.goto(this.url, { 
            waitUntil: 'networkidle',
            timeout: 30000 
          });
          console.log('[Tracking] Phase 2 réussie - networkidle');
        } catch (error2) {
          console.log('[Tracking] Phase 2 échouée, tentative Phase 3...');
          
          // Phase 3: 60s avec load (dernier recours)
          try {
            response = await page.goto(this.url, { 
              waitUntil: 'load',
              timeout: 60000 
            });
            console.log('[Tracking] Phase 3 réussie - load');
          } catch (error3) {
            console.error('[Tracking] Toutes les phases échouées, utilisation des métriques partielles');
            throw new Error(`Timeout adaptatif échoué: ${error3.message}`);
          }
        }
      }

      // Attendre un peu pour que les scripts se chargent
      await page.waitForTimeout(2000);

      // Analyser tous les trackers
      const trackingData = await page.evaluate(() => {
        const data = {
          gtm: { present: false, containerId: '' },
          ga4: { present: false, measurementId: '' },
          meta: { present: false, pixelId: '' },
          tiktok: { present: false, pixelId: '' },
          linkedin: { present: false },
          googleAds: { present: false },
          hotjar: { present: false },
          clarity: { present: false },
          cookies: [],
          scripts: []
        };

        // 1. Google Tag Manager
        if (window.dataLayer || window.google_tag_manager) {
          data.gtm.present = true;
          // Essayer d'extraire le GTM ID
          const gtmScript = document.querySelector('script[src*="gtm.js"]');
          if (gtmScript) {
            const match = gtmScript.src.match(/id=([A-Z0-9-]+)/);
            if (match) data.gtm.containerId = match[1];
          }
          // Alternative: chercher dans tous les scripts
          if (!data.gtm.containerId) {
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
              const match = script.textContent?.match(/GTM-[A-Z0-9]+/);
              if (match) {
                data.gtm.containerId = match[0];
                break;
              }
            }
          }
        }

        // 2. Google Analytics 4 - avec distinction CONFIRMED vs POSSIBLE VIA GTM
        const hasGtag = window.gtag || window.ga;
        const gtagConfigMatch = hasGtag;
        
        if (hasGtag) {
          data.ga4.present = true;
          data.ga4.confirmed = true;
          data.ga4.viaGTM = false;
          
          // Chercher le measurement ID
          const gaScripts = document.querySelectorAll('script');
          for (const script of gaScripts) {
            const match = script.textContent?.match(/G-[A-Z0-9]{10,}/);
            if (match) {
              data.ga4.measurementId = match[0];
              break;
            }
          }
          if (!data.ga4.measurementId) {
            for (const script of gaScripts) {
              const match = script.src?.match(/G-[A-Z0-9]{10,}/);
              if (match) {
                data.ga4.measurementId = match[0];
                break;
              }
            }
          }
        } else if (data.gtm.present) {
          // GA4 non visible mais GTM présent = POSSIBLE
          data.ga4.present = false;
          data.ga4.confirmed = false;
          data.ga4.viaGTM = true;  // GA4 = POSSIBLE VIA GTM
        }

        // 3. Meta/Facebook Pixel
        if (window.fbq || window._fbq) {
          data.meta.present = true;
          // Chercher le Pixel ID
          const scripts = document.querySelectorAll('script');
          for (const script of scripts) {
            const match = script.textContent?.match(/fbq\('init',\s*['"](\d+)['"]/);
            if (match) {
              data.meta.pixelId = match[1];
              break;
            }
          }
        }

        // 4. TikTok Pixel
        if (window.ttq || window._ttq) {
          data.tiktok.present = true;
          const scripts = document.querySelectorAll('script');
          for (const script of scripts) {
            const match = script.textContent?.match(/ttq\.load\(['"]([A-Z0-9]+)['"]/i);
            if (match) {
              data.tiktok.pixelId = match[1];
              break;
            }
          }
        }

        // 5. LinkedIn Insight Tag
        if (window._linkedin_data_partner_id || window.lintrk) {
          data.linkedin.present = true;
        }

        // 6. Google Ads Conversion Tracking
        if (window.gtag && window.gtag !== window.ga) {
          data.googleAds.present = true;
          // Vérifier si conversion tracking est configuré
          const scripts = document.querySelectorAll('script');
          for (const script of scripts) {
            if (script.textContent?.includes('conversion') || 
                script.textContent?.includes('AW-')) {
              data.googleAds.conversionTracking = true;
              break;
            }
          }
        }

        // 7. Hotjar
        if (window.hj || window._hjSettings) {
          data.hotjar.present = true;
        }

        // 8. Microsoft Clarity
        if (window.clarity || window._clarity) {
          data.clarity.present = true;
        }

        // Lister les cookies de tracking
        data.cookies = document.cookie.split(';')
          .map(c => c.trim().split('=')[0])
          .filter(c => c.length > 0)
          .slice(0, 20);

        // Lister les domaines de scripts externes
        const allScripts = document.querySelectorAll('script[src]');
        data.scripts = Array.from(allScripts)
          .map(s => {
            try {
              return new URL(s.src).hostname;
            } catch {
              return '';
            }
          })
          .filter(h => h && h !== window.location.hostname)
          .filter((v, i, a) => a.indexOf(v) === i)
          .slice(0, 10);

        return data;
      });

      // Fusionner les résultats
      this.results.gtm = trackingData.gtm;
      this.results.ga4 = trackingData.ga4;
      this.results.meta = trackingData.meta;
      this.results.tiktok = trackingData.tiktok;
      this.results.linkedin = { present: trackingData.linkedin.present, insightTag: trackingData.linkedin.present };
      this.results.googleAds = trackingData.googleAds;
      this.results.hotjar = trackingData.hotjar;
      this.results.clarity = trackingData.clarity;

      // Construire la liste des trackers détectés
      this.buildDetectedList();
      
      // Calculer le score
      this.calculateScore();

    } catch (error) {
      console.error('[Tracking]', error.message);
      this.results.error = error.message;
    } finally {
      await browser.close();
    }

    return this.results;
  }

  buildDetectedList() {
    const detected = [];
    
    if (this.results.gtm.present) detected.push('Google Tag Manager');
    if (this.results.ga4.present) detected.push('Google Analytics 4');
    if (this.results.meta.present) detected.push('Meta Pixel');
    if (this.results.tiktok.present) detected.push('TikTok Pixel');
    if (this.results.linkedin.present) detected.push('LinkedIn Insight');
    if (this.results.googleAds.present) detected.push('Google Ads');
    if (this.results.hotjar.present) detected.push('Hotjar');
    if (this.results.clarity.present) detected.push('Microsoft Clarity');
    
    this.results.detected = detected;
  }

  calculateScore(networkHits = { ga4: false, events: false }) {
    let score = 0;
    let hasGA4OrGTM = false;
    
    // +20 GTM détecté
    if (this.results.gtm.present) {
      score += 20;
      hasGA4OrGTM = true;
    }
    
    // +30 GA4 visible (dans le HTML)
    if (this.results.ga4.present && this.results.ga4.confirmed) {
      score += 30;
      hasGA4OrGTM = true;
    }
    // Si GA4 possible via GTM, on compte partiellement
    else if (this.results.ga4.viaGTM) {
      score += 15; // Score réduit car non confirmé
      hasGA4OrGTM = true;
    }
    
    // +40 hit réseau GA4 confirmé
    if (networkHits.ga4) {
      score += 40;
    }
    
    // +10 événements détectés
    if (networkHits.events) {
      score += 10;
    }
    
    // Règle: si uniquement GTM présent (sans GA4 confirmé), score max = 40
    if (this.results.gtm.present && !this.results.ga4.confirmed && !networkHits.ga4) {
      score = Math.min(40, score);
    }
    
    this.results.score = Math.min(100, score);
    
    // Générer le verdict
    this.generateVerdict(networkHits);
  }

  getRecommendations() {
    const recs = [];
    
    // NOUVEAU: Si GTM présent, ne pas recommander "Installer GA4"
    if (!this.results.ga4.present && !this.results.gtm.present) {
      recs.push({
        priority: 'Haute',
        category: 'Tracking',
        action: 'Installer Google Analytics 4',
        why: 'Mesure des audiences et conversions indispensable',
        impact: 'Amélioration de la mesure des performances marketing',
        effort: 'Faible'
      });
    }
    
    // NOUVEAU: Si GTM présent mais GA4 non visible, recommander d'utiliser GTM
    if (this.results.gtm.present && !this.results.ga4.present) {
      recs.push({
        priority: 'Haute',
        category: 'Tracking',
        action: 'Déployer GA4 et Meta Pixel via GTM',
        why: 'GTM déjà installé : déploiement rapide possible des outils analytics et social ads',
        impact: 'Meilleure optimisation des campagnes publicitaires',
        effort: 'Faible'
      });
    }
    
    if (!this.results.gtm.present) {
      recs.push({
        priority: 'Moyenne',
        category: 'Tracking',
        action: 'Déployer Google Tag Manager',
        why: 'Centraliser et gérer les tags sans développeur',
        impact: 'Meilleure gestion des tags marketing',
        effort: 'Moyen'
      });
    }
    
    if (!this.results.meta.present) {
      recs.push({
        priority: 'Moyenne',
        category: 'Tracking',
        action: 'Installer Meta Pixel',
        why: 'Mesure des conversions Facebook/Instagram Ads',
        impact: 'Amélioration du suivi des campagnes social media',
        effort: 'Faible'
      });
    }
    
    // Règle ABSOLUE #2: Si GTM détecté, ne JAMAIS écrire "Aucun système de mesure détecté"
    // Compter les outils réels (hors GTM qui est un container)
    const realTrackingTools = this.results.detected.filter(t => 
      t !== 'Google Tag Manager' && t !== 'Google Analytics 4'
    ).length;
    
    // Si vraiment aucun outil de tracking (même pas GTM)
    if (this.results.detected.length === 0) {
      recs.push({
        priority: 'Haute',
        category: 'Tracking',
        action: 'Audit complet du stack tracking',
        why: 'Aucun système de mesure détecté',
        impact: 'Fondamental pour toute décision',
        effort: 'Moyen'
      });
    }
    
    return recs;
  }

  generateVerdict(networkHits = { ga4: false, events: false }) {
    const parts = [];
    
    // GTM
    if (this.results.gtm.present) {
      parts.push(`Google Tag Manager est installé (container: ${this.results.gtm.containerId || 'non détecté'}).`);
    }
    
    // NOUVEAU: GA4 status selon 3 cas
    if (this.results.ga4.present && this.results.ga4.confirmed) {
      // Cas 1: GA4 script détecté
      parts.push(`GA4 est visible directement dans le HTML${this.results.ga4.measurementId ? ` (ID: ${this.results.ga4.measurementId})` : ''}.`);
      if (networkHits.ga4) {
        parts.push('Des hits réseau GA4 ont été observés, confirmant la collecte de données.');
      } else {
        parts.push('Aucun hit réseau GA4 observé pendant l\'analyse - fonctionnement non confirmé.');
      }
    } else if (this.results.ga4.viaGTM) {
      // Cas 2: GTM détecté, GA4 non visible dans le HTML
      parts.push('GA4 n\'est pas visible directement dans le code source.');
      parts.push('GA4 peut être déployé via Google Tag Manager.');
      if (networkHits.ga4) {
        parts.push('Des hits réseau GA4 ont été observés, confirmant le déploiement via GTM.');
      } else {
        parts.push('Aucun hit GA4 observé - impossible de confirmer la collecte de données.');
      }
    } else if (!this.results.gtm.present) {
      // Cas 3: Ni GA4 ni GTM détecté
      parts.push('Tracking analytics absent : ni GA4 ni GTM détecté.');
    }
    
    // Server-side hint
    if (networkHits.ga4 && !this.results.ga4.present && !this.results.ga4.viaGTM) {
      parts.push('Le tracking peut être déployé via un proxy first-party ou un server-side tagging.');
    }
    
    // Meta
    if (this.results.meta.present) {
      parts.push(`Meta Pixel détecté${this.results.meta.pixelId ? ` (ID: ${this.results.meta.pixelId})` : ''}.`);
    }
    
    this.results.verdict = parts.join(' ');
    
    // Remplir detectedTools et evidence
    this.results.detectedTools = {
      gtm: this.results.gtm.present,
      ga4: this.results.ga4.present || this.results.ga4.viaGTM,
      ga4Confirmed: this.results.ga4.confirmed,
      ga4ViaGTM: this.results.ga4.viaGTM,
      meta: this.results.meta.present,
      tiktok: this.results.tiktok.present,
      linkedin: this.results.linkedin.present
    };
    
    this.results.evidence = {
      gtmContainer: this.results.gtm.containerId,
      ga4MeasurementId: this.results.ga4.measurementId,
      metaPixelId: this.results.meta.pixelId,
      tiktokPixelId: this.results.tiktok.pixelId,
      networkHitsGA4: networkHits.ga4,
      networkHitsEvents: networkHits.events
    };
    
    // Not confirmed list
    this.results.notConfirmed = [];
    if (this.results.gtm.present && !this.results.ga4.confirmed && !networkHits.ga4) {
      this.results.notConfirmed.push('GA4 fonctionnement effectif');
    }
    if (this.results.ga4.viaGTM && !networkHits.ga4) {
      this.results.notConfirmed.push('GA4 déploiement confirmé');
    }
  }
}

module.exports = { TrackingAnalyzer };
