// Farm Impostors: wires the world, the herd, the blasters, the hunter drone and the
// fact trainer together and runs the game loop. One level is loaded per page load;
// moving to another level saves the choice and reloads.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  FactTrainer,
  MIN_FACTOR,
  MAX_FACTOR,
  factKey,
  equation,
  equationParts,
  productParts,
  productChoices,
  spokenOrder,
  explainMiss,
  fits,
} from './facts.js';
import { LEVELS, FIRST_LEVEL, opForRound, chooseLevel } from './levels.js';
import { BLASTERS } from './models.js';
import { catchScore, hunterTimeLimit, waveFor, WAVES } from './score.js';
import { loadProgress, saveProgress, clearProgress, loadSettings, saveSettings } from './storage.js';
import { buildWorld } from './world.js';
import { Herd } from './animals.js';
import { Drone } from './drone.js';
import { Effects, REVEAL_GLITCH, REVEAL_EXPOSED } from './effects.js';
import { Player } from './player.js';
import { Board } from './board.js';
import { Swarm } from './swarm.js';
import { Boss } from './boss.js';
import { BlasterView, BlasterPickup } from './blaster.js';
import { Hud } from './hud.js';
import { Voice, VOICE_MODES, VOICE_LABELS, defaultMode } from './voice.js';
import { initAudio, sfx, toggleMute } from './audio.js';
import { Graphics, QUALITY_LEVELS, QUALITY_LABELS } from './graphics.js';
import { TouchControls, isTouchDevice } from './touch.js';

// `?debug` runs the game without capturing the mouse and exposes `window.__game`,
// which is how the automated browser check drives it.
const params = new URLSearchParams(location.search);
const debug = params.has('debug');
// Phones and tablets get on-screen controls instead of the mouse; `?touch` forces them.
const touch = isTouchDevice(params);
if (touch) document.body.classList.add('touch');

const settings = loadSettings();
if (settings.best && !settings.bests) settings.bests = { [FIRST_LEVEL]: settings.best }; // older saves
// The level to play is the one last chosen, if it has been unlocked.
// `?level=forest` opens a level directly, unlocked or not.
const level = LEVELS[params.get('level')] || LEVELS[chooseLevel(settings.level, settings.unlocked)];

const PICKUP_RANGE = 2.3;
const MUZZLE_DISTANCE = 0.9;
const CENTRE = new THREE.Vector2(0, 0);
const RED = 0xff3b2f;
const GREEN = 0x7dff7a;
const mode = level.mode;
// How a signal is answered in each mode (see levels.js and the end of facts.js).
const ASK = { herd: 'factor', gates: 'factor', products: 'product', swarm: 'dial', boss: 'pair' };
const GATE_REACH = 14; // the next round starts this close to a gate
const LOCKS_PER_GATE = 5;

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// ---------- Setup ----------

const graphics = new Graphics(document.getElementById('game'));
const renderer = graphics.renderer;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 600);
camera.rotation.order = 'YXZ';

const world = buildWorld(scene, renderer, level);
const herd = new Herd(scene, { species: level.herd, bounds: level.roam });
herd.populate();
const drone = new Drone(scene);
const effects = new Effects(scene);
const player = new Player(level.spawn);
const blaster = new BlasterView();
blaster.scene.environment = scene.environment; // the held blaster reflects the same sky
graphics.setScenes(scene, camera, blaster.scene, blaster.camera);
let pickup = level.pickup ? new BlasterPickup(scene, world.gunSpot, level.pickup) : null;

// What each kind of level adds: the swarm overhead on the ridge, a board of numbers on
// each gate in the hideout, the pilot and its power cells at the landing.
const roamCentre = new THREE.Vector3((level.roam.minX + level.roam.maxX) / 2, 0, (level.roam.minZ + level.roam.maxZ) / 2);
const swarm = mode === 'swarm' ? new Swarm(scene, roamCentre, CONFIG.roundsToWin) : null;
const gates = mode === 'gates' ? world.site.gates : [];
const locks = gates.map((gate) => new Board(scene, gate.spots, { maxSize: 1.6 }));
const boss = mode === 'boss' ? new Boss(scene, world.site.pilot) : null;
const cells = mode === 'boss' ? new Board(scene, world.site.cells, { maxSize: 2.6 }) : null;
const boards = cells ? [cells] : locks;
const hud = new Hud();
let trainer = new FactTrainer(loadProgress());
const voice = new Voice(settings.voice || defaultMode(navigator.language), settings.voiceNames);
const raycaster = new THREE.Raycaster();
raycaster.far = 400;

// A faint light carried by the player, so nearby things are never lost in the dark.
const lamp = new THREE.PointLight(0xbfe6ff, 5, 18, 1.4);
scene.add(lamp);

const eye = new THREE.Vector3();

const game = {
  phase: 'title', // title -> explore (no blaster yet) -> hunt -> ended
  running: false,
  time: 0,
  cooldown: 0,
  timers: [],
  hearts: CONFIG.maxHearts,
  rescued: 0,
  score: 0,
  streak: 0,
  bestStreak: 0,
  wave: 1,
  round: null,
  log: [],
  blasters: [...level.carried], // the kinds of blaster found so far, e.g. ['×', '÷']
  // The one in hand: the last one carried in, or the first where there is none to find.
  active: (level.pickup ? level.carried.at(-1) : level.carried[0]) || null,
  roundsStarted: 0,
  cued: false, // the objective line is asking for the other blaster
  lastSwitch: 0,
  firstSignal: true,
  slowMotion: 0, // seconds of real time left in slow motion
  sparkClock: 0,
  pingClock: 0,
  dial: 7, // the number the blaster is set to on the ridge, where the player sets it
  gate: 0, // in the hideout: the gate being opened
  locks: 0, // ...and how many of its locks are open
  waiting: false, // in the hideout: between gates, until the player walks up to the next
};

