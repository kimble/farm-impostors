// Grass and crops: tens of thousands of small tufts of blades that sway in the wind.
//
// The meadow is one dense patch of grass that follows the player. Every tuft has a
// fixed place in the world; the graphics card works out which ones are near enough to
// draw, so the grass can be thick underfoot without covering the whole map in blades.
// Further away the ground's own texture takes over.

import * as THREE from 'three';

// Shared by all grass: the wind's clock and where the player is looking from.
export const wind = { value: 0 };
export const eye = { value: new THREE.Vector3() };

const PATCH = 64; // metres across; grass is drawn within half of this from the player
const CELL = 24; // metres per batch of a planted crop

// One tuft: a few tapered blades fanned out from a point, darker at the root.
function tuftGeometry({ blades, height, width, lean }) {
  const positions = [];
  const colours = [];
  const normals = [];
  const indices = [];
  for (let b = 0; b < blades; b++) {
    const turn = (b / blades) * Math.PI + b * 0.4;
    const ax = Math.cos(turn);
    const az = Math.sin(turn);
    const tall = height * (0.6 + 0.4 * (((b * 5) % blades) / Math.max(1, blades - 1)));
    const tilt = lean * (b % 2 ? 1 : -1) * (0.5 + (b / blades) * 0.8);
    const offset = (b - (blades - 1) / 2) * width * 1.2;
    const start = positions.length / 3;
    for (const [k, half] of [[0, 0.5], [0.55, 0.38], [1, 0]]) {
      const cx = -az * tilt * k * k + ax * offset;
      const cz = ax * tilt * k * k + az * offset;
      const shade = 0.5 + 0.55 * k;
      for (const side of half > 0 ? [-1, 1] : [0]) {
        positions.push(cx + ax * side * half * width, tall * k, cz + az * side * half * width);
        colours.push(shade, shade, shade);
        normals.push(0, 1, 0); // lit like the ground it grows from
      }
    }
    indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2, start + 2, start + 3, start + 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

// Blades are thin and seen from both sides. Light both sides as if they faced up,
// like the ground, or half of them turn black.
function lightFromAbove(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_maps>',
    'normal = normalize(vNormal);\n#include <normal_fragment_maps>',
  );
}

const GUST = `
  float gust = sin(uWind * 1.6 + root.x * 0.31 + root.y * 0.23)
    + 0.6 * sin(uWind * 2.9 + root.x * 0.9 - root.y * 0.7);`;

// The meadow around the player.
// mask: a texture whose red channel is 1 where nothing grows (bare earth, floors).
// area: { x, z, size } - the square of the world that the mask covers.
export function buildMeadow({ count, mask, area, colours, blades = 4, height = 0.3, width = 0.045, lean = 0.1 }) {
  const tuft = tuftGeometry({ blades, height, width, lean });
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = tuft.index;
  geometry.setAttribute('position', tuft.attributes.position);
  geometry.setAttribute('color', tuft.attributes.color);
  geometry.setAttribute('normal', tuft.attributes.normal);

  const roots = new Float32Array(count * 4); // x and z within the patch, size, turn
  const tints = new Float32Array(count * 3);
  const palette = colours.map((hex) => new THREE.Color(hex));
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    roots.set([Math.random() * PATCH, Math.random() * PATCH, 0.6 + Math.random() * 0.9, Math.random() * 6.283], i * 4);
    const a = palette[Math.floor(Math.random() * palette.length)];
    const b = palette[Math.floor(Math.random() * palette.length)];
    tint.copy(a).lerp(b, Math.random());
    tints.set([tint.r, tint.g, tint.b], i * 3);
  }
  geometry.setAttribute('aRoot', new THREE.InstancedBufferAttribute(roots, 4));
  geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3));
  geometry.instanceCount = count;

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    lightFromAbove(shader);
    shader.uniforms.uWind = wind;
    shader.uniforms.uEye = eye;
    shader.uniforms.uMask = { value: mask };
    shader.uniforms.uArea = { value: new THREE.Vector3(area.x, area.z, area.size) };
    shader.vertexShader = `
      uniform float uWind;
      uniform vec3 uEye;
      uniform sampler2D uMask;
      uniform vec3 uArea;
      attribute vec4 aRoot;
      attribute vec3 aTint;
      ${shader.vertexShader}`
      .replace(
        '#include <begin_vertex>',
        `
        const float PATCH = ${PATCH.toFixed(1)};
        // Each tuft has a home in the world; draw the copy of it nearest the player.
        vec2 away = mod(aRoot.xy - uEye.xz + PATCH * 0.5, PATCH) - PATCH * 0.5;
        vec2 root = uEye.xz + away;
        vec2 onMask = (root - uArea.xy) / uArea.z;
        float bare = texture2D(uMask, vec2(0.5 + onMask.x, 0.5 - onMask.y)).r;
        float ragged = fract(aRoot.w * 7.13);
        float grow = (1.0 - smoothstep(PATCH * 0.5 - 12.0, PATCH * 0.5 - 1.0, length(away)))
          * (1.0 - smoothstep(0.1 + ragged * 0.4, 0.3 + ragged * 0.4, bare));
        float turnC = cos(aRoot.w);
        float turnS = sin(aRoot.w);
        vec3 transformed = position * aRoot.z * grow;
        transformed.xz = vec2(turnC * transformed.x - turnS * transformed.z, turnS * transformed.x + turnC * transformed.z);
        ${GUST}
        float bend = pow(position.y / ${height.toFixed(3)}, 2.0) * 0.07 * grow;
        transformed.x += gust * bend + root.x;
        transformed.z += gust * bend * 0.6 + root.y;`,
      )
      .replace('#include <color_vertex>', '#include <color_vertex>\n vColor.rgb *= aTint;');
  };

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; // it is always around the player
  mesh.receiveShadow = true;
  return {
    mesh,
    // fraction: 1 draws every tuft, 0.4 draws four in ten.
    setDensity(fraction) {
      geometry.instanceCount = Math.max(1, Math.round(count * fraction));
    },
  };
}

