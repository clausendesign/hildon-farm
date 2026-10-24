// Pure merge rules for the long-running market history, kept apart from storage so they can be tested.
import {series} from './market-series.ts';

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
  points.set(s.seriesId+'|'+s.weekOf,{seriesId:s.seriesId,weekOf:s.weekOf,value:s.value,high52:s.compare?.high52??null,low52:s.compare?.low52??null,sourceUrl:src?.url,publisher:src?.publisher});
  for(const [k,days] of COMPARE){const v=s.compare?.[k];const date=shift(s.weekOf,days);if(v&&!near(s.seriesId,date)&&!points.has(s.seriesId+'|'+date))points.set(s.seriesId+'|'+date,{seriesId:s.seriesId,weekOf:date,value:v,derived:k,sourceUrl:src?.url,publisher:src?.publisher});}
 }
 const sales=new Map<string,any>((old?.sales||[]).map((p:any)=>[p.key,p]));
 for(const p of brief.prices||[]){
  if(!p.saleDate)continue;
  const key=[p.species,p.yard,p.classLabel,p.saleDate,p.unit,p.statistic].join('|');const src=source(p.sourceId);
  sales.set(key,{key,species:p.species,yard:p.yard,classLabel:p.classLabel,saleDate:p.saleDate,min:p.min,max:p.max,unit:p.unit,statistic:p.statistic,weightMinKg:p.weightMinKg??null,weightMaxKg:p.weightMaxKg??null,weightEstimated:!!p.weightEstimated,sourceUrl:src?.url,publisher:src?.publisher});
 }
 const byDate=(a:any,b:any)=>(a.weekOf||a.saleDate).localeCompare(b.weekOf||b.saleDate);
 return {schemaVersion:1,series,schedules:[...points.values()].sort(byDate).slice(-1500),sales:[...sales.values()].sort(byDate).slice(-2000),updatedAt:new Date().toISOString()};
}