// Runs `fn` after this many seconds of play (pausing the game pauses the wait).
function after(seconds, fn) {
  game.timers.push({ left: seconds, fn });
}

// The numbers are up from the start, so the place reads right behind the title screen.
if (gates.length) {
  showGate();
  // The prisoners in the pen wear no numbers, so only the gate's numbers are read.
  for (const animal of herd.animals) animal.sign.visible = false;
}
if (cells) cells.label(shuffle(range(MIN_FACTOR, MAX_FACTOR)));

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  graphics.resize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  blaster.setAspect(w / h);
}
window.addEventListener('resize', resize);
resize();
player.applyTo(camera);

// ---------- Voice setting ----------

function refreshVoiceChoice() {
  const status = voice.status();
  const notes = {
    ok: '',
    off: '',
    missing: `This browser has no ${VOICE_LABELS[voice.mode]} voice installed, so English is used instead.`,
    unsupported: 'This browser cannot speak, so the voice stays silent.',
  };
  hud.setVoiceChoice(VOICE_LABELS[voice.mode], notes[status]);

  // Offer a choice of voice when the computer has more than one for this language.
  const installed = voice.mode === 'off' ? [] : voice.candidates();
  const current = voice.findVoice();
  hud.setVoicePick(
    installed.length > 1 && current ? current.name : null,
    installed.indexOf(current) + 1,
    installed.length,
  );
}

function cycleVoice() {
  voice.mode = VOICE_MODES[(VOICE_MODES.indexOf(voice.mode) + 1) % VOICE_MODES.length];
  settings.voice = voice.mode;
  saveSettings(settings);
  refreshVoiceChoice();
  voice.say('×', 7, 6, 42); // a sample, so the choice can be heard straight away
}

function nextVoice() {
  if (!voice.nextVoice()) return;
  settings.voiceNames = voice.chosen;
  saveSettings(settings);
  refreshVoiceChoice();
  voice.say('×', 7, 6, 42);
}

// ---------- Graphics setting ----------

function applyGraphics() {
  // Phones start on Low: bloom at a phone's pixel ratio is more than most can draw smoothly.
  const level = QUALITY_LEVELS.includes(settings.graphics) ? settings.graphics : touch ? 'low' : 'high';
  graphics.setQuality(level);
  world.setQuality(level);
  hud.setGraphicsChoice(QUALITY_LABELS[level]);
}

function cycleGraphics() {
  const next = (QUALITY_LEVELS.indexOf(graphics.quality) + 1) % QUALITY_LEVELS.length;
  settings.graphics = QUALITY_LEVELS[next];
  saveSettings(settings);
  applyGraphics();
}

applyGraphics();
voice.onVoices = refreshVoiceChoice;
refreshVoiceChoice();

// ---------- Levels ----------

function bestHere() {
  return (settings.bests && settings.bests[level.id]) || 0;
}

// The levels that can be chosen on the start screen, in order.
function openLevels() {
  const unlocked = settings.unlocked || [];
  return Object.keys(LEVELS).filter((id) => id === FIRST_LEVEL || id === level.id || unlocked.includes(id));
}

function goToLevel(id) {
  settings.level = id;
  saveSettings(settings);
  const url = new URL(location.href);
  url.searchParams.delete('level');
  if (url.href === location.href) location.reload();
  else location.assign(url);
}

function nextOpenLevel() {
  const open = openLevels();
  goToLevel(open[(open.indexOf(level.id) + 1) % open.length]);
}

hud.setLevel(level, openLevels().length);
hud.setBest(bestHere());

// ---------- Rounds ----------

function multiplier() {
  return Math.min(5, Math.max(1, game.streak));
}

function refreshHud() {
  hud.setHearts(game.hearts, CONFIG.maxHearts);
  if (game.phase === 'hunt' || game.phase === 'ended') {
    hud.setProgress({
      score: game.score,
      multiplier: multiplier(),
      rescued: game.rescued,
      total: CONFIG.roundsToWin,
      wave: game.wave,
      counter: level.text.counter,
    });
  } else {
    hud.hideProgress();
  }
  const round = game.round;
  if (mode === 'swarm') {
    hud.setDial(game.dial, round && !round.done && round.hinted ? round.gun : null);
  } else {
    hud.setWeapons(game.blasters, game.active, round && !round.done ? round.op : null);
  }
}

// Puts a blaster in the player's hand.
function holdBlaster(op) {
  game.active = op;
  blaster.hold(op);
  cueBlaster();
}

// Each signal can only be answered with its own blaster. When the other one is in
// hand, the objective line says so and the slot for the right one pulses.
function cueBlaster() {
  const round = game.round;
  refreshHud();
  if (round && !round.done && game.active !== round.op) {
    const how = touch ? 'Tap it below to switch.' : 'Scroll to switch.';
    hud.setObjective(`This signal needs the ${round.op} blaster. ${how}`);
    game.cued = true;
  } else if (game.cued) {
    hud.setObjective('');
    game.cued = false;
  }
}

// to: the kind to switch to; left out, it moves on to the next one owned.
function switchBlaster(to = null) {
  if (!game.running || game.blasters.length < 2) return;
  const next = to || game.blasters[(game.blasters.indexOf(game.active) + 1) % game.blasters.length];
  if (next === game.active || !game.blasters.includes(next)) return;
  sfx.swap();
  holdBlaster(next);
}

