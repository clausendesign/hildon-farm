export const NAMES = ['Wozza', 'Wok', 'Big Dog Wok', 'Warwick'];
const KEY = 'hildon-farm-profile-v1';
let sessionProfile;

export function readProfile() {
  try {
    const value = sessionProfile || JSON.parse(localStorage.getItem(KEY) || '{}');
    return { name: NAMES.includes(value.name) ? value.name : null, voice: value.voice !== false, onboarded: value.onboarded === true };
  } catch { return sessionProfile || { name: null, voice: true, onboarded: false }; }
}

export function saveProfile(patch) {
  const value = { ...readProfile(), ...patch };
  sessionProfile = value;
  try { localStorage.setItem(KEY, JSON.stringify(value)); }
  catch { /* The current page still works when browser storage is unavailable. */ }
  window.dispatchEvent(new CustomEvent('farm-profile', { detail: value }));
  return value;
}

export function nameFromSpeech(text) {
  const words = String(text).toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/\bbig (?:dog|dogg)\b/.test(words)) return 'Big Dog Wok';
  if (/\b(?:wozza|woza|wazza|waza|wossa|wosa)\b/.test(words)) return 'Wozza';
  if (/\b(?:wok|wock|walk|woks)\b/.test(words)) return 'Wok';
  if (/\b(?:warwick|warrick|warick|warrwick)\b/.test(words)) return 'Warwick';
  return null;
}
