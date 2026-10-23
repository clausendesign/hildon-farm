import { NAMES, readProfile, saveProfile, nameFromSpeech } from './farm-profile.mjs';
import { voice } from './farm-voice.mjs';

export function mountProfile({ auto = true } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'profile-dialog';
  dialog.setAttribute('aria-labelledby', 'profile-title');
  dialog.innerHTML = `<div id="profile-orb" class="voice-orb" aria-hidden="true"><svg viewBox="0 0 32 32"><rect x="11" y="4" width="10" height="17" rx="5"/><path d="M7 15v2a9 9 0 0 0 18 0v-2M16 26v4M11 30h10"/></svg></div><div class="eyebrow">LET’S MAKE THIS YOURS</div><h2 id="profile-title">What should I call you?</h2><p>Wozza, Wok, Big Dog Wok or Warwick?<br>Tell me out loud, or choose below.</p><button id="setup-speak" class="setup-primary">Start voice setup</button><p id="setup-status" class="setup-status" role="status" aria-live="polite">Voice is on. Tap to begin, then allow the microphone.</p><div class="name-options">${NAMES.map(name => `<button type="button" data-name="${name}">${name}</button>`).join('')}</div><button id="setup-skip" class="setup-secondary">Use Warwick for now</button><p class="setup-fineprint">Your name and voice preference are remembered on this device. Your browser may use its speech service to transcribe your voice.</p>`;
  document.body.append(dialog);
  const button = dialog.querySelector('#setup-speak'), status = dialog.querySelector('#setup-status'), orb = dialog.querySelector('#profile-orb');
  let session = 0, priorFocus, promptHeard = false;
  const prompt = 'Welcome to Hildon Farm. What would you like me to call you? Wozza, Wok, Big Dog Wok, or Warwick?';
  function close() { session++; voice.stop(); dialog.close(); priorFocus?.focus(); }
  function choose(name) {
    session++; voice.stop(); saveProfile({ name, onboarded: true }); dialog.close(); priorFocus?.focus();
    voice.speak(`Righto, ${name}. You’re all set. Open your daily briefing to catch up and ask a question.`);
  }
  function listen() {
    if (!dialog.open) return;
    button.textContent = 'Tap to stop listening';
    voice.listen({
      onStatus: text => { status.textContent = text; if (!voice.listening) button.textContent = 'Tell me your name'; },
      onPartial: text => { status.textContent = `Hearing: ${text}`; },
      onResult: text => {
        const name = nameFromSpeech(text);
        if (name) choose(name);
        else { status.textContent = `I heard “${text}”. Say Wozza, Wok, Big Dog Wok or Warwick, or choose below.`; button.textContent = 'Try saying your name again'; voice.speak('I didn’t catch one of those names. Please try again, or choose a name on screen.'); }
      }
    });
  }
  function start() {
    if (voice.listening) { voice.stopListening(); button.textContent = 'Tell me your name'; status.textContent = 'Microphone stopped.'; return; }
    if (voice.speaking) { voice.stopSpeaking(); listen(); return; }
    voice.setEnabled(true);
    if (promptHeard) { listen(); return; }
    const current = session;
    status.textContent = 'I’ll ask the question, then listen for your answer.';
    button.textContent = 'Asking your name…';
    voice.speak(prompt).then(result => { if (!dialog.open || current !== session) return; promptHeard = result === 'finished'; listen(); });
  }
  function open() {
    priorFocus = document.activeElement; voice.stop();
    if (!dialog.open) dialog.showModal();
    const current = ++session;
    status.textContent = 'Voice is on. Tap Start voice setup, then say your choice.';
    button.textContent = 'Start voice setup';
    dialog.querySelectorAll('[data-name]').forEach(b => b.classList.toggle('selected', b.dataset.name === readProfile().name));
    promptHeard = false;
    if (voice.enabled) voice.speak(prompt).then(result => { if (dialog.open && current === session && result === 'finished') { promptHeard = true; button.textContent = 'Tell me your name'; status.textContent = 'Tap the microphone button and say your choice.'; } });
  }
  button.addEventListener('click', start);
  dialog.querySelectorAll('[data-name]').forEach(b => b.addEventListener('click', () => choose(b.dataset.name)));
  dialog.querySelector('#setup-skip').addEventListener('click', () => choose('Warwick'));
  dialog.addEventListener('cancel', () => { session++; voice.stop(); });
  voice.addEventListener('state', event => { orb.classList.toggle('listening', event.detail.listening && dialog.open); orb.classList.toggle('speaking', event.detail.speaking && dialog.open); });
  if (auto && !readProfile().onboarded) open();
  return { open, close, dialog };
}
