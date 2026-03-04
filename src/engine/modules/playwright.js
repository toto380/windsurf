import { chromium } from 'playwright';

const COMMON_ACCEPT = [
  'button:has-text("Accepter")',"button:has-text(\"J'accepte\")",'button:has-text("Tout accepter")','button:has-text("Accept")',
  '[id*="accept"]','[class*="accept"]','[data-testid*="accept"]'
];
const COMMON_REJECT = [
  'button:has-text("Refuser")','button:has-text("Tout refuser")','button:has-text("Reject")',
  '[id*="reject"]','[class*="reject"]','[data-testid*="reject"]'
];

async function tryClickAny(page, selectors){
  for (const sel of selectors){
    try{
      const loc = page.locator(sel).first();
      if (await loc.count()){
        await loc.click({ timeout: 1500 }).catch(()=>{});
        return sel;
      }
    }catch(_){}
  }
  return null;
}

function isCaptureMissing(res){
  if (!res) return true;
  const s = res.screenshot;
  const a = res?.consentScreens?.afterAccept;
  const r = res?.consentScreens?.afterReject;
  return !(typeof s === "string" && s.startsWith("data:image/")) && !(typeof a === "string" && a.startsWith("data:image/")) && !(typeof r === "string" && r.startsWith("data:image/"));
}

