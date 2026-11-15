// Materials, shapes and the models made from them: animals, the alien under the
// disguise, the hunter drone, number tags and the blaster.
// Everything is built from code, so the game needs no art files.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { surface, tiled, glowTexture } from './textures.js';

// ---------- Materials ----------

const materials = new Map();

function cached(key, build) {
  if (!materials.has(key)) materials.set(key, build());
  return materials.get(key);
}

// Plain coloured surface. Low roughness and high metalness give polished metal.
export function mat(color, { roughness = 0.85, metalness = 0 } = {}) {
  return cached(
    `mat:${color}:${roughness}:${metalness}`,
    () => new THREE.MeshStandardMaterial({ color, roughness, metalness }),
  );
}

// Surface with one of the painted textures from textures.js. `repeat` is how many
// times the texture repeats over one unit of the model's texture coordinates.
export function skin(name, options = {}) {
  const {
    repeat = 1,
    repeatY = repeat,
    color = 0xffffff,
    roughness = 0.9,
    metalness = 0,
    bump = 1,
    rotation = 0,
    offsetX = 0,
    offsetY = 0,
  } = options;
  const key = `skin:${name}:${[repeat, repeatY, color, roughness, metalness, bump, rotation, offsetX, offsetY]}`;
  return cached(key, () => {
    const { map, bumpMap } = surface(name);
    const placing = { rotation, offsetX, offsetY };
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      map: tiled(map, repeat, repeatY, placing),
      bumpMap: tiled(bumpMap, repeat, repeatY, placing),
      bumpScale: bump,
    });
  });
}

// Unlit material for things that give off light. A `boost` above 1 makes it bright
// enough to bloom.
export function glow(color, boost = 1) {
  return cached(`glow:${color}:${boost}`, () => {
    const material = new THREE.MeshBasicMaterial({ color });
    material.color.multiplyScalar(boost);
    return material;
  });
}

// ---------- Shapes ----------

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const BALL = new THREE.SphereGeometry(1, 20, 13);
const geometries = new Map();

function shadows(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function resolve(material) {
  return typeof material === 'number' ? mat(material) : material;
}

export function box(w, h, d, color, x = 0, y = 0, z = 0, material = null) {
  const mesh = new THREE.Mesh(UNIT_BOX, material || mat(color));
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  return shadows(mesh);
}

// A ball stretched to the given radii: the building block of everything organic.
export function ball(rx, ry, rz, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(BALL, resolve(material));
  mesh.scale.set(rx, ry, rz);
  mesh.position.set(x, y, z);
  shadows(mesh);
  // Eyes, ears and the like are too small for their shadows to be missed.
  if (Math.max(rx, ry, rz) < 0.14) mesh.castShadow = false;
  return mesh;
}

// An upright tapered cylinder centred on the given point.
export function limb(rTop, rBottom, length, material, x = 0, y = 0, z = 0, segments = 12) {
  const key = `limb:${rTop}:${rBottom}:${length}:${segments}`;
  if (!geometries.has(key)) {
    geometries.set(key, new THREE.CylinderGeometry(rTop, rBottom, length, segments));
  }
  const mesh = new THREE.Mesh(geometries.get(key), resolve(material));
  mesh.position.set(x, y, z);
  return shadows(mesh);
}

export function cone(radius, height, material, x = 0, y = 0, z = 0) {
  const key = `cone:${radius}:${height}`;
  if (!geometries.has(key)) geometries.set(key, new THREE.ConeGeometry(radius, height, 10));
  const mesh = new THREE.Mesh(geometries.get(key), resolve(material));
  mesh.position.set(x, y, z);
  return shadows(mesh);
}

// A box with softened edges, for machined things.
export function rounded(w, h, d, material, x = 0, y = 0, z = 0, radius = 0.02) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), resolve(material));
  mesh.position.set(x, y, z);
  return shadows(mesh);
}

