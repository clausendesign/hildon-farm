import {readBrief,writeBrief,canEdit,updateInstructions} from '../../lib/market-store';
export const dynamic='force-dynamic';
const tools=[
 {name:'get_market_brief',description:'Read Hildon Farm local livestock market briefing, source dates, upcoming Feilding sales, prices and original forecast history.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'get_market_update_instructions',description:'Read the verified public sources and rules for refreshing Hildon Farm market commentary and next-sale outlooks.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'update_market_brief',description:'Owner-only: publish the refreshed Hildon Farm livestock briefing from verified public sources. Preserve original forecasts and explicit price units. Read current briefing and instructions first.',inputSchema:{type:'object',required:['brief','expected_revision'],properties:{brief:{type:'object',description:'Complete briefing in the schema returned by get_market_brief; arrays sources, briefs, prices, events, outlooks, outcomes are required. No raw reports or paid data.'},expected_revision:{type:'integer',minimum:0}},additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true}}
];
export async function POST(request:Request){let q:any;try{q=await request.json();}catch{return Response.json({error:'Invalid JSON'},{status:400});}const response=(result:any)=>Response.json({jsonrpc:'2.0',id:q.id??null,result});
 if(q.method==='server/discover')return response({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
 if(q.method==='initialize')return response({protocolVersion:q.params?.protocolVersion||'2026-07-28',capabilities:{tools:{}},serverInfo:{name:'Hildon Farm Markets',version:'1.0.0'}});
 if(q.method==='notifications/initialized')return new Response(null,{status:202});if(q.method==='ping')return response({});if(q.method==='tools/list')return response({tools});
 if(q.method==='tools/call'){try{let result:any;switch(q.params?.name){case'get_market_brief':result=await readBrief();break;case'get_market_update_instructions':result=updateInstructions;break;case'update_market_brief':if(!canEdit(request))throw Error('Owner authorization required.');result=await writeBrief(q.params.arguments.brief,q.params.arguments.expected_revision);break;default:throw Error('Unknown tool');}return response({content:[{type:'text',text:JSON.stringify(result)}]});}catch(e){return response({isError:true,content:[{type:'text',text:(e as Error).message}]});}}
 return Response.json({jsonrpc:'2.0',id:q.id??null,error:{code:-32601,message:'Method not found'}});
}
