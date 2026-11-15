// Short-lived visuals: blaster beams, particle bursts, explosions, the unmasked alien,
// the fact floating up from a kill, and the light column that returns a rescued animal.

import * as THREE from 'three';
import { buildAlien } from './models.js';

// How long the disguise glitches before it is blown off, and how long the alien then
// stands exposed before it explodes (seconds).
export const REVEAL_GLITCH = 0.2;
export const REVEAL_EXPOSED = 1.0;
const ALIEN_GREEN = 0x7dff5a;
const ALIEN_SCALE = 1.9;

const PARTICLES = 220;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const FIRE = [0xffe08a, 0xffa23a, 0xff5a2b, 0x55627e];
const PEAK_LIGHT = 40; // brightness of an explosion's flash on its surroundings

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.anims = [];

    this.particles = [];
    for (let i = 0; i < PARTICLES; i++) {
      const mesh = new THREE.Mesh(UNIT_BOX, new THREE.MeshBasicMaterial({ transparent: true }));
      mesh.visible = false;
      scene.add(mesh);
      this.particles.push({ mesh, velocity: new THREE.Vector3(), life: 0, total: 1, size: 0.1 });
    }
    this.nextParticle = 0;
  }

  burst(position, color, count = 10, speed = 4, life = 0.6, size = 0.12) {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.nextParticle];
      this.nextParticle = (this.nextParticle + 1) % PARTICLES;
      p.mesh.visible = true;
      p.mesh.position.copy(position);
      p.mesh.material.color.setHex(Array.isArray(color) ? color[i % color.length] : color);
      p.mesh.material.opacity = 1;
      p.velocity
        .set(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      p.life = p.total = life * (0.6 + Math.random() * 0.6);
      p.size = size * (0.6 + Math.random() * 0.8);
      p.mesh.scale.setScalar(p.size);
    }
  }

  beam(from, to, { color = 0x8ff8ff, width = 0.07, seconds = 0.14 } = {}) {
    const length = from.distanceTo(to);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(UNIT_BOX, material);
    mesh.position.copy(from).lerp(to, 0.5);
    mesh.lookAt(to);
    mesh.scale.set(width, width, length);
    this.scene.add(mesh);
    let t = 0;
    this.anims.push((dt) => {
      t += dt;
      material.opacity = Math.max(0, 1 - t / seconds);
      if (t < seconds) return false;
      this.scene.remove(mesh);
      material.dispose();
      return true;
    });
  }

  // A column of light between the ground and the sky.
  column(position, color, seconds) {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 44, 12, 1, true), material);
    mesh.position.set(position.x, 22, position.z);
    this.scene.add(mesh);
    let t = 0;
    this.anims.push((dt) => {
      t += dt;
      const k = t / seconds;
      material.opacity = 0.4 * Math.sin(Math.min(1, k) * Math.PI);
      if (k < 1) return false;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
      return true;
    });
  }

  // Fireball, shockwave ring on the ground, flying debris and a flash of light.
  explosion(position, size = 1) {
    const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false };
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffc26a, ...additive }),
    );
    flash.position.copy(position);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.78, 1, 28),
      new THREE.MeshBasicMaterial({ color: 0xffa23a, side: THREE.DoubleSide, ...additive }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, 0.08, position.z);
    const light = new THREE.PointLight(0xffa040, PEAK_LIGHT * size, 40, 1.5);
    light.position.copy(position).setY(position.y + 1);
    this.scene.add(flash, ring, light);
    this.burst(position, FIRE, Math.round(34 * size), 10 * size, 1.0, 0.22);

    let t = 0;
    this.anims.push((dt) => {
      t += dt;
      const k = t / 0.55;
      flash.scale.setScalar(size * (0.6 + k * 3.4));
      flash.material.opacity = Math.max(0, 1 - k * 1.7);
      ring.scale.setScalar(size * (1 + k * 9));
      ring.material.opacity = Math.max(0, 1 - k);
      light.intensity = PEAK_LIGHT * size * Math.max(0, 1 - k);
      if (k < 1) return false;
      this.scene.remove(flash, ring, light);
      flash.geometry.dispose();
      flash.material.dispose();
      ring.geometry.dispose();
      ring.material.dispose();
      light.dispose();
      return true;
    });
  }

  // Text that rises from a point in the world and fades, sized to stay readable
  // from wherever the player is standing.
  floatText(position, text, color, cameraPos) {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 128;
    const c = canvas.getContext('2d');
    c.font = 'bold 92px ui-monospace, Menlo, Consolas, monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 12;
    c.strokeStyle = 'rgba(4, 10, 20, 0.9)';
    c.strokeText(text, 320, 68);
    c.fillStyle = color;
    c.fillText(text, 320, 68);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, fog: false });
    const sprite = new THREE.Sprite(material);
    const height = clamp(cameraPos.distanceTo(position) * 0.095, 0.4, 7);
    sprite.scale.set(height * 5, height, 1);
    sprite.position.copy(position);
    sprite.renderOrder = 10;
    this.scene.add(sprite);

    const startY = position.y;
    let t = 0;
    this.anims.push((dt) => {
      t += dt;
      const k = t / 2.2;
      sprite.position.y = startY + (1 - (1 - k) ** 2) * height * 1.2;
      material.opacity = k < 0.65 ? 1 : Math.max(0, 1 - (k - 0.65) / 0.35);
      if (k < 1) return false;
      this.scene.remove(sprite);
      texture.dispose();
      material.dispose();
      return true;
    });
  }

  // Unmasking, in three beats so there is no doubt what just happened:
  //   1. the disguise glitches like a failing hologram,
  //   2. it is blown off in pieces and a glowing alien stands there, exposed,
  //      taller than the animal it was hiding in and turned to face the player,
  //   3. it explodes.
  // `animal` must already be detached from the herd; this takes over its model.
  reveal(animal, cameraPos) {
    const disguise = animal.group;
    const at = disguise.position.clone().setY(0);
    const chest = at.clone().setY(1.9);
    animal.sign.visible = false;

    const pieces = disguise.children
      .filter((child) => child !== animal.sign && !animal.hitboxes.includes(child))
      .map((mesh) => ({ mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3() }));

    const alien = buildAlien();
    alien.group.position.copy(at);
    alien.group.rotation.y = Math.atan2(cameraPos.x - at.x, cameraPos.z - at.z);
    alien.group.visible = false;
    const light = new THREE.PointLight(ALIEN_GREEN, 0, 26, 1.4);
    light.position.copy(at).setY(3);
    this.scene.add(alien.group, light);

    let t = 0;
    let shattered = false;
    let sparkClock = 0;
    this.anims.push((dt) => {
      t += dt;

      if (t < REVEAL_GLITCH) {
        disguise.visible = Math.sin(t * 95) > -0.2;
        const squash = Math.sin(t * 70) * 0.14;
        disguise.scale.set(1 + squash, 1 - squash, 1 + squash);
        return false;
      }

      if (!shattered) {
        shattered = true;
        disguise.visible = true;
        disguise.scale.set(1, 1, 1);
        alien.group.visible = true;
        this.burst(chest, [ALIEN_GREEN, 0xffffff, ...animal.colors], 26, 8, 0.7, 0.16);
        for (const piece of pieces) {
          const p = piece.mesh.position;
          const flat = Math.hypot(p.x, p.z);
          const angle = flat > 0.05 ? Math.atan2(p.x, p.z) : Math.random() * Math.PI * 2;
          const speed = 3.5 + Math.random() * 4;
          piece.velocity.set(Math.sin(angle) * speed, 4 + Math.random() * 5, Math.cos(angle) * speed);
          piece.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14);
        }
      }

      const exposed = t - REVEAL_GLITCH;
      for (const piece of pieces) {
        piece.velocity.y -= 16 * dt;
        piece.mesh.position.addScaledVector(piece.velocity, dt);
        piece.mesh.rotation.x += piece.spin.x * dt;
        piece.mesh.rotation.y += piece.spin.y * dt;
        piece.mesh.rotation.z += piece.spin.z * dt;
        piece.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 1.4));
      }

      // The alien snaps up to full height, then thrashes.
      alien.group.scale.setScalar(ALIEN_SCALE * Math.min(1, 0.35 + (exposed / 0.12) * 0.65));
      alien.group.rotation.z = Math.sin(t * 46) * 0.07;
      alien.group.position.x = at.x + Math.sin(t * 80) * 0.05;
      alien.arms[0].rotation.z = -0.5 + Math.sin(t * 28) * 0.6;
      alien.arms[1].rotation.z = 0.5 - Math.sin(t * 28 + 1) * 0.6;
      light.intensity = 26 + Math.sin(t * 40) * 10;

      sparkClock -= dt;
      if (sparkClock <= 0) {
        sparkClock = 0.07;
        this.burst(chest, [ALIEN_GREEN, 0xffffff], 3, 6, 0.35, 0.1);
      }

      if (exposed < REVEAL_EXPOSED) return false;
      this.scene.remove(disguise, alien.group, light);
      animal.sign.material.dispose();
      light.dispose();
      this.explosion(chest, 1.2);
      return true;
    });
  }

  update(dt) {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.velocity.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      if (p.mesh.position.y < p.size / 2) {
        p.mesh.position.y = p.size / 2;
        p.velocity.multiplyScalar(0.5);
        p.velocity.y = Math.abs(p.velocity.y);
      }
      p.mesh.material.opacity = Math.min(1, (p.life / p.total) * 2);
    }
    // Copy first: an animation may add new ones (the reveal ends by starting an explosion).
    const running = this.anims;
    this.anims = [];
    for (const step of running) if (!step(dt)) this.anims.push(step);
  }
}
