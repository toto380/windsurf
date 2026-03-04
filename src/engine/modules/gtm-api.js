import fs from "fs/promises";
import crypto from "node:crypto";
import { serializeError } from "../audit/cabinet-v21.js";

function b64url(buf){
  return Buffer.from(buf).toString("base64").replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}
function signJwtRS256(privateKeyPem, header, payload){
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(data), privateKeyPem);
  return `${data}.${b64url(sig)}`;
}
async function fetchJson(url, opts){
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw:text }; }
  if(!res.ok){
    const err = new Error(`HTTP ${res.status} ${url}`);
    err.status = res.status;
    err.responseData = data;
    throw err;
  }
  return data;
}

async function getAccessTokenFromServiceAccount(jsonPath, scopes){
  const raw = await fs.readFile(jsonPath, "utf-8");
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now()/1000);
  const jwt = signJwtRS256(sa.private_key, { alg:"RS256", typ:"JWT" }, {
    iss: sa.client_email,
    scope: scopes.join(" "),
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  });
  const tokenData = await fetchJson(sa.token_uri, {
    method:"POST",
    headers:{ "Content-Type":"application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  return { accessToken: tokenData.access_token, clientEmail: sa.client_email };
}

async function detectGtmPublicIdFromHtml(url){
  if(!url) return null;
  try{
    const res = await fetch(url, { redirect:"follow" });
    const html = await res.text();
    const m = html.match(/GTM-[A-Z0-9]+/);
    return m ? m[0] : null;
  }catch{ return null; }
}

function normalizeTag(tag){
  return {
    tagId: tag.tagId,
    name: tag.name,
    type: tag.type,
    parameter: tag.parameter || [],
    firingTriggerId: tag.firingTriggerId || [],
  };
}

function pickParam(params, key){
  const p = (params||[]).find(x=>x.key===key);
  return p ? p.value : undefined;
}

function extractGa4EventCandidates(tags){
  const out = [];
  for(const t of tags){
    const eventName = pickParam(t.parameter, "eventName") || pickParam(t.parameter, "event_name");
    if(eventName){
      out.push({ eventName, tagName:t.name, tagId:t.tagId });
    }
  }
  return out;
}

export async function scanGtmApi(params, pushPrivateError){
  const jsonPath = params?.serviceAccountJsonPath;
  if(!jsonPath){
    return { ok:false, audited:false, reason:"serviceAccountJsonPath manquant (requis pour GTM API)." };
  }

  let publicId = (params.gtmPublicId || "").trim();
  if(!publicId){
    publicId = await detectGtmPublicIdFromHtml(params.siteUrl || params.url || params.gscSiteUrl);
  }
  if(!publicId){
    return { ok:false, audited:false, reason:"Impossible d'identifier le conteneur (GTM-XXXX). Fournir gtmPublicId ou siteUrl avec GTM installé." };
  }

  try{
    const { accessToken, clientEmail } = await getAccessTokenFromServiceAccount(jsonPath, [
      "https://www.googleapis.com/auth/tagmanager.readonly"
    ]);

    const accounts = await fetchJson("https://tagmanager.googleapis.com/tagmanager/v2/accounts",{
      headers:{ "Authorization":`Bearer ${accessToken}` }
    });

    const accs = accounts?.account || [];
    let found = null;

    for(const a of accs){
      const containers = await fetchJson(`https://tagmanager.googleapis.com/tagmanager/v2/${a.path}/containers`,{
        headers:{ "Authorization":`Bearer ${accessToken}` }
      });
      for(const c of (containers?.container || [])){
        if(c.publicId === publicId){
          found = { account:a, container:c };
          break;
        }
      }
      if(found) break;
    }

    if(!found){
      return {
        ok:false, audited:false, publicId, clientEmail,
        reason:`Accès GTM manquant ou conteneur introuvable pour ${publicId}. Ajouter ${clientEmail} en Viewer dans GTM + activer Tag Manager API.`
      };
    }

    const containerPath = found.container.path; // accounts/{aid}/containers/{cid}

    let liveVersionName = null;
    try{
      const live = await fetchJson(`https://tagmanager.googleapis.com/tagmanager/v2/${containerPath}/versions:live`,{
        headers:{ "Authorization":`Bearer ${accessToken}` }
      });
      liveVersionName = live?.name || live?.containerVersionId || null;
    }catch{ /* best effort */ }

    const workspaces = await fetchJson(`https://tagmanager.googleapis.com/tagmanager/v2/${containerPath}/workspaces`,{
      headers:{ "Authorization":`Bearer ${accessToken}` }
    });
    const ws = (workspaces?.workspace || [])[0];
    const wsPath = ws?.path || null;

    let tags = [];
    if(wsPath){
      const tagList = await fetchJson(`https://tagmanager.googleapis.com/tagmanager/v2/${wsPath}/tags`,{
        headers:{ "Authorization":`Bearer ${accessToken}` }
      });
      tags = (tagList?.tag || []).map(normalizeTag);
    }

    const ga4Events = extractGa4EventCandidates(tags);
    const byEvent = new Map();
    for(const e of ga4Events){
      const k = String(e.eventName).trim().toLowerCase();
      if(!byEvent.has(k)) byEvent.set(k, []);
      byEvent.get(k).push(e);
    }
    const collisions = [];
    for(const [k, arr] of byEvent.entries()){
      if(arr.length > 1) collisions.push({ eventKey:k, tags:arr });
    }

    const evidence = [];
    evidence.push({ type:"Inventaire", text:`${tags.length} tag(s) récupéré(s) dans le workspace "${ws?.name || "—"}".` });
    if(collisions.length){
      evidence.push({ type:"Collision", text:`${collisions.length} collision(s) d'eventName : double comptage probable.` });
    }else{
      evidence.push({ type:"Collision", text:"Aucune collision d'eventName détectée (sur tags lisibles)." });
    }

    return {
      ok:true,
      audited:true,
      publicId,
      clientEmail,
      containerPath,
      liveVersionName,
      workspaceName: ws?.name || null,
      tagsCount: tags.length,
      ga4EventsCount: ga4Events.length,
      collisions,
      evidence,
    };
  }catch(err){
    const se = serializeError("gtm", err, { gtmPublicId: publicId });
    pushPrivateError?.(se);
    return { ok:false, audited:false, publicId, reason:`Erreur API GTM: ${se.status || ""} ${se.message}`, error: se };
  }
}
