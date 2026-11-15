// Says facts out loud using the browser's built-in speech.
// Hearing the whole fact right after answering is the reinforcement: "7 times 6 is 42",
// "42 divided by 7 is 6".
//
// The voices come from the computer and the browser, and they vary a lot in quality.
// This module ranks them, starts with the best one, and lets the player pick another.

export const VOICE_MODES = ['en', 'no', 'off'];
export const VOICE_LABELS = { en: 'English', no: 'Norsk', off: 'Off' };

const PHRASES = {
  en: { '×': (a, b, result) => `${a} times ${b} is ${result}`, '÷': (a, b, result) => `${a} divided by ${b} is ${result}` },
  no: { '×': (a, b, result) => `${a} ganger ${b} er ${result}`, '÷': (a, b, result) => `${a} delt på ${b} er ${result}` },
};
const LOCALE = { en: 'en-US', no: 'nb-NO' };
const PREFIXES = { en: ['en'], no: ['nb', 'no', 'nn'] };

// op: '×' or '÷'. The numbers come in the order they are said.
export function phrase(mode, op, a, b, result) {
  return PHRASES[mode] && PHRASES[mode][op] ? PHRASES[mode][op](a, b, result) : '';
}

// Picks the starting language from the browser's own language.
export function defaultMode(browserLanguage = '') {
  const lang = browserLanguage.toLowerCase();
  return PREFIXES.no.some((p) => lang.startsWith(p)) ? 'no' : 'en';
}

function locale(voice) {
  return (voice.lang || '').replace('_', '-');
}

// Higher is better. Modern neural and online voices sound natural; the classic
// synthesisers found on Linux (eSpeak and friends) sound robotic.
export function voiceQuality(voice, mode) {
  const name = (voice.name || '').toLowerCase();
  let score = 0;
  if (/natural|neural|premium|enhanced|siri/.test(name)) score += 4;
  if (/google|online/.test(name)) score += 3;
  if (/espeak|festival|flite|pico|mbrola/.test(name)) score -= 4;
  if (voice.localService === false) score += 1;
  if (locale(voice) === LOCALE[mode]) score += 1;
  return score;
}

// Voices for a language, best first.
export function rankVoices(voices, mode) {
  if (!PREFIXES[mode]) return [];
  return voices
    .filter((v) => PREFIXES[mode].some((p) => locale(v).toLowerCase().startsWith(p)))
    .map((voice, index) => ({ voice, index, score: voiceQuality(voice, mode) }))
    .sort((x, y) => y.score - x.score || x.index - y.index)
    .map((entry) => entry.voice);
}

export class Voice {
  // chosen: voice names the player picked earlier, per language: { en: '...', no: '...' }
  constructor(mode, chosen = {}) {
    this.mode = VOICE_MODES.includes(mode) ? mode : 'en';
    this.chosen = { ...chosen };
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis || null : null;
    this.voices = [];
    this.lastSpoken = '';
    this.onVoices = null;
    this.pending = null;
    if (this.synth) {
      const load = () => {
        this.voices = this.synth.getVoices();
        if (this.onVoices) this.onVoices();
      };
      load();
      // Browsers fill in the voice list a moment after the page loads.
      if (this.synth.addEventListener) this.synth.addEventListener('voiceschanged', load);
    }
  }

  candidates(mode = this.mode) {
    return rankVoices(this.voices, mode);
  }

  // The voice in use: the player's pick if it is still installed, otherwise the best one.
  findVoice(mode = this.mode) {
    const list = this.candidates(mode);
    return list.find((v) => v.name === this.chosen[mode]) || list[0] || null;
  }

  // Moves on to the next installed voice for the current language.
  nextVoice() {
    const list = this.candidates();
    if (list.length < 2) return null;
    const next = list[(list.indexOf(this.findVoice()) + 1) % list.length];
    this.chosen[this.mode] = next.name;
    return next;
  }

  // 'ok', 'off', 'missing' (this computer has no voice for the language), or
  // 'unsupported' (the browser cannot speak at all).
  status(mode = this.mode) {
    if (mode === 'off') return 'off';
    if (!this.synth) return 'unsupported';
    if (this.voices.length && !this.findVoice(mode)) return 'missing';
    return 'ok';
  }

  say(op, a, b, result) {
    if (this.mode === 'off' || !this.synth) return;
    // Without a Norwegian voice, Norwegian words would be read with an English accent,
    // so fall back to English entirely.
    const mode = this.status(this.mode) === 'missing' ? 'en' : this.mode;
    const text = phrase(mode, op, a, b, result);
    this.lastSpoken = text;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = this.findVoice(mode);
      if (voice) utterance.voice = voice;
      utterance.lang = voice ? voice.lang : LOCALE[mode];
      utterance.rate = 0.95;
      // Never let facts queue up behind each other. Some browsers garble or drop an
      // utterance started in the same instant as a cancel, hence the short pause.
      const busy = this.synth.speaking || this.synth.pending;
      if (busy) this.synth.cancel();
      clearTimeout(this.pending);
      this.pending = setTimeout(() => this.synth.speak(utterance), busy ? 80 : 0);
    } catch {
      // Speech is a bonus: if the browser refuses, the game carries on silently.
    }
  }
}
