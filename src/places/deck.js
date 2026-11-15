// The deck of the mothership: a vast disc of hull plating high above the clouds, with a
// command tower, gun turrets, vents, and the force-field pen where the stolen animals
// are held. There is no land up here (`land: false`): this place brings its own floor
// and the sea of cloud below it.

import * as THREE from 'three';
import { LEVELS } from '../levels.js';
import { limb, rounded, mat, skin, glow } from '../models.js';
import { fbm, cloudTexture } from '../textures.js';

const PEN = LEVELS.mothership.roam;
const SPAWN = LEVELS.mothership.spawn;
const CENTRE = { x: 0, z: -12 }; // middle of the deck
const RADIUS = 78;
const TOWER = { x: 0, z: -68 };
const CYAN = 0x5ef2ff;
const GATE_HALF = 3;

// Cloud tops seen from above in moonlight: a tileable texture painted from noise.
function cloudSeaTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d');
  const image = c.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const billow = fbm(u, v, 4, 4, 5);
      const lumps = fbm(u + 0.3, v + 0.6, 12, 12, 3);
      const k = Math.min(1, Math.max(0, billow * 0.9 + lumps * 0.4 - 0.2));
      const i = (y * size + x) * 4;
      image.data[i] = 70 + k * 120;
      image.data[i + 1] = 80 + k * 125;
      image.data[i + 2] = 110 + k * 120;
      image.data[i + 3] = 255;
    }
  }
  c.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 10);
  return texture;
}

