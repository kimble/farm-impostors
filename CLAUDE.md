# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Farm Impostors": a browser first-person shooter that drills the multiplication table (up to 10 × 10). It is built for one player, a 13-year-old, so it must not feel like a small child's game, and every feature is judged on whether it helps him recall facts faster.

The scanner shows a fact with a missing number (`7 × ? = 42`), the blaster is set to the known factor, and ten animals wear the numbers 1–10. The animal wearing the missing number is an alien in disguise. Shooting a real animal costs a heart. On a correct shot the whole fact is shown and spoken aloud.

There are six levels, each unlocked by winning the one before. Each asks the same facts a different way (`mode` in `levels.js`):

1. **Farm** (`herd`): the above, × blaster only, found in the barn.
2. **Forest** (`herd`): a ÷ blaster is found; signals come as `42 ÷ 7 = ?` (mostly) or `7 × ? = 42`. Each signal can only be answered with its own blaster, switched with the scroll wheel or the 1 and 2 keys.
3. **Ridge** (`swarm`): no animals. The hunter drone itself wears a product (`56`), and the player sets the blaster's dial (wheel, number keys, or a tappable strip) to any number that goes into it within the table. The only level where the player chooses a number.
4. **Hideout** (`gates`): a canyon with four gates; each shows 1–10 and opens after five signals (× or ÷). The next signal waits until the player walks up to the next gate.
5. **Mothership** (`products`): on the ship's deck above the clouds; the animals wear products, relabelled every signal (`7 × 6 = ?`, or `? ÷ 7 = 6`), with the closest rival products as decoys.
6. **Landing** (`boss`): the pilot wears a product; shoot two power cells (2–10) whose numbers multiply to it.

The on-screen title is "Farm Impostors" on purpose; the folder name `math-blaster` is the name of an existing game and must not appear in the game.

## Commands

```sh
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # production build into dist/
npm test         # all unit tests (node --test)

node --test test/facts.test.js                  # one test file
node --test --test-name-pattern="combo"         # tests whose name matches
```

There is no linter or formatter configured.

Commit directly on `main`; this repo does not use branches.

## Checking changes in a browser

Open `http://localhost:5173/?debug`. Add `&touch` to get the phone controls on a desktop browser. Add `&level=forest` to open a level directly, whether or not it is unlocked. In debug mode the game runs without pointer lock and exposes `window.__game` (see the end of `src/main.js`): `start()`, `shoot()`, `step(seconds)` to advance game time without waiting, `teleport(x, z, yaw, pitch)`, `aimAt(number)` (an animal, a lock on the current gate or a power cell), `aimAtDrone()`, `switchBlaster(op)`, `setDial(n)`, `answer` (the number the current signal wants shot or dialled; at the landing, the next cell), plus the live `game`, `level`, `herd`, `drone`, `world`, `graphics` and `trainer` objects. This is how the game is driven from an automated browser; no browser-automation package is a dependency of the project.

Sound and speech cannot be verified this way, and a software-rendered headless browser says nothing about frame rate. Teleporting with yaw and pitch both exactly 0 can black out flat ground in that browser (a relief-mapping edge case the mouse cannot reach); use a small non-zero angle.

## Architecture

Vanilla ES modules, Three.js, no framework. All art is generated in code at load time: there are no model, image or sound files.

`src/main.js` owns the game state (`game`), the round flow and the frame loop, and wires the other modules together. The other modules do not know about each other, with the exceptions listed below.

### Levels

One level is loaded per page load. `main.js` picks it from the saved settings (`chooseLevel`), builds everything for it, and moves to another level by saving the choice and reloading the page (`goToLevel`). Nothing is torn down or rebuilt in place.

- `levels.js` is pure data: for each level its `mode`, spawn point, the rectangle the animals roam in (also where the ship circles), the species (ten, or none), the blasters carried in and the one to find (`pickup`, or null to start the hunt straight away), the mix of signal kinds, and every line of level-specific text. `opForRound` picks the kind of signal for a round.
- `src/places/<place>.js` is that level's scenery and ground rules (see World below).