// On the ridge the player sets the blaster's number: 2 to 10.
function setDial(n) {
  if (!game.running || mode !== 'swarm') return;
  const value = Math.max(MIN_FACTOR, Math.min(MAX_FACTOR, n));
  if (value === game.dial) return;
  game.dial = value;
  sfx.swap();
  blaster.setScreen('×', `×${value}`);
  refreshHud();
  if (game.round && !game.round.done) showSignal();
}

const DIAL_HELP = 'Set the dial with the scroll wheel or the number keys (0 is 10).';
const DIAL_HELP_TOUCH = 'Tap a number at the bottom to set the dial.';

// ---------- The scanner ----------

// The signal as the scanner shows it: [text before the box, what is in the box, text after].
function signalParts(round, solved) {
  const { op, gun, animal, product } = round;
  if (round.ask === 'product') {
    const [before, after] = productParts(op, gun, animal);
    return [before, solved ? product : '?', after];
  }
  if (round.ask === 'dial') {
    // The box shows the dial as it turns: "7 × ? = 56".
    const set = solved ? round.used[0] : game.dial;
    return ['', set, solved ? ` × ${product / set} = ${product}` : ` × ? = ${product}`];
  }
  if (round.ask === 'pair') {
    if (solved) return [`${round.used[0]} × `, round.used[1], ` = ${product}`];
    if (round.first !== null) return [`${round.first} × `, '?', ` = ${product}`];
    return ['', '?', ` × ? = ${product}`];
  }
  const [before, after] = equationParts(op, gun, product);
  return [before, solved ? animal : '?', after];
}

function showSignal(solved = false) {
  const round = game.round;
  const [before, box, after] = signalParts(round, solved);
  hud.setSignal({ before, box, after, solved, divide: round.op === '÷' });
}

// ---------- Rounds ----------

function resetRun() {
  game.hearts = CONFIG.maxHearts;
  game.rescued = 0;
  game.score = 0;
  game.streak = 0;
  game.bestStreak = 0;
  game.wave = 1;
  game.round = null;
  game.roundsStarted = 0;
  game.cued = false;
  game.log = [];
  game.timers = [];
  herd.pace = 1;
  herd.clearHints();
  drone.dismiss();
  hud.hideScanner();
  hud.setThreat(null);
  // Put back whatever the last run used up: the swarm, the gates, the pilot.
  if (swarm) swarm.reset(CONFIG.roundsToWin);
  if (boss) {
    boss.reset();
    cells.show(true);
  }
  if (gates.length) {
    gates.forEach((gate) => gate.lock());
    game.gate = 0;
    game.locks = 0;
    showGate();
    Object.assign(player.pos, { x: level.spawn.x, y: 0, z: level.spawn.z });
    player.yaw = level.spawn.yaw;
  }
  refreshHud();
}

function pickUpBlaster() {
  pickup.remove();
  pickup = null;
  game.blasters.push(level.pickup);
  game.phase = 'hunt';
  holdBlaster(level.pickup);
  sfx.pickup();
  hud.toast(level.text.found, 'info', 2.5);
  hud.setObjective(level.text.go);
  after(2, () => {
    hud.setObjective(level.text.how);
    startRound();
  });
}

// Levels with no blaster to find go straight to the hunt.
function beginHunt() {
  game.phase = 'hunt';
  refreshHud();
  if (mode === 'swarm') blaster.setScreen('×', `×${game.dial}`);
  if (mode === 'gates') {
    // The first signal comes when he walks up to the first gate.
    game.waiting = true;
    hud.setObjective(level.text.go);
    return;
  }
  hud.setObjective(level.text.go);
  after(3, () => {
    hud.setObjective(mode === 'swarm' ? `${level.text.how} ${touch ? DIAL_HELP_TOUCH : DIAL_HELP}` : level.text.how);
    startRound();
  });
}

// In the hideout only the gate being opened shows its numbers.
function showGate() {
  locks.forEach((board, i) => {
    board.show(i === game.gate);
    if (i === game.gate) board.label(shuffle(range(1, 10)));
  });
}

function startRound() {
  if (game.phase !== 'hunt') return;
  const fact = trainer.next();
  const op = opForRound(level, game.roundsStarted);
  game.roundsStarted += 1;
  const limit = hunterTimeLimit({
    typicalMs: trainer.typicalMs(),
    wave: game.wave,
    first: game.firstSignal,
  });
  game.firstSignal = false;
  const round = {
    ...fact,
    op,
    ask: ASK[mode],
    target: fact.animal, // the number to shoot, where there is one
    first: null, // at the landing: the first power cell picked
    used: null, // on the ridge and at the landing: the two factors he chose
    startedAt: game.time,
    misses: 0,
    hinted: false,
    done: false,
    limit,
  };
  game.round = round;

  if (mode === 'herd') {
    if (!herd.find(fact.animal)) herd.spawn(fact.animal, level.herd[0]);
  } else if (mode === 'products') {
    // The scanner rewrites every tag: the answer and the products closest to it.
    round.target = fact.product;
    herd.relabel(productChoices(fact.gun, fact.animal));
    if (!herd.find(round.target)) herd.animals[0].number = round.target;
  } else if (mode === 'gates') {
    locks[game.gate].label(shuffle(range(1, 10)));
  } else if (mode === 'boss') {
    round.target = null;
    cells.label(shuffle(range(MIN_FACTOR, MAX_FACTOR)));
    boss.setNumber(fact.product);
  } else if (mode === 'swarm') {
    round.target = null;
  }

  showSignal();
  // Only the blaster that fits this signal gets a number.
  for (const owned of game.blasters) {
    let screen = owned === op ? `${op}${fact.gun}` : `${owned}–`;
    if (mode === 'swarm') screen = `×${game.dial}`;
    if (mode === 'boss') screen = owned === op ? `${op}?` : `${owned}–`;
    blaster.setScreen(owned, screen);
  }
  cueBlaster();

  // The hunter: on the ridge it is one of the swarm, wearing the product; at the landing
  // the pilot sends it; everywhere else it comes from the ship.
  let from = world.ufo.position;
  if (swarm) from = swarm.release(eye);
  if (boss) from = boss.chest;
  drone.setTag(mode === 'swarm' ? fact.product : null);
  drone.launch(from, limit);
  game.pingClock = 1;
  sfx.launch();
}

