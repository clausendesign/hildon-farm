import { readProfile } from './farm-profile.mjs';
import { bindVoiceToggle, voice } from './farm-voice.mjs';
import { mountProfile } from './profile-ui.mjs';
import { createParticleOrb } from './particle-orb.mjs';

const $ = selector => document.querySelector(selector);
bindVoiceToggle($('#voice-toggle'), $('#voice-status'));
function greet() {
  const profile = readProfile();
  const hour = Number(new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const salutation = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  $('#greeting').textContent = profile.name ? `${salutation}, ${profile.name}.` : 'Welcome to the farm.';
  $('#change-name').textContent = profile.name ? `Not ${profile.name}? Switch` : 'Who’s this?';
  $('#welcome-hint').textContent = profile.name ? 'A familiar voice. A quick catch-up. Your day, sorted.' : 'Your briefing, at your pace.';
  $('#home-date').textContent = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()) + ' · NZ';
}
greet();
// After saying who's here, the voice walks through the three options, lighting up each card in turn.
const tourSteps = name => [
    [null, `G’day ${name}. There are three things you can do here.`],
    ['briefing', 'Daily briefing. The latest on cattle, lambs and sheep, and you can ask it questions.'],
    ['map', 'Explore the farm. The map, paddocks, soil and satellite views.'],
    ['cattle', 'Cattle weights. Every weigh day, and how each animal is gaining.'],
];
// Every line of the tour is ready before anyone is asked who they are, so it plays without pauses.
['Kaye', 'Warwick'].forEach(name => tourSteps(name).forEach(([, line]) => voice.preload(line)));
async function tour(name) {
  const steps = tourSteps(name);
  const light = card => document.querySelectorAll('[data-tour]').forEach(c => c.classList.toggle('spotlight', c.dataset.tour === card));
  for (const [card, line] of steps) {
    light(card);
    if (await voice.speak(line) !== 'finished') break;
  }
  light(null);
}
const setup = mountProfile({ greet: tour });
$('#change-name').addEventListener('click', () => setup.open());
window.addEventListener('farm-profile', greet);

// A little surprise: a rap about Todd. The next one is always loaded in advance, so it starts straight away.
const rapDialog = $('#rap-dialog');
let rapTurn = 0, rapWaiting = false, raps = [], nextRap = null;
const rapOrb = createParticleOrb($('#rap-orb'), () => ({ mode: voice.speaking ? 'speaking' : rapWaiting ? 'connecting' : 'idle', level: voice.level() }));
function queueRap() {
  if (!raps.length) return;
  const others = raps.filter(rap => rap !== nextRap);
  nextRap = others[Math.floor(Math.random() * others.length)] || raps[0];
  voice.preload(nextRap, { style: 'rap' });
}
fetch('/raps.json').then(r => r.json()).then(list => { raps = list; queueRap(); }).catch(() => {});
function showLyrics() { rapWaiting = false; $('#rap-status').hidden = true; $('#rap-lyrics').hidden = false; $('#rap-orb').classList.add('small'); }
async function playRap() {
  const turn = ++rapTurn, text = nextRap;
  voice.stop();
  rapWaiting = true;
  $('#rap-status').hidden = false; $('#rap-status').textContent = text ? 'Warming up the mic…' : 'The mic’s gone quiet. Give it another go in a moment.';
  $('#rap-lyrics').hidden = true; $('#rap-orb').classList.remove('small');
  if (!rapDialog.open) { rapDialog.showModal(); rapOrb.start(); }
  if (!text) { rapWaiting = false; return; }
  $('#rap-text').textContent = text;
  voice.setEnabled(true);
  const reveal = event => { if (event.detail.speaking && turn === rapTurn) { showLyrics(); voice.removeEventListener('state', reveal); } };
  voice.addEventListener('state', reveal);
  const playing = voice.speak(text, { style: 'rap' });
  queueRap();
  const result = await playing;
  voice.removeEventListener('state', reveal);
  // If the browser wouldn't play sound, still show the words.
  if (turn === rapTurn && rapDialog.open) showLyrics();
  if (result === 'blocked') $('#rap-status').textContent = '';
}
$('#rap').addEventListener('click', playRap);
$('#rap-again').addEventListener('click', playRap);
rapDialog.addEventListener('close', () => { rapTurn++; rapWaiting = false; voice.stop(); rapOrb.stop(); });
