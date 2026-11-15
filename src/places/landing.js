// The landing: dawn in the fields where the mothership came down. Its wreck lies
// smoking at the end of a scorched trench, its pilot (boss.js) stands in front of it,
// and nine power cells ring the burnt ground between the pilot and the player.
// world.js supplies the land, sky, trees and grass around it.

import * as THREE from 'three';
import { LEVELS } from '../levels.js';
import { limb, mat, skin, glow } from '../models.js';
import { cloudTexture, glowTexture } from '../textures.js';
import { softDisc, softBox, placeRocks } from './shapes.js';

const RING = LEVELS.landing.roam;
export const ARENA = { x: (RING.minX + RING.maxX) / 2, z: (RING.minZ + RING.maxZ) / 2 };
export const CELL_RING = 12;
export const CELLS = 9;
const PILOT = { x: 0, z: -47 };
const WRECK = { x: 10, z: -118 };

// Burnt earth around the arena and the pilot, and the trench the ship dug coming in.
function scorched(x, z) {
  return Math.max(
    softDisc(x, z, ARENA.x, ARENA.z - 8, 28, 5, 10),
    softBox(x, z, WRECK.x * 0.5, (PILOT.z + WRECK.z) / 2, 12, 34, 4, 8),
  );
}

export const landing = {
  // Dawn: pale blue overhead, the sky glowing orange and pink low down.
  sky: {
    zenith: new THREE.Color(0x14204a),
    horizon: new THREE.Color(0x8a6a8a),
    ember: new THREE.Color(0xff9a50),
    emberStrength: 1.2,
    aurora: 0,
    clouds: 18,
    cloudNight: new THREE.Color(0x5a5a80),
    cloudEmber: new THREE.Color(0xe08a78),
  },
  fog: { near: 60, far: 300 },
  light: { hemisphere: [0xa8b4e8, 0x4a4840, 1.5], moon: 2.0, afterglow: [0xffa070, 0.7] },
  floor: 'scorched',
  bare: scorched,
  barren: (x, z) => Math.min(1, scorched(x, z) * 1.3),
  trees: {
    count: 110,
    spread: 260,
    spruce: 0.35,
    clear: (x, z) =>
      Math.hypot(x - ARENA.x, z - ARENA.z) < 46 || Math.hypot(x - WRECK.x, z - WRECK.z) < 70 || Math.abs(x) < 8,
  },
  grass: [0x486a2a, 0x567a30, 0x638836, 0x4e702c, 0x6f8a40],
  flowers: { count: 1600, colours: [0xf4f1e6, 0xf2d24a, 0xe58fb4, 0xf4f1e6] },
  farForest: 0.36,

  build(ctx) {
    const { scene, colliders, solids, rand, addGroup } = ctx;
    const hull = skin('hull', { repeat: 6, roughness: 0.4, metalness: 0.8, bump: 2 });
    const dark = mat(0x22283a, { roughness: 0.35, metalness: 0.85 });
    const stone = skin('rock', { repeat: 2, roughness: 0.95, bump: 4 });

    // ---------- The wreck ----------

    const wreck = new THREE.Group();
    const profile = [
      [0, -7], [18, -7], [34, -4.5], [46, -1.5], [48, 0], [46, 1.5], [30, 4.5], [18, 6.5], [14, 7],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const shell = new THREE.Mesh(new THREE.LatheGeometry(profile, 72), hull);
    shell.castShadow = shell.receiveShadow = true;
    wreck.add(shell);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(47.2, 0.25, 8, 120), glow(0x7dff5a, 1.6));
    seam.rotation.x = Math.PI / 2;
    wreck.add(seam);
    const brokenDome = new THREE.Mesh(
      new THREE.SphereGeometry(13, 32, 12, 0, Math.PI * 1.4, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x182028, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }),
    );
    brokenDome.position.y = 6.5;
    wreck.add(brokenDome);
    // It hit nose-first and lies tilted, half buried.
    wreck.position.set(WRECK.x, 2, WRECK.z);
    wreck.rotation.set(0.12, 0.4, 0.2);
    addGroup(wreck, { solid: true });
    colliders.circles.push({ x: WRECK.x, z: WRECK.z, r: 46 });

    // Earth thrown up where it dug in.
    const heaps = [];
    for (let i = 0; i < 26; i++) {
      const a = Math.PI * (0.15 + rand() * 0.7);
      const r = 44 + rand() * 8;
      heaps.push({ x: WRECK.x + Math.cos(a) * r, z: WRECK.z + Math.sin(a) * r, size: 2 + rand() * 3, stretch: [1.4, 0.7, 1], turn: rand() * 6 });
    }
    placeRocks(ctx, heaps, stone);

    // ---------- Fires and smoke ----------

    const flameMap = glowTexture('rgba(255, 220, 140, 1)', 'rgba(255, 90, 30, 0.5)');
    const fires = [];
    for (const [x, z] of [[-14, -82], [22, -76], [-4, -96], [30, -98], [-24, -104], [14, -66]]) {
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameMap, blending: THREE.AdditiveBlending, depthWrite: false }));
      flame.position.set(x, 1.4, z);
      scene.add(flame);
      fires.push(flame);
    }
    const fireLight = new THREE.PointLight(0xff8a3a, 30, 60, 1.4);
    fireLight.position.set(6, 4, -84);
    scene.add(fireLight);
    const smokeMaps = [cloudTexture(41), cloudTexture(42)];
    const smoke = [];
    for (let i = 0; i < 18; i++) {
      const puff = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: smokeMaps[i % 2], color: 0x2a2626, transparent: true, depthWrite: false }),
      );
      puff.userData.phase = i / 18;
      puff.userData.from = [WRECK.x - 20 + rand() * 40, WRECK.z + 10 + rand() * 30];
      scene.add(puff);
      smoke.push(puff);
    }

    // ---------- Power cells ----------

    // Nine pylons in a ring around the arena, each holding a crystal of the ship's power.
    // The game hangs a number over each crystal.
    const crystalMaterial = new THREE.MeshStandardMaterial({
      color: 0x7dff5a,
      emissive: 0x58f03a,
      emissiveIntensity: 1.6,
      roughness: 0.2,
      metalness: 0.1,
    });
    const crystalGeometry = new THREE.OctahedronGeometry(0.55, 0);
    const crystals = [];
    const cells = [];
    for (let i = 0; i < CELLS; i++) {
      // Turned so that no cell stands between the player's way in and the pilot.
      const a = (i / CELLS) * Math.PI * 2 + Math.PI / 2 + Math.PI / CELLS;
      const x = ARENA.x + Math.cos(a) * CELL_RING;
      const z = ARENA.z + Math.sin(a) * CELL_RING;
      const pylon = new THREE.Group();
      pylon.add(limb(0.45, 0.7, 1.6, dark, 0, 0.8, 0, 12));
      for (let k = 0; k < 3; k++) {
        const claw = limb(0.06, 0.1, 1.1, dark, 0, 0, 0, 6);
        const around = (k / 3) * Math.PI * 2;
        claw.position.set(Math.cos(around) * 0.42, 1.9, Math.sin(around) * 0.42);
        claw.rotation.set(Math.sin(around) * 0.35, 0, -Math.cos(around) * 0.35);
        pylon.add(claw);
      }
      pylon.position.set(x, 0, z);
      addGroup(pylon, { solid: true });
      const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
      crystal.position.set(x, 2.3, z);
      crystal.scale.y = 1.6;
      scene.add(crystal);
      solids.push(crystal);
      crystals.push(crystal);
      colliders.circles.push({ x, z, r: 0.8 });
      cells.push(new THREE.Vector3(x, 4.1, z));
    }
    const arenaLight = new THREE.PointLight(0x7dff5a, 14, 40, 1.4);
    arenaLight.position.set(ARENA.x, 6, ARENA.z);
    scene.add(arenaLight);
    colliders.circles.push({ x: PILOT.x, z: PILOT.z, r: 6 });

    function update(dt, time) {
      for (const [i, crystal] of crystals.entries()) {
        crystal.rotation.y = time * 0.8 + i;
        crystal.position.y = 2.3 + Math.sin(time * 1.7 + i) * 0.1;
      }
      fires.forEach((flame, i) => {
        const lick = 0.8 + 0.3 * Math.sin(time * (9 + i * 2) + i);
        flame.scale.set(2.6 * lick, 3.4 * lick, 1);
      });
      fireLight.intensity = 26 + Math.sin(time * 11) * Math.sin(time * 7.3) * 8;
      for (const puff of smoke) {
        const life = (time * 0.035 + puff.userData.phase) % 1;
        const [x, z] = puff.userData.from;
        const wide = 10 + life * 34;
        puff.scale.set(wide, wide * 0.7, 1);
        puff.position.set(x + life * 30, 6 + life * 60, z - life * 10);
        puff.material.opacity = 0.75 * Math.sin(life * Math.PI);
      }
    }

    return {
      gunSpot: new THREE.Vector3(0, 1, 0),
      update,
      cells,
      pilot: new THREE.Vector3(PILOT.x, 0, PILOT.z),
    };
  },
};
