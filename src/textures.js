// Surface textures painted in code when the game loads: grass, dirt, planks, fur and so on.
// Each comes as a colour map plus a matching height map that gives the surface relief.
// Nothing here is a photo, so the game still needs no art files.

import * as THREE from 'three';

// Small seeded random generator, so everything looks the same on every visit.
export function seeded(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LATTICE = 128;
const lattice = new Float32Array(LATTICE * LATTICE);
{
  const rand = seeded(7);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
}

function wrap(i, period) {
  return ((i % period) + period) % period;
}

// Smooth noise in 0..1 that repeats every `px` cells across and `py` cells down.
function noise(x, y, px, py) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const xa = wrap(x0, px);
  const xb = wrap(x0 + 1, px);
  const ya = wrap(y0, py) * LATTICE;
  const yb = wrap(y0 + 1, py) * LATTICE;
  const a = lattice[ya + xa];
  const b = lattice[ya + xb];
  const c = lattice[yb + xa];
  const d = lattice[yb + xb];
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// Layered noise in 0..1 that tiles over the unit square. `pu` and `pv` are how many
// blobs fit across and down at the coarsest layer; unequal values give streaks.
export function fbm(u, v, pu = 4, pv = pu, octaves = 4) {
  let sum = 0;
  let amplitude = 0.5;
  let total = 0;
  for (let o = 0; o < octaves && pu <= LATTICE && pv <= LATTICE; o++) {
    sum += noise(u * pu, v * pv, pu, pv) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    pu *= 2;
    pv *= 2;
  }
  return sum / total;
}

export function smooth(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hash(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function blend(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}

function scale(out, k) {
  out[0] *= k;
  out[1] *= k;
  out[2] *= k;
}

function toTexture(image, srgb) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

// Paints a texture one pixel at a time. `shade(u, v, rgb)` fills `rgb` (0-255) and
// returns the surface height at that point (0-1).
function bake(size, shade) {
  const colour = new ImageData(size, size);
  const relief = new ImageData(size, size);
  const rgb = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const height = shade((x + 0.5) / size, (y + 0.5) / size, rgb);
      const i = (y * size + x) * 4;
      colour.data[i] = rgb[0];
      colour.data[i + 1] = rgb[1];
      colour.data[i + 2] = rgb[2];
      colour.data[i + 3] = 255;
      relief.data[i] = relief.data[i + 1] = relief.data[i + 2] = height * 255;
      relief.data[i + 3] = 255;
    }
  }
  return { map: toTexture(colour, true), bumpMap: toTexture(relief, false) };
}

// Boards side by side with grain running along them and dark gaps between.
function planks({ base, boards = 6, horizontal = false, worn = [118, 108, 98], wear = 0.2, lap = false }) {
  return bake(512, (u, v, c) => {
    const across = (horizontal ? v : u) * boards;
    const along = horizontal ? u : v;
    const index = Math.floor(across);
    const f = across - index;
    const grain = horizontal
      ? fbm(along + index * 0.37, v, 3, 64, 3)
      : fbm(u, along + index * 0.37, 64, 3, 3);
    const patch = fbm(u + 0.11 * index, v, 6, 6, 3);
    blend(c, base, worn, smooth(1 - wear, 1 - wear + 0.12, patch * 0.6 + grain * 0.4 + 0.2));
    let shade = 0.8 + hash(index) * 0.2 - (grain - 0.5) * 0.35;
    let height = 0.55 + grain * 0.35;
    if (lap) {
      // Overlapping siding: each board leans out and shades the top of the one below.
      shade *= 0.72 + 0.28 * smooth(0, 0.22, f);
      height = 1 - f * 0.8;
    } else if (f < 0.04 || f > 0.96) {
      shade *= 0.35;
      height = 0;
    }
    scale(c, shade);
    return height;
  });
}

// Rows of tiles, each row offset by half a tile.
function tiles({ base, rows = 8, cols = 6, mortar = null, round = false }) {
  return bake(512, (u, v, c) => {
    const row = Math.floor(v * rows);
    const fv = v * rows - row;
    const along = u * cols + (row % 2) * 0.5;
    const col = Math.floor(along);
    const fu = along - col;
    const grain = fbm(u, v, 32, 32, 2);
    const shade = 0.72 + hash(row * 13 + wrap(col, cols) * 7) * 0.28 - (grain - 0.5) * 0.25;
    c[0] = base[0] * shade;
    c[1] = base[1] * shade;
    c[2] = base[2] * shade;
    if (mortar) {
      if (fu < 0.05 || fv < 0.1) {
        blend(c, mortar, mortar, 0);
        scale(c, 0.8 + grain * 0.3);
        return 0.2;
      }
      return 0.7 + grain * 0.3;
    }
    if (round) {
      // Feather-like scallops: brighter towards the rounded tip.
      const d = Math.hypot(fu - 0.5, (fv - 0.35) * 0.9);
      scale(c, 0.86 + 0.14 * smooth(0.6, 0.1, d));
      return 1 - smooth(0.2, 0.6, d);
    }
    // Each row is shaded by the row above it, and tiles are split by thin gaps.
    scale(c, (0.55 + 0.45 * smooth(0, 0.3, fv)) * (fu < 0.04 ? 0.5 : 1));
    return fu < 0.04 ? 0 : 1 - fv * 0.7;
  });
}

const RECIPES = {
  grass: () =>
    bake(512, (u, v, c) => {
      const broad = fbm(u, v, 4, 4, 3);
      const fine = fbm(u + 0.3, v + 0.7, 32, 32, 3);
      blend(c, [46, 72, 30], [104, 134, 54], Math.min(1, Math.max(0, broad * 0.9 + fine * 0.6 - 0.25)));
      return fine;
    }),
  dirt: () =>
    bake(512, (u, v, c) => {
      const broad = fbm(u, v, 3, 3, 4);
      const mid = fbm(u + 0.5, v + 0.2, 24, 24, 3);
      const grit = fbm(u + 0.1, v + 0.6, 96, 96, 1);
      blend(c, [112, 84, 56], [164, 130, 90], broad * 0.5 + mid * 0.3 + grit * 0.2);
      if (grit > 0.8) scale(c, 1.14); // small stones
      return mid * 0.6 + grit * 0.4;
    }),
  soil: () =>
    bake(256, (u, v, c) => {
      const furrow = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 4);
      const fine = fbm(u, v, 32, 32, 3);
      blend(c, [52, 38, 27], [100, 76, 52], furrow * 0.55 + fine * 0.45);
      return furrow * 0.7 + fine * 0.3;
    }),
  barnWall: () => planks({ base: [136, 44, 36], boards: 7, wear: 0.1, worn: [118, 70, 60] }),
  barnDoor: () => planks({ base: [112, 36, 30], boards: 5, wear: 0.12, worn: [104, 64, 56] }),
  siding: () => planks({ base: [226, 218, 198], boards: 7, horizontal: true, lap: true, wear: 0.1, worn: [176, 168, 150] }),
  wood: () => planks({ base: [136, 104, 68], boards: 2, wear: 0.3, worn: [110, 100, 88] }),
  roofTiles: () => tiles({ base: [124, 62, 48], rows: 8, cols: 6 }),
  brick: () => tiles({ base: [150, 78, 60], rows: 8, cols: 4, mortar: [158, 152, 142] }),
  feathers: () => tiles({ base: [240, 236, 226], rows: 14, cols: 12, round: true }),
  metal: () =>
    bake(256, (u, v, c) => {
      const rib = 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * 12);
      const stain = fbm(u, v, 24, 3, 3);
      blend(c, [150, 156, 160], [118, 78, 52], smooth(0.58, 0.75, stain) * 0.7);
      scale(c, 0.72 + 0.28 * rib);
      return rib;
    }),
  bark: () =>
    bake(256, (u, v, c) => {
      const n = fbm(u, v, 20, 4, 4);
      blend(c, [48, 38, 30], [112, 94, 74], n);
      return n;
    }),
  leaves: () =>
    bake(256, (u, v, c) => {
      const n = fbm(u, v, 20, 20, 3);
      const dab = fbm(u + 0.4, v + 0.1, 48, 48, 2);
      blend(c, [22, 44, 20], [92, 132, 52], Math.min(1, n * 0.7 + smooth(0.5, 0.7, dab) * 0.5));
      return n * 0.5 + dab * 0.5;
    }),
  wool: () =>
    bake(256, (u, v, c) => {
      const n = fbm(u, v, 18, 18, 3);
      const curl = 1 - Math.abs(n - 0.5) * 2;
      blend(c, [168, 158, 138], [244, 240, 228], smooth(0.35, 0.95, curl));
      return curl;
    }),
  hide: () =>
    bake(512, (u, v, c) => {
      const blot = fbm(u + 0.2, v + 0.4, 3, 3, 3);
      const hair = fbm(u, v, 96, 24, 2);
      blend(c, [238, 233, 222], [26, 24, 24], smooth(0.5, 0.54, blot));
      scale(c, 0.86 + hair * 0.28);
      return hair;
    }),
  pigSkin: () =>
    bake(256, (u, v, c) => {
      const n = fbm(u, v, 6, 6, 3);
      const fine = fbm(u, v, 64, 64, 2);
      blend(c, [214, 138, 140], [246, 178, 176], n);
      scale(c, 0.92 + fine * 0.16);
      return fine;
    }),
  straw: () =>
    bake(256, (u, v, c) => {
      const n = fbm(u, v, 3, 64, 3);
      const fine = fbm(u + 0.3, v, 8, 96, 2);
      blend(c, [140, 118, 62], [224, 204, 142], n * 0.5 + fine * 0.5);
      return fine;
    }),
  cloth: () =>
    bake(128, (u, v, c) => {
      const weave = 0.5 + 0.25 * Math.sin(u * Math.PI * 2 * 32) + 0.25 * Math.sin(v * Math.PI * 2 * 32);
      c[0] = c[1] = c[2] = 190 + weave * 60;
      return weave;
    }),
  moon: () =>
    bake(256, (u, v, c) => {
      const seas = fbm(u, v, 4, 3, 5);
      blend(c, [150, 150, 142], [252, 248, 230], smooth(0.4, 0.62, seas));
      return seas;
    }),
};

