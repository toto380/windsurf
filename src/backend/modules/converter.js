/**
 * STRATADS - CONVERTER MODULE
 * Analyse conversion: CTAs, formulaires, friction heuristique
 */

const { chromium } = require('playwright');

class ConversionAnalyzer {
  constructor(url) {
    this.url = url;
    this.results = {
      ctas: { count: 0, elements: [], score: 0 },
      forms: { count: 0, elements: [], score: 0 },
      friction: { score: 0, issues: [] },
      heuristicScore: 0,
      elements: {
        hasCTA: false,
        hasForms: false,
        hasPhone: false,
        hasEmail: false,
        hasChat: false,
        hasSocialProof: false,
        hasTrustSignals: false
      }
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
        console.log('[Conversion] Phase 1 réussie - domcontentloaded');
      } catch (error1) {
        console.log('[Conversion] Phase 1 échouée, tentative Phase 2...');
        
        // Phase 2: 30s avec networkidle (standard)
        try {
          response = await page.goto(this.url, { 
            waitUntil: 'networkidle',
            timeout: 30000 
          });
          console.log('[Conversion] Phase 2 réussie - networkidle');
        } catch (error2) {
          console.log('[Conversion] Phase 2 échouée, tentative Phase 3...');
          
          // Phase 3: 60s avec load (dernier recours)
          try {
            response = await page.goto(this.url, { 
              waitUntil: 'load',
              timeout: 60000 
            });
            console.log('[Conversion] Phase 3 réussie - load');
          } catch (error3) {
            console.error('[Conversion] Toutes les phases échouées, utilisation des métriques partielles');
            throw new Error(`Timeout adaptatif échoué: ${error3.message}`);
          }
        }
      }
      
      await page.waitForTimeout(1000);

      const conversionData = await page.evaluate(() => {
        const data = {
          ctas: [],
          forms: [],
          friction: [],
          elements: {
            hasCTA: false,
            hasForms: false,
            hasPhone: false,
            hasEmail: false,
            hasChat: false,
            hasSocialProof: false,
            hasTrustSignals: false
          }
        };

        // 1. Détecter les CTAs
        const ctaSelectors = [
          'button',
          '.btn', '.button',
          '.cta', '[class*="cta"]',
          '[class*="action"]',
          'a[href*="contact"]',
          'a[href*="devis"]',
          'a[href*="demo"]',
          'a[href*="buy"]',
          'a[href*="cart"]',
          'input[type="submit"]'
        ];

        const ctaElements = document.querySelectorAll(ctaSelectors.join(', '));
        data.ctas = Array.from(ctaElements)
          .slice(0, 10)
          .map(el => ({
            text: el.textContent?.trim().substring(0, 50) || '',
            type: el.tagName.toLowerCase(),
            visible: el.offsetParent !== null
          }))
          .filter(c => c.text.length > 0);

        data.elements.hasCTA = data.ctas.length > 0;

        // 2. Détecter les formulaires
        const forms = document.querySelectorAll('form');
        data.forms = Array.from(forms).map(form => {
          const inputs = form.querySelectorAll('input, select, textarea');
          const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
          
          return {
            fields: inputs.length,
            hasSubmit: !!submitBtn,
            action: form.action || '',
            visible: form.offsetParent !== null
          };
        });

        data.elements.hasForms = data.forms.length > 0;

        // 3. Coordonnées de contact
        data.elements.hasPhone = !!document.querySelector('a[href^="tel:"]');
        data.elements.hasEmail = !!document.querySelector('a[href^="mailto:"]');
        data.elements.hasChat = !!(
          document.querySelector('[class*="chat"]') ||
          document.querySelector('[id*="chat"]') ||
          document.querySelector('[class*="messenger"]') ||
          document.querySelector('iframe[src*="chat"]')
        );

        // 4. Signaux de confiance
        const trustSelectors = [
          '[class*="trust"]',
          '[class*="badge"]',
          '[class*="certif"]',
          '[class*="secure"]',
          '[class*="guarantee"]'
        ];
        data.elements.hasTrustSignals = document.querySelectorAll(trustSelectors.join(', ')).length > 0;

        // 5. Preuve sociale
        const socialSelectors = [
          '[class*="testimonial"]',
          '[class*="review"]',
          '[class*="rating"]',
          '[class*="client"]',
          '[class*="partenaire"]'
        ];
        data.elements.hasSocialProof = document.querySelectorAll(socialSelectors.join(', ')).length > 0;

        // 6. Analyse friction formulaires
        for (const form of data.forms) {
          if (form.fields > 6) {
            data.friction.push({
              type: 'form_fields',
              severity: form.fields > 10 ? 'high' : 'medium',
              message: `Formulaire avec ${form.fields} champs (trop complexe)`
            });
          }
        }

        // 7. Détecter popups intrusifs (potentiel friction)
        const popups = document.querySelectorAll(
          '[class*="popup"], [class*="modal"], [id*="popup"], [id*="modal"]'
        );
        const visiblePopups = Array.from(popups).filter(p => p.offsetParent !== null);
        if (visiblePopups.length > 0) {
          data.friction.push({
            type: 'popup',
            severity: 'low',
            message: `${visiblePopups.length} popup/modal présent(s)`
          });
        }

        // 8. Analyser la hiérarchie visuelle
        const h1 = document.querySelectorAll('h1');
        if (h1.length === 0) {
          data.friction.push({
            type: 'no_h1',
            severity: 'medium',
            message: 'Pas de titre H1 détecté'
          });
        } else if (h1.length > 1) {
          data.friction.push({
            type: 'multiple_h1',
            severity: 'low',
            message: `${h1.length} titres H1 (devrait être unique)`
          });
        }

        return data;
      });

      // Fusionner les résultats
      this.results.ctas = {
        count: conversionData.ctas.length,
        elements: conversionData.ctas,
        score: this.calculateCTAScore(conversionData.ctas)
      };

      this.results.forms = {
        count: conversionData.forms.length,
        elements: conversionData.forms,
        score: this.calculateFormScore(conversionData.forms)
      };

      this.results.friction = {
        score: this.calculateFrictionScore(conversionData.friction),
        issues: conversionData.friction
      };

      this.results.elements = conversionData.elements;
      this.results.heuristicScore = this.calculateHeuristicScore();

    } catch (error) {
      console.error('[Conversion]', error.message);
      this.results.error = error.message;
    } finally {
      await browser.close();
    }

