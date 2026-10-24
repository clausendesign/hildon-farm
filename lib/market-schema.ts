const allowedHosts=['spreaker.com','api.spreaker.com','omny.fm','omnycontent.com','feildingsaleyards.co.nz','beeflambnz.com','farmersweekly.co.nz','saleyard.co.nz','mylivestock.co.nz','rnz.co.nz','nzherald.co.nz','interest.co.nz'];
export function check(ok:unknown,message:string):asserts ok{if(!ok)throw new Error(message);}
function validUrl(s:any){try{const u=new URL(s);return u.protocol==='https:'&&allowedHosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h));}catch{return false;}}
export function validateBrief(d:any){
 check(d&&d.schemaVersion===1,'Expected schemaVersion 1.');check(typeof d.checkedAt==='string'&&Number.isFinite(Date.parse(d.checkedAt))&&Date.parse(d.checkedAt)<Date.now()+3600000,'Invalid checkedAt.');
 for(const [k,n]of Object.entries({sources:40,briefs:30,prices:200,events:30,outlooks:60,outcomes:100})){check(Array.isArray(d[k])&&d[k].length<=n,`Invalid ${k}.`);}
 const ids=new Set<string>();for(const s of d.sources){check(typeof s.id==='string'&&!ids.has(s.id),'Source IDs must be unique.');ids.add(s.id);check(validUrl(s.url),'Unsupported source URL.');check(typeof s.title==='string'&&s.title.length<=250&&typeof s.publisher==='string','Invalid source title or publisher.');if(s.publishedAt)check(Number.isFinite(Date.parse(s.publishedAt)),'Invalid publication date.');}
 const refs=(x:any)=>{check(Array.isArray(x.sourceIds)&&x.sourceIds.length>0&&x.sourceIds.every((s:string)=>ids.has(s)),'Every assessment needs valid sourceIds.');};
 for(const b of d.briefs){check(['cattle','lambs','sheep','weather'].includes(b.species),'Invalid stock class.');check(['firm','steady','soft','mixed','unknown','caution'].includes(b.mood),'Invalid mood.');check(typeof b.summary==='string'&&b.summary.length<=750,'Keep summaries short and in your own words.');refs(b);}
 for(const p of d.prices){check(ids.has(p.sourceId),'Price source missing.');check(['NZD/kg LW','NZD/kg CW','NZD/head'].includes(p.unit),'Prices must state liveweight, carcass weight, or per head.');check(/^\d{4}-\d{2}-\d{2}$/.test(p.saleDate)||(p.saleDate===null&&/^\d{4}-\d{2}-\d{2}$/.test(p.publishedDate)&&typeof p.dateBasis==='string'),'State the sale date or explicitly label its absence and publication date.');check(Number.isFinite(p.min)&&p.min>=0&&Number.isFinite(p.max)&&p.max>=p.min,'Invalid price range.');check(p.evidenceType==='reported-result','Price values must be reported results.');}
 const events=new Set();for(const e of d.events){check(typeof e.id==='string'&&!events.has(e.id)&&/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&/^\d{2}:\d{2}$/.test(e.time),'Invalid sale date/time or ID.');events.add(e.id);check(ids.has(e.sourceId),'Sale calendar source missing.');}
 for(const o of d.outlooks){check(events.has(o.eventId),'Outlook needs a known sale.');check(['firm','steady','soft','mixed','uncertain'].includes(o.direction),'Invalid forecast direction.');check(['low','medium','high'].includes(o.confidence),'Invalid confidence.');check(o.type==='app-assessment'||o.type==='analyst-forecast','Label forecast origin.');check(typeof o.summary==='string'&&o.summary.length<=1000,'Invalid outlook summary.');check(o.priceRange===null,'Numeric price forecasts are not enabled without a validated comparable-price model.');refs(o);}
 for(const o of d.outcomes){check(typeof o.forecastId==='string'&&['matched','partly','missed','unscored'].includes(o.score),'Invalid outcome.');if(o.score!=='unscored')refs(o);}
 check(JSON.stringify(d).length<180000,'Brief is too large.');return d;
}
export function retainForecasts(old:any,d:any){
 const history=new Map<string,any>((old.forecastHistory||[]).map((f:any)=>[f.id,f]));
 for(const data of [old,d])for(const f of (data.outlooks||[])){if(!history.has(f.id))history.set(f.id,{...f,issuedAt:f.issuedAt||data.checkedAt,event:data.events.find((e:any)=>e.id===f.eventId),sources:data.sources.filter((s:any)=>f.sourceIds.includes(s.id))});}
 for(const o of d.outcomes){const original=history.get(o.forecastId);check(original,'Outcome needs a recorded forecast.');check(original.direction!=='uncertain'||o.score==='unscored','An uncertain forecast cannot be scored as a directional prediction.');}
 return [...history.values()].slice(-150);
}