// Rewrites a shape's texture coordinates so that a texture covers `tile` metres on
// every face, whatever the size of the shape.
export function boxUV(geometry, tile = 1) {
  const pos = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(normal.getX(i));
    const ay = Math.abs(normal.getY(i));
    const az = Math.abs(normal.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, pos.getZ(i) / tile, pos.getY(i) / tile);
    else if (ay >= az) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
    else uv.setXY(i, pos.getX(i) / tile, pos.getY(i) / tile);
  }
  return geometry;
}

// A box whose texture keeps its real-world scale (see boxUV).
export function slab(w, h, d, material, x = 0, y = 0, z = 0, tile = 2) {
  const mesh = new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, h, d), tile), resolve(material));
  mesh.position.set(x, y, z);
  return shadows(mesh);
}

// Triangular roof: `w` wide, `h` tall, ridge running along z for `d`.
export function prism(w, h, d, material, tile = 2) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geometry.translate(0, 0, -d / 2);
  return shadows(new THREE.Mesh(boxUV(geometry, tile), resolve(material)));
}

// Pitched roof made of two thin panels meeting at a ridge that runs along z.
export function roof(w, h, d, material, tile = 2, thickness = 0.14) {
  const group = new THREE.Group();
  const length = Math.hypot(w / 2, h);
  const pitch = Math.atan2(h, w / 2);
  for (const side of [1, -1]) {
    const panel = slab(length + 0.12, thickness, d, material, (side * w) / 4, h / 2, 0, tile);
    panel.rotation.z = -side * pitch;
    group.add(panel);
  }
  return group;
}