export const deck = {
  land: false,
  // Above the weather: a black sky full of stars, a pale band on the horizon, and the
  // cloud tops below lit by the moon.
  sky: {
    zenith: new THREE.Color(0x01030c),
    horizon: new THREE.Color(0x2c3c64),
    below: new THREE.Color(0x56648c),
    ember: new THREE.Color(0x6a4a9a),
    emberStrength: 0.3,
    aurora: 0,
    clouds: 4,
    cloudNight: new THREE.Color(0x3a4468),
    cloudEmber: new THREE.Color(0x4a4470),
  },
  fog: { near: 90, far: 460 },
  light: { hemisphere: [0x8aa0e8, 0x343c52, 1.3], moon: 2.5, afterglow: [0x9a7aff, 0.2] },

  build({ scene, colliders, solids, rand, addGroup }) {
    const plating = skin('hull', { repeat: 34, roughness: 0.42, metalness: 0.7, bump: 2 });
    const dark = mat(0x1c2230, { roughness: 0.35, metalness: 0.85 });
    const steel = mat(0x77819a, { roughness: 0.3, metalness: 0.85 });
    const cyan = glow(CYAN, 1.8);
    const red = glow(0xff3b2f, 2.4);

    // ---------- The hull ----------

    const top = new THREE.Mesh(new THREE.CircleGeometry(RADIUS, 96), plating);
    top.rotation.x = -Math.PI / 2;
    top.position.set(CENTRE.x, 0, CENTRE.z);
    top.receiveShadow = true;
    scene.add(top);
    // The rim, and the ship's belly curving away underneath.
    const belly = new THREE.Mesh(
      new THREE.LatheGeometry(
        [[0, -46], [22, -40], [52, -22], [70, -9], [RADIUS + 1.5, -2.5], [RADIUS + 1.5, -0.6], [RADIUS, 0]].map(
          ([r, y]) => new THREE.Vector2(r, y),
        ),
        96,
      ),
      dark,
    );
    belly.position.set(CENTRE.x, 0, CENTRE.z);
    scene.add(belly);
    // A ring of lights all around the edge, and a low glowing rail to stop anyone
    // walking off.
    const rim = new THREE.Mesh(new THREE.TorusGeometry(RADIUS + 1.2, 0.18, 8, 160), cyan);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(CENTRE.x, -1.3, CENTRE.z);
    scene.add(rim);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(RADIUS - 2, 0.06, 6, 160), cyan);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(CENTRE.x, 1.1, CENTRE.z);
    scene.add(rail);
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const x = CENTRE.x + Math.cos(a) * (RADIUS - 2);
      const z = CENTRE.z + Math.sin(a) * (RADIUS - 2);
      scene.add(limb(0.07, 0.09, 1.15, steel, x, 0.57, z, 6));
      // The edge itself, as a ring of round walls.
      colliders.circles.push({ x: CENTRE.x + Math.cos(a) * (RADIUS + 1.5), z: CENTRE.z + Math.sin(a) * (RADIUS + 1.5), r: 4.2 });
    }

    // Glowing guide lines in the plating: rings around the centre and spokes out to the edge.
    for (const r of [20, 46]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r + 0.12, 128), glow(CYAN, 0.9));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(CENTRE.x, 0.02, CENTRE.z);
      scene.add(ring);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const spoke = new THREE.Mesh(new THREE.PlaneGeometry(0.22, RADIUS - 50), glow(CYAN, 0.9));
      spoke.rotation.set(-Math.PI / 2, 0, -a + Math.PI / 2);
      const mid = 46 + (RADIUS - 50) / 2 + 2;
      spoke.position.set(CENTRE.x + Math.cos(a) * mid, 0.02, CENTRE.z + Math.sin(a) * mid);
      scene.add(spoke);
    }

    // ---------- Command tower ----------

    const tower = new THREE.Group();
    const tiers = [
      [12, 14, 5],
      [9, 11, 6],
      [6.5, 8, 7],
      [4, 5, 5],
    ];
    let y = 0;
    for (const [rTop, rBottom, h] of tiers) {
      const tier = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 40), plating);
      tier.position.y = y + h / 2;
      tier.castShadow = tier.receiveShadow = true;
      tower.add(tier);
      // A band of lit windows around the top of each tier.
      const band = new THREE.Mesh(new THREE.CylinderGeometry(rTop + 0.05, rTop + 0.05, 0.5, 40, 1, true), cyan);
      band.position.y = y + h - 0.8;
      tower.add(band);
      y += h;
    }
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(4, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7dffd0).multiplyScalar(1.4), transparent: true, opacity: 0.8 }),
    );
    dome.position.y = y;
    tower.add(dome);
    const mastTip = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), red);
    mastTip.position.y = y + 9;
    tower.add(limb(0.12, 0.2, 9, steel, 0, y + 4.5, 0, 8), mastTip);
    tower.position.set(TOWER.x, 0, TOWER.z);
    addGroup(tower, { solid: true });
    colliders.circles.push({ x: TOWER.x, z: TOWER.z, r: 14.5 });

    // ---------- Turrets ----------

    const turrets = [];
    for (const [x, z] of [[-48, -40], [48, -40], [-50, 24], [50, 24]]) {
      const turret = new THREE.Group();
      turret.add(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 1.6, 24), dark));
      const head = new THREE.Group();
      head.position.y = 2;
      head.add(new THREE.Mesh(new THREE.SphereGeometry(1.7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), steel));
      for (const side of [-0.5, 0.5]) {
        const barrel = limb(0.16, 0.2, 4, dark, side, 0.8, 2, 10);
        barrel.rotation.x = Math.PI / 2 - 0.25;
        head.add(barrel);
        head.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), red).translateX(side).translateY(1.3).translateZ(4));
      }
      turret.add(head);
      turret.position.set(x, 0.8, z);
      addGroup(turret, { solid: true });
      colliders.circles.push({ x, z, r: 2.8 });
      turrets.push({ head, phase: rand() * 6 });
    }

    // ---------- Vents ----------

    for (const [x, z] of [[-30, 8], [28, 4], [-34, -22], [32, -26], [-14, 40], [16, 42]]) {
      const vent = rounded(5, 0.4, 3, dark, x, 0.2, z, 0.08);
      scene.add(vent);
      for (let i = 0; i < 5; i++) {
        const slit = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.18), glow(0xffa04a, 1.6));
        slit.rotation.x = -Math.PI / 2;
        slit.position.set(x, 0.42, z - 1.1 + i * 0.55);
        scene.add(slit);
      }
    }

    // ---------- The pen ----------

    // A force-field fence around the animals, with a gap in the south side to walk in.
    const fenceMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(CYAN).multiplyScalar(0.5),
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const FENCE_H = 2.2;
    const posts = [];
    const segment = (x1, z1, x2, z2) => {
      const length = Math.hypot(x2 - x1, z2 - z1);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(length, FENCE_H), fenceMaterial);
      panel.position.set((x1 + x2) / 2, FENCE_H / 2, (z1 + z2) / 2);
      panel.rotation.y = Math.atan2(-(z2 - z1), x2 - x1);
      scene.add(panel);
      colliders.boxes.push({
        minX: Math.min(x1, x2) - 0.2,
        maxX: Math.max(x1, x2) + 0.2,
        minZ: Math.min(z1, z2) - 0.2,
        maxZ: Math.max(z1, z2) + 0.2,
      });
      posts.push([x1, z1], [x2, z2]);
    };
    const { minX, maxX, minZ, maxZ } = PEN;
    segment(minX, minZ, maxX, minZ);
    segment(minX, minZ, minX, maxZ);
    segment(maxX, minZ, maxX, maxZ);
    segment(minX, maxZ, -GATE_HALF, maxZ);
    segment(GATE_HALF, maxZ, maxX, maxZ);
    for (const [x, z] of posts) {
      scene.add(limb(0.14, 0.18, FENCE_H + 0.4, steel, x, (FENCE_H + 0.4) / 2, z, 8));
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), cyan);
      cap.position.set(x, FENCE_H + 0.5, z);
      scene.add(cap);
    }
    const penLight = new THREE.PointLight(0x9ff6ff, 22, 46, 1.3);
    penLight.position.set((minX + maxX) / 2, 8, (minZ + maxZ) / 2);
    scene.add(penLight);

    // ---------- The sea of cloud below ----------

    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      new THREE.MeshLambertMaterial({ map: cloudSeaTexture(), color: 0xb8c4e8 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -90;
    scene.add(sea);
    // Loose clouds drifting past below the deck, for depth.
    const maps = [cloudTexture(31), cloudTexture(32), cloudTexture(33)];
    const drifting = [];
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2;
      const r = 110 + rand() * 260;
      const cloud = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: maps[i % 3], color: 0x8a96c0, transparent: true, opacity: 0.55, depthWrite: false }),
      );
      const w = 70 + rand() * 90;
      cloud.scale.set(w, w * 0.3, 1);
      cloud.position.set(Math.cos(a) * r, -30 - rand() * 45, Math.sin(a) * r);
      scene.add(cloud);
      drifting.push(cloud);
    }

    function update(dt, time) {
      // The turrets sweep slowly, and the clouds below stream past.
      for (const { head, phase } of turrets) head.rotation.y = Math.sin(time * 0.3 + phase) * 1.2 + phase;
      for (const cloud of drifting) {
        cloud.position.z += dt * 9;
        if (cloud.position.z > 380) cloud.position.z -= 760;
      }
      sea.material.map.offset.y -= dt * 0.004;
      mastTip.visible = time % 1.6 < 0.3;
      fenceMaterial.opacity = 0.2 + 0.05 * Math.sin(time * 4);
    }

    return { gunSpot: new THREE.Vector3(SPAWN.x, 1, SPAWN.z), update };
  },
};