const baked = new Map();

// The colour and height maps for a named surface, painted the first time they are asked for.
export function surface(name) {
  if (!baked.has(name)) baked.set(name, RECIPES[name]());
  return baked.get(name);
}

// A copy of a texture that repeats at its own rate (and optionally starts at an offset
// or is turned), sharing the painted image with the original.
export function tiled(texture, repeatX, repeatY = repeatX, { offsetX = 0, offsetY = 0, rotation = 0 } = {}) {
  const copy = texture.clone();
  copy.repeat.set(repeatX, repeatY);
  copy.offset.set(offsetX, offsetY);
  copy.rotation = rotation;
  copy.needsUpdate = true;
  return copy;
}

// A lit farmhouse window seen from outside: warm light, curtains, glazing bars.
export function windowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const c = canvas.getContext('2d');
  const light = c.createRadialGradient(64, 70, 6, 64, 70, 90);
  light.addColorStop(0, '#fff0b8');
  light.addColorStop(0.6, '#ffc260');
  light.addColorStop(1, '#c8742a');
  c.fillStyle = light;
  c.fillRect(0, 0, 128, 128);
  c.fillStyle = 'rgba(120, 52, 30, 0.55)';
  for (const [x0, x1] of [[0, 34], [128, 94]]) {
    c.beginPath();
    c.moveTo(x0, 0);
    c.lineTo(x1, 0);
    c.quadraticCurveTo(x1, 70, x0, 104);
    c.fill();
  }
  c.fillStyle = '#2a211c';
  c.fillRect(60, 0, 8, 128);
  c.fillRect(0, 60, 128, 8);
  c.lineWidth = 10;
  c.strokeStyle = '#efe8d8';
  c.strokeRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A soft-edged cloud, white on transparent; the material tints it.
export function cloudTexture(seed) {
  const rand = seeded(seed);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const c = canvas.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 50 + rand() * 156;
    const y = 52 + rand() * 36 - Math.abs(x - 128) * 0.06;
    const r = 18 + rand() * 30;
    const puff = c.createRadialGradient(x, y, 0, x, y, r);
    puff.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
    puff.addColorStop(1, 'rgba(255, 255, 255, 0)');
    c.fillStyle = puff;
    c.fillRect(0, 0, 256, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A round soft glow, for halos around lights.
export function glowTexture(inner, outer) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const c = canvas.getContext('2d');
  const gradient = c.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.35, outer);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  c.fillStyle = gradient;
  c.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
