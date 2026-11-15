// The levels, in the order they unlock: where the player starts, which animals live
// there, which blasters are in play and what the game says along the way.
//
// This module is pure data (no DOM, no three.js). The scenery for each level's `place`
// is built by the matching file in src/places/.

export const FIRST_LEVEL = 'farm';

export const LEVELS = {
  farm: {
    id: 'farm',
    name: 'The farm',
    place: 'farm',
    next: 'forest',
    spawn: { x: -3, z: 18, yaw: 0.4 },
    // Fenced pasture where the herd lives. The gate is a gap in the south fence.
    roam: { minX: -24, maxX: 24, minZ: -60, maxZ: -24, gateX: 0, gateWidth: 5 },
    herd: ['sheep', 'sheep', 'sheep', 'sheep', 'cow', 'cow', 'pig', 'pig', 'chicken', 'chicken'],
    carried: [], // blasters already in hand on arrival
    pickup: '×', // the blaster waiting to be found
    mix: { '×': 1 }, // share of rounds for each kind of signal
    warmup: 0,
    text: {
      story:
        'Dusk. A ship hangs over the pasture, and some of the animals out there are not animals any more. The disguises are perfect. Only the numbers give the machines away.',
      find: 'Find a weapon. Something is glowing in the barn.',
      found: 'Blaster online',
      go: 'Scanner warming up. Get to the pasture.',
      wonTitle: 'Farm secured',
      won: (total) =>
        `All ${total} animals are back and the ship is pulling away. One of its pods went down in the forest.`,
      next: 'Follow it into the forest',
    },
  },

  forest: {
    id: 'forest',
    name: 'The forest',
    place: 'forest',
    next: null,
    spawn: { x: 3, z: 32, yaw: 0.25 },
    // The clearing where the forest animals graze. No fence: the trees are the edge.
    roam: { minX: -22, maxX: 22, minZ: -54, maxZ: -20 },
    herd: ['fox', 'fox', 'fox', 'hare', 'hare', 'hare', 'moose', 'moose', 'owl', 'owl'],
    carried: ['×'],
    pickup: '÷',
    mix: { '÷': 0.7, '×': 0.3 },
    // The first signals after the pickup all use the new blaster, to learn it.
    warmup: 4,
    text: {
      story:
        'Night. The pod came down hard among the spruces, and the forest animals have not been the same since. Your scanner cannot read their signals. Whatever can is still in the wreck.',
      find: 'The scanner cannot read these signals. Search the wreck: follow the purple light.',
      found: 'Divider online',
      go: 'Scanner warming up. Get to the clearing.',
      wonTitle: 'Forest cleared',
      won: (total) => `All ${total} animals are back among the trees and the forest is quiet again.`,
      next: null,
    },
  },
};

// Which kind of signal the next round sends.
// roundsPlayed: rounds started so far in this run.
export function opForRound(level, roundsPlayed, rng = Math.random) {
  if (roundsPlayed < level.warmup) return level.pickup;
  let roll = rng();
  for (const [op, share] of Object.entries(level.mix)) {
    roll -= share;
    if (roll < 0) return op;
  }
  return level.pickup;
}

// The level to load: the one asked for if it is unlocked, otherwise the first.
export function chooseLevel(wanted, unlocked = []) {
  return LEVELS[wanted] && (wanted === FIRST_LEVEL || unlocked.includes(wanted)) ? wanted : FIRST_LEVEL;
}
