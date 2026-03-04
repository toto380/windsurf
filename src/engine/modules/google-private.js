import fs from 'fs-extra';
import crypto from 'node:crypto';

// Scopes required for service-account private mode.
const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

function b64url(input){
  return Buffer.from(input).toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function serializeErr(err, source){
  const e = err ?? {};
  const out = {
    source,
    message: e?.message ? String(e.message) : String(e),
  };
  if (e?.code) out.code = e.code;
  if (e?.status) out.status = e.status;
  if (e?.stack) out.stack = String(e.stack);
  if (e?.responseText) out.responseData = String(e.responseText).slice(0, 4000);
  if (e?.response && e.response.data) out.responseData = e.response.data;
  return out;
}

function normalizeGa4PropertyName(ga4PropertyId){
  const raw = String(ga4PropertyId || '').trim();
  if (!raw) return null;
  if (raw.startsWith('properties/')) return raw;
  return `properties/${raw}`;
}

function normalizeGscSiteUrl(input){
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (raw.startsWith('sc-domain:')) return raw;
  try{
    const u = new URL(raw);
    // URL property must be exact and include trailing slash
    return `${u.protocol}//${u.hostname}/`;
  }catch{
    if (/^[a-z0-9.-]+$/i.test(raw)) return `sc-domain:${raw}`;
    return raw;
  }
}

function buildRange(days, offsetDays=0){
  const end = new Date(Date.now() - offsetDays*24*3600*1000);
  const start = new Date(end.getTime() - (days-1)*24*3600*1000);
  return {
    startDate: start.toISOString().slice(0,10),
    endDate: end.toISOString().slice(0,10),
  };
}

async function getAccessTokenFromServiceAccount(jsonPath, scopes, logger){
  const raw = await fs.readFile(jsonPath, 'utf8');
  const sa = JSON.parse(raw);

  logger?.('[google-private] service account loaded', {
    jsonPath,
    clientEmail: sa.client_email,
    tokenUri: sa.token_uri,
    scopes,
  });

  const now = Math.floor(Date.now()/1000);
  const header = { alg:'RS256', typ:'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: scopes.join(' '),
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  sign.end();
  const signature = sign.sign(sa.private_key);
  const jwt = `${unsigned}.${b64url(signature)}`;

  logger?.('[google-private] jwt built', {
    alg: header.alg,
    iss: claim.iss,
    aud: claim.aud,
    iat: claim.iat,
    exp: claim.exp,
    jwtPrefix: jwt.slice(0,18) + '…'
  });

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const t0 = Date.now();
  const res = await fetch(sa.token_uri, {
    method:'POST',
    headers: { 'Content-Type':'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const txt = await res.text();

  logger?.('[google-private] auth.token ' + (res.ok ? 'ok' : 'http error'), {
    url: sa.token_uri,
    status: res.status,
    at: new Date().toISOString(),
    ms: Date.now() - t0,
  });

  if (!res.ok){
    const err = new Error(`token error ${res.status}: ${txt.slice(0,800)}`);
    err.status = res.status;
    err.responseText = txt;
    throw err;
  }

  const data = JSON.parse(txt);
  if (!data.access_token) throw new Error('token response missing access_token');
  logger?.('[google-private] access token ok', { tokenPrefix: String(data.access_token).slice(0,14) + '…' });
  return data.access_token;
}

async function ga4RunReport(accessToken, propertyName, payload, logger, label){
  const url = `https://analyticsdata.googleapis.com/v1beta/${propertyName}:runReport`;
  const t0 = Date.now();
  const res = await fetch(url, {
    method:'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const txt = await res.text();
  logger?.(`[google-private] ${label} ` + (res.ok ? 'ok' : 'http error'), {
    url,
    status: res.status,
    at: new Date().toISOString(),
    ms: Date.now() - t0,
  });
  if (!res.ok){
    const err = new Error(`GA4 ${label} error ${res.status}: ${txt.slice(0,1200)}`);
    err.status = res.status;
    err.responseText = txt;
    // Annotate with actionable messages for common HTTP errors
    if (res.status === 403){
      err.actionableMessage = 'Permission denied (403): add the service account email as Viewer or Analyst on the GA4 property in Google Analytics Admin.';
    } else if (res.status === 404){
      err.actionableMessage = 'GA4 property not found (404): verify the property ID format (e.g. properties/123456789) and that it exists in Google Analytics.';
    } else if (res.status === 401){
      err.actionableMessage = 'Authentication failed (401): the service account JWT token could not be validated. Check that the service account JSON file is correct and not expired.';
    }
    throw err;
  }
  return JSON.parse(txt);
}

async function gscQuery(accessToken, siteUrl, payload, logger, label){
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const t0 = Date.now();
  const res = await fetch(url, {
    method:'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const txt = await res.text();
  logger?.(`[google-private] ${label} ` + (res.ok ? 'ok' : 'http error'), {
    url,
    status: res.status,
    at: new Date().toISOString(),
    ms: Date.now() - t0,
  });
  if (!res.ok){
    const err = new Error(`GSC ${label} error ${res.status}: ${txt.slice(0,1200)}`);
    err.status = res.status;
    err.responseText = txt;
    throw err;
  }
  return JSON.parse(txt);
}

function sumGscTotals(rows){
  const out = { clicks:0, impressions:0, ctr:0, position:null };
  if (!Array.isArray(rows) || !rows.length) return out;
  for (const r of rows){
    out.clicks += Number(r.clicks||0);
    out.impressions += Number(r.impressions||0);
  }
  out.ctr = out.impressions > 0 ? (out.clicks / out.impressions) : 0;
  const w = rows.reduce((a,r)=> a + Number(r.impressions||0), 0);
  if (w > 0){
    const pos = rows.reduce((a,r)=> a + (Number(r.position||0) * Number(r.impressions||0)), 0) / w;
    out.position = Number.isFinite(pos) ? pos : null;
  }
  return out;
}

/**
 * Private-only Google fetch (service account): GA4 Data API + Search Console API.
 * Returns a shape compatible with report-gen expectations (ga4Totals/ga4Channels/...).
 * Supports status: "OK" | "PARTIAL" | "FAIL" and pipelineLog for diagnostics.
 */
export async function fetchPrivateGoogleData({ serviceAccountJsonPath, ga4PropertyId, gscSiteUrl }, logger = console.log){
  const errors = [];
  const warnings = [];
  const pipelineLog = [];

  // ── Preflight validation ──────────────────────────────────────────────────
  const preflightStart = Date.now();
  const preflightInputs = {
    serviceAccountJsonPath: serviceAccountJsonPath ? '***' : null,
    ga4PropertyId: ga4PropertyId || null,
    gscSiteUrl: gscSiteUrl ? '***' : null,
  };

  if (!serviceAccountJsonPath){
    const msg = 'Missing serviceAccountJsonPath — provide a Google service account JSON file path.';
    errors.push({ source:'preflight', message: msg });
    pipelineLog.push({ module:'google-private', stage:'preflight', inputs: preflightInputs, status:'FAIL', duration_ms: Date.now()-preflightStart, error: msg });
    return { ok:false, status:'FAIL', errors, warnings, pipelineLog };
  }

  const propertyName = normalizeGa4PropertyName(ga4PropertyId);
  const siteUrlNorm = normalizeGscSiteUrl(gscSiteUrl);

  if (!propertyName){
    const msg = 'Missing ga4PropertyId — provide a GA4 property ID (e.g. 123456789 or properties/123456789).';
    errors.push({ source:'preflight', message: msg });
  }
  if (!siteUrlNorm){
    warnings.push({ source:'preflight', message:'missing gscSiteUrl — Search Console data will be skipped.' });
  }

  if (!propertyName){
    pipelineLog.push({ module:'google-private', stage:'preflight', inputs: preflightInputs, status:'FAIL', duration_ms: Date.now()-preflightStart, error: errors[0]?.message || null, warning: null });
    return { ok:false, status:'FAIL', errors, warnings, pipelineLog };
  }

  pipelineLog.push({ module:'google-private', stage:'preflight', inputs: preflightInputs, status:'OK', duration_ms: Date.now()-preflightStart, error: null, warning: warnings.length ? warnings[0]?.message : null });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authStart = Date.now();
  let accessToken;
  try{
    accessToken = await getAccessTokenFromServiceAccount(serviceAccountJsonPath, [GA4_SCOPE, GSC_SCOPE], logger);
    pipelineLog.push({ module:'google-private', stage:'auth', status:'OK', duration_ms: Date.now()-authStart });
  }catch(e){
    const se = serializeErr(e, 'auth');
    if (e.status === 401){
      se.actionableMessage = 'Authentication failed (401): check that the service account JSON file is valid and the private key is correct.';
    }
    errors.push(se);
    pipelineLog.push({ module:'google-private', stage:'auth', status:'FAIL', duration_ms: Date.now()-authStart, error: se.message });
    return { ok:false, status:'FAIL', errors, warnings, pipelineLog };
  }

  // Periods: 30 days (N) vs previous 30 days (N-1)
  const rangeN = buildRange(30, 0);
  const rangeP = buildRange(30, 30);

  // ── GA4 ───────────────────────────────────────────────────────────────────
  const ga4 = { ok:false, propertyName, range: rangeN, prevRange: rangeP, totals:null, channels:[], sourceMedium:[], campaigns:[], events:[], errors:[] };
  if (propertyName){
    // ga4.totals
    const t0Totals = Date.now();
    try{
      const totalsData = await ga4RunReport(accessToken, propertyName, {
        dateRanges: [rangeN],
        metrics: [{ name:'sessions' }, { name:'totalUsers' }, { name:'conversions' }, { name:'purchaseRevenue' }],
        limit: 1,
      }, logger, 'ga4.totals');

      const r = totalsData.rows?.[0];
      ga4.totals = {
        sessions: Number(r?.metricValues?.[0]?.value || 0),
        users: Number(r?.metricValues?.[1]?.value || 0),
        conversions: Number(r?.metricValues?.[2]?.value || 0),
        revenue: Number(r?.metricValues?.[3]?.value || 0),
      };
      pipelineLog.push({ module:'google-private', stage:'ga4_totals', status:'OK', duration_ms: Date.now()-t0Totals, rows: totalsData.rows?.length || 0, metrics: ['sessions','users','conversions','revenue'] });
    }catch(e){
      const se = serializeErr(e, 'ga4.totals');
      if (e.actionableMessage) se.actionableMessage = e.actionableMessage;
      ga4.errors.push(se);
      errors.push(se);
      pipelineLog.push({ module:'google-private', stage:'ga4_totals', status:'FAIL', duration_ms: Date.now()-t0Totals, error: se.message, actionableMessage: se.actionableMessage || null });
    }

    // ga4.channels
    const t0Ch = Date.now();
    try{
      const channelsData = await ga4RunReport(accessToken, propertyName, {
        dateRanges: [rangeN],
        dimensions: [{ name:'sessionDefaultChannelGroup' }],
        metrics: [{ name:'sessions' }, { name:'totalUsers' }, { name:'conversions' }, { name:'purchaseRevenue' }],
        orderBys: [{ metric:{ metricName:'sessions' }, desc:true }],
        limit: 10,
      }, logger, 'ga4.channels');
      ga4.channels = (channelsData.rows || []).map(r => ({
        channel: r.dimensionValues?.[0]?.value || '',
        sessions: Number(r.metricValues?.[0]?.value || 0),
        users: Number(r.metricValues?.[1]?.value || 0),
        conversions: Number(r.metricValues?.[2]?.value || 0),
        revenue: Number(r.metricValues?.[3]?.value || 0),
      }));
      pipelineLog.push({ module:'google-private', stage:'ga4_channels', status:'OK', duration_ms: Date.now()-t0Ch, rows: ga4.channels.length });
    }catch(e){
      const se = serializeErr(e, 'ga4.channels');
      if (e.actionableMessage) se.actionableMessage = e.actionableMessage;
      ga4.errors.push(se);
      errors.push(se);
      warnings.push({ source:'ga4.channels', message:'Channel breakdown unavailable — only totals will be shown.' });
      pipelineLog.push({ module:'google-private', stage:'ga4_channels', status:'FAIL', duration_ms: Date.now()-t0Ch, error: se.message });
    }

    // ga4.sourceMedium
    const t0Sm = Date.now();
    try{
      const smData = await ga4RunReport(accessToken, propertyName, {
        dateRanges: [rangeN],
        dimensions: [{ name:'sessionSourceMedium' }],
        metrics: [{ name:'sessions' }, { name:'conversions' }],
        orderBys: [{ metric:{ metricName:'sessions' }, desc:true }],
        limit: 15,
      }, logger, 'ga4.sourceMedium');
      ga4.sourceMedium = (smData.rows || []).map(r => ({
        sourceMedium: r.dimensionValues?.[0]?.value || '',
        sessions: Number(r.metricValues?.[0]?.value || 0),
        conversions: Number(r.metricValues?.[1]?.value || 0),
      }));
      pipelineLog.push({ module:'google-private', stage:'ga4_source_medium', status:'OK', duration_ms: Date.now()-t0Sm, rows: ga4.sourceMedium.length });
    }catch(e){
      const se = serializeErr(e, 'ga4.sourceMedium');
      if (e.actionableMessage) se.actionableMessage = e.actionableMessage;
      ga4.errors.push(se);
      warnings.push({ source:'ga4.sourceMedium', message:'Source/medium breakdown unavailable.' });
      pipelineLog.push({ module:'google-private', stage:'ga4_source_medium', status:'FAIL', duration_ms: Date.now()-t0Sm, error: se.message });
    }

    // ga4.campaigns (source/medium/campaign top 20)
    const t0Camp = Date.now();
    try{
      const campData = await ga4RunReport(accessToken, propertyName, {
        dateRanges: [rangeN],
        dimensions: [{ name:'sessionSource' }, { name:'sessionMedium' }, { name:'sessionCampaignName' }],
        metrics: [{ name:'sessions' }, { name:'totalUsers' }, { name:'conversions' }, { name:'purchaseRevenue' }],
        orderBys: [{ metric:{ metricName:'sessions' }, desc:true }],
        limit: 20,
      }, logger, 'ga4.campaigns');
      ga4.campaigns = (campData.rows || []).map(r => ({
        source: r.dimensionValues?.[0]?.value || '',
        medium: r.dimensionValues?.[1]?.value || '',
        campaign: r.dimensionValues?.[2]?.value || '',
        sessions: Number(r.metricValues?.[0]?.value || 0),
        users: Number(r.metricValues?.[1]?.value || 0),
        conversions: Number(r.metricValues?.[2]?.value || 0),
        revenue: Number(r.metricValues?.[3]?.value || 0),
      }));
      pipelineLog.push({ module:'google-private', stage:'ga4_campaigns', status:'OK', duration_ms: Date.now()-t0Camp, rows: ga4.campaigns.length });
    }catch(e){
      const se = serializeErr(e, 'ga4.campaigns');
      if (e.actionableMessage) se.actionableMessage = e.actionableMessage;
      ga4.errors.push(se);
      warnings.push({ source:'ga4.campaigns', message:'Campaign breakdown unavailable.' });
      pipelineLog.push({ module:'google-private', stage:'ga4_campaigns', status:'FAIL', duration_ms: Date.now()-t0Camp, error: se.message });
    }

    // ga4.events (top 10 events by count)
    const t0Ev = Date.now();
    try{
      const evData = await ga4RunReport(accessToken, propertyName, {
        dateRanges: [rangeN],
        dimensions: [{ name:'eventName' }],
        metrics: [{ name:'eventCount' }, { name:'conversions' }],
        orderBys: [{ metric:{ metricName:'eventCount' }, desc:true }],
        limit: 10,
      }, logger, 'ga4.events');
      ga4.events = (evData.rows || []).map(r => ({
        eventName: r.dimensionValues?.[0]?.value || '',
        eventCount: Number(r.metricValues?.[0]?.value || 0),
        conversions: Number(r.metricValues?.[1]?.value || 0),
      }));
      pipelineLog.push({ module:'google-private', stage:'ga4_events', status:'OK', duration_ms: Date.now()-t0Ev, rows: ga4.events.length });
    }catch(e){
      const se = serializeErr(e, 'ga4.events');
      if (e.actionableMessage) se.actionableMessage = e.actionableMessage;
      ga4.errors.push(se);
      warnings.push({ source:'ga4.events', message:'Event breakdown unavailable.' });
      pipelineLog.push({ module:'google-private', stage:'ga4_events', status:'FAIL', duration_ms: Date.now()-t0Ev, error: se.message });
    }

    // Mark GA4 as ok if totals were fetched (PARTIAL tolerance: individual sub-reports may fail)
    ga4.ok = !!ga4.totals;
  }

  // ── GSC ───────────────────────────────────────────────────────────────────
  const gsc = { ok:false, site: siteUrlNorm, range: rangeN, prevRange: rangeP, totals:null, pages:[], queries:[], errors:[], tried:[] };
  if (siteUrlNorm){
    const candidates = [];
    if (siteUrlNorm.startsWith('sc-domain:')){
      candidates.push(siteUrlNorm);
    } else {
      candidates.push(siteUrlNorm);
      try{
        const u = new URL(siteUrlNorm);
        candidates.push(`sc-domain:${u.hostname}`);
      }catch{}
    }

    for (const candidate of candidates){
      gsc.tried.push(candidate);
      const t0Gsc = Date.now();
      try{
        const pagesData = await gscQuery(accessToken, candidate, {
          startDate: rangeN.startDate,
          endDate: rangeN.endDate,
          dimensions: ['page'],
          rowLimit: 10,
        }, logger, 'gsc.pages');
        gsc.pages = (pagesData.rows || []).map(r => ({
          page: r.keys?.[0] || '',
          clicks: Number(r.clicks||0),
          impressions: Number(r.impressions||0),
          ctr: Number(r.ctr||0),
          position: Number(r.position||0),
        }));

        const queriesData = await gscQuery(accessToken, candidate, {
          startDate: rangeN.startDate,
          endDate: rangeN.endDate,
          dimensions: ['query'],
          rowLimit: 10,
        }, logger, 'gsc.queries');
        gsc.queries = (queriesData.rows || []).map(r => ({
          query: r.keys?.[0] || '',
          clicks: Number(r.clicks||0),
          impressions: Number(r.impressions||0),
          ctr: Number(r.ctr||0),
          position: Number(r.position||0),
        }));

        gsc.totals = sumGscTotals(gsc.pages);
        gsc.site = candidate;
        gsc.ok = true;
        pipelineLog.push({ module:'google-private', stage:'gsc', status:'OK', duration_ms: Date.now()-t0Gsc, site: candidate });
        break;
      }catch(e){
        const se = serializeErr(e, 'gsc');
        if (e.status === 403) se.actionableMessage = 'Search Console permission denied (403): add the service account email as a property user in Google Search Console.';
        else if (e.status === 404) se.actionableMessage = 'GSC property not found (404): verify the site URL is registered in Google Search Console.';
        gsc.errors.push(se);
        pipelineLog.push({ module:'google-private', stage:'gsc', status:'FAIL', duration_ms: Date.now()-t0Gsc, site: candidate, error: se.message });
        // keep trying fallbacks
      }
    }
    if (!gsc.ok){
      errors.push(...gsc.errors);
      warnings.push({ source:'gsc', message:'Search Console data unavailable — GA4 data may still be present.' });
    }
  }

  // ── Determine overall status ──────────────────────────────────────────────
  const hasAnyData = ga4.ok || gsc.ok;
  const hasPartialErrors = (ga4.errors.length > 0 || gsc.errors.length > 0) && hasAnyData;
  const status = !hasAnyData ? 'FAIL' : hasPartialErrors ? 'PARTIAL' : 'OK';

  // Compatibility layer expected by report-gen.js
  return {
    ok: hasAnyData,
    status,
    ga4,
    gsc,
    errors,
    warnings,
    pipelineLog,
    ga4Totals: ga4.ok ? { ok:true, totals: ga4.totals, range: rangeN } : { ok:false },
    ga4Channels: ga4.ok ? { ok:true, rows: ga4.channels, range: rangeN } : { ok:false },
    ga4SourceMedium: ga4.ok ? { ok:true, rows: ga4.sourceMedium, range: rangeN } : { ok:false },
    ga4Campaigns: ga4.ok ? { ok:true, rows: ga4.campaigns, range: rangeN } : { ok:false },
    ga4Events: ga4.ok ? { ok:true, rows: ga4.events, range: rangeN } : { ok:false },
    gscTotals: gsc.ok ? { ok:true, totals: gsc.totals, range: rangeN, site: gsc.site, tried: gsc.tried } : { ok:false },
    gscPages: gsc.ok ? { ok:true, rows: gsc.pages, range: rangeN, site: gsc.site, tried: gsc.tried } : { ok:false },
    gscQueries: gsc.ok ? { ok:true, rows: gsc.queries, range: rangeN, site: gsc.site, tried: gsc.tried } : { ok:false },
  };
}
