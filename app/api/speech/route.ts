import { env } from 'cloudflare:workers';

// The site's voice: Gemini's Umbriel, performing each line with a relaxed Aussie character.
// Each clip is cached in R2, so a repeated line (the briefing, greetings) is generated once
// and replayed for free. If Gemini can't answer, the page falls back to the browser's voice.
const GEMINI_MODEL = 'gemini-2.5-flash-preview-tts';
const GEMINI_VOICE = 'Umbriel';
const STYLES: Record<string, string> = {
  talk: 'Say this in a relaxed, warm, friendly Australian accent, like a neighbour catching up over the fence, at an easy pace',
  rap: 'Perform this as a fun, upbeat, rhythmic rap with swagger and a cheeky Australian accent, hitting the rhymes',
};
const MAX_CHARS = 1500;
// Hard monthly cap on paid Gemini speech: 60 minutes is about US$1.
const GEMINI_MONTHLY_SECONDS = 60 * 60;
const usageKey = () => `usage/gemini-${new Date().toISOString().slice(0, 7)}.json`;

async function geminiSecondsUsed() {
  const item = await env.BUCKET?.get(usageKey());
  return item ? Number((await item.json() as any).seconds) || 0 : 0;
}

async function addGeminiSeconds(seconds: number) {
  const used = await geminiSecondsUsed();
  await env.BUCKET?.put(usageKey(), JSON.stringify({ seconds: Math.round(used + seconds), updatedAt: new Date().toISOString() }), { httpMetadata: { contentType: 'application/json' } });
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

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

const audioResponse = (body: BodyInit) =>
  new Response(body, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'public, max-age=31536000, immutable' } });

// Why the voice is unavailable, as a header, so a change to the browser voice can be explained.
const unavailable = (reason: string) =>
  Response.json({ error: 'Natural voice is unavailable.' }, { status: 503, headers: { 'X-Voice-Note': reason.replace(/[^\x20-\x7e]/g, '').slice(0, 200) } });

export async function POST(request: Request) {
  const { text, style: wanted } = await request.json().catch(() => ({})) as { text?: unknown; style?: string };
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_CHARS) {
    return Response.json({ error: 'Text must be 1 to 1500 characters.' }, { status: 400 });
  }
  const style = wanted && STYLES[wanted] ? wanted : 'talk';
  const line = text.trim(), path = `speech/gemini-${GEMINI_VOICE}/${await sha256(`${style}|${line}`)}.wav`;
  const cached = await env.BUCKET?.get(path);
  if (cached) return audioResponse(cached.body);

  const key = (env as any).GEMINI_API_KEY as string | undefined;
  if (!key) return unavailable('no key');
  if (await geminiSecondsUsed() >= GEMINI_MONTHLY_SECONDS) return unavailable('monthly cap reached');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${STYLES[style]}:\n\n${line}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } } } },
    }),
    // Raps take longer to perform than a spoken line.
    signal: AbortSignal.timeout(style === 'rap' ? 30000 : 20000),
  }).catch(() => null);
  if (!response?.ok) return unavailable(`${response?.status ?? 'timed out'} ${(await response?.text().catch(() => '')) ?? ''}`);
  const data = await response.json().catch(() => null) as any;
  const audio = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
  if (!audio) return unavailable('no audio returned');
  const pcm = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
  await addGeminiSeconds(pcm.length / (24000 * 2));
  const clip = wav(pcm);
  await env.BUCKET?.put(path, clip, { httpMetadata: { contentType: 'audio/wav' } });
  return audioResponse(clip);
}
