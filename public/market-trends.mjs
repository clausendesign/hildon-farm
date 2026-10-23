// Changes require like stock, the same unit/statistic and a narrow reported weight range.
export function comparableTrends(prices,now=Date.now()){
 const groups=new Map();
 for(const p of prices){
  if(!p.saleDate||!p.weightMinKg||!p.weightMaxKg||p.weightEstimated||!/average|median/i.test(p.statistic)||/selected|top pen/i.test(p.statistic)||p.min!==p.max||now-Date.parse(p.saleDate)>90*86400000)continue;
  const key=[p.species,p.yard,p.classLabel,p.unit,p.statistic].join('|');const a=groups.get(key)||[];a.push(p);groups.set(key,a);
 }
 return [...groups.values()].flatMap(a=>{a.sort((x,y)=>x.saleDate.localeCompare(y.saleDate));const dates=new Map();for(const p of a){if(dates.has(p.saleDate))return [];dates.set(p.saleDate,p)}if(a.length<2||now-Date.parse(a.at(-1).saleDate)>14*86400000)return [];const weights=a.flatMap(p=>[p.weightMinKg,p.weightMaxKg]);if(Math.max(...weights)/Math.min(...weights)>1.1)return [];const before=a.at(-2),latest=a.at(-1);return [{before,latest,change:latest.min-before.min,percent:before.min?(latest.min-before.min)/before.min*100:null,points:a}];});
}