// A planted crop that stays where it is.
// points: [x, z, size] for every plant.
export function buildCrop(points, { blades = 4, height = 1, width = 0.09, lean = 0.16, sway = 0.16, colours }) {
  const geometry = tuftGeometry({ blades, height, width, lean });
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    lightFromAbove(shader);
    shader.uniforms.uWind = wind;
    shader.vertexShader = `uniform float uWind;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 root = instanceMatrix[3].xz;
        ${GUST}
        float bend = pow(position.y / ${height.toFixed(3)}, 2.0) * ${sway.toFixed(3)};
        transformed.x += gust * bend;
        transformed.z += gust * bend * 0.6;
      #endif`,
    );
  };

  const cells = new Map();
  for (const point of points) {
    const key = `${Math.floor(point[0] / CELL)},${Math.floor(point[1] / CELL)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(point);
  }

  const group = new THREE.Group();
  const batches = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const size = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  const palette = colours.map((hex) => new THREE.Color(hex));
  for (const list of cells.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach(([x, z, s], i) => {
      quaternion.setFromAxisAngle(up, Math.random() * Math.PI * 2);
      matrix.compose(position.set(x, 0, z), quaternion, size.set(s, s * (0.8 + Math.random() * 0.5), s));
      mesh.setMatrixAt(i, matrix);
      const a = palette[Math.floor(Math.random() * palette.length)];
      const b = palette[Math.floor(Math.random() * palette.length)];
      mesh.setColorAt(i, tint.copy(a).lerp(b, Math.random()));
    });
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    batches.push({ mesh, full: list.length });
  }

  return {
    group,
    setDensity(fraction) {
      for (const { mesh, full } of batches) mesh.count = Math.max(1, Math.round(full * fraction));
    },
  };
}
