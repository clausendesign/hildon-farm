import { env } from 'cloudflare:workers';
import { buildWelcome, fetchForecast } from '../../../lib/welcome';
export const dynamic = 'force-dynamic';
const nzToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
// One welcome per NZ day: the first visit (or the morning voice warm-up) fetches the forecast, everyone after shares it.
export async function GET() {
  const today = nzToday(), key = `welcome/${today}.json`, bucket = (env as any).BUCKET;
  const saved = bucket && await bucket.get(key);
  if (saved) return Response.json(await saved.json(), { headers: { 'Cache-Control': 'no-store' } });
  try {
    const welcome = buildWelcome(await fetchForecast(), today);
    if (bucket) await bucket.put(key, JSON.stringify(welcome), { httpMetadata: { contentType: 'application/json' } });
    return Response.json(welcome, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'The forecast is unavailable just now.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
