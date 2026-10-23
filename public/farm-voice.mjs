import { readProfile, saveProfile } from './farm-profile.mjs';
import { splitSpeechText } from './briefing-audio.mjs';

// Sentence-sized groups keep each server request small and let playback start sooner.
export function splitNaturalText(text, limit = 1200) {
  const chunks = [];
  let chunk = '';
  for (const sentence of String(text).trim().match(/[^.!?]+[.!?]*\s*/g) || []) {
    if (chunk && chunk.length + sentence.length > limit) { chunks.push(chunk.trim()); chunk = ''; }
    if (sentence.length > limit) { chunks.push(...splitSpeechText(sentence, limit)); continue; }
    chunk += sentence;
  }
  if (chunk.trim()) chunks.push(chunk.trim());
  return chunks;
}

const ENVELOPE_RATE = 30;
// Measure loudness from the clip itself, so the speaker's output never has to pass through Web Audio.
async function loudness(blob) {
  const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await blob.arrayBuffer());
  const samples = decoded.getChannelData(0), step = Math.floor(decoded.sampleRate / ENVELOPE_RATE), envelope = [];
  for (let start = 0; start < samples.length; start += step) {
    let sum = 0;
    for (let i = start; i < Math.min(start + step, samples.length); i++) sum += samples[i] * samples[i];
    envelope.push(Math.sqrt(sum / step));
  }
  const peak = Math.max(...envelope, 0.01);
  return envelope.map(value => Math.min(1, value / peak));
}

function silentClip() {
  const header = new DataView(new ArrayBuffer(44));
  const write = (offset, text) => [...text].forEach((c, i) => header.setUint8(offset + i, c.charCodeAt(0)));
  write(0, 'RIFF'); header.setUint32(4, 36, true); write(8, 'WAVE'); write(12, 'fmt ');
  header.setUint32(16, 16, true); header.setUint16(20, 1, true); header.setUint16(22, 1, true);
  header.setUint32(24, 8000, true); header.setUint32(28, 8000, true); header.setUint16(32, 1, true); header.setUint16(34, 8, true);
  write(36, 'data'); header.setUint32(40, 0, true);
  return URL.createObjectURL(new Blob([header], { type: 'audio/wav' }));
}

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
    this.audio = new Audio();
    this.naturalDownUntil = 0;
    // Mobile browsers only let audio play later if it was started once from a tap.
    const unlock = () => { const clip = silentClip(); this.audio.src = clip; this.audio.play().then(() => { if (this.audio.src === clip) this.audio.pause(); }, () => {}); };
    document.addEventListener('pointerdown', unlock, { once: true, capture: true });
    document.addEventListener('keydown', unlock, { once: true, capture: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
    window.addEventListener('pagehide', () => this.stop());
  }
  update(status = '') {
    this.dispatchEvent(new CustomEvent('state', { detail: { enabled: this.enabled, speaking: this.speaking, listening: this.listening, status } }));
  }
  stopSpeaking() {
    this.sequence++;
    if (this.supportsSpeech) window.speechSynthesis.cancel();
    this.audio.pause();
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
  // How loud the voice is right now, from 0 to 1, for animating the orb.
  level() {
    if (!this.speaking) return 0;
    const now = performance.now() / 1000;
    if (!this.envelope) return 0.35 + 0.25 * Math.sin(now * 9) * Math.sin(now * 2.3);
    return this.envelope[Math.floor(this.audio.currentTime * ENVELOPE_RATE)] || 0;
  }
  setEnabled(value) {
    this.enabled = value;
    saveProfile({ voice: value });
    if (!value) this.stop();
    this.update();
  }
  speak(text) {
    this.stop();
    if (!this.enabled) return Promise.resolve('muted');
    const sequence = this.sequence;
    document.querySelectorAll('audio').forEach(audio => audio.pause());
    if (Date.now() < this.naturalDownUntil) return this.speakBrowser(text, sequence);
    // The natural voice comes from the server; the browser's own voice stays as the backup.
    return this.speakNatural(text, sequence).then(result => result === 'fallback' && sequence === this.sequence ? this.speakBrowser(text, sequence) : result);
  }
  speakNatural(text, sequence) {
    const chunks = splitNaturalText(text);
    const audio = this.audio;
    return new Promise(resolve => {
      let ended = false;
      const finish = result => { if (ended) return; ended = true; this.finishSpeech = null; this.speaking = this.loading = false; this.envelope = null; audio.onended = audio.onerror = null; this.update(result === 'blocked' ? 'Tap Play or Start voice setup to hear the voice.' : result === 'unavailable' ? 'The voice stopped part-way. You can still read everything on screen.' : ''); resolve(result); };
      this.finishSpeech = finish;
      if (!chunks.length) { finish('finished'); return; }
      this.loading = true; this.update();
      const load = index => fetch('/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: chunks[index] }) }).then(response => { if (!response.ok) throw new Error('speech'); return response.blob(); });
      let pending = load(0);
      const play = async index => {
        let blob;
        try { blob = await pending; }
        catch { if (index === 0) { this.naturalDownUntil = Date.now() + 10 * 60 * 1000; finish('fallback'); } else finish('unavailable'); return; }
        if (ended || sequence !== this.sequence) return;
        if (index + 1 < chunks.length) pending = load(index + 1);
        const url = URL.createObjectURL(blob);
        audio.src = url;
        this.envelope = null;
        loudness(blob).then(envelope => { if (audio.src === url) this.envelope = envelope; }, () => {});
        audio.onended = () => { URL.revokeObjectURL(url); if (ended || sequence !== this.sequence) return; if (index + 1 < chunks.length) play(index + 1); else finish('finished'); };
        audio.onerror = () => { URL.revokeObjectURL(url); finish('unavailable'); };
        try { await audio.play(); if (!ended && sequence === this.sequence) { this.speaking = true; this.loading = false; this.update(); } }
        catch (error) { finish(error?.name === 'NotAllowedError' ? 'blocked' : 'unavailable'); }
      };
      play(0);
    });
  }
  speakBrowser(text, sequence) {
    if (!this.supportsSpeech) { this.update('Speech is unavailable on this browser. You can read everything on screen.'); return Promise.resolve('unavailable'); }
    const chunks = splitSpeechText(text);
    return new Promise(resolve => {
      let ended = false;
      let timer;
      const finish = result => { if (ended) return; ended = true; clearTimeout(timer); this.finishSpeech = null; this.speaking = false; this.utterances = []; this.update(result === 'blocked' ? 'Tap Play or Start voice setup to hear the voice.' : result === 'unavailable' ? 'Read-aloud could not start in this browser. You can still read everything on screen.' : ''); resolve(result); };
      this.finishSpeech = finish;
      if (!chunks.length) { finish('finished'); return; }
      const voices = speechSynthesis.getVoices();
      const english = voices.filter(v => /^en[-_]/i.test(v.lang));
      // Prefer the higher-quality voices a device offers over its basic ones.
      const better = english.filter(v => /premium|enhanced|natural|neural|google|siri/i.test(v.name));
      const pick = list => ['en-NZ', 'en-AU', 'en-GB', 'en-US'].map(lang => list.find(v => v.lang === lang && v.localService) || list.find(v => v.lang === lang)).find(Boolean);
      const selected = pick(better) || pick(english) || english[0];
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
