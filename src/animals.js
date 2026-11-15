// The herd: numbered animals wandering around their pasture or clearing.
// From the outside an impostor is identical to a real animal. Only the game logic
// in main.js knows which number is the impostor for the current signal.

import * as THREE from 'three';
import { buildAnimal, numberTexture, SIGN_ASPECT } from './models.js';

const MARGIN = 2.5;
const DROP_HEIGHT = 16;
const DROP_SECONDS = 1.3;

const HITBOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const HITBOX_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });

const WHITE = new THREE.Color(0xececec); // just short of white, so the tags do not bloom
const ANGRY = new THREE.Color(0xff5a4a);
const GLITCH = new THREE.Color(0x6dff5a);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class Herd {
  // species: which animal wears each of the ten numbers (in shuffled order).
  // bounds: the rectangle they stay inside.
  constructor(scene, { species, bounds, rng = Math.random }) {
    this.scene = scene;
    this.species = species;
    this.bounds = bounds;
    this.rng = rng;
    this.animals = [];
    this.hitboxes = [];
    this.pace = 1; // walking speed multiplier, raised each wave
  }

  randomSpot() {
    return {
      x: this.bounds.minX + MARGIN + this.rng() * (this.bounds.maxX - this.bounds.minX - MARGIN * 2),
      z: this.bounds.minZ + MARGIN + this.rng() * (this.bounds.maxZ - this.bounds.minZ - MARGIN * 2),
    };
  }

  // One animal for each number 1-10.
  populate() {
    const species = shuffle(this.species, this.rng);
    species.forEach((kind, i) => this.spawn(i + 1, kind));
  }

  // drop: the animal is lowered from the sky (a rescued animal being returned).
  spawn(number, species, { at = null, drop = false } = {}) {
    const model = buildAnimal(species);
    const spot = at || this.randomSpot();
    model.group.position.set(spot.x, drop ? DROP_HEIGHT : 0, spot.z);

    const sign = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: numberTexture(number), fog: false, transparent: true }),
    );
    model.group.add(sign);

    const body = new THREE.Mesh(HITBOX_GEOMETRY, HITBOX_MATERIAL);
    body.scale.set(model.width + 0.35, model.height + 0.2, model.length + 0.3);
    body.position.y = (model.height + 0.2) / 2;
    const signBox = new THREE.Mesh(HITBOX_GEOMETRY, HITBOX_MATERIAL);
    model.group.add(body, signBox);

    const animal = {
      number,
      species,
      group: model.group,
      legs: model.legs,
      height: model.height,
      speed: model.speed,
      colors: model.colors,
      sign,
      hitboxes: [body, signBox],
      state: drop ? 'drop' : 'idle',
      timer: drop ? 0 : this.rng() * 3,
      target: { x: spot.x, z: spot.z },
      heading: this.rng() * Math.PI * 2,
      phase: this.rng() * 6,
      vy: 0,
      angry: 0,
      hint: false,
    };
    body.userData.animal = animal;
    signBox.userData.animal = animal;
    model.group.rotation.y = animal.heading;

    this.scene.add(model.group);
    this.animals.push(animal);
    this.hitboxes.push(body, signBox);
    return animal;
  }

  // Takes an animal out of the herd but leaves its model in the scene, for whoever
  // asked (the unmasking effect) to animate and remove.
  detach(animal) {
    this.animals = this.animals.filter((a) => a !== animal);
    this.hitboxes = this.hitboxes.filter((h) => !animal.hitboxes.includes(h));
    animal.hint = false;
  }

  remove(animal) {
    this.detach(animal);
    this.scene.remove(animal.group);
    animal.sign.material.dispose();
  }

  find(number) {
    return this.animals.find((a) => a.number === number) || null;
  }

  // Gives the animals new numbers: numbers[i] goes on the i-th animal. (On the
  // mothership the scanner rewrites every tag with each signal.)
  relabel(numbers) {
    this.animals.forEach((a, i) => {
      if (i >= numbers.length) return;
      a.number = numbers[i];
      a.sign.material.map = numberTexture(a.number);
      a.sign.material.needsUpdate = true;
      a.hint = false;
    });
  }

  clearHints() {
    for (const a of this.animals) a.hint = false;
  }

  // A real animal that was zapped by mistake: it jumps and bolts away from the player.
  startle(animal, from) {
    const p = animal.group.position;
    const dx = p.x - from.x;
    const dz = p.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    animal.target = {
      x: clamp(p.x + (dx / d) * 9, this.bounds.minX + MARGIN, this.bounds.maxX - MARGIN),
      z: clamp(p.z + (dz / d) * 9, this.bounds.minZ + MARGIN, this.bounds.maxZ - MARGIN),
    };
    animal.state = 'flee';
    animal.timer = 1.4;
    animal.vy = 6;
    animal.angry = 1.6;
  }

  update(dt, cameraPos, time) {
    for (const a of this.animals) {
      const p = a.group.position;
      let moving = false;

      if (a.state === 'drop') {
        a.timer += dt;
        const k = Math.min(a.timer / DROP_SECONDS, 1);
        p.y = DROP_HEIGHT * (1 - k) * (1 - k);
        if (k >= 1) {
          p.y = 0;
          a.state = 'idle';
          a.timer = 0.5 + this.rng() * 1.5;
        }
      } else {
        if (a.vy !== 0 || p.y > 0) {
          a.vy -= 22 * dt;
          p.y += a.vy * dt;
          if (p.y <= 0) {
            p.y = 0;
            a.vy = 0;
          }
        }
        if (a.state === 'idle') {
          a.timer -= dt;
          if (a.timer <= 0) {
            a.target = this.randomSpot();
            a.state = 'walk';
          }
        } else {
          const fleeing = a.state === 'flee';
          const dx = a.target.x - p.x;
          const dz = a.target.z - p.z;
          const dist = Math.hypot(dx, dz);
          if (fleeing) a.timer -= dt;
          if (dist < 0.3 || (fleeing && a.timer <= 0)) {
            a.state = 'idle';
            a.timer = 1 + this.rng() * 4;
          } else {
            const speed = a.speed * (fleeing ? 4.5 : this.pace);
            const step = Math.min(dist, speed * dt);
            p.x += (dx / dist) * step;
            p.z += (dz / dist) * step;
            const want = Math.atan2(dx, dz);
            let turn = want - a.heading;
            turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            a.heading += turn * Math.min(1, dt * (fleeing ? 12 : 4));
            a.phase += dt * speed * 5;
            moving = true;
          }
        }
      }

      a.group.rotation.y = a.heading;
      const swing = moving ? Math.sin(a.phase) * 0.55 : 0;
      a.legs.forEach((leg, i) => {
        const dir = i === 0 || i === 3 ? 1 : -1;
        leg.rotation.x += (swing * dir - leg.rotation.x) * Math.min(1, dt * 12);
      });

      // The number stays readable from far away by growing with distance.
      const distance = cameraPos.distanceTo(p);
      const size = clamp(distance * 0.05, 0.85, 3.4);
      const signY = a.height + 0.3 + size / 2;
      a.sign.scale.set(size * SIGN_ASPECT, size, 1);
      a.sign.position.set(0, signY, 0);
      // The sign's hit area is a thin plate turned to face the camera, so it covers
      // exactly what the player sees and never reaches past the sign's edges.
      const signBox = a.hitboxes[1];
      signBox.scale.set(size * SIGN_ASPECT, size, 0.1);
      signBox.position.set(0, signY, 0);
      signBox.rotation.y = Math.atan2(cameraPos.x - p.x, cameraPos.z - p.z) - a.heading;

      if (a.angry > 0) a.angry -= dt;
      const tint = a.sign.material.color;
      if (a.angry > 0) tint.copy(ANGRY);
      else if (a.hint && Math.sin(time * 26) > 0) tint.copy(GLITCH);
      else tint.copy(WHITE);
      const wobble = a.hint ? 1 + Math.sin(time * 40) * 0.05 : 1;
      a.group.scale.set(wobble, 1 / wobble, wobble);
    }

    // Keep animals from standing inside each other.
    for (let i = 0; i < this.animals.length; i++) {
      for (let j = i + 1; j < this.animals.length; j++) {
        const p = this.animals[i].group.position;
        const q = this.animals[j].group.position;
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.001 && d < 1.8) {
          const push = ((1.8 - d) / 2) * Math.min(1, dt * 6);
          p.x -= (dx / d) * push;
          p.z -= (dz / d) * push;
          q.x += (dx / d) * push;
          q.z += (dz / d) * push;
        }
      }
    }
  }
}
