// Farm Impostors: wires the world, the herd, the blasters, the hunter drone and the
// fact trainer together and runs the game loop. One level is loaded per page load;
// moving to another level saves the choice and reloads.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { FactTrainer, equation, spokenOrder, mistake } from './facts.js';
import { LEVELS, FIRST_LEVEL, opForRound, chooseLevel } from './levels.js';
import { BLASTERS } from './models.js';
import { catchScore, hunterTimeLimit, waveFor, WAVES } from './score.js';
import { loadProgress, saveProgress, clearProgress, loadSettings, saveSettings } from './storage.js';
import { buildWorld } from './world.js';
import { Herd } from './animals.js';
import { Drone } from './drone.js';
import { Effects, REVEAL_GLITCH, REVEAL_EXPOSED } from './effects.js';
import { Player } from './player.js';
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

const HOW_TO =
  'Destroy the animal carrying the missing number before the hunter reaches you. Hit a real animal and the ship fires back.';
const PICKUP_RANGE = 2.3;
const MUZZLE_DISTANCE = 0.9;
const CENTRE = new THREE.Vector2(0, 0);
const RED = 0xff3b2f;

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
let pickup = new BlasterPickup(scene, world.gunSpot, level.pickup);
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
  active: level.carried.at(-1) || null, // the one in hand
  roundsStarted: 0,
  cued: false, // the objective line is asking for the other blaster
  lastSwitch: 0,
  firstSignal: true,
  slowMotion: 0, // seconds of real time left in slow motion
  sparkClock: 0,
  pingClock: 0,
};

// Runs `fn` after this many seconds of play (pausing the game pauses the wait).
function after(seconds, fn) {
  game.timers.push({ left: seconds, fn });
}

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
    });
  } else {
    hud.hideProgress();
  }
  const round = game.round;
  hud.setWeapons(game.blasters, game.active, round && !round.done ? round.op : null);
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
    hud.setObjective(HOW_TO);
    startRound();
  });
}

function startRound() {
  if (game.phase !== 'hunt') return;
  const fact = trainer.next();
  const op = opForRound(level, game.roundsStarted);
  game.roundsStarted += 1;
  if (!herd.find(fact.animal)) herd.spawn(fact.animal, level.herd[0]);
  const limit = hunterTimeLimit({
    typicalMs: trainer.typicalMs(),
    wave: game.wave,
    first: game.firstSignal,
  });
  game.firstSignal = false;
  game.round = { ...fact, op, startedAt: game.time, misses: 0, hinted: false, done: false, limit };
  hud.setEquation(op, fact.gun, fact.product);
  // Only the blaster that fits this signal gets a number.
  for (const owned of game.blasters) blaster.setScreen(owned, owned === op ? `${op}${fact.gun}` : `${owned}–`);
  cueBlaster();
  drone.launch(world.ufo.position, limit);
  game.pingClock = 1;
  sfx.launch();
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
  const targets = [...herd.hitboxes, ...world.solids];
  if (drone.active) targets.push(drone.hitbox);
  const hit = raycaster.intersectObjects(targets, false)[0];
  const to = hit ? hit.point.clone() : raycaster.ray.at(150, new THREE.Vector3());

  // Start the beam where the held blaster's muzzle is drawn on screen.
  const from = blaster.muzzleOnScreen(new THREE.Vector3()).setZ(0.5).unproject(camera);
  from.sub(camera.position).normalize().multiplyScalar(MUZZLE_DISTANCE).add(camera.position);
  effects.beam(from, to, { color: BLASTERS[game.active].beam });
  if (!hit) return;

  if (hit.object.userData.drone) {
    drone.hit(raycaster.ray.direction);
    effects.burst(to, [RED, 0xffffff], 12, 6, 0.4, 0.1);
    sfx.clang();
    return;
  }

  const animal = hit.object.userData.animal;
  const round = game.round;
  if (!animal || !round || round.done) {
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
  if (animal.number === round.animal) destroyImpostor(animal);
  else hitRealAnimal(animal, to);
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
    const impostor = herd.find(round.animal);
    if (impostor) impostor.hint = true;
    hud.setObjective('Scanner locked on. The glitching tag is your target.');
    sfx.hint();
  }
}

function hitRealAnimal(animal, point) {
  const round = game.round;
  const made = round.gun * animal.number;
  herd.startle(animal, player.pos);
  effects.burst(point, RED, 8, 4, 0.4, 0.1);

  // The ship answers a wrong shot.
  effects.beam(world.ufo.position, eye.clone().setY(eye.y - 0.5), { color: RED, width: 0.35, seconds: 0.3 });
  sfx.wrong();
  sfx.bolt();
  // Say and show the true fact that the animal he shot belongs to.
  voice.say(round.op, ...spokenOrder(round.op, round.gun, animal.number, made));
  hud.toast(`WRONG TARGET   ${mistake(round.op, round.gun, animal.number, round.product)}`, 'bad', 3.4);
  loseHeart(round);
}

