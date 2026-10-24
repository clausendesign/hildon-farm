import {check,validateBrief,retainForecasts} from './market-schema';
import { env } from 'cloudflare:workers';
import seed from './market-seed.json';
import instructions from './market-instructions.json';
import {mergeHistory,mergeChartHistory} from './market-history';
const HISTORY_KEY='markets/history.json';
const KEY='markets/current.json';
export const updateInstructions=instructions;
// The daily refresh on Todd's Mac signs in with the MARKET_EDITOR_TOKEN secret (the ChatGPT sign-in no longer applies here).
export function canEdit(request:Request){const token=(env as any).MARKET_EDITOR_TOKEN as string|undefined;const given=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';if(token&&given.length===token.length&&crypto.subtle.timingSafeEqual(new TextEncoder().encode(given),new TextEncoder().encode(token)))return true;const allowed=(env as any).MARKET_EDITOR_EMAIL;return !!allowed&&request.headers.get('oai-authenticated-user-email')?.toLowerCase()===allowed.toLowerCase();}
export async function readBrief(){const bucket=env.BUCKET;if(!bucket)return {...seed,persisted:false};const item=await bucket.get(KEY);return item?{...await item.json() as any,persisted:true}:{...seed,persisted:false};}
export async function writeBrief(d:any,expectedRevision:number){
 validateBrief(d);check(env.BUCKET,'Persistent storage is unavailable.');const obj=await env.BUCKET.get(KEY);const old:any=obj?await obj.json():seed;
 check((old.revision||0)===expectedRevision,'Revision changed. Read the brief again before updating.');
 const history=retainForecasts(old,d);
 // The first issued forecast is retained, so later hindsight cannot rewrite it.
 const next:any={...d,revision:expectedRevision+1,forecastHistory:history,savedAt:new Date().toISOString()};delete next.persisted;
 const put=await env.BUCKET.put(KEY,JSON.stringify(next),{httpMetadata:{contentType:'application/json'},onlyIf:obj?{etagMatches:obj.etag}:{etagDoesNotMatch:'*'}});check(put,'Concurrent update. Read and retry.');
 // Every saved schedule reading and dated sale result is added to the long-running history used for seasonal views.
 const h=await env.BUCKET.get(HISTORY_KEY);await env.BUCKET.put(HISTORY_KEY,JSON.stringify(mergeHistory(h?await h.json():null,next)),{httpMetadata:{contentType:'application/json'}});
 return {revision:next.revision,checkedAt:next.checkedAt,persisted:true,forecastsRecorded:next.forecastHistory.length};
}
export async function readHistory(){const h=env.BUCKET&&await env.BUCKET.get(HISTORY_KEY);return h?await h.json():mergeHistory(null,(await readBrief()));}
export async function writeChartHistory(seriesId:string,points:any[],sourceUrl:string){check(env.BUCKET,'Persistent storage is unavailable.');const h=await env.BUCKET.get(HISTORY_KEY);const next=mergeChartHistory(h?await h.json():null,seriesId,points,sourceUrl);await env.BUCKET.put(HISTORY_KEY,JSON.stringify(next),{httpMetadata:{contentType:'application/json'}});const c=next.charts[seriesId];return {seriesId,weeks:c.points.length,first:c.points[0].weekOf,latest:c.points.at(-1).weekOf};}
