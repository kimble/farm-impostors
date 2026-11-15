// The land every level stands on: sky, moon and clouds, light, ground and grass,
// trees, hills on the horizon and the ship circling overhead. What makes each level
// its own place (buildings, wrecks, paths) comes from a file in src/places/.
//
// Returns what the rest of the game needs to know about the world: where the walls
// are, what blocks a shot, where the blaster lies.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ball, slab, mat, skin, glow } from './models.js';
import { seeded, fbm, smooth, surface, tiled, cloudTexture, glowTexture } from './textures.js';
import { buildMeadow, wind, eye } from './grass.js';
import { farm } from './places/farm.js';
import { forest } from './places/forest.js';
import { ridge } from './places/ridge.js';
import { hideout } from './places/hideout.js';
import { deck } from './places/deck.js';
import { landing } from './places/landing.js';

const PLACES = { farm, forest, ridge, hideout, deck, landing };
const HILLS_START = 128; // metres from the middle of the map to where the land rises
const LAND = new THREE.Color(0x0c120c);
const AURORA = new THREE.Color(0x30e890);
const AURORA_TOP = new THREE.Color(0x8a4ae8);

// Height of the land. Flat where the game is played, rolling hills beyond.
function heightAt(x, z) {
  const r = Math.hypot(x, z);
  if (r <= HILLS_START) return 0;
  const rise = smooth(HILLS_START, 250, r);
  return rise * (5 + 70 * fbm(x / 900 + 0.5, z / 900 + 0.5, 5, 5, 4) ** 1.4) - 0.3 * (1 - rise);
}

// The colour of the sky in a direction (x, y, z: a unit vector, y up).
function skyShade(out, sky, x, y, z) {
  const flat = Math.hypot(x, z);
  if (y < 0) {
    // Below the horizon: only seen in reflections, where it stands in for the dark land
    // (or, high above the clouds, for the cloud tops).
    return out.copy(sky.below || LAND).lerp(sky.horizon, Math.max(0, 1 + y * 8));
  }
  const west = flat > 0.001 ? Math.max(0, -x / flat) : 0;
  out.copy(sky.horizon).lerp(sky.zenith, Math.min(1, y * 2.4) ** 0.8);
  out.lerp(sky.ember, west ** 3 * (1 - y) ** 9 * sky.emberStrength);
  if (sky.aurora > 0 && flat > 0.001) {
    // Northern lights: curtains of green low in the north, fading to violet higher up.
    const north = Math.max(0, -z / flat);
    const around = Math.atan2(x, -z);
    const curtain = 0.5 + 0.5 * Math.sin(around * 9 + Math.sin(around * 4) * 2);
    const band = smooth(0.08, 0.26, y) * (1 - smooth(0.3, 0.66, y));
    const strength = sky.aurora * north ** 1.5 * band * (0.35 + 0.65 * curtain);
    const top = smooth(0.3, 0.6, y);
    out.r += (AURORA.r + (AURORA_TOP.r - AURORA.r) * top) * strength;
    out.g += (AURORA.g + (AURORA_TOP.g - AURORA.g) * top) * strength;
    out.b += (AURORA.b + (AURORA_TOP.b - AURORA.b) * top) * strength;
  }
  return out;
}