function hunterStrike() {
  const round = game.round;
  effects.burst(eye, [RED, 0xffffff], 14, 5, 0.4, 0.1);
  sfx.strike();
  hud.toast('The hunter got you. Destroy the impostor to shut it down.', 'bad', 3);
  drone.retreat();
  loseHeart(round);
}

function destroyImpostor(animal) {
  const round = game.round;
  round.done = true;
  const firstTry = round.misses === 0;
  const elapsed = game.time - round.startedAt;
  trainer.record(round.key, { firstTry, ms: elapsed * 1000 });
  saveProgress(trainer.toJSON());
  game.log.push({
    op: round.op,
    gun: round.gun,
    animal: round.animal,
    product: round.product,
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

  const spot = { x: animal.group.position.x, z: animal.group.position.z };
  const { number, species, height } = animal;
  const fact = equation(round.op, round.gun, round.animal, round.product);

  // Say and show the whole fact at the moment of success: this is the part that sticks.
  voice.say(round.op, ...spokenOrder(round.op, round.gun, round.animal, round.product));
  // The text starts above the alien's head (it stands taller than the animal did).
  const textY = Math.max(height + 0.8, 5.2);
  effects.floatText(new THREE.Vector3(spot.x, textY, spot.z), fact, '#7dff7a', camera.position);

  // Unmasking: the disguise glitches, is blown off, the alien stands exposed in a
  // moment of slow motion, then explodes.
  herd.detach(animal);
  effects.reveal(animal, camera.position);
  sfx.correct();
  after(REVEAL_GLITCH, () => {
    sfx.screech();
    game.slowMotion = 0.45;
  });
  after(REVEAL_GLITCH + REVEAL_EXPOSED, () => sfx.boom());
  if (bonusHeart) after(1.6, () => sfx.heart());

  // The hunter loses its link to the impostor and blows up.
  if (drone.active) {
    effects.explosion(drone.position.clone(), 0.6);
    drone.dismiss();
  }
  hud.setThreat(null);
  hud.setEquation(round.op, round.gun, round.product, round.animal);
  game.cued = false;
  // Only the fact goes in the message; the points appear by the score instead.
  hud.toast(fact, 'good', 2.4);
  hud.scoreGain(points, bonusHeart);
  hud.setObjective('');

  const wave = waveFor(game.rescued);
  const won = game.rescued >= CONFIG.roundsToWin;
  if (wave !== game.wave && !won) {
    game.wave = wave;
    herd.pace = 1 + CONFIG.herdPacePerWave * (wave - 1);
    after(1.6, () => {
      hud.banner(wave === WAVES ? 'FINAL WAVE' : `WAVE ${wave}`);
      sfx.wave();
    });
  }
  refreshHud();

  // Once the alien is gone, the real animal it replaced is beamed back down.
  after(1.8, () => {
    herd.spawn(number, species, { at: spot, drop: true });
    effects.column(new THREE.Vector3(spot.x, 0, spot.z), 0xfff2a8, 1.5);
  });
  if (won) after(2.9, () => endRun(true));
  else after(2.7, startRound);
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
    game.phase = 'explore';
    if (game.active) blaster.hold(game.active); // a blaster carried over from an earlier level
    refreshHud();
    hud.setObjective(level.text.find);
  }
  captureMouse();
}

function playAgain() {
  initAudio();
  voice.unlock();
  hud.hideOverlays();
  resetRun();
  game.phase = 'hunt';
  after(1.2, startRound);
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
  if (slot) switchBlaster(slot.textContent);
});

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
  if (event.code === 'Digit1') switchBlaster('×');
  if (event.code === 'Digit2') switchBlaster('÷');
  if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
  player.keys.add(event.code);
});

document.addEventListener('keyup', (event) => player.keys.delete(event.code));
window.addEventListener('blur', () => player.keys.clear());

// The scroll wheel (or the 1 and 2 keys) switches between the blasters found so far.
// One turn of the wheel sends a burst of events, so only the first one counts.
window.addEventListener('wheel', () => {
  const now = performance.now();
  if (now - game.lastSwitch < 250) return;
  game.lastSwitch = now;
  switchBlaster();
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

  world.update(dt, game.time, camera.position);
  herd.update(dt, camera.position, game.time);
  effects.update(dt);
  blaster.update(dt, player.speed);

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

// Behind the title screen the farm is alive but nothing is at stake yet.
function idle(dt) {
  game.time += dt;
  world.update(dt, game.time, camera.position);
  herd.update(dt, camera.position, game.time);
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
    // Stand a few metres south of the animal wearing `number` and aim at it.
    aimAt(number) {
      const animal = herd.find(number);
      if (!animal) return false;
      const p = animal.group.position;
      Object.assign(player.pos, { x: p.x, z: p.z + 4 });
      player.shake = 0;
      player.bob = 0;
      const dy = p.y + animal.height * 0.5 - (1.7 + player.pos.y);
      player.yaw = 0;
      player.pitch = Math.atan2(dy, 4);
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
