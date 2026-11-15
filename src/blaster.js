// The blasters in two forms: lying somewhere waiting to be found, and held in view.

import * as THREE from 'three';
import { buildBlaster, BLASTERS } from './models.js';

// Held blasters. They live in their own small scene drawn on top of the world, so
// they never poke through walls when the player stands close to one. There is one
// model per kind of blaster; only the one in hand is shown.
export class BlasterView {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x56607a, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(1, 2, 1.5);
    this.scene.add(key);

    this.models = {};
    for (const op of Object.keys(BLASTERS)) {
      const model = buildBlaster(op);
      model.group.scale.setScalar(0.6);
      model.group.rotation.set(0.04, 0.12, 0);
      model.group.visible = false;
      this.scene.add(model.group);
      this.models[op] = model;
    }
    this.rest = new THREE.Vector3(0.3, -0.25, -0.66);

    this.op = null; // which blaster is in hand
    this.visible = false;
    this.raise = 0;
    this.kick = 0;
    this.bob = 0;
  }

  // Brings a blaster up into view (also used when switching from one to another).
  hold(op) {
    for (const [kind, model] of Object.entries(this.models)) model.group.visible = kind === op;
    this.op = op;
    this.visible = true;
    this.raise = 0;
  }

  hide() {
    this.visible = false;
    this.op = null;
  }

  setScreen(op, text) {
    this.models[op].setScreen(text);
  }

  fire() {
    this.kick = 1;
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  // Where the muzzle appears on screen (x and y from -1 to 1), so the beam drawn in
  // the world can start exactly at the tip of the held blaster.
  muzzleOnScreen(target) {
    const { group } = this.models[this.op];
    group.updateMatrixWorld();
    this.camera.updateMatrixWorld();
    return target.set(0, 0.01, -0.68).applyMatrix4(group.matrixWorld).project(this.camera);
  }

  update(dt, moveSpeed) {
    if (!this.op) return;
    this.raise = Math.min(1, this.raise + dt * 2.5);
    this.kick = Math.max(0, this.kick - dt * 6);
    this.bob += dt * moveSpeed * 1.7;
    const sway = moveSpeed > 0 ? 1 : 0;
    const lowered = (1 - this.raise) ** 2 * 0.5;
    const { group } = this.models[this.op];
    group.position.set(
      this.rest.x + Math.cos(this.bob) * 0.008 * sway,
      this.rest.y + Math.abs(Math.sin(this.bob)) * 0.012 * sway - lowered,
      this.rest.z + this.kick * 0.07,
    );
    group.rotation.x = 0.04 + this.kick * 0.22;
  }
}

// A blaster waiting to be found, spinning in a column of light of its own colour.
export class BlasterPickup {
  constructor(scene, position, op) {
    const style = BLASTERS[op];
    this.scene = scene;
    this.base = position.clone();
    this.root = new THREE.Group();
    this.root.position.copy(position);

    this.model = buildBlaster(op);
    this.model.group.scale.setScalar(2.2);
    this.model.group.rotation.x = 0.25;
    this.root.add(this.model.group);

    this.pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 5, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: style.glow,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.pillar.position.y = 0.9;
    this.root.add(this.pillar);

    this.light = new THREE.PointLight(style.glow, 16, 14, 1.6);
    this.light.position.y = 0.6;
    this.root.add(this.light);

    scene.add(this.root);
  }

  update(dt, time) {
    this.model.group.rotation.y += dt * 1.6;
    this.model.group.position.y = Math.sin(time * 2.2) * 0.12;
    this.pillar.material.opacity = 0.2 + Math.sin(time * 3) * 0.06;
  }

  remove() {
    this.scene.remove(this.root);
    this.pillar.geometry.dispose();
    this.pillar.material.dispose();
    this.light.dispose();
  }
}
