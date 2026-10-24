import assert from 'node:assert/strict';
const queue = [];
const win = new EventTarget();
win.speechSynthesis = { cancel() {}, resume() {}, getVoices: () => [{ lang: 'en-NZ', localService: true }], speak(utterance) { queue.push(utterance); } };
class Utterance { constructor(text) { this.text = text; } }
class Recognition {
  static current;
  constructor() { Recognition.current = this; }
  start() { this.onstart?.(); }
  stop() {}
  abort() { this.onend?.(); }
}
win.SpeechSynthesisUtterance = Utterance;
win.SpeechRecognition = Recognition;
globalThis.window = win;
globalThis.speechSynthesis = win.speechSynthesis;
globalThis.SpeechSynthesisUtterance = Utterance;
globalThis.document = new EventTarget();
document.querySelectorAll = () => [];
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
globalThis.Audio = class { pause() {} play() { return Promise.resolve(); } };
URL.createObjectURL = () => 'blob:clip'; URL.revokeObjectURL = () => {};
globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(['clip']) });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const { voice } = await import('../public/farm-voice.mjs');
assert.equal(voice.enabled, true);
const natural = voice.speak('A natural voice line.'); await tick();
assert.equal(voice.speaking, true); voice.audio.onended(); assert.equal(await natural, 'finished');
// When the natural voice is unavailable, the browser voice takes over.
globalThis.fetch = async () => ({ ok: false });
const speaking = voice.speak('A useful spoken market briefing. '.repeat(40)); await tick();
assert(queue.length > 1);
assert.equal(voice.utterances.length, queue.length);
queue[0].onstart(); assert.equal(voice.speaking, true);
queue.at(-1).onend(); assert.equal(await speaking, 'finished');
assert.equal(voice.speaking, false);
const blocked = voice.speak('Welcome.'); queue.at(-1).onerror({ error: 'not-allowed' }); assert.equal(await blocked, 'blocked');
const cancelled = voice.speak('Welcome again.'); voice.stop(); assert.equal(await cancelled, 'cancelled');
voice.setEnabled(false); assert.equal(await voice.speak('Muted.'), 'muted'); voice.setEnabled(true);
let result;
voice.listen({ onResult: text => result = text }); assert.equal(voice.listening, true);
const recognition = Recognition.current;
recognition.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Big Dog Wok' } }] });
assert.equal(result, 'Big Dog Wok'); assert.equal(voice.listening, false);
// A pause after some words counts as the end of the question, without waiting for the browser.
let paused;
voice.listen({ onResult: text => paused = text });
Recognition.current.onresult({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: 'when is the next sale' } }] });
await new Promise(resolve => setTimeout(resolve, 1300));
assert.equal(paused, 'when is the next sale'); assert.equal(voice.listening, false);
let permissionMessage;
voice.listen({ onResult() {}, onStatus: text => permissionMessage = text });
Recognition.current.onerror({ error: 'not-allowed' }); assert.match(permissionMessage, /permission was declined/);
voice.listen({ onResult() {} }); document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); assert.equal(voice.listening, false);
console.log('Voice checks passed: enabled by default, natural voice with browser fallback, retained speech queue, blocked audio, cancellation, microphone transcript, pause detection, permission denial and background cleanup.');
