// The farm: barn, farmhouse, silo, tractor, hay bales, the fenced pasture, a wheat
// field and a scarecrow. world.js supplies the land, sky, trees and grass around them.

import * as THREE from 'three';
import { LEVELS } from '../levels.js';
import { box, ball, limb, slab, rounded, prism, roof, mat, skin, glow } from '../models.js';
import { windowTexture } from '../textures.js';
import { inside, softBox } from './shapes.js';
import { buildCrop } from '../grass.js';

const PASTURE = LEVELS.farm.roam;
// The barn's door faces south (+z), toward the yard.
const BARN = { x: -16, z: -6, w: 12, d: 10, h: 5, doorW: 4.4, doorH: 3.6 };
const FIELD = { minX: 34, maxX: 64, minZ: -40, maxZ: 10 };
const YARD = { minX: -32, maxX: 30, minZ: -20, maxZ: 26 };
const HOUSE = { x: 20, z: 6, w: 9, d: 11, h: 4.6 };
const SILO = { x: -27, z: -9, r: 2.3 };

// How bare the ground is at a spot: 1 on the trodden farmyard and the tracks, 0 on grass.
function dirtAt(x, z) {
  return Math.max(
    softBox(x, z, -5, 2, 19, 19, 2.5, 5),
    softBox(x, z, PASTURE.gateX, -22, 2.2, 5, 1.2, 1.2),
    softBox(x, z, -3, 72, 2.4, 54, 1.2, 1.6),
  );
}

const BUILT_ON = [
  { minX: BARN.x - BARN.w / 2, maxX: BARN.x + BARN.w / 2, minZ: BARN.z - BARN.d / 2, maxZ: BARN.z + BARN.d / 2 },
  {
    minX: HOUSE.x - HOUSE.w / 2 - 1.2,
    maxX: HOUSE.x + HOUSE.w / 2,
    minZ: HOUSE.z - HOUSE.d / 2,
    maxZ: HOUSE.z + HOUSE.d / 2,
  },
  FIELD,
];

function builtOn(x, z) {
  return BUILT_ON.some((rect) => inside(rect, x, z, 0.4)) || Math.hypot(x - SILO.x, z - SILO.z) < SILO.r + 0.4;
}

const TREELESS = [
  { rect: YARD, margin: 2 },
  { rect: PASTURE, margin: 5 },
  { rect: FIELD, margin: 3 },
  { rect: { minX: -7, maxX: 1, minZ: 20, maxZ: 200 }, margin: 2 },
];

export const farm = {
  // Dusk: a dark sky with the last of the sunset in the west.
  sky: {
    zenith: new THREE.Color(0x050920),
    horizon: new THREE.Color(0x3b2e60),
    ember: new THREE.Color(0xe8743c),
    emberStrength: 0.95,
    aurora: 0,
    clouds: 16,
    cloudNight: new THREE.Color(0x343a5e),
    cloudEmber: new THREE.Color(0x9a5c50),
  },
  fog: { near: 70, far: 320 },
  light: { hemisphere: [0x8494d8, 0x3a4658, 1.25], moon: 2.2, afterglow: [0xffb48a, 0.35] },
  floor: 'dirt',
  bare: dirtAt,
  barren: (x, z) => (builtOn(x, z) ? 1 : dirtAt(x, z)),
  trees: {
    count: 64,
    spread: 260,
    spruce: 0.38,
    clear: (x, z) => TREELESS.some(({ rect, margin }) => inside(rect, x, z, margin)),
  },
  grass: [0x486a2a, 0x567a30, 0x638836, 0x4e702c, 0x6f8a40],
  flowers: { count: 2200, colours: [0xf4f1e6, 0xf2d24a, 0xe58fb4, 0xc8a8f0, 0xf4f1e6] },
  farForest: 0.36,

  build({ scene, colliders, solids, rand, block, addGroup, flat, WALL }) {
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

    // ---------- The crop ----------

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

    return {
      gunSpot,
      setQuality(high) {
        wheat.setDensity(high ? 1 : 0.5);
      },
    };
  },
};
