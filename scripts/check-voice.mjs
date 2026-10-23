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
const { voice } = await import('../public/farm-voice.mjs');
assert.equal(voice.enabled, true);
const speaking = voice.speak('A useful spoken market briefing. '.repeat(40));
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
let permissionMessage;
voice.listen({ onResult() {}, onStatus: text => permissionMessage = text });
Recognition.current.onerror({ error: 'not-allowed' }); assert.match(permissionMessage, /permission was declined/);
voice.listen({ onResult() {} }); document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); assert.equal(voice.listening, false);
console.log('Voice checks passed: enabled by default, retained speech queue, blocked audio, cancellation, microphone transcript, permission denial and background cleanup.');
