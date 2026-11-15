// Small helpers for describing areas of a place on the ground plane.

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
