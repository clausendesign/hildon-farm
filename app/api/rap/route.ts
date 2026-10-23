import { env } from 'cloudflare:workers';

// A fresh, silly rap about Todd for Kaye and Warwick. Only light-hearted family facts go in here.
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const FACTS = [
  'Todd is Kaye and Warwick’s son. His mates call him Terje, but Mum and Dad call him Todd.',
  'He grew up near Feilding, New Zealand, around Hildon Farm.',
  'He lives on the Gold Coast in Australia now.',
  'His partner is Jess and his daughter Airlie (Kaye and Warwick’s granddaughter) was born in January 2024.',
  'He is a lead product designer who runs a team of six designers making phone apps.',
  'He is 194 cm tall.',
  'He loves snowboarding, especially in Hakuba, Japan.',
  'He makes proper Neapolitan pizza in his Gozney oven.',
  'He likes a strong cappuccino.',
  'He has been renovating his house with walnut and microcement.',
  'He built this Hildon Farm website, with its talking voice and cattle weights, for Mum and Dad.',
];
const FALLBACKS = [
  `Yo, Feilding, listen, here's a tale that's true,
'bout a lanky lad called Todd, one-nine-four, through and through.
Grew up round the paddocks, now he's Gold Coast based,
designing slick apps with impeccable taste.
Got Jess and little Airlie, the finest crew,
makes a Gozney pizza that'd make Napoli blue.
Built Mum and Dad a website that can talk and track the herd,
Todd's the greatest son, and that's the final word!`,
  `Drop the beat on the woolshed floor,
Todd's back in the building, who could ask for more?
Snowboard in Hakuba, carving fresh powder lines,
strong cappuccino keeps that design brain fine.
Runs a team of six, makes the apps go smooth,
walnut and microcement, the man's got moves.
Kaye and Warwick, you raised a legend, no lie,
Big Dog Wok's own son, reaching for the sky!`,
];

export async function POST(request: Request) {
  const { listener } = await request.json().catch(() => ({})) as { listener?: string };
  const who = listener === 'Kaye' ? 'Kaye (his mum)' : 'Warwick (his dad)';
  const fallback = FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
  const ai = (env as any).AI;
  if (!ai) return Response.json({ text: fallback });
  try {
    const result = await ai.run(MODEL, {
      messages: [
        { role: 'system', content: 'You write short, funny, warm, family-friendly raps. No swearing, nothing mean. Output only the rap lyrics: 8 to 12 lines, rhyming couplets, no title, no stage directions, no emoji, no asterisks.' },
        { role: 'user', content: `Write a brand-new rap for ${who} about how great their son Todd is. Pick a few of these facts and have fun with them; be playful and over the top:\n- ${FACTS.join('\n- ')}` },
      ],
      max_tokens: 400,
      temperature: 1,
    });
    const text = String(result?.response ?? '').replace(/[*#_]/g, '').trim();
    return Response.json({ text: text.length > 80 && text.length < 1400 ? text : fallback });
  } catch {
    return Response.json({ text: fallback });
  }
}
