// Keeps a circle (the player, seen from above) out of walls and round obstacles.
// Pure maths on {x, z} so it can be tested without a browser.

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// colliders: { boxes: [{minX, maxX, minZ, maxZ}], circles: [{x, z, r}] }
export function resolveCollisions(pos, radius, colliders) {
  for (const b of colliders.boxes) {
    const cx = clamp(pos.x, b.minX, b.maxX);
    const cz = clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // Centre is inside the box: leave through the nearest side.
      const left = pos.x - b.minX;
      const right = b.maxX - pos.x;
      const near = pos.z - b.minZ;
      const far = b.maxZ - pos.z;
      const min = Math.min(left, right, near, far);
      if (min === left) pos.x = b.minX - radius;
      else if (min === right) pos.x = b.maxX + radius;
      else if (min === near) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    }
  }
  for (const c of colliders.circles) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const reach = radius + c.r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= reach * reach) continue;
    const d = Math.sqrt(d2);
    if (d > 1e-6) {
      pos.x = c.x + (dx / d) * reach;
      pos.z = c.z + (dz / d) * reach;
    } else {
      pos.x = c.x + reach;
    }
  }
  return pos;
}
