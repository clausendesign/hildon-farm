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
  `G'day to the farm, let the cattle all moo,
'cause the Gold Coast's finest is coming through.
One-nine-four tall, he can see past the hill,
spots a dodgy fence line from a kilometre still.
Leads six designers with a cappuccino in hand,
best-looking apps in the whole of the land.
Mum and Dad, you made him, so take a bow,
Todd's the champion of the paddock now!`,
  `Who's that carving up Hakuba in the snow?
Todd on the board, putting on a show.
Lands every jump, doesn't wobble or fall,
then rings home to Feilding to check on it all.
Back on the Gold Coast, the pizza's on fire,
the Gozney's so hot it could forge baling wire.
Kaye and Warwick, here's the news from the south,
your boy's a legend, straight from the horse's mouth!`,
  `Check the mic, one two, is the woolshed live?
Todd's on the beat and the herd's on the drive.
He built you a website that talks and it raps,
tracks every steer and draws the farm maps.
Dark mode, slick fonts, a particle ball,
there isn't a farm site this flash at all.
So when the cattle get weighed and the numbers look grand,
remember who built it: the greatest son in the land!`,
  `Little Airlie's grandad, Airlie's nan,
listen to the story of a top-notch man.
He's got Jess by his side and a walnut-clad home,
microcement floors that make the neighbours groan.
Designs the apps that a whole lot of people tap,
then takes the evening off to write you this rap.
From Feilding born to the Gold Coast sun,
Todd's still your favourite, number one!`,
  `Yo, the cappuccino's strong and the toffee notes sing,
Todd pulls a shot like a barista king.
Nine seconds to first drip, thirty all done,
then he's off designing apps before the rising sun.
Weekends in the reno, measuring each wall,
four hundred and sixty mil, he's measured it all.
Kaye and Warwick, put the kettle on too,
'cause your son's the best and he's thinking of you!`,
  `Hold the gate, Warwick, there's a rap coming through,
about the lad from Hildon who's a legend, it's true.
Grew up in the paddocks, gumboots and all,
now he's running a team, standing really tall.
Snowboard, surfboard, pizza peel too,
there's nothing that this Clausen can't do.
So turn up the radio, give the dog a pat,
Todd's the greatest son, and that is that!`,
  `Kaye, you raised him right, and Warwick did too,
look at the website he's built just for you.
Ask it the prices, it'll tell you the score,
weigh all the steers and it'll ask you for more.
It even knows a rap, and you're listening now,
greatest son ever, take a bow, take a bow!
From the Manawatū mist to the Queensland heat,
Todd Clausen's the man who can't be beat!`,
  `Big Dog Wok, are you ready for this?
A rap about your son that you can't miss.
He's six-foot-four of pure design flair,
lead of a team with impeccable hair.
Gozney pizzas, Neapolitan style,
sixty-two percent hydration, worth the while.
So here's to Todd from the whole herd too,
moo moo, legend, we love you!`,
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
        { role: 'system', content: 'You write short, funny, warm, family-friendly raps. No swearing, nothing mean. Greet with G’day, never Kia ora. Output only the rap lyrics: 8 to 12 lines, rhyming couplets, no title, no stage directions, no emoji, no asterisks.' },
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
