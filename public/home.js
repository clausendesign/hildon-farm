import { readProfile } from './farm-profile.mjs';
import { bindVoiceToggle } from './farm-voice.mjs';
import { mountProfile } from './profile-ui.mjs';

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
const setup = mountProfile();
$('#change-name').addEventListener('click', () => setup.open());
window.addEventListener('farm-profile', greet);
