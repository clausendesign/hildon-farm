import { readProfile, saveProfile } from './farm-profile.mjs';
import { splitSpeechText } from './briefing-audio.mjs';

class FarmVoice extends EventTarget {
  constructor() {
    super();
    this.enabled = readProfile().voice;
    this.speaking = false;
    this.listening = false;
    this.sequence = 0;
    this.recognition = null;
    this.utterances = [];
    this.supportsSpeech = 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
    this.Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
    window.addEventListener('pagehide', () => this.stop());
  }
  update(status = '') {
    this.dispatchEvent(new CustomEvent('state', { detail: { enabled: this.enabled, speaking: this.speaking, listening: this.listening, status } }));
  }
  stopSpeaking() {
    this.sequence++;
    if (this.supportsSpeech) window.speechSynthesis.cancel();
    this.speaking = false;
    this.finishSpeech?.('cancelled');
    this.finishSpeech = null;
    this.utterances = [];
    this.update();
  }
  stopListening() {
    if (this.recognition) { const recognition = this.recognition; this.recognition = null; recognition.abort(); }
    this.listening = false;
    this.update();
  }
  stop() { this.stopListening(); this.stopSpeaking(); }
  setEnabled(value) {
    this.enabled = value;
    saveProfile({ voice: value });
    if (!value) this.stop();
    this.update();
  }
  speak(text) {
    this.stop();
    if (!this.enabled) return Promise.resolve('muted');
    if (!this.supportsSpeech) { this.update('Speech is unavailable on this browser. You can read everything on screen.'); return Promise.resolve('unavailable'); }
    const sequence = this.sequence;
    const chunks = splitSpeechText(text);
    document.querySelectorAll('audio').forEach(audio => audio.pause());
    return new Promise(resolve => {
      let ended = false;
      let timer;
      const finish = result => { if (ended) return; ended = true; clearTimeout(timer); this.finishSpeech = null; this.speaking = false; this.utterances = []; this.update(result === 'blocked' ? 'Tap Play or Start voice setup to hear the voice.' : result === 'unavailable' ? 'Read-aloud could not start in this browser. You can still read everything on screen.' : ''); resolve(result); };
      this.finishSpeech = finish;
      if (!chunks.length) { finish('finished'); return; }
      const voices = speechSynthesis.getVoices();
      const english = voices.filter(v => /^en[-_]/i.test(v.lang));
      const selected = ['en-NZ', 'en-AU', 'en-GB', 'en-US'].map(lang => english.find(v => v.lang === lang && v.localService) || english.find(v => v.lang === lang)).find(Boolean) || english[0];
      this.utterances = chunks.map((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk.trim());
        if (selected) utterance.voice = selected;
        utterance.lang = selected?.lang || 'en-NZ';
        utterance.rate = .94;
        utterance.volume = 1;
        utterance.onstart = () => { clearTimeout(timer); if (sequence !== this.sequence || ended) return; this.speaking = true; this.update(); };
        utterance.onend = () => { if (!ended && sequence === this.sequence && index === chunks.length - 1) finish('finished'); };
        utterance.onerror = event => { if (!ended && sequence === this.sequence) finish(event.error === 'not-allowed' ? 'blocked' : ['canceled', 'interrupted'].includes(event.error) ? 'cancelled' : 'unavailable'); };
        return utterance;
      });
      timer = setTimeout(() => { if (!ended && sequence === this.sequence) { finish('blocked'); speechSynthesis.cancel(); } }, 7000);
      try { speechSynthesis.resume(); for (const utterance of this.utterances) { if (ended || sequence !== this.sequence) break; speechSynthesis.speak(utterance); } }
      catch { finish('unavailable'); }
    });
  }
  listen({ onResult, onPartial = () => {}, onStatus = () => {} }) {
    this.stop();
    if (!this.Recognition) { onStatus('Voice input is unavailable here. Choose a name or type your question instead.'); return false; }
    const recognition = new this.Recognition();
    this.recognition = recognition;
    recognition.lang = 'en-NZ';
    recognition.continuous = false;
    recognition.interimResults = true;
    let received = false;
    recognition.onstart = () => { if (this.recognition !== recognition) return; this.listening = true; this.update(); onStatus('Listening…'); };
    recognition.onresult = event => {
      if (this.recognition !== recognition) return;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal && !received) {
          received = true;
          const transcript = event.results[i][0].transcript.trim();
          this.recognition = null; this.listening = false; recognition.stop(); this.update();
          onStatus(''); onResult(transcript); return;
        }
        interim += event.results[i][0].transcript;
      }
      onPartial(interim);
    };
    recognition.onerror = event => {
      if (this.recognition !== recognition) return;
      this.recognition = null; this.listening = false; this.update();
      const messages = { 'not-allowed': 'Microphone permission was declined. Allow it in your browser settings, or use the options on screen.', 'service-not-allowed': 'Speech recognition is not available on this device. You can use the options on screen.', 'audio-capture': 'No microphone was found. You can use the options on screen.', 'network': 'The speech service could not connect. Please try again or type instead.', 'no-speech': 'I didn’t hear anything. Tap the microphone to try again.', 'aborted': '' };
      onStatus(messages[event.error] || 'Voice input stopped. Please try again or type instead.');
    };
    recognition.onend = () => { if (this.recognition !== recognition) return; this.recognition = null; this.listening = false; this.update(); if (!received) onStatus('I didn’t catch that. Tap the microphone to try again.'); };
    try { recognition.start(); return true; }
    catch { this.recognition = null; onStatus('Voice input could not start. Try again, or use the options on screen.'); return false; }
  }
}

export const voice = new FarmVoice();

export function bindVoiceToggle(button, status) {
  const update = event => {
    button.textContent = voice.enabled ? '◖)) Voice on' : '◖ Voice off';
    button.setAttribute('aria-pressed', String(voice.enabled));
    button.setAttribute('aria-label', voice.enabled ? 'Turn spoken audio off' : 'Turn spoken audio on');
    if (status && event?.detail?.status) status.textContent = event.detail.status;
  };
  update(); voice.addEventListener('state', update);
  button.addEventListener('click', () => { voice.setEnabled(!voice.enabled); if (voice.enabled) voice.speak('Voice is on.'); });
}