// Every numbered thing a shot can hit right now. (The animals in the hideout's pen are
// prisoners, not targets.)
function numberedHitboxes() {
  const list = mode === 'gates' ? [] : [...herd.hitboxes];
  for (const board of boards) list.push(...board.hitboxes);
  return list;
}

function shoot() {
  if (!game.running || !game.active || game.cooldown > 0) return;
  if (game.phase !== 'hunt' && game.phase !== 'explore') return;
  game.cooldown = CONFIG.fireCooldown;
  blaster.fire();
  sfx.shoot();

  scene.updateMatrixWorld();
  camera.updateMatrixWorld();
  raycaster.setFromCamera(CENTRE, camera);
  const targets = [...numberedHitboxes(), ...world.solids, ...drone.hitboxes];
  if (boss) targets.push(boss.hitbox);
  const hit = raycaster.intersectObjects(targets, false)[0];
  const to = hit ? hit.point.clone() : raycaster.ray.at(150, new THREE.Vector3());

  // Start the beam where the held blaster's muzzle is drawn on screen.
  const from = blaster.muzzleOnScreen(new THREE.Vector3()).setZ(0.5).unproject(camera);
  from.sub(camera.position).normalize().multiplyScalar(MUZZLE_DISTANCE).add(camera.position);
  effects.beam(from, to, { color: BLASTERS[game.active].beam });
  if (!hit) return;

  const round = game.round;
  const live = round && !round.done;

  if (hit.object.userData.drone) {
    if (mode === 'swarm' && live) {
      // On the ridge the drone is the target, and the dial is the answer.
      if (fits(game.dial, round.product)) solve(null, [game.dial, round.product / game.dial]);
      else miss(null, to, game.dial);
      return;
    }
    drone.hit(raycaster.ray.direction);
    effects.burst(to, [RED, 0xffffff], 12, 6, 0.4, 0.1);
    sfx.clang();
    return;
  }
  if (hit.object.userData.boss) {
    // The shield turns blaster fire. Only the power cells can hurt it.
    effects.burst(to, [GREEN, 0xffffff], 10, 5, 0.4, 0.1);
    sfx.clang();
    if (live) hud.toast('Blasters bounce off the shield. Use the power cells.', 'info', 2.2);
    return;
  }

  const target = hit.object.userData.animal || hit.object.userData.target;
  const counts = target && live && (mode !== 'gates' || locks[game.gate].items.includes(target));
  if (!counts || mode === 'swarm') {
    effects.burst(to, 0x9ff6ff, 5, 3, 0.3, 0.08);
    return;
  }
  if (game.active !== round.op) {
    // The wrong blaster does nothing to it, and costs nothing either.
    effects.burst(to, 0x8a93a8, 6, 3, 0.3, 0.08);
    sfx.fizzle();
    hud.toast('Wrong blaster for this signal', 'info', 1.8);
    return;
  }
  if (mode === 'boss') cellShot(target, to);
  else if (target.number === round.target) solve(target);
  else miss(target, to, target.number);
}

// At the landing: the first cell must go into the pilot's number, the second must
// complete it.
function cellShot(cell, point) {
  const round = game.round;
  const n = cell.number;
  if (round.first === null) {
    if (!fits(n, round.product)) {
      miss(cell, point, n);
      return;
    }
    round.first = n;
    cell.lit = true;
    effects.column(cell.position.clone().setY(0), GREEN, 0.5);
    effects.burst(cell.position, [GREEN, 0xffffff], 10, 4, 0.4, 0.1);
    sfx.pickup();
    herd.clearHints();
    cells.clearHints();
    if (round.hinted) hintAt(round);
    showSignal();
    return;
  }
  if (round.first * n === round.product) solve(cell, [round.first, n]);
  else miss(cell, point, n);
}

// The scanner locks on after repeated setbacks: the target (or, where the player picks
// the numbers, one that fits) starts to glitch.
function hintAt(round) {
  if (mode === 'herd' || mode === 'products') {
    const impostor = herd.find(round.target);
    if (impostor) impostor.hint = true;
  } else if (mode === 'gates') {
    const lock = locks[game.gate].find(round.target);
    if (lock) lock.hint = true;
  } else if (mode === 'boss') {
    const want = round.first === null ? round.gun : round.product / round.first;
    const cell = cells.find(want);
    if (cell) cell.hint = true;
  }
  refreshHud(); // on the ridge the dial pulses at a number that fits
}

// Shared by wrong shots and hunter strikes.
function loseHeart(round) {
  round.misses += 1;
  game.streak = 0;
  game.hearts -= 1;
  player.shake = 0.4;
  hud.flashDamage();
  refreshHud();
  if (game.hearts <= 0) {
    endRun(false);
    return;
  }
  if (round.misses >= CONFIG.hintAfterMisses && !round.hinted) {
    round.hinted = true;
    hintAt(round);
    hud.setObjective(
      mode === 'swarm'
        ? 'Scanner locked on. The flashing number on the dial fits.'
        : 'Scanner locked on. The glitching tag is your target.',
    );
    sfx.hint();
  }
}

