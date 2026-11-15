// Numbered targets that stand still: the locks on a gate in the hideout and the power
// cells around the pilot. Each spot shows a number tag like the animals' tags, can be
// relabelled between signals, and can flash or glitch.
//
// A target's hitbox carries it as `userData.target`, with the same `number` field an
// animal has, so the shot logic in main.js treats both alike.

import * as THREE from 'three';
import { numberTexture, SIGN_ASPECT } from './models.js';

const HITBOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const HITBOX_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });
const WHITE = new THREE.Color(0xececec); // just short of white, so the tags do not bloom
const GLITCH = new THREE.Color(0x6dff5a);
const LIT = new THREE.Color(0x7dff7a);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class Board {
  // spots: where each tag hangs (THREE.Vector3). maxSize: the largest a tag may grow
  // with distance, so neighbours never overlap.
  constructor(scene, spots, { maxSize = 3.4 } = {}) {
    this.scene = scene;
    this.maxSize = maxSize;
    this.items = spots.map((spot) => {
      const sign = new THREE.Sprite(new THREE.SpriteMaterial({ fog: false, transparent: true }));
      sign.position.copy(spot);
      const hitbox = new THREE.Mesh(HITBOX_GEOMETRY, HITBOX_MATERIAL);
      hitbox.position.copy(spot);
      scene.add(sign, hitbox);
      // lit: picked and waiting for its partner (the first of a pair of power cells).
      const item = { number: 0, sign, hitbox, position: spot.clone(), hint: false, lit: false, flash: 0, flashColor: new THREE.Color() };
      hitbox.userData.target = item;
      return item;
    });
    this.visible = true;
  }

  get hitboxes() {
    return this.visible ? this.items.map((item) => item.hitbox) : [];
  }

  // numbers[i] goes on spot i.
  label(numbers) {
    numbers.forEach((n, i) => {
      const item = this.items[i];
      item.number = n;
      item.sign.material.map = numberTexture(n);
      item.sign.material.needsUpdate = true;
      item.hint = false;
      item.lit = false;
    });
  }

  find(number) {
    return this.items.find((item) => item.number === number) || null;
  }

  flash(item, color, seconds = 0.6) {
    item.flash = seconds;
    item.flashColor.set(color);
  }

  clearHints() {
    for (const item of this.items) item.hint = false;
  }

  show(visible) {
    this.visible = visible;
    for (const item of this.items) item.sign.visible = visible;
  }

  update(dt, cameraPos, time) {
    for (const item of this.items) {
      // Tags grow with distance so they stay readable, like the animals' tags.
      const distance = cameraPos.distanceTo(item.position);
      const size = clamp(distance * 0.05, 0.85, this.maxSize);
      item.sign.scale.set(size * SIGN_ASPECT, size, 1);
      item.hitbox.scale.set(size * SIGN_ASPECT, size, 0.1);
      item.hitbox.rotation.y = Math.atan2(cameraPos.x - item.position.x, cameraPos.z - item.position.z);

      item.flash = Math.max(0, item.flash - dt);
      const tint = item.sign.material.color;
      if (item.flash > 0) tint.copy(item.flashColor);
      else if (item.lit) tint.copy(LIT);
      else if (item.hint && Math.sin(time * 26) > 0) tint.copy(GLITCH);
      else tint.copy(WHITE);
      const wobble = item.hint ? 1 + Math.sin(time * 40) * 0.06 : 1;
      item.sign.scale.multiplyScalar(wobble);
    }
  }
}
