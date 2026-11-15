// The hunter drone: the mothership launches one with every signal and it closes in on
// the player. It is the time limit made visible. Shooting it knocks it back and buys a
// little time; destroying the impostor shuts it down.

import * as THREE from 'three';
import { buildDrone, numberTexture, SIGN_ASPECT } from './models.js';

const MAX_SPEED = 16; // faster than the player can run, so it cannot be outrun
const CLOSING_SPEED = 2.2; // metres it closes per second once it is on its final approach
const MAX_STANDOFF = 36;
const ORBIT_SPEED = 0.15; // radians per second it circles the player while closing in

export class Drone {
  constructor(scene) {
    const model = buildDrone();
    this.group = model.group;
    this.ring = model.ring;
    this.group.visible = false;

    this.light = new THREE.PointLight(0xff3b2f, 0, 12, 1.6);
    this.group.add(this.light);

    this.hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.5, 1.5), // the model is scaled up, so this is generous
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.hitbox.userData.drone = this;
    this.group.add(this.hitbox);
    scene.add(this.group);

    // On the ridge the drone wears a number. The tag hangs above it and, like the
    // animals' tags, counts as part of it when shot.
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ fog: false, transparent: true }));
    this.tag.visible = false;
    this.tagBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    this.tagBox.userData.drone = this;
    scene.add(this.tag, this.tagBox);
    this.number = null;

    this.active = false;
    this.elapsed = 0;
    this.limit = 1;
    this.stun = 0;
    this.hits = 0;
    this.distance = 0;
    this.knock = new THREE.Vector3();
    this.toTarget = new THREE.Vector3();
    this.station = new THREE.Vector3();
  }

  // n: the number the drone wears, or null for none.
  setTag(n) {
    this.number = n;
    this.tag.visible = n !== null;
    if (n !== null) {
      this.tag.material.map = numberTexture(n);
      this.tag.material.needsUpdate = true;
    }
  }

  // The hitboxes a shot can hit while the drone is out.
  get hitboxes() {
    if (!this.active) return [];
    return this.number === null ? [this.hitbox] : [this.hitbox, this.tagBox];
  }

  get position() {
    return this.group.position;
  }

  // 0 just launched, 1 about to strike.
  get progress() {
    return Math.min(1, this.elapsed / this.limit);
  }

  launch(from, limitSeconds) {
    this.group.position.copy(from);
    this.group.visible = true;
    this.active = true;
    this.elapsed = 0;
    this.limit = limitSeconds;
    this.stun = 0;
    this.hits = 0;
    this.knock.set(0, 0, 0);
    this.light.intensity = 14;
  }

  dismiss() {
    this.active = false;
    this.group.visible = false;
    this.tag.visible = false;
    this.light.intensity = 0;
  }

  // Keeps the tag above the drone, sized for the distance and facing the viewer.
  placeTag(viewer) {
    if (this.number === null) return;
    this.tag.visible = this.active;
    const p = this.group.position;
    const size = Math.max(1.1, Math.min(3.4, p.distanceTo(viewer) * 0.06));
    this.tag.scale.set(size * SIGN_ASPECT, size, 1);
    this.tag.position.set(p.x, p.y + 1.3 + size / 2, p.z);
    this.tagBox.scale.set(size * SIGN_ASPECT, size, 0.1);
    this.tagBox.position.copy(this.tag.position);
    this.tagBox.rotation.y = Math.atan2(viewer.x - p.x, viewer.z - p.z);
  }

  // Shot by the player: stunned, shoved away, and its clock set back a little.
  // Each further hit in the same round buys less time.
  hit(direction) {
    this.stun = 1.4;
    this.knock.copy(direction).multiplyScalar(16);
    this.elapsed = Math.max(0, this.elapsed - Math.max(0.5, 3 - this.hits));
    this.hits += 1;
  }

  // After striking the player it backs off and comes around again.
  retreat() {
    this.elapsed = this.limit * 0.4;
    this.stun = 0.6;
  }

  // Returns true on the frame it reaches the player.
  //
  // The drone's distance from the player is set by the time left, not by where the
  // player runs: it holds off at a distance, circles, and closes in as the clock runs
  // down. Running toward it or away from it changes nothing, so the limit is fair.
  update(dt, target, time) {
    if (!this.active) return false;
    const p = this.group.position;
    this.ring.rotation.x = time * 3;
    this.ring.rotation.y = time * 2.1;

    if (this.knock.lengthSq() > 0.01) {
      p.addScaledVector(this.knock, dt);
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 5));
    }

    if (this.stun > 0) {
      this.stun -= dt;
    } else {
      this.elapsed += dt;
      const remaining = this.limit - this.elapsed;
      if (remaining <= 0) {
        p.copy(target);
        this.distance = 0;
        this.placeTag(target);
        return true;
      }

      // Where it should be right now: `standoff` metres out, a little above eye level,
      // slowly circling.
      const standoff = Math.min(MAX_STANDOFF, remaining * CLOSING_SPEED);
      const angle = Math.atan2(p.x - target.x, p.z - target.z) + ORBIT_SPEED * dt;
      this.station.set(
        target.x + Math.sin(angle) * standoff,
        target.y + 0.4 + standoff * 0.28 + Math.sin(time * 2.4) * 0.25,
        target.z + Math.cos(angle) * standoff,
      );
      this.toTarget.copy(this.station).sub(p);
      const gap = this.toTarget.length();
      if (gap > 0.001) p.addScaledVector(this.toTarget, Math.min(1, (MAX_SPEED * dt) / gap));
    }

    p.y = Math.max(0.8, p.y);
    this.distance = p.distanceTo(target);
    this.group.lookAt(target);
    if (this.stun > 0) this.group.rotation.z += Math.sin(time * 50) * 0.3;
    this.placeTag(target);
    return false;
  }
}
