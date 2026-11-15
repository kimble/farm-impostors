// Tunable game rules and the shared layout of the farm.

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

// Fenced pasture where the herd lives. The gate is a gap in the south fence.
export const PASTURE = { minX: -24, maxX: 24, minZ: -60, maxZ: -24, gateX: 0, gateWidth: 5 };

// The barn's door faces south (+z), toward the yard.
export const BARN = { x: -16, z: -6, w: 12, d: 10, h: 5, doorW: 4.4, doorH: 3.6 };

export const SPAWN = { x: -3, z: 18, yaw: 0.4 };

export const WORLD_LIMIT = 95;

export const STORAGE_KEY = 'farm-impostors.v1';
