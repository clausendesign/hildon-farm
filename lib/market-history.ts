// Pure merge rules for the long-running market history, kept apart from storage so they can be tested.
import {series} from './market-series.ts';
import {check} from './market-schema.ts';

const DAY=86400000;
const shift=(date:string,days:number)=>new Date(Date.parse(date+'T00:00:00Z')-days*DAY).toISOString().slice(0,10);
// The published comparison columns become approximate earlier points until a real weekly reading exists for that week.
const COMPARE:[string,number][]= [['weekAgo',7],['fourWeeksAgo',28],['threeMonthsAgo',91],['yearAgo',364]];

export function mergeHistory(old:any,brief:any){
 const source=(id:string)=>brief.sources.find((s:any)=>s.id===id);
 const points=new Map<string,any>((old?.schedules||[]).map((p:any)=>[p.seriesId+'|'+p.weekOf,p]));
 const near=(id:string,date:string)=>[...points.values()].some(p=>p.seriesId===id&&!p.derived&&Math.abs(Date.parse(p.weekOf)-Date.parse(date))<4*DAY);
 for(const s of brief.schedules||[]){
  if(!series[s.seriesId])continue;
  const src=source(s.sourceId);
  for(const [key,p] of points)if(p.seriesId===s.seriesId&&p.derived&&Math.abs(Date.parse(p.weekOf)-Date.parse(s.weekOf))<4*DAY)points.delete(key);
  points.set(s.seriesId+'|'+s.weekOf,{seriesId:s.seriesId,weekOf:s.weekOf,origin:'table',value:s.value,high52:s.compare?.high52??null,low52:s.compare?.low52??null,sourceUrl:src?.url,publisher:src?.publisher});
  for(const [k,days] of COMPARE){const v=s.compare?.[k];const date=shift(s.weekOf,days);if(v&&!near(s.seriesId,date)&&!points.has(s.seriesId+'|'+date))points.set(s.seriesId+'|'+date,{seriesId:s.seriesId,weekOf:date,value:v,derived:k,sourceUrl:src?.url,publisher:src?.publisher});}
 }
 const sales=new Map<string,any>((old?.sales||[]).map((p:any)=>[p.key,p]));
 for(const p of brief.prices||[]){
  if(!p.saleDate)continue;
  const key=[p.species,p.yard,p.classLabel,p.saleDate,p.unit,p.statistic].join('|');const src=source(p.sourceId);
  sales.set(key,{key,species:p.species,yard:p.yard,classLabel:p.classLabel,saleDate:p.saleDate,min:p.min,max:p.max,unit:p.unit,statistic:p.statistic,weightMinKg:p.weightMinKg??null,weightMaxKg:p.weightMaxKg??null,weightEstimated:!!p.weightEstimated,sourceUrl:src?.url,publisher:src?.publisher});
 }
 const byDate=(a:any,b:any)=>(a.weekOf||a.saleDate).localeCompare(b.weekOf||b.saleDate);
 return {schemaVersion:1,series,schedules:[...points.values()].sort(byDate).slice(-1500),sales:[...sales.values()].sort(byDate).slice(-2000),charts:old?.charts||{},updatedAt:new Date().toISOString()};
}

// A published weekly series (interest.co.nz chart, dated as at each Saturday) replaces the stored copy for that series.
// It is kept apart from the table readings so one chart never mixes the two dating conventions.
export function mergeChartHistory(old:any,seriesId:string,points:any[],sourceUrl:string,now=Date.now()){
 check(series[seriesId],'Unknown schedule series.');check(Array.isArray(points)&&points.length>=10&&points.length<=2000,'Expected 10 to 2000 weekly points.');
 const clean=points.map((p:any)=>({weekOf:String(p.weekOf),value:Number(p.value)}));
 for(const p of clean)check(/^\d{4}-\d{2}-\d{2}$/.test(p.weekOf)&&Number.isFinite(p.value)&&p.value>0&&p.value<100000,'Invalid weekly point.');
 clean.sort((a,b)=>a.weekOf.localeCompare(b.weekOf));
 for(let i=1;i<clean.length;i++)check(clean[i].weekOf!==clean[i-1].weekOf,'Duplicate week.');
 check(Date.parse(clean.at(-1)!.weekOf)>now-60*DAY,'The series is out of date.');
 const base=mergeHistory(old,{sources:[],prices:[],schedules:[]});
 base.charts={...(old?.charts||{}),[seriesId]:{sourceUrl,updatedAt:new Date(now).toISOString(),points:clean}};
 return base;
}
