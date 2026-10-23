import { NAMES, readProfile, saveProfile, nameFromSpeech } from './farm-profile.mjs';
import { voice } from './farm-voice.mjs';
import { createParticleOrb } from './particle-orb.mjs';

export function mountProfile({ auto = true } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'profile-dialog';
  dialog.setAttribute('aria-labelledby', 'profile-title');
  dialog.innerHTML = `<div class="orb-stage"><button id="setup-speak" class="voice-orb" aria-describedby="orb-caption"><canvas aria-hidden="true"></canvas><span class="visually-hidden">Talk to Hildon Farm</span></button><p id="orb-caption" class="orb-caption">Getting ready…</p></div><div class="eyebrow">LET’S MAKE THIS YOURS</div><h2 id="profile-title">What should I call you?</h2><p class="setup-lead">Say Wozza, Wok, Big Dog Wok or Warwick.<br>Or tap a name below.</p><p id="setup-status" class="setup-status" role="status" aria-live="polite"></p><div class="name-options">${NAMES.map(name => `<button type="button" data-name="${name}">${name}</button>`).join('')}</div><button id="setup-skip" class="setup-secondary">Use Warwick for now</button><p class="setup-fineprint">Your name and voice preference are remembered on this device. Your browser may use its speech service to transcribe your voice.</p>`;
  document.body.append(dialog);
  const orb = dialog.querySelector('#setup-speak'), status = dialog.querySelector('#setup-status'), caption = dialog.querySelector('#orb-caption');
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
    caption.textContent = 'Listening… say your name';
    voice.listen({
      onStatus: text => { status.textContent = text; if (!voice.listening) caption.textContent = 'Tap the orb and say your name'; },
      onPartial: text => { status.textContent = `Hearing: ${text}`; },
      onResult: text => {
        const name = nameFromSpeech(text);
        if (name) choose(name);
        else { status.textContent = `I heard “${text}”. Say Wozza, Wok, Big Dog Wok or Warwick, or choose below.`; caption.textContent = 'Tap the orb and try again'; const current = session; voice.speak('I didn’t catch one of those names. Please try again, or choose a name on screen.').then(result => { if (result === 'finished' && dialog.open && current === session) listen(); }); }
      }
    });
  }
  function start() {
    if (voice.listening) { voice.stopListening(); caption.textContent = 'Tap the orb and say your name'; status.textContent = 'Microphone stopped.'; return; }
    if (voice.speaking) { voice.stopSpeaking(); listen(); return; }
    voice.setEnabled(true);
    if (promptHeard) { listen(); return; }
    const current = session;
    status.textContent = 'I’ll ask the question, then listen for your answer.';
    caption.textContent = 'Asking your name…';
    voice.speak(prompt).then(result => { if (!dialog.open || current !== session) return; promptHeard = result === 'finished'; listen(); });
  }
  function open() {
    priorFocus = document.activeElement; voice.stop();
    if (!dialog.open) dialog.showModal();
    particles.start();
    const current = ++session;
    status.textContent = '';
    caption.textContent = 'Tap the orb to talk';
    dialog.querySelectorAll('[data-name]').forEach(b => b.classList.toggle('selected', b.dataset.name === readProfile().name));
    promptHeard = false;
    if (!voice.enabled) return;
    // Ask straight away and then listen; browsers that block sound until a tap leave the orb waiting.
    caption.textContent = 'Asking your name…';
    voice.speak(prompt).then(result => {
      if (!dialog.open || current !== session) return;
      if (result === 'finished') { promptHeard = true; listen(); }
      else { caption.textContent = 'Tap the orb to talk'; status.textContent = ''; }
    });
  }
  orb.addEventListener('click', start);
  dialog.querySelectorAll('[data-name]').forEach(b => b.addEventListener('click', () => choose(b.dataset.name)));
  dialog.querySelector('#setup-skip').addEventListener('click', () => choose('Warwick'));
  dialog.addEventListener('cancel', () => { session++; voice.stop(); });
  voice.addEventListener('state', event => { orb.classList.toggle('listening', event.detail.listening && dialog.open); orb.classList.toggle('speaking', event.detail.speaking && dialog.open); });
  if (auto && !readProfile().onboarded) open();
  return { open, close, dialog };
}
