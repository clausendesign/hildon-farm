// Makes every fixed line the site speaks ahead of time, so visitors never wait for the voice.
// Usage: node scripts/warm-voice.mjs [site URL]   (defaults to the live site)
// Gemini only allows a few new clips a minute, so it pauses after each clip it has to make.
import { readFileSync } from 'node:fs';
import { answerQuestion, briefingScript, focusOnStoreBeef } from '../public/briefing-answers.mjs';
import { splitNaturalText } from '../public/briefing-audio.mjs';

const HARD_OF_HEARING = 'Sorry, I’m a bit hard of hearing in me old age. Some may say I’m worse than Kaye, but I wouldn’t go that far. If it’s easier, you can just tap one of the buttons.';

const site = (process.argv[2] || 'https://hildon-farm.hildonfarm.workers.dev').replace(/\/$/, '');
const raps = JSON.parse(readFileSync(new URL('../public/raps.json', import.meta.url)));
const brief = focusOnStoreBeef(await fetch(`${site}/api/markets`).then(r => r.json()));

const talk = new Set([
  'Welcome to Hildon Farm. Who’s this? Kaye or Warwick?',
  'Voice is on.',
  HARD_OF_HEARING,
  'Daily briefing. The latest on cattle, lambs and sheep, and you can ask it questions.',
  'Explore the farm. The map, paddocks, soil and satellite views.',
  'Cattle weights. Every weigh day, and how each animal is gaining.',
]);
for (const name of ['Kaye', 'Warwick', 'Wozza', 'Wok', 'Big Dog Wok']) {
  talk.add(`G’day ${name}. There are three things you can do here.`);
  talk.add(briefingScript(brief, name));
}
talk.add(briefingScript(brief, null));
const questions = ['When is the next sale?', 'What are lambs doing?', 'What prices have been reported?', 'What is the outlook?', 'Are prices trending up?',
  'What are cattle doing?', 'What are sheep doing?'];
for (const question of questions) {
  const answer = answerQuestion(brief, question, {});
  talk.add(answer.text);
  // Follow-up buttons shown after this answer.
  answer.suggestions.forEach(next => talk.add(answerQuestion(brief, next, { species: answer.species, intent: answer.intent }).text));
}

const lines = [...[...talk].flatMap(text => splitNaturalText(text).map(chunk => [chunk, undefined])),
  ...raps.flatMap(rap => splitNaturalText(rap).map(chunk => [chunk, 'rap']))];
let made = 0, failed = 0;
for (const [text, style] of lines) {
  const started = Date.now();
  const speak = () => fetch(`${site}/api/speech`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, style }) });
  let response = await speak();
  // Over the per-minute limit: wait a minute and try once more.
  if (response.status === 503) { await new Promise(resolve => setTimeout(resolve, 60000)); response = await speak(); }
  const seconds = (Date.now() - started) / 1000;
  if (response.ok) { made++; if (seconds > 1) { console.log(`made in ${seconds.toFixed(1)}s: ${text.slice(0, 50)}`); await new Promise(resolve => setTimeout(resolve, 7000)); } }
  else { failed++; console.log(`failed (${response.status} ${response.headers.get('x-voice-note') || ''}): ${text.slice(0, 50)}`); }
}
console.log(`${made} of ${lines.length} clips ready${failed ? `, ${failed} failed` : ''}.`);