Each mode's rules live in `main.js`, branched on `mode` in a few places: `startRound` (set up the targets), `shoot`/`cellShot` (what a hit means), `miss` (who fires back), `celebrate` (what a right answer looks like and what comes next), `hintAt`, and `resetRun` (Play again puts back the swarm, the gates and the pilot). The moving parts are their own modules: `board.js` (numbered targets that stand still: gate locks and power cells, `userData.target`), `swarm.js` (the drones circling the ridge) and `boss.js` (the pilot).

Where the player picks the numbers (ridge and landing), `solve` records the fact he actually used (`round.used`), not the one the trainer asked for.

To add a level: an entry in `LEVELS` (and `next` on the level before it), a file in `src/places/`, a line in `PLACES` in `world.js`, and any new species in `models.js`.

### Pure logic (runs under `node --test`)

`facts.js`, `levels.js`, `score.js`, `collide.js` and the top half of `voice.js` import nothing from Three.js and touch no browser globals at import time. The tests import them directly, so keep them that way.

- `facts.js` — `FactTrainer` decides which fact comes next. Each fact sits in a box 0–5 (higher is better known). Weak facts are picked more often, about 30% of rounds are deliberately easy, a missed fact comes back 2–3 rounds later (never back to back, and with growing spacing if it keeps being missed), and the round right after a miss is an easy one. The game sets the blaster's number; the player never chooses it, except with the ridge's dial, where he picks a factor of the product the trainer chose.
- `facts.js` also holds how a fact reads for each blaster (`equation`, `equationParts`, `spokenOrder`, `mistake`). A round always has a `gun`, an `animal` (the answer) and a `product`; only the wording differs between × and ÷. Both blasters train the same facts in the same saved store, so a fact missed in division comes back in multiplication too.
- The end of `facts.js` covers the later levels: `productParts` and `productChoices` (the answer plus its nine closest rivals from the same two tables), `fits` (a dial number or first power cell that goes into the product with a partner of 2–10), and `explainMiss`, which turns any wrong answer into a true fact to show and say.
- `score.js` — points, the combo multiplier, waves, and `hunterTimeLimit`, which adapts the time limit to the player's own median answer time.

Progress is saved in localStorage under `STORAGE_KEY` (`config.js`), settings under `${STORAGE_KEY}.settings`.

### Time

Gameplay waits go through `after(seconds, fn)` in `main.js`, which counts game time, so pausing pauses them and slow motion stretches them. Do not use `setTimeout` for anything that affects play. The existing wall-clock timers are deliberate: the HUD's toast and banner, the short delay before the results screen in `endRun`, and the speech queue in `voice.js`.

### Shooting

A shot is one raycast from the screen centre against invisible hitbox meshes: `herd.hitboxes` (`userData.animal`), the boards' hitboxes (`userData.target`), `drone.hitboxes` (`userData.drone`, including its number tag on the ridge), the pilot (`userData.boss`, which only stops shots) and `world.solids`. Each animal has a body hitbox and a thin plate that tracks its number tag, so hitting the tag counts. Animals and board targets both have a `number`, so the shot logic treats them alike. In the hideout the animals in the pen are prisoners, not targets: their tags are hidden and their hitboxes left out.

A shot at an animal with the blaster that does not match the round's signal fizzles: no penalty, a cue to switch. `game.blasters` lists the kinds owned and `game.active` is the one in hand; `BLASTERS` in `models.js` gives each kind its colours.

The hunter drone is the time limit made visible. Its distance from the player is a function of the time left, not of where the player runs (`drone.js`).

### Touch screens

Phones and tablets (a coarse pointer with touch points, or `?touch`) get `body.touch` and on-screen controls from `touch.js` instead of pointer lock: a floating joystick on the left half sets `player.stick`, a drag on the right half looks, the fire button keeps aiming while held, and the blaster slots in `#weapons` are tappable. The game pauses when the page is hidden, since there is no pointer lock to lose. Touch devices default to Low graphics. Any text that names a control (like the "Scroll to switch" cue) needs a touch wording too; the start screen has two control lists, `.key-help` and `.touch-help`, and CSS shows one. Below 520px of height (a phone held sideways) the HUD shrinks and the start card splits into two columns so Start stays on screen.

