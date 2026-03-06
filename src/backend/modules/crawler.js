/**
 * STRATADS BACKEND - CRAWLER MODULE
 * Analyse robots.txt, sitemap, URLs, status codes
 */

const { chromium } = require('playwright');

class Crawler {
  constructor(url, options = {}) {
    this.baseUrl = url;
    this.options = {
      maxPages: options.maxPages || 10, // FAST: 20, PUBLIC: 200, PRIVATE: 200, FULL: 1000
      followRedirects: options.followRedirects !== false,
      checkRobots: options.checkRobots !== false,
      checkSitemap: options.checkSitemap !== false,
      smartSampling: options.smartSampling !== false,
      ...options
    };
    this.visited = new Set();
    this.errors = [];
    this.redirects = [];
    this.canonicals = [];
    this.sampledPages = [];
    this.results = {
      pagesAnalyzed: 0,
      pages: [],
      errors: [],
      redirects: [],
      canonicals: [],
      sitemap: { present: false, url: '', valid: false, urls: [] },
      robots: { present: false, url: '', valid: false, sitemapRef: '' },
      securityHeaders: { hsts: false, csp: false, xframe: false, xcontent: false, raw: {} },
      // NOUVEAU: Métriques collectées pour FAST mode
      performanceMetrics: {
        https: null,
        pageWeight: null,
        scriptCount: null,
        imageCount: null,
        requestCount: null
      },
      // NOUVEAU: Technologies détectées
      technologies: {
        framework: { detected: false, name: '', version: '' },
        cms: { detected: false, name: '', version: '' },
        cdn: { detected: false, name: '' },
        ecommerce: { detected: false, name: '' },
        analytics: { detected: false, tools: [] }
      }
    };
  }

  async run() {
    const browser = await chromium.launch();
    
    try {
      // 1. Vérifier robots.txt
      if (this.options.checkRobots) {
        await this.checkRobotsTxt(browser);
      }

      // 2. Vérifier sitemap
      if (this.options.checkSitemap) {
        await this.checkSitemap(browser);
      }

      // 3. Crawl des pages + capture HTTPS réel
      await this.crawlPages(browser);
      
      // 4. Déterminer HTTPS basé sur l'URL finale réelle
      this.determineHttpsFromFinalUrl();

    } finally {
      await browser.close();
    }

    this.results.sampledPages = this.sampledPages;

    return this.results;
  }
  
  /**
   * Détermine HTTPS basé sur l'URL finale après navigation réelle
   * RÈGLE: Ne jamais dire "HTTPS: Non" si finalUrl commence par https://
   */
  determineHttpsFromFinalUrl() {
    if (this.finalUrl) {
      this.results.https = {
        enabled: this.finalUrl.startsWith('https://'),
        finalUrl: this.finalUrl,
        hadRedirect: this.results.redirects.length > 0,
        note: this.finalUrl.startsWith('https://') && this.results.redirects.some(r => r.from?.startsWith('http:'))
          ? 'Redirection HTTP→HTTPS détectée'
          : null
      };
    } else {
      // Fallback sur l'URL initiale si pas de navigation
      this.results.https = {
        enabled: this.baseUrl.startsWith('https://'),
        finalUrl: this.baseUrl,
        hadRedirect: false,
        note: null
      };
    }
  }

