// Builds the farm: ground, grass, barn, farmhouse, silo, tractor, pasture fence, crop
// field, trees, hills, the night sky and a UFO circling overhead. Returns what the rest
// of the game needs to know about it (where the walls are, what blocks a shot, where
// the blaster lies).

import * as THREE from 'three';
import { PASTURE, BARN } from './config.js';
import { box, ball, limb, slab, rounded, prism, roof, mat, skin, glow } from './models.js';
import { seeded, fbm, smooth, surface, tiled, windowTexture, cloudTexture, glowTexture } from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildMeadow, buildCrop, wind, eye } from './grass.js';

const FIELD = { minX: 34, maxX: 64, minZ: -40, maxZ: 10 };
const YARD = { minX: -32, maxX: 30, minZ: -20, maxZ: 26 };
const HOUSE = { x: 20, z: 6, w: 9, d: 11, h: 4.6 };
const SILO = { x: -27, z: -9, r: 2.3 };
const HILLS_START = 128; // metres from the middle of the farm to where the land rises

function inside(rect, x, z, margin = 0) {
  return (
    x > rect.minX - margin && x < rect.maxX + margin && z > rect.minZ - margin && z < rect.maxZ + margin
  );
}

// A patch with a soft, uneven edge: 1 inside, 0 outside.
function softBox(x, z, cx, cz, halfW, halfD, edge, wobble) {
  const wander = (fbm(x / 40, z / 40, 4, 4, 3) - 0.5) * wobble;
  const d = Math.max(Math.abs(x - cx) - halfW, Math.abs(z - cz) - halfD) + wander;
  return 1 - smooth(-edge, edge, d);
}

// How bare the ground is at a spot: 1 on the trodden farmyard and the tracks, 0 on grass.
function dirtAt(x, z) {
  return Math.max(
    softBox(x, z, -5, 2, 19, 19, 2.5, 5),
    softBox(x, z, PASTURE.gateX, -22, 2.2, 5, 1.2, 1.2),
    softBox(x, z, -3, 72, 2.4, 54, 1.2, 1.6),
  );
}

// Height of the land. Flat where the game is played, rolling hills beyond.
function heightAt(x, z) {
  const r = Math.hypot(x, z);
  if (r <= HILLS_START) return 0;
  const rise = smooth(HILLS_START, 250, r);
  return rise * (5 + 70 * fbm(x / 900 + 0.5, z / 900 + 0.5, 5, 5, 4) ** 1.4) - 0.3 * (1 - rise);
}

function skyShade(out, x, y, z) {
  const ZENITH = skyShade.zenith;
  const flat = Math.hypot(x, z);
  const west = flat > 0.001 ? Math.max(0, -x / flat) : 0;
  if (y < 0) {
    // Below the horizon: only seen in reflections, where it stands in for the dark land.
    return out.copy(skyShade.land).lerp(skyShade.horizon, Math.max(0, 1 + y * 8));
  }
  out.copy(skyShade.horizon).lerp(ZENITH, Math.min(1, y * 2.4) ** 0.8);
  return out.lerp(skyShade.ember, west ** 3 * (1 - y) ** 9 * 0.95);
}
skyShade.zenith = new THREE.Color(0x050920);
skyShade.horizon = new THREE.Color(0x3b2e60);
skyShade.ember = new THREE.Color(0xe8743c);
skyShade.land = new THREE.Color(0x0c120c);