// A leg that swings from the hip: the group's origin is the top of the leg.
function legAt(group, x, hipY, z, parts) {
  const pivot = new THREE.Group();
  pivot.position.set(x, hipY, z);
  pivot.add(...parts);
  group.add(pivot);
  return pivot;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// ---------- Animals (all face +z) ----------

const WOOL = 0xe9e4d6;
const DARK = 0x2a2625;
const WHITE = 0xf2efe6;
const BLACK = 0x1c1c1f;
const PIG = 0xe8a0a2;
const RED = 0xc8322a;

const eyeBlack = () => mat(0x08080a, { roughness: 0.08, metalness: 0.4 });

function sheep() {
  const g = new THREE.Group();
  const wool = skin('wool', { repeat: 3, repeatY: 2, roughness: 1, bump: 2.5 });
  const face = mat(DARK, { roughness: 0.7 });

  g.add(ball(0.5, 0.45, 0.72, wool, 0, 0.98, 0));
  // Tufts all over the fleece break up the outline.
  for (let i = 0; i < 14; i++) {
    const around = Math.random() * Math.PI * 2;
    const up = -0.3 + Math.random() * 1.3;
    const flat = Math.sqrt(Math.max(0, 1 - up * up));
    const r = 0.17 + Math.random() * 0.09;
    const tuft = ball(r, r * 0.9, r, wool, Math.sin(around) * flat * 0.44, 0.98 + up * 0.4, Math.cos(around) * flat * 0.66);
    tuft.castShadow = false; // the body underneath casts the shadow
    g.add(tuft);
  }
  const head = ball(0.165, 0.19, 0.27, face, 0, 1.13, 0.86);
  head.rotation.x = 0.35;
  g.add(head);
  g.add(ball(0.17, 0.12, 0.17, wool, 0, 1.3, 0.74));
  g.add(ball(0.1, 0.1, 0.06, wool, 0, 1.0, -0.76));
  for (const side of [1, -1]) {
    const ear = ball(0.12, 0.045, 0.065, face, side * 0.24, 1.2, 0.76);
    ear.rotation.z = -side * 0.5;
    g.add(ear);
    g.add(ball(0.032, 0.032, 0.02, mat(0xd9a94e, { roughness: 0.2 }), side * 0.115, 1.2, 0.99));
    g.add(ball(0.016, 0.02, 0.012, eyeBlack(), side * 0.12, 1.2, 1.005));
  }
  const legs = [[0.26, 0.42], [-0.26, 0.42], [0.26, -0.42], [-0.26, -0.42]].map(([x, z]) =>
    legAt(g, x, 0.6, z, [limb(0.085, 0.055, 0.5, face, 0, -0.25, 0), limb(0.06, 0.066, 0.1, BLACK, 0, -0.55, 0)]),
  );
  return { group: g, legs, height: 1.55, width: 1.05, length: 1.9, speed: 1.1, colors: [WOOL, DARK] };
}

function cow() {
  const g = new THREE.Group();
  const offsets = pick([[0, 0], [0.31, 0.2], [0.6, 0.55], [0.83, 0.37]]);
  const hide = skin('hide', { repeat: 2, repeatY: 1, roughness: 0.75, bump: 0.6, offsetX: offsets[0], offsetY: offsets[1] });
  const white = mat(0xd6d0c2, { roughness: 0.8 });
  const pink = mat(0xd49a94, { roughness: 0.55 });
  const hoof = mat(BLACK, { roughness: 0.5 });
  const horn = mat(0xd8cdb0, { roughness: 0.45 });

  g.add(ball(0.56, 0.52, 1.0, hide, 0, 1.3, 0));
  g.add(ball(0.5, 0.5, 0.5, hide, 0, 1.38, 0.6));
  g.add(ball(0.52, 0.5, 0.48, hide, 0, 1.36, -0.6));
  const neck = ball(0.28, 0.33, 0.5, hide, 0, 1.56, 1.02);
  neck.rotation.x = -0.5;
  g.add(neck);
  const head = ball(0.26, 0.27, 0.4, hide, 0, 1.68, 1.4);
  head.rotation.x = 0.4;
  g.add(head);
  g.add(ball(0.2, 0.165, 0.17, pink, 0, 1.53, 1.69));
  g.add(ball(0.2, 0.15, 0.22, pink, 0, 0.8, -0.42));
  for (const side of [1, -1]) {
    g.add(ball(0.03, 0.025, 0.02, hoof, side * 0.08, 1.56, 1.845));
    g.add(ball(0.045, 0.045, 0.035, eyeBlack(), side * 0.2, 1.78, 1.56));
    const ear = ball(0.17, 0.085, 0.05, hide, side * 0.38, 1.8, 1.2);
    ear.rotation.z = -side * 0.3;
    g.add(ear);
    const tip = cone(0.05, 0.24, horn, side * 0.19, 1.99, 1.22);
    tip.rotation.z = -side * 0.5;
    g.add(tip);
  }
  const tail = limb(0.03, 0.018, 0.75, hoof, 0, 1.22, -1.04, 6);
  tail.rotation.x = 0.12;
  g.add(tail);
  g.add(ball(0.06, 0.11, 0.06, hoof, 0, 0.82, -1.09));
  const legs = [[0.33, 0.68], [-0.33, 0.68], [0.33, -0.68], [-0.33, -0.68]].map(([x, z]) =>
    legAt(g, x, 0.92, z, [
      ball(0.15, 0.3, 0.17, hide, 0, -0.12, 0),
      limb(0.1, 0.07, 0.8, white, 0, -0.4, 0),
      limb(0.075, 0.09, 0.13, hoof, 0, -0.855, 0),
    ]),
  );
  return { group: g, legs, height: 2.05, width: 1.15, length: 2.7, speed: 0.9, colors: [WHITE, BLACK] };
}

function pig() {
  const g = new THREE.Group();
  const body = skin('pigSkin', { repeat: 2, roughness: 0.65, bump: 0.5 });
  const snout = mat(0xc97f86, { roughness: 0.5 });
  const trotter = mat(0x6e4a48, { roughness: 0.6 });

  g.add(ball(0.44, 0.4, 0.72, body, 0, 0.76, 0));
  g.add(ball(0.3, 0.29, 0.31, body, 0, 0.84, 0.72));
  const nose = limb(0.115, 0.125, 0.16, snout, 0, 0.78, 1.04, 16);
  nose.rotation.x = Math.PI / 2;
  g.add(nose);
  for (const side of [1, -1]) {
    g.add(ball(0.025, 0.035, 0.02, trotter, side * 0.045, 0.78, 1.12));
    g.add(ball(0.035, 0.035, 0.025, eyeBlack(), side * 0.17, 0.95, 0.96));
    const ear = cone(0.11, 0.22, body, side * 0.2, 1.1, 0.74);
    ear.scale.set(1, 1, 0.4);
    ear.rotation.set(0.5, 0, -side * 0.35);
    g.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 14, 4.6), snout);
  tail.position.set(0, 0.92, -0.76);
  tail.rotation.y = Math.PI / 2;
  tail.castShadow = true;
  g.add(tail);
  const legs = [[0.25, 0.42], [-0.25, 0.42], [0.25, -0.42], [-0.25, -0.42]].map(([x, z]) =>
    legAt(g, x, 0.46, z, [limb(0.105, 0.065, 0.38, body, 0, -0.19, 0), limb(0.065, 0.07, 0.09, trotter, 0, -0.415, 0)]),
  );
  return { group: g, legs, height: 1.2, width: 0.9, length: 1.9, speed: 1.2, colors: [PIG, 0xd9828c] };
}

