// The forest: a clearing among spruces where the animals graze, a path to it, and the
// wreck of an alien pod with the ÷ blaster lying beside it. world.js supplies the
// land, sky, trees and grass around them.

import * as THREE from 'three';
import { LEVELS } from '../levels.js';
import { ball, limb, rounded, mat, skin, glow } from '../models.js';
import { fbm, cloudTexture, glowTexture } from '../textures.js';
import { buildCrop } from '../grass.js';
import { inside, softBox, softDisc } from './shapes.js';

const CLEARING = LEVELS.forest.roam;
const SPAWN = LEVELS.forest.spawn;
const CRASH = { x: -19, z: 10 }; // where the pod lies
const REST = { x: CRASH.x + 5, z: CRASH.z + 2.6 }; // where the blaster lies
const VIOLET = 0xc77dff;

const glade = (x, z) =>
  softBox(x, z, (CLEARING.minX + CLEARING.maxX) / 2, (CLEARING.minZ + CLEARING.maxZ) / 2, 25, 20, 4, 9);

// The trodden path from the south into the clearing, its branch to the wreck, and the
// ground the pod scorched.
function path(x, z) {
  return Math.max(
    softBox(x, z, 2, 12, 1.4, 31, 1, 2.5),
    softBox(x, z, -8, 12.5, 10, 1.2, 1, 2),
    softDisc(x, z, CRASH.x, CRASH.z, 6.5, 2, 3),
  );
}

function treeless(x, z) {
  return (
    inside(CLEARING, x, z, 3) ||
    path(x, z) > 0.02 ||
    Math.hypot(x - CRASH.x, z - CRASH.z) < 10 ||
    Math.hypot(x - SPAWN.x, z - SPAWN.z) < 8
  );
}