// A wrong answer: the true fact behind it is shown and said, and something fires back.
// target: what was hit (null on the ridge); shot: the number that was chosen.
function miss(target, point, shot) {
  const round = game.round;
  const { text, fact } = explainMiss({
    ask: round.ask,
    op: round.op,
    gun: round.gun,
    answer: round.animal,
    product: round.product,
    shot,
    first: round.first,
  });
  effects.burst(point, RED, 8, 4, 0.4, 0.1);
  const at = eye.clone().setY(eye.y - 0.5);
  if (mode === 'herd' || mode === 'products') {
    herd.startle(target, player.pos);
    // The ship answers a wrong shot.
    effects.beam(world.ufo.position, at, { color: RED, width: 0.35, seconds: 0.3 });
  } else if (mode === 'gates') {
    locks[game.gate].flash(target, RED, 1.2);
    effects.beam(new THREE.Vector3(0, 7.5, gates[game.gate].z), at, { color: RED, width: 0.3, seconds: 0.3 });
  } else if (mode === 'boss') {
    cells.flash(target, RED, 1.2);
    effects.beam(boss.chest, at, { color: GREEN, width: 0.45, seconds: 0.35 });
  } else if (mode === 'swarm') {
    // The drone shrugs it off and fires back.
    effects.burst(drone.position, [RED, 0xffffff], 10, 5, 0.4, 0.1);
    effects.beam(drone.position, at, { color: RED, width: 0.25, seconds: 0.3 });
  }
  sfx.wrong();
  sfx.bolt();
  if (fact) voice.say(fact.op, ...spokenOrder(fact.op, fact.gun, fact.answer, fact.product));
  hud.toast(`WRONG   ${text}`, 'bad', 3.4);
  loseHeart(round);
}

function hunterStrike() {
  const round = game.round;
  effects.burst(eye, [RED, 0xffffff], 14, 5, 0.4, 0.1);
  sfx.strike();
  hud.toast(
    mode === 'swarm' ? 'The drone got you. Set the dial and bring it down.' : 'The hunter got you. Answer the signal to shut it down.',
    'bad',
    3,
  );
  drone.retreat();
  loseHeart(round);
}

// A right answer. target: what was hit (null on the ridge). used: the two factors the
// player chose, where he chooses them (the ridge and the landing).
function solve(target, used = null) {
  const round = game.round;
  round.done = true;
  round.used = used;
  const firstTry = round.misses === 0;
  const elapsed = game.time - round.startedAt;
  // The fact as he answered it: where he picks the factors, the pair he picked.
  const fact = used
    ? { op: '×', gun: used[0], answer: used[1], product: round.product, key: factKey(used[0], used[1]) }
    : { op: round.op, gun: round.gun, answer: round.animal, product: round.product, key: round.key };
  trainer.record(fact.key, { firstTry, ms: elapsed * 1000 });
  saveProgress(trainer.toJSON());
  game.log.push({
    op: fact.op,
    gun: fact.gun,
    animal: fact.answer,
    product: fact.product,
    firstTry,
    ms: elapsed * 1000,
  });
  game.rescued += 1;

  let bonusHeart = false;
  if (firstTry) {
    game.streak += 1;
    game.bestStreak = Math.max(game.bestStreak, game.streak);
    if (game.streak % CONFIG.streakForHeart === 0 && game.hearts < CONFIG.maxHearts) {
      game.hearts += 1;
      bonusHeart = true;
    }
  }
  const { points } = catchScore({ firstTry, combo: game.streak, elapsed, limit: round.limit });
  game.score += points;

  // Say and show the whole fact at the moment of success: this is the part that sticks.
  const text = equation(fact.op, fact.gun, fact.answer, fact.product);
  voice.say(fact.op, ...spokenOrder(fact.op, fact.gun, fact.answer, fact.product));

  const won = game.rescued >= CONFIG.roundsToWin;
  celebrate(target, text, won);
  if (bonusHeart) after(1.6, () => sfx.heart());

  // The hunter loses its link and blows up (on the ridge it already has).
  if (drone.active) {
    effects.explosion(drone.position.clone(), 0.6);
    drone.dismiss();
  }
  hud.setThreat(null);
  showSignal(true);
  game.cued = false;
  // Only the fact goes in the message; the points appear by the score instead.
  hud.toast(text, 'good', 2.4);
  hud.scoreGain(points, bonusHeart);
  hud.setObjective('');

  const wave = waveFor(game.rescued);
  if (wave !== game.wave && !won) {
    game.wave = wave;
    herd.pace = 1 + CONFIG.herdPacePerWave * (wave - 1);
    if (boss) boss.rage = (wave - 1) / 3;
    // In the hideout a new wave is a new gate, which has its own moment.
    if (mode !== 'gates') {
      after(1.6, () => {
        hud.banner(wave === WAVES ? 'FINAL WAVE' : `WAVE ${wave}`);
        sfx.wave();
      });
    }
  }
  refreshHud();
}

