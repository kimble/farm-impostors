// Scoring, waves and how long the hunter drone gives him. Pure maths, tested with `npm test`.

export const MAX_MULTIPLIER = 5;
export const ROUNDS_PER_WAVE = 5;
export const WAVES = 4;

// combo: first-try catches in a row, including this one.
// elapsed / limit: seconds taken, and seconds the hunter allowed.
export function catchScore({ firstTry, combo, elapsed, limit }) {
  if (!firstTry) return { points: 50, multiplier: 1, speedBonus: 0 };
  const multiplier = Math.min(MAX_MULTIPLIER, Math.max(1, combo));
  const pace = limit > 0 ? Math.max(0, Math.min(1, 1 - elapsed / limit)) : 0;
  const speedBonus = Math.round(pace * 100);
  return { points: (100 + speedBonus) * multiplier, multiplier, speedBonus };
}

export function waveFor(rescued) {
  return Math.min(WAVES, 1 + Math.floor(rescued / ROUNDS_PER_WAVE));
}

const WAVE_PRESSURE = [1, 0.9, 0.8, 0.72];

// Seconds before the hunter drone reaches him. Based on how fast he usually is, so the
// pressure is real but fair, and tighter in later waves.
// typicalMs: his median time for a first-try catch, or null when there is too little data.
// first: the very first signal, when he is still standing in the barn.
export function hunterTimeLimit({ typicalMs, wave, first = false }) {
  const base = typicalMs ? Math.max(16, Math.min(30, (typicalMs / 1000) * 2.5)) : 28;
  const scaled = base * WAVE_PRESSURE[Math.max(0, Math.min(WAVES, wave) - 1)];
  return scaled + (first ? 12 : 0);
}
