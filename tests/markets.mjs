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

const {mergeHistory}=await import('../lib/market-history.ts');
const hb={sources:[{id:'s',url:'https://www.interest.co.nz/rural/livestock-schedule-averages',publisher:'interest.co.nz'}],prices:[{species:'lambs',yard:'Feilding',classLabel:'Store lambs',saleDate:'2026-10-20',min:150,max:180,unit:'NZD/head',statistic:'Range',sourceId:'s'},{species:'lambs',yard:'X',classLabel:'Y',saleDate:null,min:1,max:1,unit:'NZD/head',statistic:'R',sourceId:'s'}],schedules:[{seriesId:'lamb-yx-ni',weekOf:'2026-10-26',value:208,compare:{weekAgo:209,fourWeeksAgo:198,threeMonthsAgo:null,yearAgo:186,high52:209,low52:175},sourceId:'s'}]};
let h=mergeHistory(null,hb);
assert.equal(h.sales.length,1,'Undated sales stay out of history');
assert.deepEqual(h.schedules.map(p=>[p.weekOf,p.value,!!p.derived]),[['2025-10-27',186,true],['2026-09-28',198,true],['2026-10-19',209,true],['2026-10-26',208,false]]);
hb.schedules=[{...hb.schedules[0],weekOf:'2026-11-02',value:210,compare:{weekAgo:207}}];h=mergeHistory(h,hb);
assert.equal(h.schedules.find(p=>p.weekOf==='2026-10-26').value,208,'A real reading is never replaced by a later comparison column');
assert.equal(h.schedules.length,5);assert.equal(mergeHistory(h,hb).sales.length,1,'Saving twice does not duplicate sales');
console.log('Market history keeps real weekly readings, labels derived points and de-duplicates sales.');

const {mergeChartHistory}=await import('../lib/market-history.ts');
const weeks=Array.from({length:20},(_,i)=>({weekOf:new Date(Date.UTC(2026,5,7)+i*7*86400000).toISOString().slice(0,10),value:900+i}));
let ch=mergeChartHistory(h,'steer-p2-ni',weeks,'https://www.interest.co.nz/charts/rural/p2-steer2',Date.UTC(2026,9,24));
assert.equal(ch.charts['steer-p2-ni'].points.length,20);assert.equal(ch.schedules.length,h.schedules.length,'Table readings are kept apart from the weekly chart');
ch=mergeChartHistory(ch,'steer-p2-ni',weeks.slice(5),'https://www.interest.co.nz/charts/rural/p2-steer2',Date.UTC(2026,9,24));assert.equal(ch.charts['steer-p2-ni'].points.length,15,'A new import replaces the stored series');
assert.throws(()=>mergeChartHistory(ch,'steer-p2-ni',weeks,'x',Date.UTC(2027,5,1)),/out of date/);
assert.throws(()=>mergeChartHistory(ch,'steer-p2-ni',[...weeks,weeks[0]],'x',Date.UTC(2026,9,24)),/Duplicate/);
console.log('Weekly chart history is validated, replaced as a whole and kept apart from table readings.');

const {buildWelcome,pickJoke}=await import('../lib/welcome.ts');
const fc={daily:{time:['2026-10-23','2026-10-24','2026-10-25','2026-10-26','2026-10-27','2026-10-28'],weather_code:[0,51,3,0,95,80],temperature_2m_max:[15,16.6,18.3,20,17.5,15.5],temperature_2m_min:[8,9.4,10.3,9,9.1,8.4],precipitation_sum:[0,0.3,0,0,7,1.7],precipitation_probability_max:[0,55,2,0,100,35],wind_speed_10m_max:[20,31.4,32.8,20,40.7,36.8],wind_direction_10m_dominant:[0,296,307,0,334,302]}};
const w=buildWelcome(fc,'2026-10-24');
assert.equal(w.days.length,5,'Today plus four days, starting today');assert.equal(w.days[0].date,'2026-10-24');
assert.match(w.todayLine,/^Today in Feilding: drizzle, a top of 17 and a low of 9, with a fresh northwesterly\.$/);
assert.match(w.aheadLine,/Sunday, cloudy and 18; Monday, fine and clear and 20; Tuesday, thunderstorms and 18; Wednesday, showers and 16/);
assert.ok(!/kia ora/i.test(w.spoken));assert.notEqual(pickJoke(w.days[0],'2026-10-24'),pickJoke(w.days[0],'2026-10-25'),'The joke changes each day');
console.log('Daily welcome: forecast wording, five days from today and a joke that changes daily.');
