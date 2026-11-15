// Synthesised sound effects and a low ambient drone, so the game needs no audio files.

let ctx = null;
let master = null;
let noiseBuffer = null;
let muted = false;
let ambientStarted = false;

// Browsers only allow audio after a click, so this is called from the start button.
export function initAudio() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  startAmbient();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 1;
  return muted;
}

// A quiet, uneasy hum under everything.
function startAmbient() {
  if (ambientStarted || !ctx) return;
  ambientStarted = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 180;
  const gain = ctx.createGain();
  gain.gain.value = 0.05;
  filter.connect(gain).connect(master);
  for (const freq of [55, 55.6, 82.4]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.connect(filter);
    osc.start();
  }
  // Slow swell so the hum breathes.
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  lfo.frequency.value = 0.08;
  depth.gain.value = 0.02;
  lfo.connect(depth).connect(gain.gain);
  lfo.start();
}

function tone({ type = 'square', from, to = from, dur = 0.15, vol = 0.12, delay = 0 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Filtered noise: explosions and impacts.
function noise({ dur = 0.5, vol = 0.3, from = 1800, to = 60, delay = 0 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  source.connect(filter).connect(gain).connect(master);
  source.start(t0);
  source.stop(t0 + dur + 0.02);
}

function notes(freqs, { step = 0.09, dur = 0.16, type = 'triangle', vol = 0.16 } = {}) {
  freqs.forEach((f, i) => tone({ type, from: f, dur, vol, delay: i * step }));
}

export const sfx = {
  shoot() {
    tone({ type: 'sawtooth', from: 1100, to: 180, dur: 0.16, vol: 0.09 });
    noise({ dur: 0.08, vol: 0.05, from: 4000, to: 800 });
  },
  // The impostor is unmasked.
  correct() {
    notes([523, 784, 1047], { step: 0.07, dur: 0.14 });
  },
  // The alien, exposed.
  screech() {
    tone({ type: 'sawtooth', from: 420, to: 1500, dur: 0.16, vol: 0.07 });
    tone({ type: 'square', from: 1500, to: 520, dur: 0.55, vol: 0.05, delay: 0.14 });
    tone({ type: 'sawtooth', from: 1560, to: 480, dur: 0.55, vol: 0.04, delay: 0.14 });
  },
  boom() {
    noise({ dur: 0.7, vol: 0.4, from: 1600, to: 50 });
    tone({ type: 'sine', from: 110, to: 35, dur: 0.5, vol: 0.3 });
  },
  wrong() {
    tone({ type: 'square', from: 170, to: 90, dur: 0.32, vol: 0.12 });
  },
  // The mothership fires on him.
  bolt() {
    tone({ type: 'sawtooth', from: 1800, to: 90, dur: 0.35, vol: 0.14 });
    noise({ dur: 0.4, vol: 0.25, from: 2500, to: 100, delay: 0.05 });
  },
  // The hunter drone reaches him.
  strike() {
    noise({ dur: 0.35, vol: 0.3, from: 3000, to: 200 });
    tone({ type: 'square', from: 300, to: 60, dur: 0.4, vol: 0.14 });
  },
  // A new hunter leaves the ship.
  launch() {
    tone({ type: 'sine', from: 220, to: 880, dur: 0.35, vol: 0.07 });
    notes([880, 1320], { step: 0.12, dur: 0.1, type: 'sine', vol: 0.09 });
  },
  // closeness 0 (far away) to 1 (about to strike).
  ping(closeness) {
    tone({ type: 'sine', from: 700 + closeness * 900, dur: 0.07, vol: 0.03 + closeness * 0.07 });
  },
  clang() {
    tone({ type: 'square', from: 900, to: 300, dur: 0.12, vol: 0.1 });
    noise({ dur: 0.12, vol: 0.12, from: 5000, to: 1000 });
  },
  pickup() {
    notes([196, 294, 392, 587, 784], { step: 0.08, dur: 0.22, type: 'sawtooth', vol: 0.09 });
  },
  // Switching from one blaster to another.
  swap() {
    tone({ type: 'square', from: 500, to: 900, dur: 0.06, vol: 0.06 });
    noise({ dur: 0.05, vol: 0.05, from: 3000, to: 1500 });
  },
  // Firing the blaster that cannot answer this signal.
  fizzle() {
    tone({ type: 'sawtooth', from: 320, to: 110, dur: 0.22, vol: 0.09 });
    noise({ dur: 0.18, vol: 0.06, from: 1500, to: 300 });
  },
  heart() {
    notes([1047, 1568], { step: 0.1, dur: 0.22, type: 'sine', vol: 0.14 });
  },
  hint() {
    notes([300, 600, 300, 600], { step: 0.06, dur: 0.06, type: 'square', vol: 0.06 });
  },
  wave() {
    notes([147, 147, 220], { step: 0.16, dur: 0.3, type: 'sawtooth', vol: 0.12 });
    noise({ dur: 0.6, vol: 0.12, from: 400, to: 60 });
  },
  win() {
    notes([392, 523, 659, 784, 1047], { step: 0.13, dur: 0.3 });
  },
  lose() {
    notes([392, 330, 262, 196], { step: 0.2, dur: 0.34, type: 'sawtooth', vol: 0.09 });
    noise({ dur: 1.2, vol: 0.15, from: 600, to: 40 });
  },
};
