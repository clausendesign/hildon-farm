import { env } from 'cloudflare:workers';

// Natural voice. The Kiwi voice comes from Azure's free tier when its key is set,
// with Cloudflare's Australian voice as the backup. Each clip is cached in R2, so a
// repeated line (the briefing, greetings) is generated once and replayed for free.
const AZURE_VOICE = 'en-NZ-MitchellNeural';
const MODEL = '@cf/deepgram/aura-2-en';
const SPEAKER = 'hyperion';
const MAX_CHARS = 1500;

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const audioResponse = (body: BodyInit) =>
  new Response(body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });

const xml = (text: string) => text.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

async function azure(text: string): Promise<ArrayBuffer | null> {
  const key = (env as any).AZURE_SPEECH_KEY as string | undefined;
  if (!key) return null;
  const region = (env as any).AZURE_SPEECH_REGION || 'australiaeast';
  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'hildon-farm' },
    body: `<speak version="1.0" xml:lang="en-NZ"><voice name="${AZURE_VOICE}">${xml(text)}</voice></speak>`,
  }).catch(() => null);
  // A used-up free tier answers 429; fall through to the backup voice.
  return response?.ok ? response.arrayBuffer() : null;
}

async function cloudflare(text: string): Promise<ArrayBuffer | null> {
  const ai = (env as any).AI;
  if (!ai) return null;
  try { return await new Response(await ai.run(MODEL, { text, speaker: SPEAKER, encoding: 'mp3' })).arrayBuffer(); }
  catch { return null; } // Includes the free daily allowance running out.
}

export async function POST(request: Request) {
  const { text } = await request.json().catch(() => ({})) as { text?: unknown };
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_CHARS) {
    return Response.json({ error: 'Text must be 1 to 1500 characters.' }, { status: 400 });
  }
  const line = text.trim(), hash = await sha256(line);
  const voices: [string, (t: string) => Promise<ArrayBuffer | null>][] = [[AZURE_VOICE, azure], [SPEAKER, cloudflare]];
  // Try each voice in turn, its saved clip first; the backup only speaks when the Kiwi voice can't.
  for (const [name, make] of voices) {
    if (name === AZURE_VOICE && !(env as any).AZURE_SPEECH_KEY) continue;
    const cached = await env.BUCKET?.get(`speech/${name}/${hash}.mp3`);
    if (cached) return audioResponse(cached.body);
    const audio = await make(line);
    if (!audio?.byteLength) continue;
    await env.BUCKET?.put(`speech/${name}/${hash}.mp3`, audio, { httpMetadata: { contentType: 'audio/mpeg' } });
    return audioResponse(audio);
  }
  // The page falls back to the browser's own voice.
  return Response.json({ error: 'Natural voice is unavailable.' }, { status: 503 });
}
