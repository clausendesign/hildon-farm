// Start speech in the tap handler, retain utterances and report silent failures.
export function splitSpeechText(text, limit = 240) {
  const chunks = [];
  let chunk = '';
  for (const word of String(text).trim().split(/\s+/)) {
    if (!word) continue;
    if (chunk && chunk.length + word.length + 1 > limit) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += (chunk ? ' ' : '') + word;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

// Sentence-sized groups keep each server request small. The first sentence goes on its own,
// so the voice starts quickly while the rest is being made.
export function splitNaturalText(text, limit = 1200) {
  const chunks = [];
  let chunk = '';
  for (const sentence of String(text).trim().match(/[^.!?]+[.!?]*\s*/g) || []) {
    if (chunk && (chunk.length + sentence.length > limit || chunks.length === 0)) { chunks.push(chunk.trim()); chunk = ''; }
    if (sentence.length > limit) { chunks.push(...splitSpeechText(sentence, limit)); continue; }
    chunk += sentence;
  }
  if (chunk.trim()) chunks.push(chunk.trim());
  return chunks;
}

export function createBriefingAudio({button, status, getText, onFallback, beforePlay, win = window, startTimeoutMs = 7000}) {
  const synth = win.speechSynthesis;
  const supported = !!synth && typeof win.SpeechSynthesisUtterance === 'function';
  let voices = [], utterances = [], generation = 0, active = false, timer;
  const say = text => { status.textContent = text; status.hidden = !text; };
  const clearTimer = () => { if (timer) win.clearTimeout(timer); timer = undefined; };
  const resetButton = () => {
    button.textContent = '▶ Listen to briefing';
    button.setAttribute('aria-pressed', 'false');
  };
  function stop(message = '') {
    generation++;
    active = false;
    clearTimer();
    if (supported) synth.cancel();
    utterances = [];
    resetButton();
    say(message);
  }
  function fail() {
    stop('Read-aloud could not start. Play the original report below, or open this page in Safari or Chrome.');
    onFallback();
  }
  function loadVoices() {
    if (supported) voices = synth.getVoices();
  }
  function chooseVoice() {
    const english = voices.filter(v => /^en(?:-|_)/i.test(v.lang));
    for (const lang of ['en-NZ', 'en-AU', 'en-GB', 'en-US']) {
      const matches = english.filter(v => v.lang.toLowerCase() === lang.toLowerCase());
      const voice = matches.find(v => v.localService) || matches[0];
      if (voice) return voice;
    }
    return english.find(v => v.default) || english[0] || voices.find(v => v.default);
  }
  function start() {
    if (active) { stop('Playback stopped.'); return; }
    const text = getText();
    if (!text?.trim()) { say('The briefing is still loading. Please try again in a moment.'); return; }
    if (!supported) { fail(); return; }
    stop();
    beforePlay?.();
    loadVoices();
    const voice = chooseVoice();
    const current = generation;
    active = true;
    button.textContent = '■ Cancel playback';
    say('Starting read-aloud…');
    // Keep the complete queue in memory: some mobile engines lose local-only references.
    utterances = splitSpeechText(text).map(part => {
      const u = new win.SpeechSynthesisUtterance(part);
      if (voice) u.voice = voice;
      u.lang = voice?.lang || 'en-US';
      u.rate = 0.95;
      u.volume = 1;
      return u;
    });
    utterances.forEach((u, index) => {
      u.onstart = () => {
        if (generation !== current) return;
        clearTimer();
        button.textContent = '■ Stop listening';
        button.setAttribute('aria-pressed', 'true');
        say('Reading briefing aloud. No sound? Check media volume or play the original report below.');
      };
      u.onend = () => {
        if (generation === current && index === utterances.length - 1) {
          active = false;
          clearTimer();
          utterances = [];
          resetButton();
          say('Briefing finished.');
        }
      };
      u.onerror = event => {
        if (generation !== current) return;
        if (['canceled', 'interrupted'].includes(event.error)) stop('Playback stopped.');
        else fail();
      };
    });
    timer = win.setTimeout(() => { if (generation === current && active) fail(); }, startTimeoutMs);
    try {
      // Do not await voice loading or a fetch here: the first speak must keep the tap's activation.
      synth.resume();
      for (const u of utterances) {
        if (generation !== current) break;
        synth.speak(u);
      }
    } catch { fail(); }
  }
  loadVoices();
  synth?.addEventListener?.('voiceschanged', loadVoices);
  button.addEventListener('click', start);
  win.addEventListener?.('pagehide', () => stop());
  return {stop};
}
