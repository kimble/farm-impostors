// The pilot of the mothership: the alien from under the disguises, grown to the height of
// a barn, standing behind a shield with a number on its chest. It faces +z, toward the
// ring of power cells and the player.

import * as THREE from 'three';
import { buildAlien, numberTexture, SIGN_ASPECT } from './models.js';

const SCALE = 7;
const SHIELD = 0x7dff5a;

export class Boss {
  constructor(scene, position) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.position.copy(position);
    scene.add(this.root);

    const { group, arms } = buildAlien();
    group.scale.setScalar(SCALE);
    this.body = group;
    this.arms = arms;
    this.root.add(group);

    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(10.5, 40, 24),
      new THREE.MeshBasicMaterial({
        color: SHIELD,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.shield.scale.set(1, 1.1, 0.8);
    this.shield.position.y = 9;
    this.root.add(this.shield);

    // Its number hangs in front of its chest, big enough to read across the arena.
    this.sign = new THREE.Sprite(new THREE.SpriteMaterial({ fog: false, transparent: true }));
    this.sign.scale.set(4.4 * SIGN_ASPECT, 4.4, 1);
    this.sign.position.set(0, 8.6, 4.5);
    this.sign.visible = false;
    this.root.add(this.sign);

    this.light = new THREE.PointLight(SHIELD, 30, 30, 1.5);
    this.light.position.set(0, 10, 5);
    this.root.add(this.light);

    // Shots stop on it (and do nothing).
    this.hitbox = new THREE.Mesh(new THREE.BoxGeometry(6, 18, 5), new THREE.MeshBasicMaterial({ visible: false }));
    this.hitbox.position.y = 9;
    this.hitbox.userData.boss = this;
    this.root.add(this.hitbox);

    this.health = 1; // 1 untouched, 0 beaten
    this.stagger = 0;
    this.rage = 0; // 0 calm, 1 furious: it moves more in later waves
    this.down = 0; // seconds since it was beaten, or 0 while standing
  }

  // Where beams aimed at it should land.
  get chest() {
    return this.root.localToWorld(new THREE.Vector3(0, 7.2, 1.5));
  }

  setNumber(n) {
    this.sign.visible = n !== null;
    if (n !== null) {
      this.sign.material.map = numberTexture(n);
      this.sign.material.needsUpdate = true;
    }
  }

  // health: what is left after this hit, from 1 to 0.
  hit(health) {
    this.health = health;
    this.stagger = 1;
  }

  // Standing again, at full strength, for a new run.
  reset() {
    this.health = 1;
    this.stagger = 0;
    this.rage = 0;
    this.down = 0;
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.light.intensity = 30;
    this.setNumber(null);
  }

  defeat() {
    this.down = 0.001;
    this.sign.visible = false;
  }

  update(dt, time) {
    this.stagger = Math.max(0, this.stagger - dt * 1.4);
    const k = this.stagger;
    if (this.down > 0) {
      // Topples backwards and sinks as the shield dies.
      this.down += dt;
      const fall = Math.min(1, this.down / 2.2);
      this.body.rotation.x = -fall * fall * 1.45;
      this.body.position.y = -fall * 1.5;
      this.shield.material.opacity = Math.max(0, 0.3 * (1 - this.down * 2));
      this.light.intensity = Math.max(0, 30 - this.down * 20);
      for (const [i, arm] of this.arms.entries()) arm.rotation.z = -(i ? -1 : 1) * (2.7 - fall * 2.1);
      return;
    }
    // Breathing, swaying, and arms that rise as it gets angrier. (An arm at rotation 0
    // points straight up; about 2.8 hangs it at the alien's side.)
    const sway = Math.sin(time * (0.8 + this.rage)) * (0.04 + this.rage * 0.05);
    this.body.rotation.set(-k * 0.25, sway, Math.sin(time * 0.6) * 0.03);
    this.body.position.y = Math.sin(time * 1.6) * 0.15;
    for (const [i, arm] of this.arms.entries()) {
      const side = i ? -1 : 1;
      const angle = 2.7 - this.rage * 1.5 + Math.sin(time * (2 + this.rage * 3) + i) * (0.12 + this.rage * 0.2) - k * 1.1;
      arm.rotation.z = -side * angle;
      arm.rotation.x = -0.2 - this.rage * 0.3;
    }
    // The shield thins as it takes hits, and flares when struck.
    const flicker = k > 0 ? Math.sin(time * 60) * 0.5 + 0.5 : 0;
    this.shield.material.opacity = 0.05 + this.health * 0.16 + flicker * 0.35 * k;
    this.shield.rotation.y = time * 0.2;
  }
}
