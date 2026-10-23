import { env } from 'cloudflare:workers';

// Natural voice via Workers AI. Each clip is cached in R2, so a repeated line
// (the briefing, greetings) is generated once and replayed for free.
const MODEL = '@cf/deepgram/aura-2-en';
const SPEAKER = 'hyperion';
const MAX_CHARS = 1500;

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const audioResponse = (body: BodyInit) =>
  new Response(body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });

export async function POST(request: Request) {
  const { text } = await request.json().catch(() => ({})) as { text?: unknown };
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_CHARS) {
    return Response.json({ error: 'Text must be 1 to 1500 characters.' }, { status: 400 });
  }
  const ai = (env as any).AI;
  if (!ai) return Response.json({ error: 'Natural voice is unavailable.' }, { status: 503 });
  const key = `speech/${SPEAKER}/${await sha256(text.trim())}.mp3`;
  const cached = await env.BUCKET?.get(key);
  if (cached) return audioResponse(cached.body);
  let audio: ArrayBuffer;
  try {
    const result = await ai.run(MODEL, { text: text.trim(), speaker: SPEAKER, encoding: 'mp3' });
    audio = await new Response(result).arrayBuffer();
  } catch {
    // Includes the free daily allowance running out; the page falls back to the browser voice.
    return Response.json({ error: 'Natural voice is unavailable.' }, { status: 503 });
  }
  if (!audio.byteLength) return Response.json({ error: 'Natural voice is unavailable.' }, { status: 503 });
  await env.BUCKET?.put(key, audio, { httpMetadata: { contentType: 'audio/mpeg' } });
  return audioResponse(audio);
}
