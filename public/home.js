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
async function tour(name) {
  const steps = [
    [null, `G’day ${name}. There are three things you can do here.`],
    ['briefing', 'Daily briefing. The latest on cattle, lambs and sheep, and you can ask it questions.'],
    ['map', 'Explore the farm. The map, paddocks, soil and satellite views.'],
    ['cattle', 'Cattle weights. Every weigh day, and how each animal is gaining.'],
  ];
  // Get the later lines ready while the first one plays, so the steps follow on quickly.
  steps.slice(1).forEach(([, line]) => fetch('/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: line }) }).catch(() => {}));
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

// A little surprise: a fresh rap about Todd. The orb thinks until the voice is ready, then the lyrics appear.
const rapDialog = $('#rap-dialog');
let rapTurn = 0, rapWaiting = false;
const rapOrb = createParticleOrb($('#rap-orb'), () => ({ mode: voice.speaking ? 'speaking' : rapWaiting ? 'connecting' : 'idle', level: voice.level() }));
function showLyrics() { rapWaiting = false; $('#rap-status').hidden = true; $('#rap-lyrics').hidden = false; $('#rap-orb').classList.add('small'); }
async function playRap() {
  const turn = ++rapTurn;
  voice.stop();
  rapWaiting = true;
  $('#rap-status').hidden = false; $('#rap-status').textContent = 'Writing a rap about Todd…';
  $('#rap-lyrics').hidden = true; $('#rap-orb').classList.remove('small');
  if (!rapDialog.open) { rapDialog.showModal(); rapOrb.start(); }
  try {
    const { text } = await fetch('/api/rap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listener: readProfile().name === 'Kaye' ? 'Kaye' : 'Warwick' }) }).then(r => r.json());
    if (turn !== rapTurn || !rapDialog.open) return;
    $('#rap-text').textContent = text;
    $('#rap-status').textContent = 'Warming up the mic…';
    voice.setEnabled(true);
    const reveal = event => { if (event.detail.speaking && turn === rapTurn) { showLyrics(); voice.removeEventListener('state', reveal); } };
    voice.addEventListener('state', reveal);
    const result = await voice.speak(text);
    voice.removeEventListener('state', reveal);
    // If the browser wouldn't play sound, still show the words.
    if (turn === rapTurn && rapDialog.open) showLyrics();
    if (result === 'blocked') $('#rap-status').textContent = '';
  } catch { if (turn === rapTurn) { rapWaiting = false; $('#rap-status').textContent = 'The mic’s gone quiet. Give it another go in a moment.'; } }
}
$('#rap').addEventListener('click', playRap);
$('#rap-again').addEventListener('click', playRap);
rapDialog.addEventListener('close', () => { rapTurn++; rapWaiting = false; voice.stop(); rapOrb.stop(); });