  async checkRobotsTxt(browser) {
    const page = await browser.newPage();
    try {
      const robotsUrl = new URL('/robots.txt', this.baseUrl).href;
      this.results.robots.url = robotsUrl;
      
      const response = await page.goto(robotsUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      
      if (response && response.status() === 200) {
        const content = await page.evaluate(() => document.body.innerText);
        this.results.robots.present = true;
        this.results.robots.valid = content.includes('User-agent');
        
        // Extraire référence sitemap
        const sitemapMatch = content.match(/Sitemap:\s*(.+)/i);
        if (sitemapMatch) {
          this.results.robots.sitemapRef = sitemapMatch[1].trim();
        }
      }
    } catch (e) {
      this.errors.push(`robots.txt: ${e.message}`);
    } finally {
      await page.close();
    }
  }

  async checkSitemap(browser) {
    const page = await browser.newPage();
    try {
      // Essayer sitemap.xml
      let sitemapUrl = new URL('/sitemap.xml', this.baseUrl).href;
      
      // Ou utiliser la référence depuis robots.txt
      if (this.results.robots.sitemapRef) {
        sitemapUrl = this.results.robots.sitemapRef;
      }
      
      this.results.sitemap.url = sitemapUrl;
      
      const response = await page.goto(sitemapUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      
      if (response && response.status() === 200) {
        const content = await page.evaluate(() => document.body.innerText);
        this.results.sitemap.present = true;
        this.results.sitemap.valid = content.includes('<urlset') || content.includes('<sitemapindex');
        
        // Compter URLs dans sitemap
        const urlMatches = content.match(/<loc>/g);
        if (urlMatches) {
          this.results.sitemap.urls = urlMatches.length;
        }
      }
    } catch (e) {
      this.errors.push(`sitemap: ${e.message}`);
    } finally {
      await page.close();
    }
  }

  async crawlPages(browser) {
    const toVisit = [this.baseUrl];
    const page = await browser.newPage();
    
    // NOUVEAU: Compter les requêtes réseau
    let requestCount = 0;
    page.on('request', () => {
      requestCount++;
    });
    
    try {
      while (toVisit.length > 0 && this.visited.size < this.options.maxPages) {
        const url = toVisit.shift();
        if (this.visited.has(url)) continue;
        
        if (this.options.smartSampling && this.visited.size >= this.options.maxPages * 0.7) {
          const priority = this.calculatePagePriority(url, toVisit);
          if (priority < 0.3) {
            this.sampledPages.push({
              url,
              reason: 'Low priority - skipped by smart sampling',
              priority,
              timestamp: new Date().toISOString()
            });
            continue;
          }
        }
        
        this.visited.add(url);
        
        try {
          const response = await page.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 15000 
          });
          
          // CAPTURE URL FINALE après navigation (première page seulement)
          if (!this.finalUrl) {
            this.finalUrl = page.url();
          }
          
          if (!response) {
            this.results.errors.push({ url, error: 'Pas de réponse' });
            continue;
          }

          const status = response.status();
          
          // Vérifier redirections
          if (status >= 300 && status < 400) {
            const location = response.headers()['location'];
            this.results.redirects.push({ from: url, to: location, code: status });
          }
          
          // Vérifier erreurs
          if (status >= 400) {
            this.results.errors.push({ url, status, error: `HTTP ${status}` });
          }
          
          // Analyse page
          if (status === 200) {
            const pageData = await this.analyzePage(page, url);
            
            // Stocker les données de la page
            const seoScore = this.calculatePageSeoScore(pageData);
            this.results.pages.push({
              url,
              status,
              title: pageData.title,
              titleLength: pageData.title?.length || 0,
              metaDescription: pageData.metaDescription,
              metaLength: pageData.metaDescription?.length || 0,
              headings: pageData.headings,
              canonical: pageData.canonical,
              imagesWithoutAlt: pageData.imagesWithoutAlt,
              schemaPresent: pageData.schemaPresent,
              schemaTypes: pageData.schemaTypes,
              internalLinksCount: pageData.internalLinks.length,
              seoScore
            });
            
            // NOUVEAU: Collecter métriques performance sur la première page
            if (this.results.pagesAnalyzed === 0) {
              await this.collectPerformanceMetrics(page, requestCount);
              await this.detectTechnologies(page);
              // Lire les security headers depuis la réponse
              this.extractSecurityHeaders(response);
            }
            
            // Vérifier canonical
            if (pageData.canonical && pageData.canonical !== url) {
              this.results.canonicals.push({ url, canonical: pageData.canonical });
            }
            
            // Ajouter liens internes à visiter
            if (this.visited.size < this.options.maxPages) {
              const linksToAdd = this.options.smartSampling 
                ? this.prioritizeLinks(pageData.internalLinks, toVisit)
                : pageData.internalLinks.slice(0, 5);
              
              for (const link of linksToAdd) {
                if (!this.visited.has(link) && !toVisit.includes(link)) {
                  toVisit.push(link);
                }
              }
            }
          }
          
          this.results.pagesAnalyzed++;
          
        } catch (e) {
          this.results.errors.push({ url, error: e.message });
        }
      }
    } finally {
      await page.close();
    }
  }