// level: an entry from levels.js.
export function buildWorld(scene, renderer, level) {
  const place = PLACES[level.place];
  const colliders = { boxes: [], circles: [] };
  const solids = []; // meshes that stop a blaster shot
  const rand = seeded(11);
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const posVec = new THREE.Vector3();
  const euler = new THREE.Euler();

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

  // A flat textured patch lying on the ground.
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

  // ---------- Sky ----------

  const { sky: skyColours } = place;
  scene.background = skyColours.zenith;
  scene.fog = new THREE.Fog(skyColours.horizon, place.fog.near, place.fog.far);

  const skyGeometry = new THREE.SphereGeometry(480, 96, 48);
  const skyPos = skyGeometry.attributes.position;
  const skyColors = new Float32Array(skyPos.count * 3);
  const shade = new THREE.Color();
  for (let i = 0; i < skyPos.count; i++) {
    skyShade(shade, skyColours, skyPos.getX(i) / 480, skyPos.getY(i) / 480, skyPos.getZ(i) / 480);
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
  for (let i = 0; i < skyColours.clouds; i++) {
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
      cloud.material.color.copy(skyColours.cloudNight).lerp(skyColours.cloudEmber, west ** 2 * (0.35 + low * 0.65));
    }
  }

  // ---------- Light ----------

  const [hemiSky, hemiGround, hemiStrength] = place.light.hemisphere;
  scene.add(new THREE.HemisphereLight(hemiSky, hemiGround, hemiStrength));
  const sun = new THREE.DirectionalLight(0xb9c9ff, place.light.moon); // the moon, in fact
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
  // Light from low in the west: the afterglow of the sunset, where there is one.
  const afterglow = new THREE.DirectionalLight(place.light.afterglow[0], place.light.afterglow[1]);
  afterglow.position.set(-90, 14, 12);
  scene.add(afterglow);

  // A place that is not on the ground (the deck of the ship) brings its own floor, and
  // skips the land, grass, trees and hills.
  const land = place.land !== false;
  let meadow = null;
  let mask = null;
  const FLOOR_SIZE = 256;
  const FLOOR_CENTRE = { x: 0, z: 10 };

  if (land) {
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
        // No relief on this one: up close the grass covers it, and far away relief is
        // invisible. (It also produced broken pixels when viewed dead level.)
        map: tiled(grassSurface.map, 100),
        roughness: 1,
        vertexColors: true,
      }),
    );
    ground.receiveShadow = true;
    scene.add(ground);

    // A second surface (bare earth, forest floor) lies over the grass wherever the place
    // says so. One mask holds both answers: green is how much of that surface shows,
    // red is how hard it is for grass to grow there.
    const maskSize = 512;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskCanvas.height = maskSize;
    const maskContext = maskCanvas.getContext('2d');
    const maskImage = maskContext.createImageData(maskSize, maskSize);
    for (let py = 0; py < maskSize; py++) {
      for (let px = 0; px < maskSize; px++) {
        const x = FLOOR_CENTRE.x + ((px + 0.5) / maskSize - 0.5) * FLOOR_SIZE;
        const z = FLOOR_CENTRE.z + ((py + 0.5) / maskSize - 0.5) * FLOOR_SIZE;
        const i = (py * maskSize + px) * 4;
        maskImage.data[i] = place.barren(x, z) * 255;
        maskImage.data[i + 1] = place.bare(x, z) * 255;
        maskImage.data[i + 3] = 255;
      }
    }
    maskContext.putImageData(maskImage, 0, 0);
    mask = new THREE.CanvasTexture(maskCanvas);
    const floorSurface = surface(place.floor);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
      new THREE.MeshStandardMaterial({
        map: tiled(floorSurface.map, FLOOR_SIZE / 5),
        bumpMap: tiled(floorSurface.bumpMap, FLOOR_SIZE / 5),
        bumpScale: 2,
        alphaMap: mask,
        transparent: true,
        depthWrite: false,
        roughness: 1,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(FLOOR_CENTRE.x, 0.02, FLOOR_CENTRE.z);
    floor.receiveShadow = true;
    floor.renderOrder = -1;
    scene.add(floor);
  }

  // ---------- What makes this place its own ----------

  const built = place.build({ scene, colliders, solids, rand, block, addGroup, flat, WALL, heightAt });

  if (land) {
    // ---------- Trees ----------

    // A lumpy ball of foliage; a leafy tree's crown is several of these.
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
    // Closed underneath: seen from below a tier shows its underside, and from inside
    // (walking under the branches) it shows nothing, rather than a dark void.
    const tierGeometry = new THREE.ConeGeometry(1, 1, 14, 1, false);
    const foliage = [0xffffff, 0xd8f0c0, 0xc8d8a8].map((color) =>
      skin('leaves', { repeat: 4, repeatY: 3, color, roughness: 1, bump: 4 }),
    );
    const needles = skin('leaves', { repeat: 6, repeatY: 2, color: 0x7fa890, roughness: 1, bump: 4 });
    const bark = skin('bark', { repeat: 2, repeatY: 2, roughness: 1, bump: 4 });
    const trunkGeometry = new THREE.CylinderGeometry(0.6, 1, 1, 9);

    function shaped(geometry, x, y, z, sx, sy, sz, turn) {
      quat.setFromEuler(euler.set(0, turn, 0));
      return geometry.clone().applyMatrix4(m4.compose(posVec.set(x, y, z), quat, scale.set(sx, sy, sz)));
    }

    // There are a handful of tree shapes, each drawn many times over at different sizes
    // and turns, so a whole forest costs the graphics card only a few draw calls.
    function leafyShape() {
      const lumps = 7 + Math.floor(rand() * 4);
      const parts = [];
      for (let i = 0; i < lumps; i++) {
        const around = (i / lumps) * Math.PI * 2 + rand();
        const out = i === 0 ? 0 : 1.0 + rand() * 1.1;
        const size = i === 0 ? 2.1 : 1.2 + rand() * 0.7;
        parts.push(
          shaped(
            crowns[Math.floor(rand() * crowns.length)],
            Math.cos(around) * out,
            i === 0 ? 5.2 : 3.6 + rand() * 1.8,
            Math.sin(around) * out,
            size,
            size * (0.8 + rand() * 0.2),
            size,
            rand() * 6,
          ),
        );
      }
      return {
        trunk: shaped(trunkGeometry, 0, 1.8, 0, 0.4, 3.6, 0.4, 0),
        crown: mergeGeometries(parts),
        material: foliage[Math.floor(rand() * foliage.length)],
        girth: 0.34,
        spots: [],
      };
    }

    function spruceShape() {
      const tiers = 6;
      const parts = [];
      for (let i = 0; i < tiers; i++) {
        const k = i / (tiers - 1);
        const wide = (1.75 - k * 1.3) * (0.9 + rand() * 0.2);
        // The lowest branches start above head height, so nobody walks through them.
        parts.push(shaped(tierGeometry, 0, 2.75 + i * 0.95, 0, wide, 1.9 - k * 0.5, wide, rand() * 6));
      }
      return {
        trunk: shaped(trunkGeometry, 0, 1.5, 0, 0.26, 3.0, 0.26, 0),
        crown: mergeGeometries(parts),
        material: needles,
        girth: 0.3,
        spots: [],
      };
    }

    const leafyShapes = [leafyShape(), leafyShape(), leafyShape(), leafyShape()];
    const spruceShapes = [spruceShape(), spruceShape(), spruceShape()];
    for (let planted = 0; planted < place.trees.count; ) {
      const x = (rand() - 0.5) * place.trees.spread;
      const z = (rand() - 0.5) * place.trees.spread;
      if (place.trees.clear(x, z)) continue;
      const shapes = rand() < place.trees.spruce ? spruceShapes : leafyShapes;
      const shape = shapes[Math.floor(rand() * shapes.length)];
      const size = (0.85 + rand() * 0.75) * 1.25;
      shape.spots.push([x, heightAt(x, z) - 0.1, z, size, rand() * Math.PI * 2]);
      colliders.circles.push({ x, z, r: shape.girth * size });
      planted += 1;
    }
    for (const shape of [...leafyShapes, ...spruceShapes]) {
      if (!shape.spots.length) continue;
      for (const [geometry, material] of [[shape.trunk, bark], [shape.crown, shape.material]]) {
        const mesh = new THREE.InstancedMesh(geometry, material, shape.spots.length);
        shape.spots.forEach(([x, y, z, size, turn], i) => {
          quat.setFromEuler(euler.set(0, turn, 0));
          mesh.setMatrixAt(i, m4.compose(posVec.set(x, y, z), quat, scale.setScalar(size)));
        });
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        scene.add(mesh);
        solids.push(mesh);
      }
    }

    // ---------- Grass and wildflowers ----------

    meadow = buildMeadow({
      count: 60000,
      mask,
      area: { x: FLOOR_CENTRE.x, z: FLOOR_CENTRE.z, size: FLOOR_SIZE },
      colours: place.grass,
    });
    scene.add(meadow.mesh);

    const flowerSpots = [];
    while (flowerSpots.length < place.flowers.count) {
      const x = (rand() - 0.5) * 190;
      const z = (rand() - 0.5) * 190;
      if (place.barren(x, z) < 0.05) flowerSpots.push([x, z]);
    }
    const flowers = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.03, 6, 4),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      flowerSpots.length,
    );
    const petal = new THREE.Color();
    const petals = place.flowers.colours;
    flowerSpots.forEach(([x, z], i) => {
      flowers.setMatrixAt(i, m4.makeTranslation(x, heightAt(x, z) + 0.24 + rand() * 0.1, z));
      flowers.setColorAt(i, petal.setHex(petals[Math.floor(rand() * petals.length)]));
    });
    scene.add(flowers);

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
      if (fbm(x / 140, z / 140, 4, 4, 3) < place.farForest + rand() * 0.2) continue;
      forestSpots.push([x, heightAt(x, z), z, 3.2 + rand() * 3.2]);
    }
    const farForest = new THREE.InstancedMesh(farTree, new THREE.MeshLambertMaterial({ color: 0x1e3a26 }), forestSpots.length);
    forestSpots.forEach(([x, y, z, tall], i) => {
      farForest.setMatrixAt(i, m4.compose(posVec.set(x, y - 0.4, z), quat.identity(), scale.set(tall * 0.42, tall, tall * 0.42)));
    });
    scene.add(farForest);
  }

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

  // The ship circles over wherever the animals are.
  const { roam } = level;
  const ufoCentre = new THREE.Vector3((roam.minX + roam.maxX) / 2, 40, (roam.minZ + roam.maxZ) / 2);
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
    if (built.update) built.update(dt, time);
  }
  update(0, 0);

  // 'high' draws everything; 'low' is for computers that struggle.
  function setQuality(quality) {
    const high = quality !== 'low';
    if (meadow) meadow.setDensity(high ? 1 : 0.35);
    if (built.setQuality) built.setQuality(high);
    const size = high ? 4096 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
  }

  // `site` is whatever else the place hands back for the game to use (the gates, say).
  return { colliders, solids, gunSpot: built.gunSpot, ufo, update, setQuality, site: built };
}
