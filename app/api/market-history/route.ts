import {readHistory} from '../../../lib/market-store';
export const dynamic='force-dynamic';
export async function GET(){return Response.json(await readHistory(),{headers:{'Cache-Control':'no-store'}});}
