import { readProfile } from './farm-profile.mjs';
import { bindVoiceToggle, voice } from './farm-voice.mjs';
import { mountProfile } from './profile-ui.mjs';
import { createParticleOrb } from './particle-orb.mjs';
import { loadWelcome, renderWelcome, welcomeSpeech } from './welcome.mjs';

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
// Each visit opens with a warm welcome: the farm's weather today, the days ahead and a joke, all fresh each day.
let welcome = null;
const welcomeReady = loadWelcome().then(w => {
  welcome = w;
  if (!w) return;
  renderWelcome($('#welcome'), w);
  // Both welcomes are ready before anyone says who they are, so it plays without a pause.
  [...new Set(['Kaye', 'Warwick', readProfile().name].filter(Boolean))].forEach(name => voice.preload(welcomeSpeech(w, name)));
  $('#welcome .welcome-play').addEventListener('click', () => { voice.setEnabled(true); voice.speak(welcomeSpeech(w, readProfile().name)); });
});
// The welcome plays once per visit: straight after Kaye or Warwick says who they are, or on arrival when that's
// already known. Coming back to this page later in the same visit doesn't repeat it.
const HEARD_KEY = 'hildon-farm-welcome-heard';
const heardThisVisit = () => { try { return sessionStorage.getItem(HEARD_KEY) === '1'; } catch { return false; } };
async function sayWelcome(name) {
  await welcomeReady;
  try { sessionStorage.setItem(HEARD_KEY, '1'); } catch { /* Plays again next time instead. */ }
  voice.speak(welcome ? welcomeSpeech(welcome, name) : `G’day ${name}. Good to see you.`);
}
const setup = mountProfile({ greet: sayWelcome });
if (!setup.dialog.open && !heardThisVisit() && readProfile().name && voice.enabled) sayWelcome(readProfile().name);
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
