import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCollisions } from '../src/collide.js';

const wall = { boxes: [{ minX: -5, maxX: 5, minZ: -0.2, maxZ: 0.2 }], circles: [] };

test('leaves a position alone when nothing is near', () => {
  const pos = resolveCollisions({ x: 0, z: 3 }, 0.4, wall);
  assert.deepEqual(pos, { x: 0, z: 3 });
});

test('pushes the player back out of a wall', () => {
  const pos = resolveCollisions({ x: 1, z: 0.4 }, 0.4, wall);
  assert.equal(pos.x, 1);
  assert.ok(Math.abs(pos.z - 0.6) < 1e-9);
});

test('pushes out through the nearest side when the centre is inside', () => {
  const pos = resolveCollisions({ x: 0, z: 0.05 }, 0.4, wall);
  assert.ok(Math.abs(pos.z - 0.6) < 1e-9);
});

test('walking into a thin wall in small steps never gets through', () => {
  const pos = { x: 0, z: 2 };
  for (let i = 0; i < 100; i++) {
    pos.z -= 0.2;
    resolveCollisions(pos, 0.4, wall);
  }
  assert.ok(pos.z >= 0.6 - 1e-9, `ended at z=${pos.z}`);
});

test('keeps the player outside round obstacles', () => {
  const tree = { boxes: [], circles: [{ x: 0, z: 0, r: 1 }] };
  const pos = resolveCollisions({ x: 0.5, z: 0 }, 0.4, tree);
  assert.ok(Math.abs(Math.hypot(pos.x, pos.z) - 1.4) < 1e-9);
});
