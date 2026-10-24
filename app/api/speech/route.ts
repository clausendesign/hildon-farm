import { env } from 'cloudflare:workers';

// Natural voice. Gemini's voice comes first when its key is set, then Azure's Kiwi voice,
// then Cloudflare's Australian voice. Each clip is cached in R2, so a repeated line
// (the briefing, greetings) is generated once and replayed for free.
const GEMINI_MODEL = 'gemini-2.5-flash-preview-tts';
const GEMINI_VOICES = ['Achird', 'Umbriel', 'Algenib', 'Charon', 'Sadachbia', 'Sulafat'];
const DEFAULT_GEMINI_VOICE = 'Umbriel';
const STYLES: Record<string, string> = {
  talk: 'Say this in a relaxed, warm, friendly Australian accent, like a neighbour catching up over the fence, at an easy pace',
  rap: 'Perform this as a fun, upbeat, rhythmic rap with swagger and a cheeky Australian accent, hitting the rhymes',
};
const AZURE_VOICE = 'en-NZ-MitchellNeural';
const MODEL = '@cf/deepgram/aura-2-en';
const SPEAKER = 'hyperion';
const MAX_CHARS = 1500;

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const audioResponse = (body: BodyInit, type = 'audio/mpeg') =>
  new Response(body, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' } });

const xml = (text: string) => text.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

// Gemini returns raw 24 kHz 16-bit mono PCM; wrap it in a WAV header so browsers can play it.
function wav(pcm: Uint8Array, rate = 24000) {
  const out = new Uint8Array(44 + pcm.length), view = new DataView(out.buffer);
  const write = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + pcm.length, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, pcm.length, true); out.set(pcm, 44);
  return out.buffer;
}

async function gemini(text: string, voice: string, style: string): Promise<ArrayBuffer | null> {
  const key = (env as any).GEMINI_API_KEY as string | undefined;
  if (!key) return null;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${STYLES[style]}:\n\n${text}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }),
  }).catch(() => null);
  // A used-up free allowance answers 429; fall through to the next voice.
  if (!response?.ok) return null;
  const data = await response.json().catch(() => null) as any;
  const audio = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
  if (!audio) return null;
  return wav(Uint8Array.from(atob(audio), c => c.charCodeAt(0)));
}

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
  const { text, style: wanted, voice: picked, quick } = await request.json().catch(() => ({})) as { text?: unknown; style?: string; voice?: string; quick?: boolean };
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_CHARS) {
    return Response.json({ error: 'Text must be 1 to 1500 characters.' }, { status: 400 });
  }
  const style = wanted && STYLES[wanted] ? wanted : 'talk';
  // A voice can be picked from the short list (used to compare samples); otherwise the site's chosen one.
  const geminiVoice = picked && GEMINI_VOICES.includes(picked) ? picked : (env as any).GEMINI_VOICE || DEFAULT_GEMINI_VOICE;
  const line = text.trim(), hash = await sha256(`${style}|${line}`), plainHash = await sha256(line);
  const voices: [string, string, string, (t: string) => Promise<ArrayBuffer | null>, boolean][] = [
    [`gemini-${geminiVoice}`, hash, 'wav', t => gemini(t, geminiVoice, style), !!(env as any).GEMINI_API_KEY],
    [AZURE_VOICE, plainHash, 'mp3', azure, !!(env as any).AZURE_SPEECH_KEY],
    [SPEAKER, plainHash, 'mp3', cloudflare, true],
  ];
  // Try each voice in turn, its saved clip first; a backup only speaks when the one before it can't.
  for (const [name, key, ext, make, available] of voices) {
    if (!available) continue;
    const type = ext === 'wav' ? 'audio/wav' : 'audio/mpeg';
    const cached = await env.BUCKET?.get(`speech/${name}/${key}.${ext}`);
    if (cached) return audioResponse(cached.body, type);
    // Quick requests (one-off answers) don't wait on Gemini's slower voice unless the clip is already saved.
    if (quick && name.startsWith('gemini-')) continue;
    const audio = await make(line);
    if (!audio?.byteLength) continue;
    await env.BUCKET?.put(`speech/${name}/${key}.${ext}`, audio, { httpMetadata: { contentType: type } });
    return audioResponse(audio, type);
  }
  // The page falls back to the browser's own voice.
  return Response.json({ error: 'Natural voice is unavailable.' }, { status: 503 });
}
