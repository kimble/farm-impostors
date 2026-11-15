// The ridge: a bare, windswept hilltop at midnight with an old radio mast, a ruined
// stone shelter and a cairn. Nothing lives up here; the swarm (swarm.js) circles
// overhead. world.js supplies the land, sky, trees and grass around it.

import * as THREE from 'three';
import { LEVELS } from '../levels.js';
import { limb, slab, mat, skin, glow } from '../models.js';
import { fbm } from '../textures.js';
import { softDisc, placeRocks } from './shapes.js';

const TOP = LEVELS.ridge.roam;
const CENTRE = { x: (TOP.minX + TOP.maxX) / 2, z: (TOP.minZ + TOP.maxZ) / 2 };
const MAST = { x: 17, z: -4 };
const SHELTER = { x: -16, z: 2 };
const CAIRN = { x: -3, z: -27 };

// The hilltop is stony: gravel shows through the grass in patches, more toward the top.
const top = (x, z) => softDisc(x, z, CENTRE.x, CENTRE.z, 30, 8, 14);
function stony(x, z) {
  const patches = fbm(x / 24 + 0.3, z / 24 + 0.8, 4, 4, 3);
  return Math.min(1, Math.max(0, (patches - 0.48) * 4) * (0.4 + top(x, z) * 0.6));
}