  /**
   * Calculate page priority for smart sampling
   */
  calculatePagePriority(url, toVisit) {
    let priority = 0.5; // Base priority
    
    // 1. Home page always high priority
    if (url === this.baseUrl || url === this.baseUrl + '/') {
      priority += 0.5;
    }
    
    // 2. Money pages (product, pricing, contact)
    const moneyPatterns = ['/produit', '/product', '/tarifs', '/pricing', '/contact', '/panier', '/cart', '/checkout'];
    if (moneyPatterns.some(pattern => url.toLowerCase().includes(pattern))) {
      priority += 0.3;
    }
    
    // 3. Category/landing pages
    const categoryPatterns = ['/categorie', '/category', '/services', '/solutions'];
    if (categoryPatterns.some(pattern => url.toLowerCase().includes(pattern))) {
      priority += 0.2;
    }
    
    // 4. Blog/content pages (lower priority)
    const contentPatterns = ['/blog', '/article', '/news', '/actualite'];
    if (contentPatterns.some(pattern => url.toLowerCase().includes(pattern))) {
      priority -= 0.1;
    }
    
    // 5. Admin/system pages (very low priority)
    const adminPatterns = ['/admin', '/wp-admin', '/login', '/register', '/account'];
    if (adminPatterns.some(pattern => url.toLowerCase().includes(pattern))) {
      priority -= 0.3;
    }
    
    // 6. URL depth (prefer shallower pages)
    const depth = (url.split('/').length - 3); // Remove protocol and domain
    priority -= Math.min(0.2, depth * 0.05);
    
    return Math.max(0, Math.min(1, priority));
  }

  /**
   * NEW: Prioritize links based on smart sampling
   */
  prioritizeLinks(internalLinks, toVisit) {
    if (!this.options.smartSampling) {
      return internalLinks.slice(0, 5);
    }
    
    // Sort links by priority
    const prioritized = internalLinks
      .map(link => ({
        url: link,
        priority: this.calculatePagePriority(link, toVisit)
      }))
      .sort((a, b) => b.priority - a.priority);
    
    // Return top priority links
    return prioritized.slice(0, 5).map(item => item.url);
  }

  /**
   * NOUVEAU: Collecter les métriques performance pour FAST mode
   */
  async collectPerformanceMetrics(page, requestCount) {
    try {
      // 1. Compter les scripts
      const scriptCount = await page.$$eval('script', el => el.length);
      
      // 2. Compter les images (amélioré)
      const imageData = await page.evaluate(() => {
        // Images standards
        const standardImages = document.querySelectorAll('img').length;
        
        // Images lazy load
        const lazyImages = document.querySelectorAll('img[loading="lazy"]').length;
        
        // Images background CSS
        const elementsWithBg = Array.from(document.querySelectorAll('*')).filter(el => {
          const style = window.getComputedStyle(el);
          return style.backgroundImage && style.backgroundImage !== 'none';
        }).length;
        
        // Images dans picture elements
        const pictureImages = document.querySelectorAll('picture img').length;
        
        // Total unique images
        const allImageElements = new Set([
          ...document.querySelectorAll('img'),
          ...document.querySelectorAll('picture img')
        ]);
        
        return {
          total: allImageElements.size,
          standard: standardImages,
          lazy: lazyImages,
          background: elementsWithBg,
          picture: pictureImages
        };
      });
      
      // 3. Mesurer le poids de la page (HTML uniquement)
      const html = await page.content();
      const pageWeight = Buffer.byteLength(html, 'utf8');
      
      // 4. Vérifier HTTPS
      const finalUrl = page.url();
      const https = finalUrl.startsWith('https://');
      
      // Stocker les métriques détaillées
      this.results.performanceMetrics = {
        https,
        pageWeight,
        scriptCount,
        imageCount: imageData.total,
        requestCount,
        // Détail images pour crédibilité
        imageDetails: imageData
      };
      
    } catch (e) {
      console.error('[Crawler] Error collecting performance metrics:', e.message);
      // Garder les valeurs null si erreur
    }
  }

