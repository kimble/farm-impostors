// Small helpers for describing areas of a place on the ground plane.

import * as THREE from 'three';
import { fbm, smooth } from '../textures.js';

export function inside(rect, x, z, margin = 0) {
  return (
    x > rect.minX - margin && x < rect.maxX + margin && z > rect.minZ - margin && z < rect.maxZ + margin
  );
}

// How far an edge is pushed in or out at this spot, so that no outline is ruler-straight.
function wander(x, z, wobble) {
  return (fbm(x / 40, z / 40, 4, 4, 3) - 0.5) * wobble;
}

// A rectangular patch with a soft, uneven edge: 1 inside, 0 outside.
export function softBox(x, z, cx, cz, halfW, halfD, edge, wobble) {
  const d = Math.max(Math.abs(x - cx) - halfW, Math.abs(z - cz) - halfD) + wander(x, z, wobble);
  return 1 - smooth(-edge, edge, d);
}

// The same for a round patch.
export function softDisc(x, z, cx, cz, radius, edge, wobble) {
  const d = Math.hypot(x - cx, z - cz) - radius + wander(x, z, wobble);
  return 1 - smooth(-edge, edge, d);
}

// A boulder: a ball pushed in and out until it stops looking like one.
export function rockGeometry(seed) {
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

const ROCK_SHAPES = [0.3, 2.1, 4.4, 6.8];

// Boulders, drawn as a few instanced shapes so hundreds cost a handful of draw calls.
// spots: { x, z, y = 0, size, stretch = [1, 1, 1], turn }. Each stops shots and,
// unless `collide` is false, the player.
export function placeRocks({ scene, solids, colliders }, spots, material, { collide = true } = {}) {
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const at = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const groups = ROCK_SHAPES.map(() => []);
  spots.forEach((spot, i) => groups[i % groups.length].push(spot));
  groups.forEach((group, k) => {
    if (!group.length) return;
    const rocks = new THREE.InstancedMesh(rockGeometry(ROCK_SHAPES[k]), material, group.length);
    group.forEach(({ x, z, y = 0, size, stretch = [1, 1, 1], turn = 0 }, i) => {
      quat.setFromEuler(euler.set(0, turn, 0));
      scale.set(size * stretch[0], size * stretch[1], size * stretch[2]);
      rocks.setMatrixAt(i, m4.compose(at.set(x, y + size * stretch[1] * 0.22, z), quat, scale));
      if (collide) colliders.circles.push({ x, z, r: size * Math.min(stretch[0], stretch[2]) * 0.85 });
    });
    rocks.castShadow = rocks.receiveShadow = true;
    rocks.computeBoundingSphere();
    scene.add(rocks);
    solids.push(rocks);
  });
}