export const ridge = {
  // Clear midnight: deep blue, a hint of violet low in the west, strong northern lights.
  sky: {
    zenith: new THREE.Color(0x030818),
    horizon: new THREE.Color(0x1c2a4a),
    ember: new THREE.Color(0x5a3c86),
    emberStrength: 0.35,
    aurora: 0.32,
    clouds: 9,
    cloudNight: new THREE.Color(0x2a3352),
    cloudEmber: new THREE.Color(0x3e3560),
  },
  fog: { near: 50, far: 280 },
  light: { hemisphere: [0x7a90d0, 0x2c3440, 1.2], moon: 2.3, afterglow: [0x9a7aff, 0.15] },
  floor: 'gravel',
  bare: stony,
  barren: (x, z) => Math.max(stony(x, z), top(x, z) * 0.35),
  trees: {
    count: 120,
    spread: 250,
    spruce: 0.8,
    // Only a few wind-bent trees make it up the slope.
    clear: (x, z) => Math.hypot(x - CENTRE.x, z - CENTRE.z) < 38,
  },
  grass: [0x4a6234, 0x56703a, 0x5f7640, 0x4c6436, 0x6a7a48],
  flowers: { count: 500, colours: [0xf4f1e6, 0xc8a8f0, 0xa8c8ff] },
  farForest: 0.3,

  build(ctx) {
    const { scene, colliders, solids, rand, addGroup } = ctx;
    const stone = skin('rock', { repeat: 2, roughness: 0.95, bump: 4 });

    // ---------- Radio mast ----------

    // A steel lattice tower: four legs leaning in, braced every few metres.
    const mast = new THREE.Group();
    const steel = mat(0x6a7280, { roughness: 0.5, metalness: 0.8 });
    const HEIGHT = 22;
    const legs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const halfAt = (y) => 1.6 - (y / HEIGHT) * 1.2;
    for (const [sx, sz] of legs) {
      const leg = limb(0.07, 0.09, HEIGHT, steel, 0, HEIGHT / 2, 0, 6);
      const lean = Math.atan((halfAt(0) - halfAt(HEIGHT)) / HEIGHT);
      leg.position.set(sx * (halfAt(0) + halfAt(HEIGHT)) / 2, HEIGHT / 2, sz * (halfAt(0) + halfAt(HEIGHT)) / 2);
      leg.rotation.set(-sz * lean, 0, sx * lean);
      mast.add(leg);
    }
    for (let y = 2; y < HEIGHT; y += 2.5) {
      const half = halfAt(y);
      for (const [dx, dz, long] of [[0, half, true], [0, -half, true], [half, 0, false], [-half, 0, false]]) {
        const bar = limb(0.035, 0.035, half * 2, steel, dx, y, dz, 5);
        bar.rotation.set(long ? 0 : Math.PI / 2, 0, long ? Math.PI / 2 : 0);
        mast.add(bar);
      }
    }
    mast.add(limb(0.05, 0.05, 4, steel, 0, HEIGHT + 2, 0, 6));
    const beacon = glow(0xff3020, 3);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), beacon);
    lamp.position.y = HEIGHT + 4.1;
    mast.add(lamp);
    mast.position.set(MAST.x, 0, MAST.z);
    addGroup(mast);
    colliders.circles.push({ x: MAST.x, z: MAST.z, r: 2 });
    // The legs are thin: only a block at the foot stops shots, so the mast never hides a drone.
    const plinth = slab(4, 0.5, 4, mat(0x5c5a56, { roughness: 1 }), MAST.x, 0.25, MAST.z);
    scene.add(plinth);
    solids.push(plinth);
    // Guy wires out to anchors in the ground.
    const wire = new THREE.LineBasicMaterial({ color: 0x8890a0, transparent: true, opacity: 0.6 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(MAST.x, HEIGHT * 0.8, MAST.z),
        new THREE.Vector3(MAST.x + Math.cos(a) * 12, 0.1, MAST.z + Math.sin(a) * 12),
      ]);
      scene.add(new THREE.Line(geometry, wire));
    }
    const beaconLight = new THREE.PointLight(0xff3020, 0, 30, 1.6);
    beaconLight.position.set(MAST.x, HEIGHT + 4, MAST.z);
    scene.add(beaconLight);

    // ---------- Ruined stone shelter ----------

    // Dry-stone walls, roofless, one corner fallen in. The door faces the hilltop.
    const wall = (w, h, d, x, z) => {
      const mesh = slab(w, h, d, stone, SHELTER.x + x, h / 2, SHELTER.z + z, 1.5);
      scene.add(mesh);
      solids.push(mesh);
      colliders.boxes.push({
        minX: SHELTER.x + x - w / 2,
        maxX: SHELTER.x + x + w / 2,
        minZ: SHELTER.z + z - d / 2,
        maxZ: SHELTER.z + z + d / 2,
      });
    };
    wall(7, 2.4, 0.7, 0, -3); // back
    wall(0.7, 2.0, 6, -3.5, 0); // left side
    wall(0.7, 1.1, 3.4, 3.5, -1.3); // right side, half fallen
    wall(2.2, 1.8, 0.7, -2.4, 3); // front, either side of the door
    wall(1.4, 0.9, 0.7, 2.8, 3);
    placeRocks(
      ctx,
      [
        { x: SHELTER.x + 4.4, z: SHELTER.z + 1.5, size: 0.6 },
        { x: SHELTER.x + 5, z: SHELTER.z + 0.2, size: 0.45 },
        { x: SHELTER.x + 3.2, z: SHELTER.z + 2.4, size: 0.5 },
      ],
      stone,
    );

    // ---------- Cairn ----------

    const cairnSpots = [];
    for (let i = 0; i < 7; i++) {
      const size = 0.9 - i * 0.1;
      cairnSpots.push({ x: CAIRN.x + (rand() - 0.5) * 0.3, z: CAIRN.z + (rand() - 0.5) * 0.3, y: i * 0.42, size, stretch: [1, 0.7, 1], turn: rand() * 6 });
    }
    placeRocks(ctx, cairnSpots, stone, { collide: false });
    colliders.circles.push({ x: CAIRN.x, z: CAIRN.z, r: 1 });

    // ---------- Outcrops and boulders ----------

    const spots = [];
    // A few long outcrops breaking through on the slopes around the top (none right
    // where the player arrives, where one would fill the view).
    const SPAWN = LEVELS.ridge.spawn;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rand() * 0.5;
      const r = 30 + rand() * 12;
      const x = CENTRE.x + Math.cos(a) * r;
      const z = CENTRE.z + Math.sin(a) * r;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 16) continue;
      spots.push({
        x,
        z,
        size: 2.2 + rand() * 1.8,
        stretch: [1.6, 0.8 + rand() * 0.6, 1],
        turn: rand() * 6,
      });
    }
    // Scattered stones on the top itself, small enough to see the swarm past.
    while (spots.length < 60) {
      const x = (rand() - 0.5) * 150;
      const z = (rand() - 0.5) * 150;
      const near = Math.hypot(x - CENTRE.x, z - CENTRE.z);
      const blocked = Math.hypot(x - MAST.x, z - MAST.z) < 6 || Math.hypot(x - SHELTER.x, z - SHELTER.z) < 7;
      if (near < 10 || blocked || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 5) continue;
      spots.push({ x, z, size: near < 36 ? 0.35 + rand() * 0.5 : 0.6 + rand() ** 2 * 2, turn: rand() * 6 });
    }
    placeRocks(ctx, spots, stone);

    function update(dt, time) {
      // The beacon blinks once every two seconds.
      const on = time % 2 < 0.25;
      lamp.visible = on;
      beaconLight.intensity = on ? 22 : 0;
    }

    return { gunSpot: new THREE.Vector3(CENTRE.x, 1, CENTRE.z), update };
  },
};