  /**
   * NOUVEAU: Détecter les technologies utilisées (framework, CMS, CDN)
   */
  async detectTechnologies(page) {
    try {
      const techData = await page.evaluate(() => {
        const technologies = {
          framework: { detected: false, name: '', version: '' },
          cms: { detected: false, name: '', version: '' },
          cdn: { detected: false, name: '' },
          ecommerce: { detected: false, name: '' },
          analytics: { detected: false, tools: [] }
        };
        
        // 1. Frameworks JavaScript
        // React - plus de sélecteurs
        if (document.querySelector('[data-reactroot]') || 
            document.querySelector('[data-react]') ||
            window.React || 
            window.__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
            document.querySelector('script[src*="react"]') ||
            document.querySelector('div[id*="react"]') ||
            document.querySelector('script[src*="react-dom"]')) {
          technologies.framework.detected = true;
          technologies.framework.name = 'React';
          // Version detection
          const reactScript = document.querySelector('script[src*="react"]');
          if (reactScript) {
            const versionMatch = reactScript.src.match(/\/(\d+\.\d+\.\d+)\/react/);
            if (versionMatch) technologies.framework.version = versionMatch[1];
          }
        }
        
        // Vue.js - plus de sélecteurs
        if (window.Vue || 
            document.querySelector('[data-v-]') ||
            document.querySelector('[v-app]') ||
            document.querySelector('[v-data]') ||
            document.querySelector('script[src*="vue"]') ||
            window.__VUE__) {
          technologies.framework.detected = true;
          technologies.framework.name = 'Vue.js';
        }
        
        // Angular - plus de sélecteurs
        if (document.querySelector('[ng-app]') || 
            document.querySelector('[ng-controller]') ||
            document.querySelector('[ng-model]') ||
            window.ng || 
            window.angular ||
            window.zone ||
            document.querySelector('script[src*="angular"]') ||
            document.querySelector('app-root')) {
          technologies.framework.detected = true;
          technologies.framework.name = 'Angular';
        }
        
        // Next.js
        if (window.__NEXT_DATA__ || 
            document.querySelector('script[id="__NEXT_DATA__"]') ||
            document.querySelector('script[src*="next"]')) {
          technologies.framework.detected = true;
          technologies.framework.name = 'Next.js';
        }
        
        // Nuxt.js
        if (window.__NUXT__ || 
            document.querySelector('script[id="__NUXT_DATA__"]') ||
            document.querySelector('script[src*="nuxt"]')) {
          technologies.framework.detected = true;
          technologies.framework.name = 'Nuxt.js';
        }
        
        // 2. CMS Detection
        // WordPress - plus de sélecteurs
        const wpMeta = document.querySelector('meta[name="generator"][content*="WordPress"]');
        if (wpMeta || 
            /wp-content|wp-includes|wp-json/.test(window.location.href) ||
            document.querySelector('link[href*="wp-content"]') ||
            document.querySelector('script[src*="wp-content"]') ||
            document.querySelector('link[href*="wp-includes"]') ||
            document.querySelector('link[href*="wp-json"]') ||
            document.querySelector('body[class*="wordpress"]')) {
          technologies.cms.detected = true;
          technologies.cms.name = 'WordPress';
          if (wpMeta) {
            const versionMatch = wpMeta.content.match(/(\d+\.\d+\.\d+)/);
            if (versionMatch) technologies.cms.version = versionMatch[1];
          }
        }
        
        // Shopify - plus de sélecteurs
        if (window.Shopify || 
            /shopify\.com/.test(window.location.hostname) ||
            document.querySelector('script[src*="shopify"]') ||
            document.querySelector('script[src*="cdn.shopify.com"]') ||
            document.querySelector('link[href*="cdn.shopify.com"]') ||
            document.querySelector('meta[name="generator"][content*="Shopify"]') ||
            document.querySelector('div[id*="shopify"]')) {
          technologies.cms.detected = true;
          technologies.cms.name = 'Shopify';
        }
        
        // Squarespace - plus de sélecteurs
        if (/squarespace\.com/.test(window.location.hostname) ||
            document.querySelector('script[src*="squarespace"]') ||
            document.querySelector('link[href*="squarespace"]') ||
            document.querySelector('meta[name="generator"][content*="Squarespace"]') ||
            document.querySelector('div[class*="sqs"]')) {
          technologies.cms.detected = true;
          technologies.cms.name = 'Squarespace';
        }
        
        // Wix
        if (window.wixBiSession || 
            document.querySelector('script[src*="wix"]') ||
            document.querySelector('div[id*="wix"]') ||
            /wix\.com/.test(window.location.hostname)) {
          technologies.cms.detected = true;
          technologies.cms.name = 'Wix';
        }
        
        // Webflow
        if (window.Webflow || 
            document.querySelector('script[data-wf-page]') ||
            document.querySelector('html[data-wf-site]') ||
            document.querySelector('link[href*="webflow"]')) {
          technologies.cms.detected = true;
          technologies.cms.name = 'Webflow';
        }
        
        // Drupal
        if (document.querySelector('meta[name="generator"][content*="Drupal"]') ||
            /sites\/default\/files/.test(window.location.href) ||
            document.querySelector('link[href*="drupal"]')) {
          technologies.cms.detected = true;
          technologies.cms.name = 'Drupal';
        }
        
        // 3. CDN Detection
        // Cloudflare - plus de sélecteurs
        const cfScript = document.querySelector('script[src*="cloudflareinsights"]');
        if (cfScript || 
            window.__cf || 
            document.querySelector('script[src*="cdn.cloudflare.com"]') ||
            document.querySelector('link[href*="cdn.cloudflare.com"]') ||
            document.querySelector('meta[name="cf-ray"]') ||
            /cloudflare/.test(document.cookie) ||
            document.querySelector('div[class*="cf-"]')) {
          technologies.cdn.detected = true;
          technologies.cdn.name = 'Cloudflare';
        }
        
        // Fastly - plus de sélecteurs
        if (document.querySelector('script[src*="fastly"]') || 
            /fastly\.net/.test(window.location.hostname) ||
            document.querySelector('link[href*="fastly"]') ||
            document.querySelector('meta[http-equiv="fastly"]')) {
          technologies.cdn.detected = true;
          technologies.cdn.name = 'Fastly';
        }
        
        // Akamai - plus de sélecteurs
        if (/akamai/.test(window.location.hostname) || 
            document.querySelector('script[src*="akamai"]') ||
            document.querySelector('link[href*="akamai"]') ||
            document.querySelector('meta[name="akamai"]')) {
          technologies.cdn.detected = true;
          technologies.cdn.name = 'Akamai';
        }
        
        // Cloudinary
        if (document.querySelector('script[src*="cloudinary"]') ||
            document.querySelector('link[href*="cloudinary"]') ||
            /cloudinary\.com/.test(window.location.hostname)) {
          technologies.cdn.detected = true;
          technologies.cdn.name = 'Cloudinary';
        }
        
        // Amazon CloudFront
        if (/cloudfront\.net/.test(window.location.hostname) ||
            document.querySelector('script[src*="cloudfront"]') ||
            document.querySelector('link[href*="cloudfront"]')) {
          technologies.cdn.detected = true;
          technologies.cdn.name = 'CloudFront';
        }
        
        // Google CDN
        if (document.querySelector('script[src*="ajax.googleapis.com"]') ||
            document.querySelector('script[src*="fonts.googleapis.com"]') ||
            document.querySelector('link[href*="fonts.googleapis.com"]') ||
            document.querySelector('link[href*="ajax.googleapis.com"]')) {
          technologies.cdn.detected = true;
          technologies.cdn.name = 'Google CDN';
        }
        
        // 4. E-commerce
        // WooCommerce
        if (document.querySelector('.woocommerce') || /woocommerce/.test(document.body.className)) {
          technologies.ecommerce.detected = true;
          technologies.ecommerce.name = 'WooCommerce';
        }
        
        // Magento
        if (document.querySelector('script[src*="magento"]') || /magento/.test(window.location.href)) {
          technologies.ecommerce.detected = true;
          technologies.ecommerce.name = 'Magento';
        }
        
        // 5. Analytics (détection basique pour compléter tracking.js)
        if (window.ga || window.gtag) technologies.analytics.tools.push('Google Analytics');
        if (window.dataLayer) technologies.analytics.tools.push('Google Tag Manager');
        if (window.fbq) technologies.analytics.tools.push('Meta Pixel');
        if (window.hj) technologies.analytics.tools.push('Hotjar');
        if (window.clarity) technologies.analytics.tools.push('Microsoft Clarity');
        
        technologies.analytics.detected = technologies.analytics.tools.length > 0;
        
        return technologies;
      });
      
      this.results.technologies = techData;
      
    } catch (e) {
      console.error('[Crawler] Error detecting technologies:', e.message);
    }
  }