async function runOnce(url, log, { headless }){
  const browser = await chromium.launch({
    headless,
    // A few flags help with some anti-bot setups and Windows GPU cache issues
    args: ['--disable-gpu','--disable-dev-shm-usage','--no-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) StratAdsAudit/1.0',
    viewport: { width: 1366, height: 768 }
  });
  const page = await context.newPage();

  const detectedTags = new Set();
  const networkCalls = [];
  const cookiesFound = [];
  const thirdParty = { total: 0, third: 0 };

  // Error capture (console / page errors / request failures)
  const consoleEvents = [];
  const pageErrors = [];
  const requestFailed = [];
  const badResponses = [];

  const trackerCounts = {
    gtm: 0,
    ga4: 0,
    meta: 0,
    tiktok: 0,
    linkedin: 0,
    googleAds: 0,
    hotjar: 0,
  };

  const signatures = {
    'Google Tag Manager (GTM)': /googletagmanager\.com\/gtm\.js/,
    'Google Analytics 4 (GA4)': /google-analytics\.com\/g\/collect|googletagmanager\.com\/gtag\/js/,
    'Meta Pixel': /facebook\.com\/tr/,
    'TikTok Pixel': /analytics\.tiktok\.com|tiktok\.com\/i18n\/pixel/,
    'LinkedIn Insight': /px\.ads\.linkedin\.com/,
    'Hotjar': /static\.hotjar\.com/,
    'Google Ads': /googleads\.g\.doubleclick\.net|googlesyndication\.com/
  };

  page.on('request', request => {
    const u = request.url();
    networkCalls.push(u);
    try{
      const host = new URL(u).hostname;
      const pageHost = new URL(url).hostname;
      thirdParty.total += 1;
      if (host && host !== pageHost && !host.endsWith('.' + pageHost)) thirdParty.third += 1;
    }catch(_){}
    for (const [name, regex] of Object.entries(signatures)) {
      if (regex.test(u)) detectedTags.add(name);
    }

    // tracker counters for consent proof / correlations
    if (/googletagmanager\.com\/gtm\.js/i.test(u)) trackerCounts.gtm += 1;
    if (/google-analytics\.com\/g\/collect|googletagmanager\.com\/gtag\/js/i.test(u)) trackerCounts.ga4 += 1;
    if (/facebook\.com\/tr/i.test(u)) trackerCounts.meta += 1;
    if (/analytics\.tiktok\.com|tiktok\.com\/i18n\/pixel/i.test(u)) trackerCounts.tiktok += 1;
    if (/px\.ads\.linkedin\.com/i.test(u)) trackerCounts.linkedin += 1;
    if (/googleads\.g\.doubleclick\.net|googlesyndication\.com/i.test(u)) trackerCounts.googleAds += 1;
    if (/static\.hotjar\.com/i.test(u)) trackerCounts.hotjar += 1;
  });

  page.on('console', (msg) => {
    try{
      const type = msg.type();
      // Keep errors + warnings only
      if (type !== 'error' && type !== 'warning') return;
      consoleEvents.push({ type, text: msg.text().slice(0, 500) });
    }catch{}
  });
  page.on('pageerror', (err) => {
    try{ pageErrors.push(String(err?.message || err).slice(0, 600)); }catch{}
  });
  page.on('requestfailed', (req) => {
    try{
      const u = req.url();
      requestFailed.push({ url: u.slice(0, 500), errorText: (req.failure()?.errorText || '').slice(0, 200) });
    }catch{}
  });
  page.on('response', (res) => {
    try{
      const st = res.status();
      if (st >= 400) badResponses.push({ url: res.url().slice(0, 500), status: st });
    }catch{}
  });

  try{
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

    const screenshotBuf = await page.screenshot({ fullPage: true, type: 'png' }).catch(()=>null);
    const screenshot = screenshotBuf ? `data:image/png;base64,${screenshotBuf.toString('base64')}` : null;

    const cookies = await context.cookies().catch(()=>[]);
    cookies.forEach(c => cookiesFound.push({ name: c.name, domain: c.domain, secure: c.secure }));

    const dataLayer = await page.evaluate(() => {
      // @ts-ignore
      return window.dataLayer ? JSON.stringify(window.dataLayer, null, 2) : 'Non détecté';
    }).catch(()=> 'Non détecté');

    const consentScreens = {
      afterAccept: null,
      afterReject: null,
      acceptSelector: null,
      rejectSelector: null,
      // Proof signals (cookies + tracker calls) to demonstrate accept vs reject
      proof: {
        accept: { cookiesCount: 0, trackers: {}, thirdPartyRequests: 0, totalRequests: 0 },
        reject: { cookiesCount: 0, trackers: {}, thirdPartyRequests: 0, totalRequests: 0 }
      }
    };

    // Accept (same context)
    try{
      const acceptSel = await tryClickAny(page, COMMON_ACCEPT);
      if (acceptSel){
        consentScreens.acceptSelector = acceptSel;
        await page.waitForTimeout(1500);
        const b = await page.screenshot({ fullPage: true, type:'png' }).catch(()=>null);
        if (b) consentScreens.afterAccept = `data:image/png;base64,${b.toString('base64')}`;

        // Proof signals after accept
        const c = await context.cookies().catch(()=>[]);
        consentScreens.proof.accept.cookiesCount = Array.isArray(c) ? c.length : 0;
        consentScreens.proof.accept.trackers = { ...trackerCounts };
        consentScreens.proof.accept.thirdPartyRequests = thirdParty.third;
        consentScreens.proof.accept.totalRequests = thirdParty.total;
      }
    }catch(e){ log && log(`(Consent accept screenshot failed: ${e.message})`); }

    // Reject (fresh context to avoid accept state)
    try{
      // reset counters for reject flow
      const rejectTrackerCounts = { gtm:0, ga4:0, meta:0, tiktok:0, linkedin:0, googleAds:0, hotjar:0 };
      const rejectThirdParty = { total:0, third:0 };
      const rejectNetworkCalls = [];

      const ctx2 = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) StratAdsAudit/1.0',
        viewport: { width: 1366, height: 768 }
      });
      const p2 = await ctx2.newPage();
      p2.on('request', request => {
        const u = request.url();
        rejectNetworkCalls.push(u);
        try{
          const host = new URL(u).hostname;
          const pageHost = new URL(url).hostname;
          rejectThirdParty.total += 1;
          if (host && host !== pageHost && !host.endsWith('.' + pageHost)) rejectThirdParty.third += 1;
        }catch(_){ }
        if (/googletagmanager\.com\/gtm\.js/i.test(u)) rejectTrackerCounts.gtm += 1;
        if (/google-analytics\.com\/g\/collect|googletagmanager\.com\/gtag\/js/i.test(u)) rejectTrackerCounts.ga4 += 1;
        if (/facebook\.com\/tr/i.test(u)) rejectTrackerCounts.meta += 1;
        if (/analytics\.tiktok\.com|tiktok\.com\/i18n\/pixel/i.test(u)) rejectTrackerCounts.tiktok += 1;
        if (/px\.ads\.linkedin\.com/i.test(u)) rejectTrackerCounts.linkedin += 1;
        if (/googleads\.g\.doubleclick\.net|googlesyndication\.com/i.test(u)) rejectTrackerCounts.googleAds += 1;
        if (/static\.hotjar\.com/i.test(u)) rejectTrackerCounts.hotjar += 1;
      });

      await p2.goto(url, { waitUntil:'networkidle', timeout: 45000 });
      const rejectSel = await tryClickAny(p2, COMMON_REJECT);
      if (rejectSel){
        consentScreens.rejectSelector = rejectSel;
        await p2.waitForTimeout(1500);
        const b = await p2.screenshot({ fullPage: true, type:'png' }).catch(()=>null);
        if (b) consentScreens.afterReject = `data:image/png;base64,${b.toString('base64')}`;

        // Proof signals after reject
        const c = await ctx2.cookies().catch(()=>[]);
        consentScreens.proof.reject.cookiesCount = Array.isArray(c) ? c.length : 0;
        consentScreens.proof.reject.trackers = { ...rejectTrackerCounts };
        consentScreens.proof.reject.thirdPartyRequests = rejectThirdParty.third;
        consentScreens.proof.reject.totalRequests = rejectThirdParty.total;
      }

      await ctx2.close().catch(()=>{});
    }catch(e){ log && log(`(Consent reject screenshot failed: ${e.message})`); }

    let score = 0;
    if (detectedTags.has('Google Tag Manager (GTM)')) score += 30;
    if (detectedTags.has('Google Analytics 4 (GA4)')) score += 25;
    if (detectedTags.has('Meta Pixel')) score += 20;
    if (cookies.length > 0) score += 10;
    score += Math.min(15, Math.round((thirdParty.third / Math.max(1, thirdParty.total)) * 15));
    score = Math.min(100, Math.max(0, score));


    // DOM signals: detect GTM/GA4 even when network sampling is incomplete (e.g., blocked by consent, cached, or deferred).
    let domSignals = {};
    try {
      domSignals = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => String(s.src || ''));
        const iframes = Array.from(document.querySelectorAll('iframe[src]')).map(i => String(i.src || ''));
        const inline = Array.from(document.querySelectorAll('script:not([src])')).map(s => String(s.textContent || '')).join('\\n').slice(0, 60000);

        const gtmSrcMatch = scripts.map(u => u.match(/googletagmanager\.com\/gtm\.js\?id=(GTM-[A-Z0-9]+)/i)).find(Boolean);
        const gtmNsMatch = iframes.map(u => u.match(/googletagmanager\.com\/ns\.html\?id=(GTM-[A-Z0-9]+)/i)).find(Boolean);
        const gtmInlineMatch = inline.match(/GTM-[A-Z0-9]+/i);
        const gtmId = (gtmSrcMatch && gtmSrcMatch[1]) || (gtmNsMatch && gtmNsMatch[1]) || (gtmInlineMatch && gtmInlineMatch[0]) || null;

        const hasGTM =
          !!gtmId ||
          scripts.some(u => /googletagmanager\.com\/gtm\.js/i.test(u)) ||
          iframes.some(u => /googletagmanager\.com\/ns\.html/i.test(u)) ||
          typeof (window.google_tag_manager) === 'object';

        const ga4InlineId = (inline.match(/G-[A-Z0-9]{6,}/) || [])[0] || null;
        const gtagPresent = /gtag\(/.test(inline) || typeof (window.gtag) === 'function';
        const ga4Id = ga4InlineId;

        const hasGA4 =
          !!ga4Id ||
          scripts.some(u => /google-analytics\.com\/(g|analytics)\.js/i.test(u)) ||
          scripts.some(u => /googletagmanager\.com\/gtag\/js\?id=G-/i.test(u)) ||
          gtagPresent;

        const hasDataLayer = Array.isArray(window.dataLayer) && window.dataLayer.length > 0;

        return {
          hasGTM,
          gtmId,
          hasGA4,
          ga4Id: ga4Id || null,
          hasDataLayer,
          dataLayerLength: hasDataLayer ? window.dataLayer.length : 0,
          scriptsCount: scripts.length,
          iframesCount: iframes.length
        };
      });
} catch (e) {
      domSignals = { error: e?.message || String(e) };
    }

    // Network domains distribution (lightweight)
    const topDomains = {};
    try {
      for (const c of networkCalls) {
        const u = c?.url || '';
        try {
          const host = new URL(u).hostname || '';
          if (!host) continue;
          topDomains[host] = (topDomains[host] || 0) + 1;
        } catch {}
      }
    } catch {}

    await browser.close();

    return {
      score,
      tags: Array.from(detectedTags),
      cookies: cookiesFound.slice(0, 50),
      dataLayerSample: (dataLayer || '').slice(0, 800),
      screenshot,
      consentScreens,
      console: {
        // keep it small for the report
        errors: consoleEvents.filter(x=>x.type==='error').slice(0, 15),
        warnings: consoleEvents.filter(x=>x.type==='warning').slice(0, 10),
        pageErrors: pageErrors.slice(0, 10),
      },
      networkIssues: {
        failedRequests: requestFailed.slice(0, 12),
        badResponses: badResponses.slice(0, 12)
      },
      domSignals,
      network: {
        topDomains,
        totalRequests: thirdParty.total,
        thirdPartyRequests: thirdParty.third,
        sample: networkCalls.slice(0, 200)
      },
      captureMode: headless ? "headless" : "non-headless"
    };
  }catch(e){
    log && log(`❌ Erreur Playwright (${headless ? "headless":"non-headless"}): ${e.message}`);
    await browser.close();
    return {
      score: 0,
      error: e.message,
      tags: [],
      cookies: [],
      screenshot: null,
      consentScreens: {
        afterAccept: null,
        afterReject: null,
        acceptSelector: null,
        rejectSelector: null,
        proof: {
          accept: { cookiesCount: 0, trackers: {}, thirdPartyRequests: 0, totalRequests: 0 },
          reject: { cookiesCount: 0, trackers: {}, thirdPartyRequests: 0, totalRequests: 0 }
        }
      },
      console: { errors: [], warnings: [], pageErrors: [] },
      networkIssues: { failedRequests: [], badResponses: [] },
      network: { totalRequests: 0, thirdPartyRequests: 0, sample: [] },
      captureMode: headless ? "headless" : "non-headless"
    };
  }
}

export async function scanPlaywright(url, log, options = {}) {
  const fallbackHeadful = options.fallbackHeadful !== false;

  // Try headless first
  const headlessRes = await runOnce(url, log, { headless: true });

  // If screenshots missing and fallback enabled, retry non-headless
  if (fallbackHeadful && isCaptureMissing(headlessRes)) {
    log && log("🧩 Captures bloquées en headless → relance automatique en non‑headless (fenêtre visible)...");
    const headfulRes = await runOnce(url, log, { headless: false });

    // Keep best tags/cookies if headful has better capture
    if (!isCaptureMissing(headfulRes)) return headfulRes;
    return headlessRes;
  }

  return headlessRes;
}