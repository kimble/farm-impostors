// The hideout: a canyon the aliens have sealed with four gates, and the pen behind the
// last one where they keep the animals. Each gate is two pylons, a lintel with five lock
// lights and a force field; the game hangs the numbers in front of it (board.js) and
// tells the gate when a lock is opened.
//
// world.js supplies the land, sky, trees and grass around the canyon.

import * as THREE from 'three';
import { LEVELS } from '../levels.js';
import { slab, rounded, limb, skin, glow } from '../models.js';
import { fbm } from '../textures.js';
import { placeRocks } from './shapes.js';

const { spawn: SPAWN, roam: PEN } = LEVELS.hideout;
const HALF = 9; // half the width of the canyon floor
const MOUTH = 54; // where the canyon opens onto the land
const BACK = -100; // the rock wall at its end
export const GATES = [24, -2, -28, -54]; // z of each gate, in the order they are reached
const LOCKS = 5;
const FIELD_HEIGHT = 7.2;
const LOCKED = new THREE.Color(0xff3b2f);
const OPEN = new THREE.Color(0x7dff7a);

const inCanyon = (x, z) => Math.abs(x) < HALF + 4 && z < MOUTH + 2;

export const hideout = {
  // A dark, cold night with a little green in the north.
  sky: {
    zenith: new THREE.Color(0x02060e),
    horizon: new THREE.Color(0x10202c),
    ember: new THREE.Color(0x000000),
    emberStrength: 0,
    aurora: 0.12,
    clouds: 10,
    cloudNight: new THREE.Color(0x222a3c),
    cloudEmber: new THREE.Color(0x222a3c),
  },
  fog: { near: 30, far: 220 },
  light: { hemisphere: [0x6884b8, 0x2a2c30, 1.1], moon: 2.1, afterglow: [0x5ef2ff, 0.12] },
  floor: 'gravel',
  // Gravel all along the canyon floor; grass only outside it.
  bare: (x, z) => (inCanyon(x, z) ? 1 : 0.15 * fbm(x / 30, z / 30, 4, 4, 3)),
  barren: (x, z) => (inCanyon(x, z) ? 1 : 0),
  trees: {
    count: 260,
    spread: 250,
    spruce: 0.75,
    clear: (x, z) => Math.abs(x) < HALF + 16 && z < MOUTH + 10,
  },
  grass: [0x3c5c26, 0x4a6c2c, 0x567a32, 0x426228, 0x5f7a3a],
  flowers: { count: 400, colours: [0xf4f1e6, 0xa8c8ff] },
  farForest: 0.25,

  build(ctx) {
    const { scene, colliders, solids, rand } = ctx;
    const stone = skin('rock', { repeat: 2, roughness: 0.95, bump: 4 });
    const hull = skin('hull', { repeat: 1, roughness: 0.4, metalness: 0.75, bump: 2 });

    // ---------- Canyon walls ----------

    // Huge boulders stacked into cliffs on both sides, a second row behind and above the
    // first, so the walls read as solid rock from the floor.
    const rocks = [];
    for (const side of [-1, 1]) {
      for (let z = MOUTH; z > BACK - 6; z -= 4 + rand() * 2) {
        const size = 4.5 + rand() * 2.5;
        rocks.push({ x: side * (HALF + size * 0.95), z, size, stretch: [1, 2.3 + rand() * 0.8, 1.2], turn: rand() * 6 });
        const high = 5 + rand() * 3;
        rocks.push({ x: side * (HALF + 7 + high), z: z + 2, y: 4, size: high, stretch: [1.2, 2.2, 1.3], turn: rand() * 6 });
      }
    }
    // The end of the canyon, closed off behind the pen.
    for (let x = -HALF - 4; x <= HALF + 4; x += 5) {
      rocks.push({ x, z: BACK - 6, size: 6 + rand() * 2, stretch: [1.1, 2.4, 1], turn: rand() * 6 });
    }
    // Rubble along the foot of the walls.
    for (let z = MOUTH; z > BACK; z -= 3 + rand() * 4) {
      const side = rand() < 0.5 ? -1 : 1;
      rocks.push({ x: side * (HALF - 0.6 - rand() * 0.8), z, size: 0.4 + rand() * 0.6, turn: rand() * 6 });
    }
    placeRocks(ctx, rocks, stone);
    // The real limits, in case a gap opens between two boulders.
    for (const side of [-1, 1]) {
      colliders.boxes.push({
        minX: side > 0 ? HALF + 0.5 : -HALF - 40,
        maxX: side > 0 ? HALF + 40 : -HALF - 0.5,
        minZ: BACK - 40,
        maxZ: MOUTH,
      });
    }
    colliders.boxes.push({ minX: -HALF - 1, maxX: HALF + 1, minZ: BACK - 40, maxZ: BACK });

    // ---------- Alien fittings ----------

    // Glowing conduits run along both walls, from gate to gate, at knee height.
    const conduit = glow(0x5ef2ff, 1.6);
    for (const side of [-1, 1]) {
      const pipe = limb(0.08, 0.08, MOUTH - BACK - 10, conduit, side * (HALF - 0.2), 0.7, (MOUTH + BACK) / 2 - 2, 6);
      pipe.rotation.x = Math.PI / 2;
      scene.add(pipe);
    }
    // Supply crates stacked near the gates.
    for (const gz of GATES) {
      for (let i = 0; i < 3; i++) {
        const side = (i % 2 ? 1 : -1) * (rand() < 0.5 ? 1 : -1);
        const w = 1 + rand() * 0.5;
        const x = side * (HALF - 1.6 - rand());
        const z = gz + 5 + rand() * 6;
        const crate = rounded(w, w, w, hull, x, w / 2, z, 0.05);
        crate.rotation.y = rand();
        scene.add(crate);
        solids.push(crate);
        colliders.circles.push({ x, z, r: w * 0.7 });
      }
    }

    // ---------- Gates ----------

    const gates = GATES.map((gz, index) => {
      const pylonMaterial = hull;
      for (const side of [-1, 1]) {
        const pylon = rounded(1.4, FIELD_HEIGHT + 1.4, 1.6, pylonMaterial, side * (HALF - 1), (FIELD_HEIGHT + 1.4) / 2, gz, 0.1);
        scene.add(pylon);
        solids.push(pylon);
      }
      const lintel = rounded(HALF * 2, 1, 1.4, pylonMaterial, 0, FIELD_HEIGHT + 0.9, gz, 0.1);
      scene.add(lintel);
      solids.push(lintel);

      // The force field: a sheet of light between the pylons.
      const fieldMaterial = new THREE.MeshBasicMaterial({
        color: LOCKED.clone().multiplyScalar(0.5),
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const field = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 - 3.4, FIELD_HEIGHT, 1, 12), fieldMaterial);
      field.position.set(0, FIELD_HEIGHT / 2, gz);
      scene.add(field);
      solids.push(field);
      const wall = { minX: -HALF, maxX: HALF, minZ: gz - 0.5, maxZ: gz + 0.5 };
      colliders.boxes.push(wall);

      // Five lock lights along the front of the lintel.
      const lights = [];
      for (let i = 0; i < LOCKS; i++) {
        const material = new THREE.MeshBasicMaterial({ color: LOCKED.clone().multiplyScalar(2.2) });
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), material);
        light.position.set((i - (LOCKS - 1) / 2) * 2.2, FIELD_HEIGHT + 0.9, gz + 0.75);
        scene.add(light);
        lights.push(light);
      }
      const lamp = new THREE.PointLight(0xff5040, 10, 22, 1.5);
      lamp.position.set(0, FIELD_HEIGHT - 1, gz + 3);
      scene.add(lamp);

      // Where the game hangs the ten numbers: two rows of five in front of the field.
      const spots = [];
      for (const y of [4.7, 2.5]) {
        for (let i = 0; i < 5; i++) spots.push(new THREE.Vector3((i - 2) * 3, y, gz + 0.8));
      }

      let opening = -1; // seconds since it started to open, or -1 while shut
      return {
        index,
        z: gz,
        spots,
        get open() {
          return opening >= 0;
        },
        // How many of the five locks are open.
        setLocks(count) {
          lights.forEach((light, i) => light.material.color.copy(i < count ? OPEN : LOCKED).multiplyScalar(2.2));
        },
        // Closed again, every lock shut (for a new run).
        lock() {
          this.setLocks(0);
          if (opening < 0) return;
          opening = -1;
          colliders.boxes.push(wall);
          solids.push(field);
          field.visible = true;
          lamp.color.set(0xff5040);
        },
        // Drops the field and lets the player through.
        unlock() {
          if (opening >= 0) return;
          opening = 0;
          colliders.boxes.splice(colliders.boxes.indexOf(wall), 1);
          solids.splice(solids.indexOf(field), 1);
          lamp.color.copy(OPEN);
        },
        update(dt, time) {
          if (opening < 0) {
            fieldMaterial.opacity = 0.3 + 0.08 * Math.sin(time * 5 + index);
            return;
          }
          opening += dt;
          // Flickers, then dies.
          fieldMaterial.opacity = opening < 0.6 ? 0.5 * (Math.sin(opening * 70) > 0 ? 1 : 0.1) : Math.max(0, 0.3 - (opening - 0.6));
          field.visible = fieldMaterial.opacity > 0.01;
        },
      };
    });

    // ---------- The pen ----------

    // The far wall of the pen is alien: plating with a glowing seal.
    const back = slab(HALF * 2 + 2, 10, 1.2, hull, 0, 5, BACK + 0.6, 2);
    scene.add(back);
    solids.push(back);
    const seal = new THREE.Mesh(new THREE.CircleGeometry(2.4, 40), glow(0x5ef2ff, 1.4));
    seal.position.set(0, 5, BACK + 1.25);
    scene.add(seal);
    const penLight = new THREE.PointLight(0x9ff6ff, 16, 34, 1.4);
    penLight.position.set(0, 6, (PEN.minZ + PEN.maxZ) / 2);
    scene.add(penLight);

    function update(dt, time) {
      for (const gate of gates) gate.update(dt, time);
    }

    return { gunSpot: new THREE.Vector3(SPAWN.x, 1, SPAWN.z), update, gates };
  },
};