  extractSecurityHeaders(response) {
    try {
      const headers = response.headers();
      this.results.securityHeaders = {
        hsts: 'strict-transport-security' in headers,
        csp: 'content-security-policy' in headers,
        xframe: 'x-frame-options' in headers,
        xcontent: 'x-content-type-options' in headers,
        raw: {
          hsts: headers['strict-transport-security'] || null,
          csp: headers['content-security-policy'] || null,
          xframe: headers['x-frame-options'] || null,
          xcontent: headers['x-content-type-options'] || null
        }
      };
    } catch (e) {
      console.error('[Crawler] Error extracting security headers:', e.message);
    }
  }

  calculatePageSeoScore(pageData) {
    let score = 0;
    if (pageData.title && pageData.title.length > 0) score += 25;
    if (pageData.title && pageData.title.length >= 30 && pageData.title.length <= 60) score += 10;
    if (pageData.metaDescription && pageData.metaDescription.length > 0) score += 20;
    if (pageData.metaDescription && pageData.metaDescription.length >= 120 && pageData.metaDescription.length <= 160) score += 10;
    if (pageData.headings?.h1 === 1) score += 20;
    if (pageData.headings?.h2 > 0) score += 5;
    if (pageData.schemaPresent) score += 10;
    if (pageData.imagesWithoutAlt === 0) score += 10;
    else if (pageData.imagesWithoutAlt > 0) score -= Math.min(10, pageData.imagesWithoutAlt * 2);
    return Math.max(0, Math.min(100, score));
  }