function chicken() {
  const g = new THREE.Group();
  const k = 1.25; // drawn a little larger than life so it is a fair target
  const feathers = skin('feathers', { repeat: 2, roughness: 0.8, bump: 1.2 });
  const tailFeather = skin('feathers', { repeat: 1, roughness: 0.8, bump: 1.2, color: 0xd9d4c8 });
  const yellow = mat(0xe0a528, { roughness: 0.5 });
  const red = mat(RED, { roughness: 0.5 });
  const B = (rx, ry, rz, m, x, y, z) => ball(rx * k, ry * k, rz * k, m, x * k, y * k, z * k);

  const body = B(0.2, 0.19, 0.3, feathers, 0, 0.5, -0.02);
  body.rotation.x = -0.25;
  g.add(body);
  g.add(B(0.17, 0.18, 0.16, feathers, 0, 0.52, 0.16));
  g.add(B(0.1, 0.18, 0.1, feathers, 0, 0.71, 0.21));
  g.add(B(0.095, 0.1, 0.11, feathers, 0, 0.9, 0.25));
  const beak = cone(0.035 * k, 0.11 * k, yellow, 0, 0.88 * k, 0.385 * k);
  beak.rotation.x = Math.PI / 2;
  g.add(beak);
  for (const z of [0.19, 0.25, 0.31]) g.add(B(0.022, 0.05, 0.04, red, 0, 1.01 - Math.abs(z - 0.25) * 0.3, z));
  g.add(B(0.022, 0.05, 0.025, red, 0, 0.8, 0.335));
  for (const side of [1, -1]) {
    g.add(B(0.018, 0.018, 0.014, eyeBlack(), side * 0.078, 0.92, 0.3));
    g.add(B(0.05, 0.14, 0.22, tailFeather, side * 0.19, 0.52, -0.02));
  }
  for (const spread of [-0.5, -0.25, 0, 0.25, 0.5]) {
    const plume = B(0.028, 0.2, 0.085, tailFeather, spread * 0.12, 0.74, -0.32);
    plume.rotation.set(-0.7, 0, -spread * 0.6);
    g.add(plume);
  }
  const legs = [0.09, -0.09].map((x) =>
    legAt(g, x * k, 0.33 * k, 0, [
      limb(0.02 * k, 0.016 * k, 0.32 * k, yellow, 0, -0.16 * k, 0, 6),
      ball(0.055 * k, 0.013 * k, 0.075 * k, yellow, 0, -0.318 * k, 0.03 * k),
    ]),
  );
  return { group: g, legs, height: 1.2, width: 0.6, length: 0.95, speed: 1.4, colors: [WHITE, RED] };
}

const SPECIES = { sheep, cow, pig, chicken };

export function buildAnimal(species) {
  return SPECIES[species]();
}

