import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateBrief,retainForecasts} from '../lib/market-schema.ts';
const seed=JSON.parse(fs.readFileSync(new URL('../lib/market-seed.json',import.meta.url)));const copy=()=>structuredClone(seed);
assert.equal(validateBrief(copy()).prices.length,2);
for(const change of [d=>d.prices[0].unit='NZD/kg',d=>d.prices[0].sourceId='missing',d=>d.prices[0].publishedDate=null,d=>d.outlooks[0].priceRange={min:5,max:6},d=>d.sources[0].url='https://not-a-source.example/report']){const d=copy();change(d);assert.throws(()=>validateBrief(d));}
const saved={...seed,forecastHistory:retainForecasts({},seed)};const updated=copy();updated.outlooks[0].direction='soft';updated.outlooks[0].issuedAt='2026-10-25T00:00:00Z';const history=retainForecasts(saved,updated);assert.equal(history[0].direction,'uncertain');assert.equal(history[0].issuedAt,seed.outlooks[0].issuedAt);assert.equal(history[0].sources.length,2);
updated.outcomes=[{forecastId:seed.outlooks[0].id,score:'matched',sourceIds:[seed.sources[0].id]}];assert.throws(()=>retainForecasts(saved,updated),/uncertain/);
console.log('Market validation, source checks and immutable forecast history passed.');

const {comparableTrends}=await import('../public/market-trends.mjs');
assert.equal(comparableTrends(seed.prices).length,0);
const base={species:'cattle',yard:'Test yard',classLabel:'Test class',statistic:'Class average',weightMinKg:300,weightMaxKg:310,unit:'NZD/kg LW',min:5,max:5,saleDate:'2026-10-16'};
const latest={...base,min:5.5,max:5.5,saleDate:'2026-10-23'};const now=Date.parse('2026-10-24');assert.equal(comparableTrends([base,latest],now)[0].percent,10);
for(const variant of [{...latest,unit:'NZD/head'},{...latest,weightMinKg:400,weightMaxKg:410},{...latest,saleDate:null},{...latest,statistic:'Selected top pen'}])assert.equal(comparableTrends([base,variant],now).length,0);
console.log('Trend calculation excludes mismatched units, weights, dates and selected pens.');

updated.outcomes=[];assert.equal(retainForecasts(seed,updated)[0].direction,'uncertain');