// What a right answer looks like, which differs from level to level, and what comes next.
function celebrate(target, text, won) {
  const round = game.round;
  const next = (seconds) => (won ? after(seconds + 0.2, () => endRun(true)) : after(seconds, startRound));

  if (mode === 'swarm') {
    // The drone itself is blown out of the sky.
    const at = drone.position.clone();
    effects.explosion(at, 1.3);
    effects.floatText(at.clone().setY(at.y + 2), text, '#7dff5a', camera.position);
    drone.dismiss();
    sfx.correct();
    after(0.15, () => sfx.boom());
    next(2.2);
    return;
  }

  if (mode === 'gates') {
    const board = locks[game.gate];
    const gate = gates[game.gate];
    board.flash(target, GREEN, 1.5);
    effects.burst(target.position, [GREEN, 0xffffff], 18, 5, 0.5, 0.12);
    effects.floatText(new THREE.Vector3(0, 5.5, gate.z + 1.5), text, '#7dff5a', camera.position);
    game.locks += 1;
    gate.setLocks(game.locks);
    sfx.correct();
    if (game.locks < LOCKS_PER_GATE) {
      next(1.8);
      return;
    }
    // The fifth lock: the gate opens, and the next round waits for the next gate.
    after(0.9, () => {
      gate.unlock();
      board.show(false);
      effects.burst(new THREE.Vector3(0, 3.5, gate.z), [0x5ef2ff, 0xffffff], 40, 9, 0.8, 0.14);
      sfx.boom();
      hud.banner(won ? 'ALL GATES OPEN' : `GATE ${game.gate + 1} OPEN`);
      if (won) {
        hud.setObjective('');
        after(2.5, () => endRun(true));
        return;
      }
      game.gate += 1;
      game.locks = 0;
      showGate();
      game.waiting = true;
      hud.setObjective(level.text.gateOpen);
    });
    return;
  }

  if (mode === 'boss') {
    // Both cells fire into the pilot's shield.
    const first = cells.find(round.used[0]);
    const second = target;
    const chest = boss.chest;
    for (const cell of [first, second]) {
      if (!cell) continue;
      cell.lit = false;
      cells.flash(cell, GREEN, 1.2);
      effects.beam(cell.position, chest, { color: GREEN, width: 0.3, seconds: 0.6 });
    }
    effects.floatText(chest.clone().setY(chest.y + 5), text, '#7dff5a', camera.position);
    boss.setNumber(null);
    boss.hit(1 - game.rescued / CONFIG.roundsToWin);
    effects.burst(chest, [GREEN, 0xffffff], 30, 9, 0.6, 0.16);
    sfx.correct();
    after(0.3, () => sfx.boom());
    if (!won) {
      next(2.6);
      return;
    }
    // The last hit: the shield fails and the pilot falls.
    cells.show(false);
    after(0.8, () => {
      boss.defeat();
      sfx.screech();
      game.slowMotion = 0.6;
    });
    for (const [t, dx, dy] of [[1.2, 0, 0], [1.8, -2, 3], [2.4, 2, -1], [3.2, 0, -4]]) {
      after(t, () => {
        effects.explosion(chest.clone().add(new THREE.Vector3(dx, dy, 0)), 1.6);
        sfx.boom();
      });
    }
    after(4.4, () => endRun(true));
    return;
  }

  // Herd levels: the unmasking. The disguise glitches, is blown off, the alien stands
  // exposed in a moment of slow motion, then explodes.
  const animal = target;
  const spot = { x: animal.group.position.x, z: animal.group.position.z };
  const { number, species, height } = animal;
  // The text starts above the alien's head (it stands taller than the animal did).
  const textY = Math.max(height + 0.8, 5.2);
  effects.floatText(new THREE.Vector3(spot.x, textY, spot.z), text, '#7dff7a', camera.position);
  herd.detach(animal);
  effects.reveal(animal, camera.position);
  sfx.correct();
  after(REVEAL_GLITCH, () => {
    sfx.screech();
    game.slowMotion = 0.45;
  });
  after(REVEAL_GLITCH + REVEAL_EXPOSED, () => sfx.boom());
  // Once the alien is gone, the real animal it replaced is beamed back down.
  after(1.8, () => {
    herd.spawn(number, species, { at: spot, drop: true });
    effects.column(new THREE.Vector3(spot.x, 0, spot.z), 0xfff2a8, 1.5);
  });
  next(2.7);
}

function summarise(won) {
  const firstTries = game.log.filter((entry) => entry.firstTry);
  const accuracy = game.log.length ? firstTries.length / game.log.length : 0;
  const missed = [];
  for (const entry of game.log) {
    if (entry.firstTry) continue;
    const text = equation(entry.op, entry.gun, entry.animal, entry.product);
    if (!missed.includes(text)) missed.push(text);
  }
  const previousBest = bestHere();
  const newBest = game.score > previousBest;
  if (newBest) settings.bests = { ...settings.bests, [level.id]: game.score };
  // Winning a level opens the next one.
  const opened = won && level.next && !(settings.unlocked || []).includes(level.next);
  if (opened) settings.unlocked = [...(settings.unlocked || []), level.next];
  if (newBest || opened) saveSettings(settings);
  return {
    won,
    wonTitle: level.text.wonTitle,
    wonText: level.text.won(CONFIG.roundsToWin),
    nextText: level.next ? level.text.next : null,
    rescued: game.rescued,
    total: CONFIG.roundsToWin,
    rounds: game.log.length,
    accuracy,
    avgSeconds: firstTries.length
      ? firstTries.reduce((sum, entry) => sum + entry.ms, 0) / firstTries.length / 1000
      : null,
    bestStreak: game.bestStreak,
    score: game.score,
    best: Math.max(previousBest, game.score),
    newBest,
    stars: !won ? 0 : accuracy >= 0.9 ? 3 : accuracy >= 0.7 ? 2 : 1,
    missed,
    facts: trainer.all(),
  };
}

