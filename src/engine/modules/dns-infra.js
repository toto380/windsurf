import dns from 'node:dns/promises';

function hasSpf(txts) {
  return txts.some(t => /v=spf1/i.test(t));
}
function hasDmarc(txts) {
  return txts.some(t => /v=DMARC1/i.test(t));
}

export async function scanDNS(url) {
  try {
    const hostname = new URL(url).hostname;

    const [a, aaaa, ns, mx, txt] = await Promise.all([
      dns.resolve4(hostname).catch(() => []),
      dns.resolve6(hostname).catch(() => []),
      dns.resolveNs(hostname).catch(() => []),
      dns.resolveMx(hostname).catch(() => []),
      dns.resolveTxt(hostname).catch(() => []),
    ]);

    const txtFlat = txt.flat().map(x => String(x)).slice(0, 200);

    // DMARC lives at _dmarc.<domain>
    const dmarcTxt = await dns.resolveTxt(`_dmarc.${hostname}`).catch(() => []);
    const dmarcFlat = dmarcTxt.flat().map(x => String(x)).slice(0, 50);

    let score = 100;
    const reasons = [];

    if (a.length === 0 && aaaa.length === 0) { score = 0; reasons.push('Aucun A/AAAA record'); }
    if (mx.length === 0) { score -= 10; reasons.push('Aucun MX record'); }
    if (!hasSpf(txtFlat)) { score -= 10; reasons.push('SPF non détecté (TXT)'); }
    if (!hasDmarc(dmarcFlat)) { score -= 10; reasons.push('DMARC non détecté (_dmarc)'); }
    if (ns.length === 0) { score -= 10; reasons.push('Aucun NS record'); }

    score = Math.max(0, score);

    return {
      score,
      reasons,
      hostname,
      records: {
        A: a,
        AAAA: aaaa,
        NS: ns,
        MX: mx.sort((x,y) => (x.priority||0)-(y.priority||0)).slice(0, 20),
        TXT: txtFlat,
        DMARC: dmarcFlat
      }
    };
  } catch (e) {
    return { score: 0, error: e.message };
  }
}
