import { env } from 'cloudflare:workers';

// Weigh records for the herd, kept in R2 behind a family passcode (the CATTLE_PIN secret).
const KEY = 'cattle/records.json';
const MAX_RECORDS = 50000;

type WeighRecord = { id: string; eid: string; vid: string; weight: number; date: string; source: string; addedBy: string };

function unauthorised(request: Request) {
  const pin = (env as any).CATTLE_PIN as string | undefined;
  if (!pin) return Response.json({ error: 'Cattle weights are not set up yet.' }, { status: 503 });
  const given = request.headers.get('x-farm-pin') || '';
  if (given.length !== pin.length || !crypto.subtle.timingSafeEqual(new TextEncoder().encode(given), new TextEncoder().encode(pin))) {
    return Response.json({ error: 'That passcode isn’t right.' }, { status: 401 });
  }
  return null;
}

async function load(): Promise<{ records: WeighRecord[]; etag?: string }> {
  const item = await env.BUCKET.get(KEY);
  return item ? { records: (await item.json() as any).records || [], etag: item.etag } : { records: [] };
}

const clean = (value: unknown, max = 40) => String(value ?? '').trim().slice(0, max);

function validate(input: any): WeighRecord | null {
  const eid = clean(input?.eid).replace(/\s+/g, ''), vid = clean(input?.vid);
  const weight = Number(input?.weight), date = clean(input?.date, 10);
  if (!eid && !vid) return null;
  if (!(weight > 0 && weight < 2000)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { id: `${eid || vid}|${date}|${weight}`, eid, vid, weight: Math.round(weight * 10) / 10, date, source: clean(input?.source, 80), addedBy: clean(input?.addedBy, 20) };
}

export async function GET(request: Request) {
  const denied = unauthorised(request); if (denied) return denied;
  return Response.json({ records: (await load()).records }, { headers: { 'Cache-Control': 'no-store' } });
}

// Adds records; the same animal, date and weight is only stored once, so re-importing a file is harmless.
export async function POST(request: Request) {
  const denied = unauthorised(request); if (denied) return denied;
  const body = await request.json().catch(() => null) as any;
  const incoming = (Array.isArray(body?.records) ? body.records : []).slice(0, 5000).map(validate).filter(Boolean) as WeighRecord[];
  if (!incoming.length) return Response.json({ error: 'No usable weights were found.' }, { status: 400 });
  for (let attempt = 0; attempt < 3; attempt++) {
    const { records, etag } = await load();
    const known = new Set(records.map(r => r.id));
    const added = incoming.filter(r => !known.has(r.id) && known.add(r.id));
    const next = [...records, ...added].slice(-MAX_RECORDS);
    const put = await env.BUCKET.put(KEY, JSON.stringify({ records: next }), { httpMetadata: { contentType: 'application/json' }, onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: '*' } });
    if (put) return Response.json({ added: added.length, skipped: incoming.length - added.length, total: next.length });
  }
  return Response.json({ error: 'Someone else was saving at the same time. Please try again.' }, { status: 409 });
}

export async function DELETE(request: Request) {
  const denied = unauthorised(request); if (denied) return denied;
  const id = new URL(request.url).searchParams.get('id');
  const { records, etag } = await load();
  const next = records.filter(r => r.id !== id);
  if (next.length === records.length) return Response.json({ error: 'That weight wasn’t found.' }, { status: 404 });
  const put = await env.BUCKET.put(KEY, JSON.stringify({ records: next }), { httpMetadata: { contentType: 'application/json' }, onlyIf: etag ? { etagMatches: etag } : undefined });
  if (!put) return Response.json({ error: 'Please try again.' }, { status: 409 });
  return Response.json({ total: next.length });
}
