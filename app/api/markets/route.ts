import {readBrief} from '../../../lib/market-store';
export const dynamic='force-dynamic';
export async function GET(){return Response.json(await readBrief(),{headers:{'Cache-Control':'no-store'}});}
