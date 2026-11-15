// The levels, in the order they unlock: where the player starts, which animals live
// there, which blasters are in play and what the game says along the way.
//
// This module is pure data (no DOM, no three.js). The scenery for each level's `place`
// is built by the matching file in src/places/.
//
// `mode` is how a signal is answered:
//   'herd'     - ten animals wear 1-10; shoot the impostor wearing the missing factor
//   'products' - the animals wear products, relabelled every signal; shoot the answer
//   'swarm'    - no animals; the hunter drone wears a product and the player sets the
//                blaster's dial to a number that goes into it
//   'gates'    - each gate in a canyon carries 1-10 and opens after five right answers
//   'boss'     - power cells wear 2-10; shoot two that multiply to the boss's number

export const FIRST_LEVEL = 'farm';

export const LEVELS = {
  farm: {
    id: 'farm',
    name: 'The farm',
    place: 'farm',
    mode: 'herd',
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
      how: 'Destroy the animal carrying the missing number before the hunter reaches you. Hit a real animal and the ship fires back.',
      counter: 'rescued',
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
    mode: 'herd',
    next: 'ridge',
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
      how: 'Destroy the animal carrying the missing number before the hunter reaches you. Hit a real animal and the ship fires back.',
      counter: 'rescued',
      found: 'Divider online',
      go: 'Scanner warming up. Get to the clearing.',
      wonTitle: 'Forest cleared',
      won: (total) =>
        `All ${total} animals are back among the trees. Above the ridge to the north, the ship is gathering a swarm.`,
      next: 'Climb the ridge',
    },
  },

  ridge: {
    id: 'ridge',
    name: 'The ridge',
    place: 'ridge',
    mode: 'swarm',
    next: 'hideout',
    spawn: { x: 0, z: 14, yaw: 0.1 },
    // The bare hilltop the swarm circles over. Nothing roams here.
    roam: { minX: -20, maxX: 20, minZ: -30, maxZ: 6 },
    herd: [],
    carried: ['×'],
    pickup: null,
    mix: { '×': 1 },
    warmup: 0,
    text: {
      story:
        'Midnight on the ridge. The ship has let loose its swarm, and every drone in it is locked to a number. Your blaster has a dial now: you choose its number. Any number that goes into a drone\'s number brings it down.',
      go: 'Swarm overhead. They are coming down one at a time.',
      how: 'Set the dial to a number that goes into the drone\'s number, then shoot it before it reaches you.',
      counter: 'drones down',
      wonTitle: 'Swarm destroyed',
      won: (total) =>
        `All ${total} drones are down. The last of the aliens fled into a canyon to the north and sealed it behind them.`,
      next: 'Into the canyon',
    },
  },

  hideout: {
    id: 'hideout',
    name: 'The hideout',
    place: 'hideout',
    mode: 'gates',
    next: 'mothership',
    spawn: { x: 0, z: 44, yaw: 0 },
    // The pen behind the last gate, where the stolen animals are kept.
    roam: { minX: -10, maxX: 10, minZ: -96, maxZ: -74 },
    herd: ['sheep', 'cow', 'pig', 'chicken', 'fox', 'hare', 'moose', 'owl', 'sheep', 'pig'],
    carried: ['×', '÷'],
    pickup: null,
    mix: { '÷': 0.5, '×': 0.5 },
    warmup: 0,
    text: {
      story:
        'The aliens have dug in at the end of a canyon and sealed it with four gates. Every gate has five locks, and every lock is a fact. Behind the last gate are the animals they took.',
      go: 'Walk up to the first gate.',
      how: 'Shoot the number that opens the lock. Five locks open a gate.',
      gateOpen: 'Gate open. On to the next one.',
      counter: 'locks open',
      wonTitle: 'Hideout broken',
      won: () =>
        'All four gates are down and the animals are free. One way left to end this: get on board the ship.',
      next: 'Board the mothership',
    },
  },

  mothership: {
    id: 'mothership',
    name: 'The mothership',
    place: 'deck',
    mode: 'products',
    next: 'landing',
    spawn: { x: 0, z: 22, yaw: 0 },
    // The holding pen on deck.
    roam: { minX: -22, maxX: 22, minZ: -50, maxZ: -16 },
    herd: ['sheep', 'cow', 'pig', 'chicken', 'fox', 'hare', 'moose', 'owl', 'sheep', 'cow'],
    carried: ['×', '÷'],
    pickup: null,
    mix: { '×': 0.7, '÷': 0.3 },
    warmup: 0,
    text: {
      story:
        'You are on the hull of the mothership, high above the clouds. The animals it took are held on deck, and the ship rewrites their tags with every signal. Now they carry answers, not numbers.',
      go: 'The hold is in front of you. The ship knows you are here.',
      how: 'Destroy the animal carrying the answer before the hunter reaches you. Hit a real animal and the ship fires back.',
      counter: 'rescued',
      wonTitle: 'Ship crippled',
      won: (total) =>
        `All ${total} animals are free and the ship is losing height. It is coming down in the fields, and its pilot is coming with it.`,
      next: 'Face the pilot',
    },
  },

  landing: {
    id: 'landing',
    name: 'The landing',
    place: 'landing',
    mode: 'boss',
    next: null,
    spawn: { x: 0, z: 6, yaw: 0 },
    // The ring of power cells, around the scorched ground in front of the pilot.
    roam: { minX: -15, maxX: 15, minZ: -38, maxZ: -8 },
    herd: [],
    carried: ['×', '÷'],
    pickup: null,
    mix: { '×': 1 },
    warmup: 0,
    text: {
      story:
        'Dawn. The mothership has come down in the fields and its pilot has climbed out. Its shield breaks only when two power cells fire together, and only if their numbers multiply to the number on its chest.',
      go: 'The pilot has seen you. The power cells are charging.',
      how: 'Shoot two power cells whose numbers multiply to the pilot\'s number.',
      counter: 'hits',
      wonTitle: 'Pilot defeated',
      won: () => 'The pilot is down, the ship will never fly again, and every animal is home.',
      next: null,
    },
  },
};

// Which kind of signal the next round sends.
// roundsPlayed: rounds started so far in this run.
export function opForRound(level, roundsPlayed, rng = Math.random) {
  if (roundsPlayed < level.warmup && level.pickup) return level.pickup;
  const kinds = Object.entries(level.mix);
  let roll = rng();
  for (const [op, share] of kinds) {
    roll -= share;
    if (roll < 0) return op;
  }
  return kinds[kinds.length - 1][0];
}

// The level to load: the one asked for if it is unlocked, otherwise the first.
export function chooseLevel(wanted, unlocked = []) {
  return LEVELS[wanted] && (wanted === FIRST_LEVEL || unlocked.includes(wanted)) ? wanted : FIRST_LEVEL;
}