function endRun(won) {
  const round = game.round;
  if (round && !round.done) {
    // Ran out of hearts mid-signal: that fact still counts as missed.
    round.done = true;
    trainer.record(round.key, { firstTry: false });
    game.log.push({ op: round.op, gun: round.gun, animal: round.animal, product: round.product, firstTry: false });
  }
  saveProgress(trainer.toJSON());
  game.phase = 'ended';
  game.timers = [];
  herd.clearHints();
  if (drone.active) {
    if (won) effects.explosion(drone.position.clone(), 0.6);
    drone.dismiss();
  }
  hud.setThreat(null);
  hud.setObjective('');
  if (won) sfx.win();
  else sfx.lose();

  // Let the last effects play for a moment before the results appear.
  setTimeout(
    () => {
      game.running = false;
      if (document.pointerLockElement) document.exitPointerLock();
      hud.showResults(summarise(won));
      hud.setBest(bestHere());
      hud.setLevel(level, openLevels().length);
    },
    won ? 900 : 1300,
  );
}

// ---------- Starting, pausing, input ----------

function captureMouse() {
  if (touch) goFullscreen();
  if (debug || touch) {
    game.running = true;
    hud.hideOverlays();
    hud.showHud();
    return;
  }
  const request = renderer.domElement.requestPointerLock();
  // Browsers refuse a new capture for about a second after Esc: fall back to the pause menu.
  if (request && request.catch) request.catch(() => hud.showPause());
}

function start() {
  initAudio();
  voice.unlock();
  if (game.phase === 'title') {
    if (game.active) blaster.hold(game.active); // a blaster carried over from an earlier level
    if (level.pickup) {
      game.phase = 'explore';
      refreshHud();
      hud.setObjective(level.text.find);
    } else {
      beginHunt();
    }
  }
  captureMouse();
}

function playAgain() {
  initAudio();
  voice.unlock();
  hud.hideOverlays();
  resetRun();
  beginHunt();
  captureMouse();
}

// On a phone, fill the screen and hold it sideways where the browser allows it
// (Android does; iPhones have no fullscreen for pages, so the rotate hint covers it).
function goFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement || !root.requestFullscreen) return;
  root
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
    .catch(() => {});
}

function pause() {
  if (!game.running || (game.phase !== 'explore' && game.phase !== 'hunt')) return;
  game.running = false;
  player.keys.clear();
  if (controls) controls.reset();
  hud.showPause();
}

// Touch screens have no pointer lock to lose, so the game pauses when the page is hidden.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && touch) pause();
});

const controls = touch
  ? new TouchControls(player, { fire: shoot, pause, active: () => game.running })
  : null;
if (touch) document.getElementById('touch').hidden = false;

// The blaster slots are buttons on a touch screen.
document.getElementById('weapons').addEventListener('pointerdown', (event) => {
  const slot = event.target.closest('.slot.owned');
  if (!slot) return;
  if (slot.dataset.dial) setDial(Number(slot.dataset.dial));
  else switchBlaster(slot.textContent);
});
if (mode === 'swarm') {
  document.body.classList.add('dial-mode');
  // The start screen's controls: on the ridge the wheel and keys turn the dial.
  document.getElementById('switch-help').innerHTML = '<kbd>Scroll</kbd><kbd>2</kbd>–<kbd>0</kbd> set the dial';
  document.getElementById('switch-help-touch').innerHTML = '<kbd>2 … 10</kbd> tap to set the dial';
}

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === renderer.domElement) {
    game.running = true;
    hud.hideOverlays();
    hud.showHud();
  } else {
    player.keys.clear();
    if (game.phase === 'explore' || game.phase === 'hunt') {
      game.running = false;
      hud.showPause();
    }
  }
});

document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === renderer.domElement) {
    player.look(event.movementX, event.movementY);
  }
});

document.addEventListener('mousedown', (event) => {
  if (event.button === 0 && document.pointerLockElement === renderer.domElement) shoot();
});

document.addEventListener('keydown', (event) => {
  if (event.code === 'KeyM' && !event.repeat) {
    hud.toast(toggleMute() ? 'Sound off' : 'Sound on', 'info', 1.2);
    return;
  }
  if (event.code === 'KeyV' && !event.repeat) {
    cycleVoice();
    hud.toast(`Voice: ${VOICE_LABELS[voice.mode]}`, 'info', 1.2);
    return;
  }
  if (!game.running) return;
  if (mode === 'swarm') {
    // The number keys set the dial: 2-9, and 0 for 10.
    const digit = /^(?:Digit|Numpad)(\d)$/.exec(event.code);
    if (digit && digit[1] !== '1') setDial(digit[1] === '0' ? 10 : Number(digit[1]));
  } else {
    if (event.code === 'Digit1') switchBlaster('×');
    if (event.code === 'Digit2') switchBlaster('÷');
  }
  if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
  player.keys.add(event.code);
});

document.addEventListener('keyup', (event) => player.keys.delete(event.code));
window.addEventListener('blur', () => player.keys.clear());

// The scroll wheel (or the 1 and 2 keys) switches between the blasters found so far.
// One turn of the wheel sends a burst of events, so only the first one counts.
// On the ridge it turns the dial instead, one number per notch.
window.addEventListener('wheel', (event) => {
  const now = performance.now();
  if (now - game.lastSwitch < (mode === 'swarm' ? 70 : 250)) return;
  game.lastSwitch = now;
  if (mode === 'swarm') setDial(game.dial + (event.deltaY > 0 ? 1 : -1));
  else switchBlaster();
});

document.getElementById('start-button').addEventListener('click', start);
document.getElementById('resume-button').addEventListener('click', start);
document.getElementById('again-button').addEventListener('click', playAgain);
document.getElementById('voice-button').addEventListener('click', cycleVoice);
document.getElementById('voice-name-button').addEventListener('click', nextVoice);
document.getElementById('graphics-button').addEventListener('click', cycleGraphics);
document.getElementById('level-button').addEventListener('click', nextOpenLevel);
document.getElementById('next-button').addEventListener('click', () => goToLevel(level.next));
document.getElementById('reset-button').addEventListener('click', (event) => {
  clearProgress();
  trainer = new FactTrainer(null);
  delete settings.best;
  settings.bests = {};
  saveSettings(settings);
  hud.setBest(0);
  event.target.textContent = 'Saved progress cleared';
});