// A boulder: a ball pushed in and out until it stops looking like one.
function rockGeometry(seed) {
  const geometry = new THREE.SphereGeometry(1, 11, 8);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = 0.62 + fbm(x * 0.6 + z * 0.3 + seed, y * 0.6 - z * 0.25 + seed * 0.6, 3, 3, 3) * 0.75;
    pos.setXYZ(i, x * r, y * r * 0.72, z * r);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export const forest = {
  // Deep night with northern lights. No sunset left.
  sky: {
    zenith: new THREE.Color(0x02050f),
    horizon: new THREE.Color(0x14283a),
    ember: new THREE.Color(0x000000),
    emberStrength: 0,
    aurora: 0.15,
    clouds: 7,
    cloudNight: new THREE.Color(0x26304a),
    cloudEmber: new THREE.Color(0x26304a),
  },
  fog: { near: 30, far: 210 },
  light: { hemisphere: [0x7098c8, 0x26342c, 1.15], moon: 2.0, afterglow: [0x60ffc0, 0.12] },
  floor: 'needles',
  // Needles and twigs under the trees and on the path; grass only where light gets in.
  bare: (x, z) => Math.max(path(x, z), (1 - glade(x, z)) * 0.85),
  barren: (x, z) => Math.max(path(x, z), (1 - glade(x, z)) * 0.42),
  trees: { count: 430, spread: 240, spruce: 0.7, clear: treeless },
  grass: [0x3c5c26, 0x4a6c2c, 0x567a32, 0x426228, 0x5f7a3a],
  flowers: { count: 700, colours: [0xf4f1e6, 0xa8c8ff, 0xc8a8f0, 0xf4f1e6] },
  farForest: 0.2,

  build({ scene, colliders, solids, rand, addGroup }) {
    const m4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const size = new THREE.Vector3();
    const at = new THREE.Vector3();
    const bark = skin('bark', { repeat: 2, repeatY: 2, roughness: 1, bump: 4 });

    // ---------- The wreck ----------

    const scorchMap = glowTexture('rgba(0, 0, 0, 0.9)', 'rgba(0, 0, 0, 0.55)');
    function scorch(x, z, long, wide, turn) {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(1, 32),
        new THREE.MeshBasicMaterial({ map: scorchMap, transparent: true, depthWrite: false }),
      );
      mesh.rotation.set(-Math.PI / 2, 0, turn);
      mesh.scale.set(long, wide, 1);
      mesh.position.set(x, 0.04, z);
      scene.add(mesh);
    }
    // It came in low from the south-east, ploughed a trench and stopped here.
    scorch(CRASH.x + 7, CRASH.z + 6, 11, 3.2, -0.72);
    scorch(CRASH.x, CRASH.z, 8, 7, 0);

    const pod = new THREE.Group();
    const hull = mat(0x4a5060, { roughness: 0.45, metalness: 0.9 });
    const seam = glow(VIOLET, 2.6);
    const profile = [
      [0, -0.7], [1.4, -0.7], [2.3, -0.4], [2.6, -0.1], [2.3, 0.2], [1.4, 0.55], [0.9, 0.62],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const shell = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), hull);
    shell.castShadow = shell.receiveShadow = true;
    pod.add(shell);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.06, 8, 48), seam);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.1;
    pod.add(ring);
    // The canopy is smashed and whatever powered the pod is still lit inside.
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 24, 10, 0, Math.PI * 1.5, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.8, metalness: 0.4, side: THREE.DoubleSide }),
    );
    canopy.position.y = 0.55;
    pod.add(canopy);
    pod.add(ball(0.5, 0.3, 0.5, seam, 0, 0.6, 0));
    pod.scale.setScalar(1.3);
    pod.position.set(CRASH.x, 1.1, CRASH.z);
    pod.rotation.set(0.42, 0.6, -0.3);
    addGroup(pod, { solid: true });
    colliders.circles.push({ x: CRASH.x, z: CRASH.z, r: 3.1 });

    // Torn-off plating lies around it.
    for (const [x, z, w, d, lean, turn] of [
      [CRASH.x - 3.6, CRASH.z + 2.4, 1.1, 0.7, 0.5, 1.9],
      [CRASH.x + 1.2, CRASH.z - 4.2, 0.9, 1.3, -0.35, 0.3],
      [CRASH.x + 8.5, CRASH.z + 7.5, 1.2, 0.8, 0.25, 2.6],
    ]) {
      const plate = rounded(w, 0.12, d, hull, x, 0, z, 0.04);
      plate.rotation.set(lean, turn, lean * 0.6);
      plate.position.y = 0.1 + Math.abs(lean) * 0.5;
      scene.add(plate);
      solids.push(plate);
    }
    const rest = new THREE.Mesh(rockGeometry(5.2), skin('rock', { repeat: 2, roughness: 0.95, bump: 4 }));
    rest.scale.set(1.0, 0.95, 0.9);
    rest.position.set(REST.x, 0.3, REST.z);
    rest.castShadow = rest.receiveShadow = true;
    scene.add(rest);
    solids.push(rest);
    colliders.circles.push({ x: REST.x, z: REST.z, r: 0.8 });
    // The largest piece of plating came to rest on a boulder, with the blaster on it.
    const shelf = rounded(1.7, 0.12, 1.2, hull, REST.x, 1.02, REST.z, 0.04);
    shelf.rotation.set(0.06, 0.5, 0.04);
    scene.add(shelf);
    solids.push(shelf);
    const gunSpot = new THREE.Vector3(REST.x, 1.9, REST.z);

    const podLight = new THREE.PointLight(0xb070ff, 20, 24, 1.6);
    podLight.position.set(CRASH.x, 2.2, CRASH.z);
    scene.add(podLight);

    // Small fires where it hit, with embers and a column of smoke.
    const FIRES = [
      [CRASH.x - 2.6, CRASH.z - 1.4],
      [CRASH.x + 2.2, CRASH.z + 3.6],
      [CRASH.x + 6.4, CRASH.z + 5.2],
    ];
    const flameMap = glowTexture('rgba(255, 230, 150, 1)', 'rgba(255, 120, 30, 0.5)');
    const flames = FIRES.map(([x, z]) => {
      const flame = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: flameMap, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      flame.material.color.setScalar(1.6);
      flame.position.set(x, 0.35, z);
      scene.add(flame);
      return flame;
    });
    const fireLight = new THREE.PointLight(0xff8a3a, 14, 18, 1.6);
    fireLight.position.set(CRASH.x + 1.5, 1.2, CRASH.z + 2);
    scene.add(fireLight);

    const EMBERS = 54;
    const emberAt = new Float32Array(EMBERS * 3);
    const emberSeed = Array.from({ length: EMBERS }, () => [rand(), rand(), rand()]);
    const emberGeometry = new THREE.BufferGeometry();
    emberGeometry.setAttribute('position', new THREE.BufferAttribute(emberAt, 3));
    const embers = new THREE.Points(
      emberGeometry,
      new THREE.PointsMaterial({
        color: 0xffa040,
        size: 0.09,
        map: flameMap,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    embers.material.color.multiplyScalar(2);
    embers.frustumCulled = false;
    scene.add(embers);

    const smokeMap = cloudTexture(31);
    const smoke = Array.from({ length: 7 }, (_, i) => {
      const puff = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: smokeMap, color: 0x2a2c34, transparent: true, depthWrite: false }),
      );
      puff.userData.phase = i / 7;
      scene.add(puff);
      return puff;
    });

    // ---------- Trees the pod took down ----------

    for (const [x, z, turn, length] of [
      [CRASH.x + 9, CRASH.z + 9.5, 0.5, 6.5],
      [CRASH.x + 4.5, CRASH.z + 9, -0.5, 5.5],
      [12, 18, 1.2, 6],
      [-33, -8, 0.3, 7],
      [29, -6, 2.0, 6.5],
      [10, 46, 0.9, 5.5],
    ]) {
      const log = limb(0.26, 0.34, length, bark, x, 0.3, z, 10);
      log.rotation.set(0, turn, Math.PI / 2);
      scene.add(log);
      solids.push(log);
      // The player cannot walk through it: a row of small circles along its length.
      for (let along = -length / 2 + 0.3; along <= length / 2 - 0.3; along += 0.6) {
        colliders.circles.push({ x: x + Math.cos(turn) * along, z: z - Math.sin(turn) * along, r: 0.36 });
      }
    }
    const splinter = mat(0xc9a878, { roughness: 0.9 });
    for (const [x, z, girth] of [
      [CRASH.x + 10.5, CRASH.z + 5.5, 0.34],
      [CRASH.x + 6, CRASH.z + 11, 0.3],
      [CRASH.x - 5.5, CRASH.z - 4, 0.36],
      [CRASH.x + 12.5, CRASH.z + 10.5, 0.28],
    ]) {
      const stump = limb(girth * 0.85, girth * 1.15, 0.8, bark, x, 0.4, z, 9);
      scene.add(stump);
      solids.push(stump);
      const snapped = new THREE.Mesh(new THREE.ConeGeometry(girth * 0.8, 0.5, 5), splinter);
      snapped.position.set(x + girth * 0.2, 0.95, z);
      snapped.rotation.z = 0.25;
      snapped.castShadow = true;
      scene.add(snapped);
      colliders.circles.push({ x, z, r: girth * 1.2 });
    }

    // ---------- Boulders ----------

    const rockShapes = [rockGeometry(0.3), rockGeometry(2.1), rockGeometry(4.4)].map((geometry) => ({
      geometry,
      spots: [],
    }));
    for (let placed = 0; placed < 54; ) {
      const x = (rand() - 0.5) * 210;
      const z = (rand() - 0.5) * 210;
      if (treeless(x, z)) continue;
      const big = 0.5 + rand() ** 2 * 1.5;
      rockShapes[Math.floor(rand() * rockShapes.length)].spots.push([x, z, big, rand() * 6]);
      colliders.circles.push({ x, z, r: big * 0.9 });
      placed += 1;
    }
    const stone = skin('rock', { repeat: 2, roughness: 0.95, bump: 4 });
    for (const { geometry, spots } of rockShapes) {
      const rocks = new THREE.InstancedMesh(geometry, stone, spots.length);
      spots.forEach(([x, z, big, turn], i) => {
        quat.setFromEuler(euler.set(0, turn, 0));
        rocks.setMatrixAt(i, m4.compose(at.set(x, big * 0.22, z), quat, size.setScalar(big)));
      });
      rocks.castShadow = rocks.receiveShadow = true;
      rocks.computeBoundingSphere();
      scene.add(rocks);
      solids.push(rocks);
    }

    // ---------- Ferns under the trees ----------

    const fernSpots = [];
    while (fernSpots.length < 2600) {
      const x = (rand() - 0.5) * 200;
      const z = (rand() - 0.5) * 200;
      if (glade(x, z) > 0.4 || path(x, z) > 0.05) continue;
      // Ferns grow in drifts rather than evenly.
      if (fbm(x / 30 + 0.2, z / 30 + 0.7, 4, 4, 3) < 0.42 + rand() * 0.2) continue;
      fernSpots.push([x, z, 0.7 + rand() * 0.8]);
    }
    const ferns = buildCrop(fernSpots, {
      blades: 6,
      height: 0.6,
      width: 0.17,
      lean: 0.42,
      sway: 0.05,
      colours: [0x2f5a2a, 0x3a6a30, 0x2a4f28, 0x47743a],
    });
    scene.add(ferns.group);

    // ---------- Fireflies ----------

    const flies = [0, 1].map((half) => {
      const spots = [];
      for (let i = 0; i < 140; i++) {
        spots.push((rand() - 0.5) * 130, 0.4 + rand() * 2.8, (rand() - 0.5) * 130 - 10);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(spots, 3));
      const points = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: 0xd8ff6a,
          size: 0.16,
          map: flameMap,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      points.material.color.multiplyScalar(1.8);
      points.userData.half = half;
      scene.add(points);
      return points;
    });

    function update(dt, time) {
      const flicker = 0.75 + 0.25 * Math.sin(time * 13) * Math.sin(time * 7.3);
      fireLight.intensity = 14 * flicker;
      podLight.intensity = 18 + Math.sin(time * 2.1) * 4;
      flames.forEach((flame, i) => {
        const lick = 0.8 + 0.3 * Math.sin(time * (11 + i * 3) + i);
        flame.scale.set(0.9 * lick, 1.25 * lick, 1);
      });
      for (let i = 0; i < EMBERS; i++) {
        const [a, b, c] = emberSeed[i];
        const [fx, fz] = FIRES[i % FIRES.length];
        const life = (time * (0.25 + a * 0.3) + b) % 1;
        emberAt[i * 3] = fx + Math.sin(time * 1.3 + c * 20) * 0.5 * life + (c - 0.5) * 0.6;
        emberAt[i * 3 + 1] = 0.3 + life * (2.5 + a * 3);
        emberAt[i * 3 + 2] = fz + Math.cos(time * 1.1 + a * 20) * 0.5 * life + (b - 0.5) * 0.6;
      }
      emberGeometry.attributes.position.needsUpdate = true;
      for (const puff of smoke) {
        const life = (time * 0.07 + puff.userData.phase) % 1;
        const wide = 2.5 + life * 9;
        puff.scale.set(wide, wide * 0.6, 1);
        puff.position.set(CRASH.x + life * 5, 1.5 + life * 17, CRASH.z - life * 3);
        puff.material.opacity = 0.5 * Math.sin(life * Math.PI);
      }
      for (const points of flies) {
        const turn = points.userData.half ? 1 : -1;
        points.position.set(Math.sin(time * 0.21 * turn) * 1.5, Math.sin(time * 0.6 + points.userData.half * 2) * 0.3, Math.cos(time * 0.17) * 1.5);
        points.material.opacity = 0.55 + 0.45 * Math.sin(time * 2.3 + points.userData.half * 3);
      }
    }

    return {
      gunSpot,
      update,
      setQuality(high) {
        ferns.setDensity(high ? 1 : 0.4);
      },
    };
  },
};
