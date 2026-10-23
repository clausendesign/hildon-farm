import { NAMES, readProfile, saveProfile, nameFromSpeech } from './farm-profile.mjs';
import { voice } from './farm-voice.mjs';
import { createParticleOrb } from './particle-orb.mjs';

export function mountProfile({ auto = true } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'profile-dialog';
  dialog.setAttribute('aria-labelledby', 'profile-title');
  dialog.innerHTML = `<button id="setup-speak" class="voice-orb" aria-describedby="setup-hint"><canvas aria-hidden="true"></canvas><span class="visually-hidden">Talk to Hildon Farm</span></button><h2 id="profile-title">What should I call you?</h2><p id="setup-hint" class="setup-hint" role="status" aria-live="polite"></p><div class="name-options">${NAMES.map(name => `<button type="button" data-name="${name}">${name}</button>`).join('')}</div>`;
  document.body.append(dialog);
  const orb = dialog.querySelector('#setup-speak'), hint = dialog.querySelector('#setup-hint');
  const say = text => { hint.textContent = text; };
  let session = 0, priorFocus, promptHeard = false;
  const particles = createParticleOrb(orb.querySelector('canvas'), () => ({ mode: voice.listening ? 'listening' : voice.speaking ? 'speaking' : voice.loading ? 'connecting' : 'idle', level: voice.level() }));
  dialog.addEventListener('close', () => particles.stop());
  const prompt = 'Welcome to Hildon Farm. What would you like me to call you? Wozza, Wok, Big Dog Wok, or Warwick?';
  function close() { session++; voice.stop(); dialog.close(); priorFocus?.focus(); }
  function choose(name) {
    session++; voice.stop(); saveProfile({ name, onboarded: true }); dialog.close(); priorFocus?.focus();
    voice.speak(`Righto, ${name}. You’re all set. Open your daily briefing to catch up and ask a question.`);
  }
  function listen() {
    if (!dialog.open) return;
    say('Listening…');
    voice.listen({
      onStatus: text => say(text.replace('the microphone', 'the orb') || (voice.listening ? 'Listening…' : 'Tap the orb to talk')),
      onPartial: text => say(`“${text}”`),
      onResult: text => {
        const name = nameFromSpeech(text);
        if (name) choose(name);
        else { say(`I heard “${text}”. Try again, or tap a name.`); const current = session; voice.speak('I didn’t catch one of those names. Please try again, or choose a name on screen.').then(result => { if (result === 'finished' && dialog.open && current === session) listen(); }); }
      }
    });
  }
  function start() {
    if (voice.listening) { voice.stopListening(); say('Tap the orb to talk'); return; }
    if (voice.speaking) { voice.stopSpeaking(); listen(); return; }
    voice.setEnabled(true);
    if (promptHeard) { listen(); return; }
    const current = session;
    say('');
    voice.speak(prompt).then(result => { if (!dialog.open || current !== session) return; promptHeard = result === 'finished'; listen(); });
  }
  function open() {
    priorFocus = document.activeElement; voice.stop();
    if (!dialog.open) dialog.showModal();
    particles.start();
    const current = ++session;
    say('Tap the orb to talk');
    dialog.querySelectorAll('[data-name]').forEach(b => b.classList.toggle('selected', b.dataset.name === readProfile().name));
    promptHeard = false;
    if (!voice.enabled) return;
    // Ask straight away and then listen; browsers that block sound until a tap leave the orb waiting.
    say('');
    voice.speak(prompt).then(result => {
      if (!dialog.open || current !== session) return;
      if (result === 'finished') { promptHeard = true; listen(); }
      else say('Tap the orb to talk');
    });
  }
  orb.addEventListener('click', start);
  dialog.querySelectorAll('[data-name]').forEach(b => b.addEventListener('click', () => choose(b.dataset.name)));
    dialog.addEventListener('cancel', () => { session++; voice.stop(); });
  voice.addEventListener('state', event => { orb.classList.toggle('listening', event.detail.listening && dialog.open); orb.classList.toggle('speaking', event.detail.speaking && dialog.open); });
  if (auto && !readProfile().onboarded) open();
  return { open, close, dialog };
}