  async analyzePage(page, url) {
    return await page.evaluate(() => {
      // Canonical
      const canonicalLink = document.querySelector('link[rel="canonical"]');
      const canonical = canonicalLink ? canonicalLink.href : '';
      
      // Titre
      const title = document.querySelector('title')?.textContent || '';
      
      // Meta description
      const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
      
      // Headings
      const h1 = document.querySelectorAll('h1').length;
      const h2 = document.querySelectorAll('h2').length;
      const h3 = document.querySelectorAll('h3').length;
      
      // Liens internes
      const links = Array.from(document.querySelectorAll('a[href]'));
      const internalLinks = links
        .map(a => a.href)
        .filter(href => href.startsWith(window.location.origin))
        .filter(href => !href.includes('#'));
      
      // Images sans alt
      const images = Array.from(document.querySelectorAll('img'));
      const imagesWithoutAlt = images.filter(img => !img.alt).length;
      
      // Schema.org
      const schemaScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      const schemaTypes = schemaScripts.map(s => {
        try {
          const data = JSON.parse(s.textContent);
          return data['@type'] || 'Unknown';
        } catch {
          return 'Invalid';
        }
      });
      
      return {
        canonical,
        title,
        metaDescription: metaDesc,
        headings: { h1, h2, h3 },
        internalLinks: [...new Set(internalLinks)].slice(0, 10),
        imagesWithoutAlt,
        schemaPresent: schemaScripts.length > 0,
        schemaTypes
      };
    });
  }
}

module.exports = { Crawler };
