// Tunable game rules. Where things are in each level is in levels.js.

export const CONFIG = {
  roundsToWin: 20,
  maxHearts: 5,
  // A heart comes back after this many first-try catches in a row.
  streakForHeart: 3,
  // After this many setbacks on one signal (wrong zaps or hunter strikes), the
  // impostor's number tag starts glitching.
  hintAfterMisses: 2,
  // Each wave the herd moves this much faster.
  herdPacePerWave: 0.15,
  fireCooldown: 0.35,
};

export const WORLD_LIMIT = 95;

export const STORAGE_KEY = 'farm-impostors.v1';