// What is really under the disguise (faces +z).
// Built to be recognised in half a second at dusk: an oversized glowing green head with
// big black slanted eyes on a thin dark body. The skin gives off its own light, so it
// stays bright however dark the pasture is.
export function buildAlien() {
  const suit = mat(0x1d2230, { roughness: 0.4, metalness: 0.6 });
  const trim = mat(0x5d6a88, { roughness: 0.3, metalness: 0.8 });
  const flesh = cached('alien-skin', () =>
    new THREE.MeshStandardMaterial({ color: 0x3f8f2c, emissive: 0x58f03a, emissiveIntensity: 0.85, roughness: 0.45 }),
  );
  const core = glow(0xff3b2f, 2);
  const eyes = mat(0x020304, { roughness: 0.04, metalness: 0.7 });
  const g = new THREE.Group();

  for (const side of [1, -1]) {
    g.add(limb(0.075, 0.05, 0.62, suit, side * 0.13, 0.31, 0));
    g.add(ball(0.08, 0.035, 0.13, suit, side * 0.13, 0.035, 0.04));
    g.add(ball(0.13, 0.1, 0.13, trim, side * 0.3, 1.15, 0));
  }
  g.add(ball(0.26, 0.37, 0.17, suit, 0, 0.9, 0));
  g.add(ball(0.2, 0.12, 0.15, trim, 0, 0.62, 0));
  g.add(ball(0.085, 0.085, 0.04, core, 0, 0.98, 0.16));

  // Long thin arms that swing from the shoulder and are thrown up in alarm.
  const arms = [1, -1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.34, 1.15, 0);
    pivot.add(limb(0.035, 0.05, 0.64, flesh, 0, 0.32, 0, 8));
    pivot.add(ball(0.065, 0.085, 0.045, flesh, 0, 0.7, 0));
    for (const spread of [-1, 0, 1]) {
      const finger = limb(0.012, 0.018, 0.2, flesh, spread * 0.045, 0.85, 0, 6);
      finger.rotation.z = -spread * 0.3;
      pivot.add(finger);
    }
    g.add(pivot);
    return pivot;
  });

  g.add(limb(0.055, 0.07, 0.2, flesh, 0, 1.3, 0, 10));
  g.add(ball(0.44, 0.4, 0.44, flesh, 0, 1.8, -0.03));
  g.add(ball(0.25, 0.3, 0.27, flesh, 0, 1.54, 0.07));
  for (const side of [1, -1]) {
    const eye = ball(0.16, 0.21, 0.07, eyes, side * 0.175, 1.67, 0.31);
    eye.rotation.set(0, side * 0.45, side * 0.55);
    g.add(eye);
    g.add(ball(0.012, 0.018, 0.01, eyes, side * 0.03, 1.47, 0.325));
    g.add(limb(0.012, 0.02, 0.34, trim, side * 0.26, 2.26, -0.03, 6));
    g.add(ball(0.055, 0.055, 0.055, core, side * 0.26, 2.45, -0.03));
  }
  g.add(ball(0.07, 0.012, 0.02, eyes, 0, 1.36, 0.28));
  return { group: g, arms };
}

// The hunter the mothership sends after the player (faces +z).
export function buildDrone() {
  const hull = mat(0x161a24, { roughness: 0.3, metalness: 0.9 });
  const steel = mat(0x596379, { roughness: 0.25, metalness: 0.9 });
  const eye = glow(0xff3b2f, 3);
  const g = new THREE.Group();
  g.add(ball(0.36, 0.36, 0.36, hull));
  g.add(ball(0.17, 0.17, 0.08, eye, 0, 0, 0.32));
  const socket = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 8, 24), steel);
  socket.position.z = 0.3;
  g.add(socket);
  for (const side of [1, -1]) {
    g.add(rounded(0.95, 0.07, 0.2, steel, 0, side * 0.36, -0.08));
    g.add(rounded(0.07, 0.3, 0.3, steel, side * 0.42, 0, -0.14));
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.04, 8, 40), eye);
  g.add(ring);

  // Red halo, so it reads as a glowing dot even when it is still far away.
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('rgba(255, 120, 90, 0.9)', 'rgba(255, 59, 47, 0.35)'),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  halo.scale.setScalar(4.5);
  g.add(halo);

  g.scale.setScalar(1.4);
  return { group: g, ring };
}