    return this.results;
  }

  calculateCTAScore(ctas) {
    if (!ctas || ctas.length === 0) return 0;
    
    let score = Math.min(40, ctas.length * 8);
    
    // Bonus si CTAs visibles
    const visibleCount = ctas.filter(c => c.visible).length;
    if (visibleCount >= 2) score += 20;
    
    // Bonus pour variété
    const types = new Set(ctas.map(c => c.type));
    if (types.size > 1) score += 10;
    
    return Math.min(100, score);
  }

  calculateFormScore(forms) {
    if (!forms || forms.length === 0) return 0;
    
    let score = Math.min(30, forms.length * 15);
    
    // Vérifier si formulaires fonctionnels
    const validForms = forms.filter(f => f.hasSubmit && f.visible);
    if (validForms.length > 0) score += 30;
    
    // Pénalité si trop de champs
    const avgFields = forms.reduce((sum, f) => sum + f.fields, 0) / forms.length;
    if (avgFields <= 4) score += 20;
    else if (avgFields <= 6) score += 10;
    
    return Math.min(100, score);
  }

  calculateFrictionScore(issues) {
    if (!issues || issues.length === 0) return 100;
    
    let penalty = 0;
    for (const issue of issues) {
      switch (issue.severity) {
        case 'high': penalty += 20; break;
        case 'medium': penalty += 10; break;
        case 'low': penalty += 5; break;
      }
    }
    
    return Math.max(0, 100 - penalty);
  }

  calculateHeuristicScore() {
    let score = 30; // Base
    
    // CTAs
    score += this.results.ctas.score * 0.25;
    
    // Formulaires
    score += this.results.forms.score * 0.20;
    
    // Friction (inversé)
    score += this.results.friction.score * 0.15;
    
    // Éléments de contact
    const contactElements = [
      this.results.elements.hasPhone,
      this.results.elements.hasEmail,
      this.results.elements.hasChat
    ].filter(Boolean).length;
    score += contactElements * 5;
    
    // Signaux de confiance
    if (this.results.elements.hasTrustSignals) score += 10;
    if (this.results.elements.hasSocialProof) score += 10;
    
    return Math.min(100, Math.round(score));
  }

  getRecommendations() {
    const recs = [];
    
    if (!this.results.elements.hasCTA) {
      recs.push({
        priority: 'Haute',
        category: 'Conversion',
        action: 'Ajouter des CTAs visibles',
        why: 'Aucun appel à l\'action détecté',
        impact: 'Augmentation potentielle du taux de conversion',
        effort: 'Moyen'
      });
    }
    
    if (!this.results.elements.hasForms) {
      recs.push({
        priority: 'Moyenne',
        category: 'Conversion',
        action: 'Ajouter un formulaire de contact',
        why: 'Permettre aux visiteurs de convertir',
        impact: 'Meilleure génération de leads qualifiés',
        effort: 'Faible'
      });
    }
    
    if (!this.results.elements.hasPhone && !this.results.elements.hasEmail) {
      recs.push({
        priority: 'Moyenne',
        category: 'Conversion',
        action: 'Ajouter coordonnées téléphone/email cliquables',
        why: 'Faciliter le contact direct',
        impact: 'Facilitation du contact direct avec les prospects',
        effort: 'Faible'
      });
    }
    
    if (!this.results.elements.hasTrustSignals) {
      recs.push({
        priority: 'Moyenne',
        category: 'Conversion',
        action: 'Ajouter signaux de confiance',
        why: 'Réduire la friction et augmenter la crédibilité',
        impact: 'Renforcement de la crédibilité et conversion',
        effort: 'Moyen'
      });
    }
    
    if (this.results.friction.issues.some(i => i.type === 'form_fields')) {
      recs.push({
        priority: 'Haute',
        category: 'Conversion',
        action: 'Simplifier les formulaires (max 4-5 champs)',
        why: 'Chaque champ supplémentaire réduit les conversions',
        impact: 'Amélioration du taux de complétion des formulaires',
        effort: 'Faible'
      });
    }
    
    return recs;
  }
}

module.exports = { ConversionAnalyzer };