### Models

- `textures.js` paints named surfaces (colour map + height map) on demand via `surface(name)`.
- `models.js` has the material helpers (`mat`, `skin`, `glow`), shape helpers (`ball`, `limb`, `slab`, …) and the animals, alien, drone and blaster. Materials are cached and shared, so do not mutate one that came from `mat` or `skin`.
- Everything that walks faces +z; the blaster points along −z.

Contracts that span files:

- An animal model's parts must be direct children of its group. `Effects.reveal` (the unmasking) flings each child apart individually, skipping only the tag and the hitboxes.
- `Herd.update` overwrites an animal group's `scale` every frame (the hint wobble), so an animal cannot be resized by scaling its group.
- `Effects.reveal(animal, …)` expects the animal to have been removed with `herd.detach()` first, and takes over its model. `REVEAL_GLITCH` and `REVEAL_EXPOSED` set the timing that `destroyImpostor` in `main.js` schedules sounds and the next round around.
- The beam starts at the muzzle point hard-coded in `BlasterView.muzzleOnScreen` (`blaster.js`); it must match the barrel in `buildBlaster`.

### World

`world.js` builds what every level shares (sky, light, ground, grass, trees, hills, the ship) and returns `{ colliders, solids, gunSpot, ufo, update, setQuality, site }`, where `site` is whatever else the place's `build` returned (the hideout's `gates`, the landing's `cells` and `pilot`). A place with `land: false` (the mothership's deck) skips the ground, grass, trees and hills and brings its own floor; `sky.below` then colours the sky under the horizon. It asks the level's place for everything else. A place (`src/places/farm.js`, `forest.js`, `ridge.js`, `hideout.js`, `deck.js`, `landing.js`) exports one object: sky colours, fog, light strengths, which surface lies over the grass (`floor`), where (`bare`) and where grass cannot grow (`barren`), where trees may not stand, grass and flower colours, and a `build(ctx)` that adds its own scenery and returns `{ gunSpot, update?, setQuality? }`.

Movement collision is 2D (boxes and circles in `colliders`); the ground is flat everywhere the player can reach, and `heightAt` only rises beyond `HILLS_START`.

One mask texture describes the ground: its green channel is how much of the place's floor surface shows over the grass (the alpha of that layer) and its red channel is how hard it is for grass to grow (read by the grass shader). Both come from the place's `bare` and `barren` functions.

Trees are a handful of shapes drawn as instanced meshes, so a forest costs a few draw calls. The instanced meshes are in `solids`, so trunks and crowns stop shots. Spruce branches start above head height on purpose: the player walks under them.

The meadow (`grass.js`) is a single dense patch of instanced tufts that follows the player: the vertex shader wraps each tuft to its copy nearest the camera and fades the patch out at its edge. It is not a field of placed objects.

### Rendering

`graphics.js` owns the renderer and has two quality levels, saved in settings:

- **high** — an effect composer: world pass, then the held blaster as a second pass that clears depth (so it never clips into walls), then a pass that blacks out broken pixels (not-a-number or absurdly bright, which the bloom would otherwise smear over the whole screen), then bloom, then tone mapping.
- **low** — the same two passes drawn directly, no bloom, pixel ratio 1; `world.setQuality` also thins the grass and shrinks the shadow map.

Bloom picks up anything brighter than about 0.9 in linear light. To make something glow, use `glow(color, boost)` with a boost above 1. The number tags are tinted just short of white (`WHITE` in `animals.js`) so they stay crisp instead of blooming; keep them readable, since reading them is the game.

The held blasters live in their own scene with their own camera and lights (`BlasterView`): one model per kind, only the one in hand visible.

### HUD

`hud.js` is plain DOM over the canvas; the elements are in `index.html` and styled in `src/style.css`. Keep score and other numbers away from the fact on screen: `7 × 6 = 42 +190` was read as part of the sum, which is why points appear under the score panel.