// ---------- Number signs ----------

const signTextures = new Map();

export function numberTexture(n) {
  if (signTextures.has(n)) return signTextures.get(n);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const c = canvas.getContext('2d');
  // Drawn like a tag projected by the scanner: dark glass, cyan frame, corner brackets.
  c.fillStyle = 'rgba(4, 14, 26, 0.82)';
  c.strokeStyle = 'rgba(94, 242, 255, 0.55)';
  c.lineWidth = 4;
  c.beginPath();
  c.rect(10, 10, 236, 140);
  c.fill();
  c.stroke();
  c.strokeStyle = '#5ef2ff';
  c.lineWidth = 10;
  c.beginPath();
  for (const [x, y, dx, dy] of [[10, 10, 1, 1], [246, 10, -1, 1], [10, 150, 1, -1], [246, 150, -1, -1]]) {
    c.moveTo(x + dx * 42, y);
    c.lineTo(x, y);
    c.lineTo(x, y + dy * 34);
  }
  c.stroke();
  c.shadowColor = '#5ef2ff';
  c.shadowBlur = 16;
  c.fillStyle = '#ffffff';
  c.font = 'bold 112px ui-monospace, Menlo, Consolas, monospace';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(String(n), 128, 86);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  signTextures.set(n, texture);
  return texture;
}

export const SIGN_ASPECT = 1.6;

// ---------- Blaster (points along -z) ----------

export function buildBlaster() {
  const body = mat(0x3a4258, { roughness: 0.45, metalness: 0.35 });
  const metal = mat(0x8f9ab2, { roughness: 0.3, metalness: 0.6 });
  const accent = mat(0xff7a1a, { roughness: 0.4, metalness: 0.3 });
  const grip = mat(0x15171d, { roughness: 0.9 });
  const cyan = glow(0x5ef2ff, 1.25);
  const g = new THREE.Group();
  const lengthwise = (mesh) => {
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  };

  g.add(rounded(0.13, 0.15, 0.46, body, 0, 0, -0.05, 0.03));
  g.add(rounded(0.15, 0.05, 0.3, metal, 0, 0.09, -0.1, 0.015));
  g.add(rounded(0.145, 0.04, 0.24, accent, 0, -0.06, -0.12, 0.012));
  g.add(lengthwise(limb(0.04, 0.04, 0.36, metal, 0, 0.01, -0.45, 16)));
  for (const z of [-0.36, -0.43, -0.5]) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.014, 8, 24), cyan);
    coil.position.set(0, 0.01, z);
    g.add(coil);
  }
  g.add(lengthwise(limb(0.07, 0.06, 0.07, body, 0, 0.01, -0.63, 16)));
  g.add(lengthwise(limb(0.035, 0.035, 0.012, cyan, 0, 0.01, -0.667, 16)));
  for (const z of [-0.18, -0.08, 0.02]) {
    g.add(box(0.012, 0.05, 0.06, 0, -0.068, 0.02, z, cyan));
    g.add(box(0.012, 0.05, 0.06, 0, 0.068, 0.02, z, cyan));
  }
  const handle = rounded(0.09, 0.22, 0.1, grip, 0, -0.17, 0.1, 0.025);
  handle.rotation.x = 0.3;
  g.add(handle);

  // Small screen on top, tilted toward whoever is holding the blaster.
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 80;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const housing = rounded(0.19, 0.125, 0.02, body, 0, 0.14, 0.09, 0.008);
  housing.rotation.x = -0.75;
  g.add(housing);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.165, 0.1),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  screen.position.set(0, 0.148, 0.099);
  screen.rotation.x = -0.75;
  g.add(screen);

  function setScreen(text) {
    const c = canvas.getContext('2d');
    c.fillStyle = '#06131c';
    c.fillRect(0, 0, 128, 80);
    c.fillStyle = '#5ef2ff';
    c.font = 'bold 58px ui-monospace, Menlo, Consolas, monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 64, 44);
    texture.needsUpdate = true;
  }
  setScreen('×?');

  return { group: g, setScreen };
}
