import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";

export async function scanLighthouse(url) {
  try {
    const chrome = await launch({ chromeFlags: ["--headless", "--no-sandbox"] });
    const options = {
      logLevel: "error",
      output: "json",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      port: chrome.port
    };

    const runnerResult = await lighthouse(url, options);
    await chrome.kill();

    const lhr = runnerResult.lhr;
    const cats = lhr.categories;

    const auditNum = (id) => {
      const a = lhr?.audits?.[id];
      const v = a?.numericValue;
      return (typeof v === 'number' && Number.isFinite(v)) ? v : null;
    };
    const auditText = (id) => {
      const a = lhr?.audits?.[id];
      const t = a?.displayValue;
      return (typeof t === 'string' && t.trim()) ? t.trim() : null;
    };

    // Core metrics (for FULL correlations & better reporting)
    const metrics = {
      fcpMs: auditNum('first-contentful-paint'),
      lcpMs: auditNum('largest-contentful-paint'),
      tbtMs: auditNum('total-blocking-time'),
      cls: auditNum('cumulative-layout-shift'),
      siMs: auditNum('speed-index'),
      ttiMs: auditNum('interactive'),
      fcpDisplay: auditText('first-contentful-paint'),
      lcpDisplay: auditText('largest-contentful-paint'),
      tbtDisplay: auditText('total-blocking-time'),
      clsDisplay: auditText('cumulative-layout-shift'),
      siDisplay: auditText('speed-index'),
      ttiDisplay: auditText('interactive'),
    };

    // Top opportunities (lightweight summary)
    const oppIds = [
      'render-blocking-resources',
      'unused-javascript',
      'unused-css-rules',
      'unminified-javascript',
      'unminified-css',
      'uses-long-cache-ttl',
      'uses-text-compression',
      'total-byte-weight',
      'third-party-summary'
    ];
    const opportunities = [];
    for (const id of oppIds) {
      const a = lhr?.audits?.[id];
      if (!a) continue;
      const title = a.title || id;
      const displayValue = a.displayValue || null;
      const score = typeof a.score === 'number' ? a.score : null;
      // Only keep meaningful items
      if (score !== null && score >= 0.95) continue;
      opportunities.push({ id, title, displayValue, score });
      if (opportunities.length >= 6) break;
    }

    // runnerResult.report est une string JSON (ou tableau), on la garde telle quelle pour éviter JSON.stringify profond
    const rawReport = Array.isArray(runnerResult.report) ? runnerResult.report[0] : runnerResult.report;

    return {
      performance: cats.performance?.score ?? 0,
      accessibility: cats.accessibility?.score ?? 0,
      bestPractices: cats["best-practices"]?.score ?? 0,
      seo: cats.seo?.score ?? 0,
      metrics,
      opportunities,
      rawReport // JSON string
    };
  } catch (e) {
    return { performance: 0, accessibility: 0, bestPractices: 0, seo: 0, metrics: {}, opportunities: [], error: e.message };
  }
}