// ---------- Game loop ----------

function update(dt) {
  game.time += dt;
  game.cooldown = Math.max(0, game.cooldown - dt);

  for (const timer of game.timers) timer.left -= dt;
  const due = game.timers.filter((timer) => timer.left <= 0);
  game.timers = game.timers.filter((timer) => timer.left > 0);
  for (const timer of due) timer.fn();

  player.update(dt, world.colliders);
  player.applyTo(camera);
  lamp.position.copy(camera.position);
  eye.set(player.pos.x, player.pos.y + 1.5, player.pos.z);

  updateSite(dt);
  effects.update(dt);
  blaster.update(dt, player.speed);

  // In the hideout, the next signal comes when he walks up to the next gate.
  if (game.waiting && game.phase === 'hunt' && player.pos.z < gates[game.gate].z + GATE_REACH) {
    game.waiting = false;
    hud.setObjective(level.text.how);
    startRound();
  }

  if (pickup) {
    pickup.update(dt, game.time);
    const dx = player.pos.x - world.gunSpot.x;
    const dz = player.pos.z - world.gunSpot.z;
    if (game.phase === 'explore' && Math.hypot(dx, dz) < PICKUP_RANGE) pickUpBlaster();
  }

  if (drone.active) {
    const reached = drone.update(dt, eye, game.time);
    if (reached) hunterStrike();
    if (drone.active) {
      hud.setThreat(drone.progress, drone.distance);
      // The hunter's ping speeds up as it closes in.
      game.pingClock -= dt;
      if (game.pingClock <= 0) {
        sfx.ping(drone.progress);
        game.pingClock = 1.1 - drone.progress * 0.95;
      }
    }
  }

  // Green sparks leak from a disguise that is being hinted at.
  game.sparkClock -= dt;
  if (game.sparkClock <= 0) {
    game.sparkClock = 0.12;
    const hinted = herd.animals.find((a) => a.hint);
    if (hinted) {
      const p = hinted.group.position;
      effects.burst(new THREE.Vector3(p.x, hinted.height * 0.6, p.z), 0x6dff5a, 2, 2.5, 0.5, 0.1);
    }
  }
}

// Everything that moves on its own: scenery, animals, the swarm, the pilot, the numbers.
function updateSite(dt) {
  world.update(dt, game.time, camera.position);
  herd.update(dt, camera.position, game.time);
  if (swarm) swarm.update(dt, game.time);
  if (boss) boss.update(dt, game.time);
  for (const board of boards) board.update(dt, camera.position, game.time);
}

// Behind the title screen the place is alive but nothing is at stake yet.
function idle(dt) {
  game.time += dt;
  updateSite(dt);
  if (pickup) pickup.update(dt, game.time);
}

function render() {
  graphics.render(blaster.visible);
}

lamp.position.copy(camera.position);

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (game.running) {
    // A beat of slow motion when an alien is unmasked.
    const slow = game.slowMotion > 0;
    game.slowMotion = Math.max(0, game.slowMotion - dt);
    update(slow ? dt * 0.35 : dt);
  } else if (game.phase === 'title') {
    idle(dt);
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (debug) {
  window.__game = {
    game,
    player,
    herd,
    drone,
    world,
    voice,
    settings,
    graphics,
    camera,
    level,
    blaster,
    swarm,
    boss,
    boards,
    switchBlaster,
    get trainer() {
      return trainer;
    },
    start,
    shoot,
    playAgain,
    // Advance the game by a number of seconds without waiting for real time.
    step(seconds) {
      for (let t = 0; t < seconds; t += 1 / 60) update(1 / 60);
    },
    teleport(x, z, yaw = player.yaw, pitch = 0) {
      Object.assign(player.pos, { x, z });
      player.yaw = yaw;
      player.pitch = pitch;
      player.applyTo(camera);
    },
    setDial,
    // The number the current signal wants shot (the first factor, at the landing).
    get answer() {
      const round = game.round;
      if (!round) return null;
      if (mode === 'boss') return round.first === null ? round.gun : round.product / round.first;
      if (mode === 'swarm') return round.gun;
      return round.target;
    },
    // Stand a few metres south of whatever wears `number` (an animal, a lock on the
    // gate being opened, a power cell) and aim at it.
    aimAt(number) {
      const animal = mode === 'herd' || mode === 'products' ? herd.find(number) : null;
      const item = animal ? null : boards.filter((b) => b.visible).map((b) => b.find(number)).find(Boolean);
      if (!animal && !item) return false;
      const p = animal ? animal.group.position : item.position;
      const aimY = animal ? p.y + animal.height * 0.5 : p.y;
      const back = animal ? 4 : 6;
      Object.assign(player.pos, { x: p.x, z: p.z + back });
      player.shake = 0;
      player.bob = 0;
      player.yaw = 0;
      player.pitch = Math.atan2(aimY - (1.7 + player.pos.y), back);
      player.applyTo(camera);
      return true;
    },
    // Turn to face the hunter drone from wherever the player stands.
    aimAtDrone() {
      const d = drone.position;
      const dx = d.x - player.pos.x;
      const dz = d.z - player.pos.z;
      player.shake = 0;
      player.bob = 0;
      player.yaw = Math.atan2(-dx, -dz);
      player.pitch = Math.atan2(d.y - (1.7 + player.pos.y), Math.hypot(dx, dz));
      player.applyTo(camera);
    },
  };
}
