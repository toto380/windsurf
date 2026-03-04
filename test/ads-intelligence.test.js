import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdsIntelligence } from '../src/engine/v2/ads/ads-intelligence.js';

test('buildAdsIntelligence handles missing sources', () => {
  const ai = buildAdsIntelligence({ google:{ ok:false }, meta:{ ok:false } }, { reportModules:{ privateAds:true }});
  assert.equal(ai.ok, false);
  assert.ok(ai.quality.score <= 100);
});

test('buildAdsIntelligence computes ROAS when value & spend exist', () => {
  const ai = buildAdsIntelligence({
    google:{ ok:true, totals30d:{ cost:100, clicks:50, impressions:1000, conversions:10, value:250 }, files:[{ok:true}] },
    meta:{ ok:false }
  }, {});
  assert.equal(ai.ok, true);
  const g = ai.platforms.google;
  assert.equal(Math.round(g.totals.spend), 100);
  assert.ok(g.metrics.roas.ok);
  assert.equal(Number(g.metrics.roas.value.toFixed(2)), 2.5);
});

test('Ads Intelligence does not invent ROAS when value missing', () => {
  const ai = buildAdsIntelligence({
    google:{ ok:true, totals30d:{ cost:100, clicks:50, impressions:1000, conversions:10 }, files:[{ok:true}] },
    meta:{ ok:false }
  }, {});
  const g = ai.platforms.google;
  assert.equal(g.metrics.roas.ok, false);
  assert.equal(g.metrics.roas.value, null);
});

test('Quality gate penalizes clicks > impressions', () => {
  const ai = buildAdsIntelligence({
    google:{ ok:true, totals30d:{ cost:100, clicks:200, impressions:10, conversions:1, value:10 }, files:[{ok:true}] },
    meta:{ ok:false }
  }, {});
  assert.ok(ai.quality.score < 85);
  assert.ok(ai.quality.issues.some(x => String(x).toLowerCase().includes('clicks') && String(x).toLowerCase().includes('impressions')));
});

test('ROI_with_margin computed only when grossMargin provided', () => {
  const aiA = buildAdsIntelligence({
    google:{ ok:true, totals30d:{ cost:100, clicks:50, impressions:1000, conversions:5, value:400 }, files:[{ok:true}] },
    meta:{ ok:false }
  }, { grossMargin: 50 });
  assert.equal(aiA.platforms.google.metrics.roiWithMargin.ok, true);
  assert.equal(aiA.platforms.google.metrics.roiWithMargin.value, 1);

  const aiB = buildAdsIntelligence({
    google:{ ok:true, totals30d:{ cost:100, clicks:50, impressions:1000, conversions:5, value:400 }, files:[{ok:true}] },
    meta:{ ok:false }
  }, { grossMargin: 0 });
  assert.equal(aiB.platforms.google.metrics.roiWithMargin.ok, false);
});