export function buildWorld(scene, renderer) {
  const colliders = { boxes: [], circles: [] };
  const solids = []; // meshes that stop a blaster shot
  const rand = seeded(11);

  // Adds a box to the scene; `solid` stops shots, `collide` stops the player.
  function block(w, h, d, material, x, y, z, { solid = false, collide = false, tile = 2 } = {}) {
    const mesh = slab(w, h, d, material, x, y, z, tile);
    scene.add(mesh);
    if (solid) solids.push(mesh);
    if (collide) {
      colliders.boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    }
    return mesh;
  }
  const WALL = { solid: true, collide: true };

  function addGroup(group, { solid = false } = {}) {
    scene.add(group);
    if (solid) {
      group.updateMatrixWorld(true);
      group.traverse((child) => {
        if (child.isMesh) solids.push(child);
      });
    }
  }

  // ---------- Sky ----------

  // Dusk: a dark sky with the last of the sunset in the west, lit by the moon.
  scene.background = skyShade.zenith;
  scene.fog = new THREE.Fog(skyShade.horizon, 70, 320);

  const skyGeometry = new THREE.SphereGeometry(480, 48, 32);
  const skyPos = skyGeometry.attributes.position;
  const skyColors = new Float32Array(skyPos.count * 3);
  const shade = new THREE.Color();
  for (let i = 0; i < skyPos.count; i++) {
    skyShade(shade, skyPos.getX(i) / 480, skyPos.getY(i) / 480, skyPos.getZ(i) / 480);
    skyColors.set([shade.r, shade.g, shade.b], i * 3);
  }
  skyGeometry.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
  const sky = new THREE.Mesh(
    skyGeometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  scene.add(sky);

  // The sky also lights the scene softly and shows up in polished metal.
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const skyOnly = new THREE.Scene();
    skyOnly.add(sky.clone());
    scene.environment = pmrem.fromScene(skyOnly, 0, 1, 1000).texture;
    scene.environmentIntensity = 0.9;
    pmrem.dispose();
  }

  const starRand = seeded(3);
  const starMap = glowTexture('rgba(255, 255, 255, 1)', 'rgba(255, 255, 255, 0.3)');
  for (const [count, size, color] of [[1100, 3, 0xc8d4ff], [130, 5.5, 0xffffff]]) {
    const starPositions = [];
    while (starPositions.length < count * 3) {
      const v = new THREE.Vector3(starRand() - 0.5, starRand() * 0.5, starRand() - 0.5).normalize();
      if (v.y > 0.1) starPositions.push(v.x * 460, v.y * 460, v.z * 460);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    scene.add(
      new THREE.Points(
        starGeometry,
        new THREE.PointsMaterial({
          color,
          size,
          map: starMap,
          sizeAttenuation: false,
          fog: false,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );
  }

  const moonMaterial = new THREE.MeshBasicMaterial({ map: surface('moon').map, fog: false });
  moonMaterial.color.setScalar(0.95);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(15, 32, 20), moonMaterial);
  moon.position.set(295, 285, -110);
  moon.rotation.y = 2.2;
  scene.add(moon);
  const moonHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('rgba(200, 215, 255, 0.28)', 'rgba(150, 170, 255, 0.1)'),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  moonHalo.scale.setScalar(150);
  moonHalo.position.copy(moon.position);
  scene.add(moonHalo);

  // Clouds: soft dark shapes, catching the last light where they hang in the west.
  const clouds = [];
  const cloudMaps = [cloudTexture(21), cloudTexture(22), cloudTexture(23)];
  const cloudNight = new THREE.Color(0x343a5e);
  const cloudEmber = new THREE.Color(0x9a5c50);
  for (let i = 0; i < 16; i++) {
    const angle = rand() * Math.PI * 2;
    const distance = 170 + rand() * 230;
    const material = new THREE.SpriteMaterial({
      map: cloudMaps[i % cloudMaps.length],
      transparent: true,
      opacity: 0.35 + rand() * 0.3,
      depthWrite: false,
      fog: false,
    });
    const cloud = new THREE.Sprite(material);
    const width = 150 + rand() * 130;
    cloud.scale.set(width, width * (0.2 + rand() * 0.1), 1);
    cloud.position.set(Math.cos(angle) * distance, 60 + rand() * 75, Math.sin(angle) * distance);
    cloud.renderOrder = -2;
    scene.add(cloud);
    clouds.push(cloud);
  }
  function tintClouds() {
    for (const cloud of clouds) {
      const p = cloud.position;
      const west = Math.max(0, -p.x / Math.hypot(p.x, p.z));
      const low = 1 - Math.min(1, (p.y - 60) / 75);
      cloud.material.color.copy(cloudNight).lerp(cloudEmber, west ** 2 * (0.35 + low * 0.65));
    }
  }

  // ---------- Light ----------

  scene.add(new THREE.HemisphereLight(0x8494d8, 0x3a4658, 1.25));
  const sun = new THREE.DirectionalLight(0xb9c9ff, 2.2); // the moon, in fact
  sun.position.set(60, 58, -40);
  sun.target.position.set(0, 0, -22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.left = -75;
  sun.shadow.camera.right = 75;
  sun.shadow.camera.top = 75;
  sun.shadow.camera.bottom = -75;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  // The afterglow of the sunset, low in the west: a warm edge on everything.
  const afterglow = new THREE.DirectionalLight(0xffb48a, 0.35);
  afterglow.position.set(-90, 14, 12);
  scene.add(afterglow);

  // ---------- Ground ----------

  const grassSurface = surface('grass');
  const groundGeometry = new THREE.PlaneGeometry(700, 700, 100, 100);
  groundGeometry.rotateX(-Math.PI / 2);
  const groundPos = groundGeometry.attributes.position;
  const groundColors = new Float32Array(groundPos.count * 3);
  for (let i = 0; i < groundPos.count; i++) {
    const k = 0.7 + 0.5 * fbm(groundPos.getX(i) / 260 + 0.5, groundPos.getZ(i) / 260 + 0.5, 4, 4, 4);
    groundColors.set([k, k, k * 0.96], i * 3);
  }
  groundGeometry.setAttribute('color', new THREE.BufferAttribute(groundColors, 3));
  const ground = new THREE.Mesh(
    groundGeometry,
    new THREE.MeshStandardMaterial({
      map: tiled(grassSurface.map, 100),
      bumpMap: tiled(grassSurface.bumpMap, 100),
      bumpScale: 2,
      roughness: 1,
      vertexColors: true,
    }),
  );
  ground.receiveShadow = true;
  scene.add(ground);

  const blocked = [
    { minX: BARN.x - BARN.w / 2, maxX: BARN.x + BARN.w / 2, minZ: BARN.z - BARN.d / 2, maxZ: BARN.z + BARN.d / 2 },
    {
      minX: HOUSE.x - HOUSE.w / 2 - 1.2,
      maxX: HOUSE.x + HOUSE.w / 2,
      minZ: HOUSE.z - HOUSE.d / 2,
      maxZ: HOUSE.z + HOUSE.d / 2,
    },
    FIELD,
  ];
  function noGrass(x, z) {
    return blocked.some((rect) => inside(rect, x, z, 0.4)) || Math.hypot(x - SILO.x, z - SILO.z) < SILO.r + 0.4;
  }

  // Bare earth laid over the grass where it is trodden: one mask says where.
  const DIRT_SIZE = 256;
  const DIRT_CENTRE = { x: 0, z: 10 };
  const maskSize = 512;
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = maskCanvas.height = maskSize;
  const maskContext = maskCanvas.getContext('2d');
  const maskImage = maskContext.createImageData(maskSize, maskSize);
  for (let py = 0; py < maskSize; py++) {
    for (let px = 0; px < maskSize; px++) {
      const x = DIRT_CENTRE.x + ((px + 0.5) / maskSize - 0.5) * DIRT_SIZE;
      const z = DIRT_CENTRE.z + ((py + 0.5) / maskSize - 0.5) * DIRT_SIZE;
      const bare = dirtAt(x, z);
      const i = (py * maskSize + px) * 4;
      maskImage.data[i] = (noGrass(x, z) ? 1 : bare) * 255; // red: nothing grows here
      maskImage.data[i + 1] = bare * 255; // green: how much bare earth shows
      maskImage.data[i + 3] = 255;
    }
  }
  maskContext.putImageData(maskImage, 0, 0);
  const mask = new THREE.CanvasTexture(maskCanvas);
  const dirtSurface = surface('dirt');
  const dirt = new THREE.Mesh(
    new THREE.PlaneGeometry(DIRT_SIZE, DIRT_SIZE),
    new THREE.MeshStandardMaterial({
      map: tiled(dirtSurface.map, DIRT_SIZE / 5),
      bumpMap: tiled(dirtSurface.bumpMap, DIRT_SIZE / 5),
      bumpScale: 2,
      alphaMap: mask,
      transparent: true,
      depthWrite: false,
      roughness: 1,
    }),
  );
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.set(DIRT_CENTRE.x, 0.02, DIRT_CENTRE.z);
  dirt.receiveShadow = true;
  dirt.renderOrder = -1;
  scene.add(dirt);

  function flat(w, d, name, x, z, { y = 0.03, tile = 4, color = 0xffffff } = {}) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      skin(name, { repeat: w / tile, repeatY: d / tile, color, roughness: 1, bump: 2 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  flat(FIELD.maxX - FIELD.minX, FIELD.maxZ - FIELD.minZ, 'soil', 49, -15);

  // ---------- Barn ----------

  const { x: bx, z: bz, w: W, d: D, h: H, doorW, doorH } = BARN;
  const T = 0.4;
  const barnRed = skin('barnWall', { roughness: 0.9, bump: 3 });
  const barnDoor = skin('barnDoor', { roughness: 0.9, bump: 3 });
  const trim = mat(0xd9d3c4, { roughness: 0.75 });
  const side = (W - doorW) / 2;
  const front = bz + D / 2;
  const BOARDS = { ...WALL, tile: 2.2 };

  block(W, H, T, barnRed, bx, H / 2, bz - D / 2, BOARDS);
  block(T, H, D, barnRed, bx - W / 2, H / 2, bz, BOARDS);
  block(T, H, D, barnRed, bx + W / 2, H / 2, bz, BOARDS);
  block(side, H, T, barnRed, bx - W / 2 + side / 2, H / 2, front, BOARDS);
  block(side, H, T, barnRed, bx + W / 2 - side / 2, H / 2, front, BOARDS);
  block(doorW, H - doorH, T, barnRed, bx, doorH + (H - doorH) / 2, front, { solid: true, tile: 2.2 });
  block(0.28, doorH, 0.1, trim, bx - doorW / 2 - 0.14, doorH / 2, front + 0.24);
  block(0.28, doorH, 0.1, trim, bx + doorW / 2 + 0.14, doorH / 2, front + 0.24);
  block(doorW + 0.84, 0.28, 0.1, trim, bx, doorH + 0.14, front + 0.24);
  block(W + 0.2, 0.3, 0.1, trim, bx, H - 0.15, front + 0.24);
  for (const dir of [-1, 1]) block(0.3, H, 0.3, trim, bx + (dir * W) / 2, H / 2, front + 0.06);

  // Doors standing open.
  for (const dir of [-1, 1]) {
    const doorX = bx + dir * (doorW / 2 + 0.3);
    block(0.14, doorH, doorW / 2, barnDoor, doorX, doorH / 2, front + doorW / 4 + 0.2, { ...WALL, tile: 2.2 });
    block(0.18, 0.2, doorW / 2, trim, doorX, doorH - 0.2, front + doorW / 4 + 0.2);
    block(0.18, 0.2, doorW / 2, trim, doorX, 0.2, front + doorW / 4 + 0.2);
    block(0.18, doorH, 0.2, trim, doorX, doorH / 2, front + 0.3);
    block(0.18, doorH, 0.2, trim, doorX, doorH / 2, front + doorW / 2 + 0.1);
  }

  const roofMetal = skin('metal', { color: 0x777c86, roughness: 0.5, metalness: 0.55, bump: 3 });
  const barnRoof = roof(W + 1.4, 3.4, D + 1.4, roofMetal, 3);
  barnRoof.position.set(bx, H, bz);
  addGroup(barnRoof, { solid: true });
  // The triangle of wall under the roof, front and back.
  for (const z of [front + 0.02, bz - D / 2 - 0.02]) {
    const gable = prism(W, 3.4 * (W / (W + 1.4)), T, barnRed, 2.2);
    gable.position.set(bx, H, z);
    addGroup(gable, { solid: true });
  }
  block(1.3, 1.3, 0.1, mat(0x1a1410), bx, H + 1.15, front + 0.26);
  block(1.6, 0.14, 0.14, trim, bx, H + 1.87, front + 0.28);
  block(1.6, 0.14, 0.14, trim, bx, H + 0.43, front + 0.28);
  block(0.14, 1.58, 0.14, trim, bx - 0.73, H + 1.15, front + 0.28);
  block(0.14, 1.58, 0.14, trim, bx + 0.73, H + 1.15, front + 0.28);
  const barnFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(W - T, D - T),
    skin('dirt', { repeat: 4, color: 0xc9b07a, roughness: 1, bump: 2 }),
  );
  barnFloor.rotation.x = -Math.PI / 2;
  barnFloor.position.set(bx, 0.04, bz);
  barnFloor.receiveShadow = true;
  scene.add(barnFloor);

  // Lamp over the barn door.
  const lampGlow = glow(0xffd98a, 2.4);
  scene.add(limb(0.05, 0.3, 0.18, mat(0x30343a, { metalness: 0.8, roughness: 0.4 }), bx, doorH + 0.92, front + 0.45, 16));
  scene.add(ball(0.11, 0.13, 0.11, lampGlow, bx, doorH + 0.8, front + 0.45));
  const barnLamp = new THREE.PointLight(0xffc070, 14, 20, 1.6);
  barnLamp.position.set(bx, doorH + 0.5, front + 1.6);
  scene.add(barnLamp);

  // Hay inside, including the stack the blaster rests on.
  const hay = skin('straw', { roughness: 1, bump: 3 });
  const HAY = { ...WALL, tile: 1 };
  const gunSpot = new THREE.Vector3(bx, 1.75, bz - 2.6);
  block(1.6, 0.9, 1.6, hay, gunSpot.x, 0.45, gunSpot.z, HAY);
  block(2.2, 1.0, 1.3, hay, bx - 4.3, 0.5, bz - 3.9, HAY);
  block(2.2, 1.0, 1.3, hay, bx - 4.3, 1.5, bz - 3.9, { solid: true, tile: 1 });
  block(1.3, 1.0, 2.2, hay, bx + 4.6, 0.5, bz - 3.4, HAY);

  // ---------- Farmhouse ----------

  const { x: hx, z: hz, w: HW, d: HD, h: HH } = HOUSE;
  const siding = skin('siding', { roughness: 0.85, bump: 2.5 });
  block(HW, HH, HD, siding, hx, HH / 2, hz, WALL);
  for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    block(0.24, HH, 0.24, trim, hx + (dx * HW) / 2, HH / 2, hz + (dz * HD) / 2);
  }
  block(HW + 0.3, 0.3, HD + 0.3, mat(0x8f8f88), hx, 0.15, hz);
  const roofTiles = skin('roofTiles', { rotation: Math.PI / 2, roughness: 0.85, bump: 3 });
  const houseRoof = roof(HW + 1.2, 3, HD + 1.2, roofTiles, 2.6);
  houseRoof.position.set(hx, HH, hz);
  addGroup(houseRoof, { solid: true });
  for (const z of [hz + HD / 2 - 0.05, hz - HD / 2 + 0.05]) {
    const gable = prism(HW, 3 * (HW / (HW + 1.2)), 0.2, siding, 2);
    gable.position.set(hx, HH, z);
    addGroup(gable, { solid: true });
  }
  block(0.9, 2.4, 0.9, skin('brick', { roughness: 0.9, bump: 3 }), hx + 2.2, HH + 1.9, hz - 2.5, { tile: 1.2 });
  block(1.06, 0.14, 1.06, mat(0x6a6660), hx + 2.2, HH + 3.15, hz - 2.5);

  // Someone is home: the windows are lit.
  const windowMaterial = new THREE.MeshBasicMaterial({ map: windowTexture() });
  windowMaterial.color.setScalar(1.15);
  const west = hx - HW / 2;
  function houseWindow(x, y, z, facing) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.3), windowMaterial);
    pane.position.set(x, y, z);
    pane.rotation.y = facing;
    scene.add(pane);
    const sill = slab(1.7, 0.1, 0.2, trim, x, y - 0.72, z, 1.5);
    sill.rotation.y = facing;
    scene.add(sill);
  }
  houseWindow(west - 0.03, 2.5, hz - 3.3, -Math.PI / 2);
  houseWindow(west - 0.03, 2.5, hz + 3.3, -Math.PI / 2);
  for (const dx of [-2.2, 2.2]) {
    houseWindow(hx + dx, 2.5, hz + HD / 2 + 0.03, 0);
    houseWindow(hx + dx, 2.5, hz - HD / 2 - 0.03, Math.PI);
  }
  // Front door, step and a small roof over it.
  block(0.1, 2.2, 1.2, skin('wood', { color: 0x9a6a48, bump: 2 }), west - 0.05, 1.25, hz, { tile: 1.2 });
  block(0.12, 2.4, 0.14, trim, west - 0.06, 1.35, hz - 0.67);
  block(0.12, 2.4, 0.14, trim, west - 0.06, 1.35, hz + 0.67);
  block(0.12, 0.14, 1.48, trim, west - 0.06, 2.48, hz);
  block(1.0, 0.25, 2.2, mat(0x9c9c94), west - 0.5, 0.125, hz, { collide: true });
  const canopy = slab(1.5, 0.1, 2.6, roofTiles, west - 0.72, 2.95, hz, 2.6);
  canopy.rotation.z = 0.22;
  scene.add(canopy);
  scene.add(ball(0.09, 0.11, 0.09, lampGlow, west - 0.2, 2.7, hz + 0.95));
  const porchLight = new THREE.PointLight(0xffc070, 26, 22, 1.6);
  porchLight.position.set(west - 2.5, 2.6, hz);
  scene.add(porchLight);

  // ---------- Silo ----------

  const siloMetal = skin('metal', { repeat: 5, repeatY: 3, roughness: 0.45, metalness: 0.7, bump: 2 });
  const silo = new THREE.Mesh(new THREE.CylinderGeometry(SILO.r, SILO.r, 9, 40), siloMetal);
  silo.position.set(SILO.x, 4.5, SILO.z);
  silo.castShadow = silo.receiveShadow = true;
  scene.add(silo);
  solids.push(silo);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(SILO.r, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(0x8d949c, { roughness: 0.4, metalness: 0.75 }),
  );
  cap.scale.y = 0.75;
  cap.position.set(SILO.x, 9, SILO.z);
  cap.castShadow = true;
  scene.add(cap);
  colliders.circles.push({ x: SILO.x, z: SILO.z, r: SILO.r });

  // ---------- Tractor ----------

  const tractor = new THREE.Group();
  const paint = mat(0x2a7d36, { roughness: 0.35, metalness: 0.35 });
  const frame = mat(0x25282d, { roughness: 0.5, metalness: 0.7 });
  const tyre = mat(0x141416, { roughness: 0.95 });
  const hubcap = mat(0xe0b020, { roughness: 0.4, metalness: 0.4 });
  const lamp = glow(0xffe89a, 2.2);
  tractor.add(rounded(1.2, 0.5, 3.0, frame, 0, 0.95, 0, 0.06));
  tractor.add(rounded(1.0, 0.8, 1.5, paint, 0, 1.5, 0.8, 0.12));
  tractor.add(rounded(1.25, 0.75, 1.35, paint, 0, 1.45, -0.8, 0.1));
  tractor.add(rounded(0.7, 0.15, 0.6, frame, 0, 1.9, -0.9, 0.05));
  for (const [px, pz] of [[0.57, -0.2], [-0.57, -0.2], [0.57, -1.4], [-0.57, -1.4]]) {
    tractor.add(limb(0.04, 0.04, 1.3, frame, px, 2.45, pz, 8));
  }
  tractor.add(rounded(1.45, 0.12, 1.5, paint, 0, 3.15, -0.8, 0.05));
  tractor.add(limb(0.05, 0.05, 0.9, frame, 0.32, 2.3, 1.2, 10));
  tractor.add(limb(0.07, 0.05, 0.14, frame, 0.32, 2.8, 1.2, 10));
  tractor.add(box(0.9, 0.5, 0.04, 0, 0, 1.5, 1.56, mat(0x15171b, { roughness: 0.6, metalness: 0.6 })));
  tractor.add(ball(0.12, 0.09, 0.04, lamp, 0.32, 1.72, 1.56));
  tractor.add(ball(0.12, 0.09, 0.04, lamp, -0.32, 1.72, 1.56));
  for (const [wx, wy, wz, wr, ww] of [
    [0.9, 0.9, -0.9, 0.9, 0.5],
    [-0.9, 0.9, -0.9, 0.9, 0.5],
    [0.72, 0.5, 1.25, 0.5, 0.34],
    [-0.72, 0.5, 1.25, 0.5, 0.34],
  ]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(wr - ww * 0.42, ww * 0.42, 12, 28), tyre);
    wheel.position.set(wx, wy, wz);
    wheel.rotation.y = Math.PI / 2;
    wheel.castShadow = true;
    tractor.add(wheel);
    const hub = limb(wr * 0.55, wr * 0.55, ww * 0.5, hubcap, wx, wy, wz, 20);
    hub.rotation.z = Math.PI / 2;
    tractor.add(hub);
  }
  tractor.position.set(8, 0, -8);
  tractor.rotation.y = -0.7;
  addGroup(tractor, { solid: true });
  colliders.circles.push({ x: 8, z: -8, r: 2.1 });

  // ---------- Round hay bales in the yard ----------

  const baleSide = skin('straw', { repeat: 3, repeatY: 1, roughness: 1, bump: 3 });
  for (const [x, z, turn] of [[-6, -3, 0.2], [-4.3, -3.6, 0.5], [3, -3, 1.3], [12, 14, 0.8]]) {
    const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 28), baleSide);
    bale.position.set(x, 0.75, z);
    bale.rotation.set(0, turn, Math.PI / 2);
    bale.castShadow = bale.receiveShadow = true;
    scene.add(bale);
    solids.push(bale);
    colliders.circles.push({ x, z, r: 0.85 });
  }

  // ---------- Pasture fence ----------

  const postWood = skin('bark', { repeat: 2, repeatY: 1, color: 0xd8c0a0, bump: 3 });
  const railWood = skin('bark', { rotation: Math.PI / 2, color: 0xd8c0a0, bump: 3 });
  const { minX, maxX, minZ, maxZ, gateX, gateWidth } = PASTURE;
  const runs = [
    [minX, minZ, maxX, minZ],
    [minX, minZ, minX, maxZ],
    [maxX, minZ, maxX, maxZ],
    [minX, maxZ, gateX - gateWidth / 2, maxZ],
    [gateX + gateWidth / 2, maxZ, maxX, maxZ],
  ];
  const posts = [];
  for (const [x1, z1, x2, z2] of runs) {
    const alongX = z1 === z2;
    const length = alongX ? x2 - x1 : z2 - z1;
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    for (const y of [0.42, 0.74, 1.06]) {
      scene.add(slab(alongX ? length : 0.06, 0.13, alongX ? 0.06 : length, railWood, cx, y, cz, 1.4));
    }
    const count = Math.max(1, Math.round(length / 2.6));
    for (let i = 0; i <= count; i++) {
      const k = i / count;
      posts.push([x1 + (x2 - x1) * k, z1 + (z2 - z1) * k]);
    }
    colliders.boxes.push({
      minX: Math.min(x1, x2) - 0.15,
      maxX: Math.max(x1, x2) + 0.15,
      minZ: Math.min(z1, z2) - 0.15,
      maxZ: Math.max(z1, z2) + 0.15,
    });
  }
  const postMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.085, 0.1, 1.35, 8), postWood, posts.length);
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const posVec = new THREE.Vector3();
  posts.forEach(([x, z], i) => {
    // No two posts are quite the same height or quite upright.
    quat.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.08, rand() * 6, (rand() - 0.5) * 0.08));
    postMesh.setMatrixAt(i, m4.compose(posVec.set(x, 0.66, z), quat, scale.set(1, 0.96 + rand() * 0.1, 1)));
  });
  postMesh.castShadow = true;
  postMesh.receiveShadow = true;
  scene.add(postMesh);
  for (const dir of [-1, 1]) {
    scene.add(limb(0.15, 0.17, 1.9, postWood, gateX + (dir * gateWidth) / 2, 0.95, maxZ, 10));
  }

  // ---------- Scarecrow ----------

  const scarecrow = new THREE.Group();
  const shirt = skin('cloth', { repeat: 2, color: 0x4a6fa5, roughness: 1, bump: 2 });
  const sack = skin('cloth', { repeat: 2, color: 0xc9a56a, roughness: 1, bump: 3 });
  const felt = mat(0x3c2d1c, { roughness: 1 });
  scarecrow.add(limb(0.06, 0.07, 2.4, postWood, 0, 1.2, 0, 8));
  const arms = limb(0.045, 0.045, 1.9, postWood, 0, 1.75, 0, 8);
  arms.rotation.z = Math.PI / 2;
  scarecrow.add(arms);
  scarecrow.add(ball(0.4, 0.48, 0.2, shirt, 0, 1.5, 0));
  const sleeves = ball(0.85, 0.11, 0.11, shirt, 0, 1.75, 0);
  scarecrow.add(sleeves);
  scarecrow.add(ball(0.27, 0.29, 0.27, sack, 0, 2.3, 0));
  scarecrow.add(limb(0.5, 0.52, 0.04, felt, 0, 2.52, 0, 20));
  scarecrow.add(limb(0.2, 0.26, 0.3, felt, 0, 2.68, 0, 20));
  scarecrow.position.set(47, 0, -12);
  scarecrow.rotation.y = -1.2;
  addGroup(scarecrow, { solid: true });
  colliders.circles.push({ x: 47, z: -12, r: 0.4 });

  // ---------- Trees ----------

  // A lumpy ball of foliage; a tree's crown is several of these.
  function crownGeometry(seed) {
    const geometry = new THREE.SphereGeometry(1, 13, 9);
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const lump = fbm(x * 0.5 + z * 0.23 + seed, y * 0.5 - z * 0.31 + seed * 0.7, 3, 3, 3);
      const r = 0.74 + lump * 0.6;
      pos.setXYZ(i, x * r, y * r * (y < 0 ? 0.8 : 1), z * r);
    }
    geometry.computeVertexNormals();
    return geometry;
  }
  const crowns = [crownGeometry(0.1), crownGeometry(1.7), crownGeometry(3.3)];
  const tierGeometry = new THREE.ConeGeometry(1, 1, 14, 1, true);
  const foliage = [0xffffff, 0xd8f0c0, 0xc8d8a8].map((color) =>
    skin('leaves', { repeat: 4, repeatY: 3, color, roughness: 1, bump: 4 }),
  );
  const needles = skin('leaves', { repeat: 6, repeatY: 2, color: 0x7fa890, roughness: 1, bump: 4 });
  needles.side = THREE.DoubleSide; // the tiers are open underneath
  const bark = skin('bark', { repeat: 2, repeatY: 2, roughness: 1, bump: 4 });
  const trunkGeometry = new THREE.CylinderGeometry(0.6, 1, 1, 9);

  // A tree is two meshes, trunk and foliage, however many lumps or tiers it has.
  const part = new THREE.Matrix4();
  const partTurn = new THREE.Quaternion();
  const partEuler = new THREE.Euler();
  function shaped(geometry, x, y, z, sx, sy, sz, turn) {
    partTurn.setFromEuler(partEuler.set(0, turn, 0));
    return geometry.clone().applyMatrix4(part.compose(posVec.set(x, y, z), partTurn, scale.set(sx, sy, sz)));
  }

  function leafy(s) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeometry, bark);
    trunk.scale.set(0.4 * s, 3.6 * s, 0.4 * s);
    trunk.position.y = 1.8 * s;
    tree.add(trunk);
    const lumps = 7 + Math.floor(rand() * 4);
    const parts = [];
    for (let i = 0; i < lumps; i++) {
      const around = (i / lumps) * Math.PI * 2 + rand();
      const out = i === 0 ? 0 : (1.0 + rand() * 1.1) * s;
      const size = (i === 0 ? 2.1 : 1.2 + rand() * 0.7) * s;
      parts.push(
        shaped(
          crowns[Math.floor(rand() * crowns.length)],
          Math.cos(around) * out,
          (i === 0 ? 5.2 : 3.6 + rand() * 1.8) * s,
          Math.sin(around) * out,
          size,
          size * (0.8 + rand() * 0.2),
          size,
          rand() * 6,
        ),
      );
    }
    tree.add(new THREE.Mesh(mergeGeometries(parts), foliage[Math.floor(rand() * foliage.length)]));
    return tree;
  }

  function spruce(s) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeometry, bark);
    trunk.scale.set(0.24 * s, 2.0 * s, 0.24 * s);
    trunk.position.y = 1.0 * s;
    tree.add(trunk);
    const tiers = 6;
    const parts = [];
    for (let i = 0; i < tiers; i++) {
      const k = i / (tiers - 1);
      const wide = (1.75 - k * 1.3) * s;
      parts.push(shaped(tierGeometry, 0, (1.9 + i * 0.95) * s, 0, wide, (1.9 - k * 0.5) * s, wide, rand() * 6));
    }
    tree.add(new THREE.Mesh(mergeGeometries(parts), needles));
    return tree;
  }

  const keepClear = [
    { rect: YARD, margin: 2 },
    { rect: PASTURE, margin: 5 },
    { rect: FIELD, margin: 3 },
    { rect: { minX: -7, maxX: 1, minZ: 20, maxZ: 200 }, margin: 2 },
  ];
  let placed = 0;
  while (placed < 64) {
    const x = (rand() - 0.5) * 260;
    const z = (rand() - 0.5) * 260;
    if (keepClear.some(({ rect, margin }) => inside(rect, x, z, margin))) continue;
    const s = 0.85 + rand() * 0.75;
    const tree = rand() < 0.38 ? spruce(s * 1.25) : leafy(s * 1.25);
    tree.position.set(x, heightAt(x, z) - 0.1, z);
    tree.rotation.y = rand() * Math.PI;
    tree.traverse((child) => {
      if (child.isMesh) child.castShadow = child.receiveShadow = true;
    });
    addGroup(tree, { solid: true });
    colliders.circles.push({ x, z, r: 0.42 * s });
    placed += 1;
  }

  // ---------- Grass, wildflowers and the crop ----------

  const meadow = buildMeadow({
    count: 60000,
    mask,
    area: { x: DIRT_CENTRE.x, z: DIRT_CENTRE.z, size: DIRT_SIZE },
    colours: [0x486a2a, 0x567a30, 0x638836, 0x4e702c, 0x6f8a40],
  });
  scene.add(meadow.mesh);
  const pastureCentre = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };

  const flowerSpots = [];
  while (flowerSpots.length < 2200) {
    const x = (rand() - 0.5) * 190;
    const z = (rand() - 0.5) * 190;
    if (!noGrass(x, z) && dirtAt(x, z) < 0.05) flowerSpots.push([x, z]);
  }
  const flowers = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.03, 6, 4),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    flowerSpots.length,
  );
  const petal = new THREE.Color();
  const petals = [0xf4f1e6, 0xf2d24a, 0xe58fb4, 0xc8a8f0, 0xf4f1e6];
  flowerSpots.forEach(([x, z], i) => {
    flowers.setMatrixAt(i, m4.makeTranslation(x, heightAt(x, z) + 0.24 + rand() * 0.1, z));
    flowers.setColorAt(i, petal.setHex(petals[Math.floor(rand() * petals.length)]));
  });
  scene.add(flowers);

  const stalks = [];
  for (let x = FIELD.minX + 0.6; x < FIELD.maxX - 0.4; x += 0.5) {
    for (let z = FIELD.minZ + 0.5; z < FIELD.maxZ - 0.3; z += 0.42) {
      stalks.push([x + (rand() - 0.5) * 0.2, z + (rand() - 0.5) * 0.3, 0.85 + rand() * 0.35]);
    }
  }
  const wheat = buildCrop(stalks, {
    blades: 4,
    height: 1.0,
    width: 0.09,
    lean: 0.16,
    sway: 0.16,
    colours: [0x9a8038, 0xa88e48, 0x8c7030, 0xb09a58],
  });
  scene.add(wheat.group);

  // ---------- Hills on the horizon ----------

  const RINGS = 28;
  const SPOKES = 120;
  const hillPositions = [];
  const hillColors = [];
  const hillIndices = [];
  for (let i = 0; i <= RINGS; i++) {
    const r = HILLS_START - 2 + (i / RINGS) ** 1.25 * 360;
    for (let j = 0; j <= SPOKES; j++) {
      const angle = (j / SPOKES) * Math.PI * 2;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const y = r <= HILLS_START ? -0.3 : heightAt(x, z);
      hillPositions.push(x, y, z);
      // Meadow low down, dark forest higher up.
      const wooded = smooth(6, 26, y + 14 * fbm(x / 120, z / 120, 4, 4, 3));
      const tone = 0.75 + 0.5 * fbm(x / 60 + 0.3, z / 60 + 0.6, 4, 4, 3);
      hillColors.push((0.11 - wooded * 0.06) * tone, (0.19 - wooded * 0.09) * tone, (0.07 - wooded * 0.03) * tone);
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SPOKES; j++) {
      const a = i * (SPOKES + 1) + j;
      const b = a + SPOKES + 1;
      hillIndices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const hillGeometry = new THREE.BufferGeometry();
  hillGeometry.setAttribute('position', new THREE.Float32BufferAttribute(hillPositions, 3));
  hillGeometry.setAttribute('color', new THREE.Float32BufferAttribute(hillColors, 3));
  hillGeometry.setIndex(hillIndices);
  hillGeometry.computeVertexNormals();
  const hills = new THREE.Mesh(
    hillGeometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }),
  );
  hills.receiveShadow = true;
  scene.add(hills);

  // Spruce forest on the slopes, far too distant to need more than an outline.
  const farTree = mergeGeometries(
    [0, 1, 2].map((i) => new THREE.ConeGeometry(1 - i * 0.26, 1.5, 7).translate(0, 0.75 + i * 0.85, 0)),
  );
  const forestSpots = [];
  while (forestSpots.length < 2600) {
    const angle = rand() * Math.PI * 2;
    const r = HILLS_START + 4 + rand() ** 1.5 * 250;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    // Trees gather in stands, leaving meadows between them.
    if (fbm(x / 140, z / 140, 4, 4, 3) < 0.36 + rand() * 0.2) continue;
    forestSpots.push([x, heightAt(x, z), z, 3.2 + rand() * 3.2]);
  }
  const forest = new THREE.InstancedMesh(farTree, new THREE.MeshLambertMaterial({ color: 0x1e3a26 }), forestSpots.length);
  forestSpots.forEach(([x, y, z, tall], i) => {
    forest.setMatrixAt(i, m4.compose(posVec.set(x, y - 0.4, z), quat.identity(), scale.set(tall * 0.42, tall, tall * 0.42)));
  });
  scene.add(forest);

  // ---------- UFO ----------

  const ufo = new THREE.Group();
  const hullMetal = mat(0x8e97ab, { roughness: 0.22, metalness: 0.95 });
  const profile = [
    [0, -1.05], [2.6, -1.05], [3.6, -0.85], [4.7, -0.42], [4.85, -0.3], [4.7, -0.18],
    [3.4, 0.2], [2.5, 0.48], [2.2, 0.55],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const hull = new THREE.Mesh(new THREE.LatheGeometry(profile, 56), hullMetal);
  hull.castShadow = true;
  ufo.add(hull);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x7dffd0, transparent: true, opacity: 0.8, fog: false }),
  );
  dome.material.color.multiplyScalar(1.3);
  dome.position.y = 0.5;
  ufo.add(dome);
  const lamps = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    lamps.add(ball(0.26, 0.2, 0.26, glow(i % 2 ? 0xffe066 : 0xff5ad0, 2.5), Math.cos(a) * 4.1, -0.62, Math.sin(a) * 4.1));
  }
  ufo.add(lamps);

  // Glowing belly and a searchlight sweeping the pasture.
  const BEAM = 0xb4ffe2;
  const belly = new THREE.Mesh(new THREE.CircleGeometry(2.5, 40), glow(BEAM, 2));
  belly.rotation.x = Math.PI / 2;
  belly.position.y = -1.07;
  ufo.add(belly);
  const beamCone = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 7.5, 40, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color: BEAM,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  beamCone.position.y = -21;
  ufo.add(beamCone);
  const searchlight = new THREE.SpotLight(0xd8fff0, 2.2, 0, 0.2, 0.7, 0);
  searchlight.target.position.set(0, -40, 0);
  ufo.add(searchlight, searchlight.target);

  const ufoCentre = new THREE.Vector3(pastureCentre.x, 40, pastureCentre.z);
  scene.add(ufo);

  function update(dt, time, cameraPosition) {
    wind.value = time;
    if (cameraPosition) eye.value.copy(cameraPosition);
    for (const cloud of clouds) {
      cloud.position.x += dt * 1.6;
      if (cloud.position.x > 420) cloud.position.x = -420;
    }
    tintClouds();
    ufo.position.set(
      ufoCentre.x + Math.cos(time * 0.25) * 16,
      ufoCentre.y + Math.sin(time * 0.8) * 1.2,
      ufoCentre.z + Math.sin(time * 0.25) * 12,
    );
    lamps.rotation.y = time * 1.5;
  }
  update(0, 0);

  // 'high' draws everything; 'low' is for computers that struggle.
  function setQuality(level) {
    const high = level !== 'low';
    meadow.setDensity(high ? 1 : 0.35);
    wheat.setDensity(high ? 1 : 0.5);
    const size = high ? 4096 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
  }

  return { colliders, solids, gunSpot, ufo, update, setQuality };
}
