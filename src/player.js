// First-person movement: WASD or arrow keys, Shift to run, Space to jump, mouse to look.
// On a touch screen the joystick sets `stick` instead of the keys (see touch.js).

import { WORLD_LIMIT } from './config.js';
import { resolveCollisions } from './collide.js';

const EYE_HEIGHT = 1.7;
const RADIUS = 0.4;
const WALK = 5.5;
const RUN = 9;
const JUMP = 6.5;
const GRAVITY = 20;
const SENSITIVITY = 0.0022;
const MAX_STEP = 0.2; // movement is split into steps this small so thin fences can't be skipped

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class Player {
  // spawn: { x, z, yaw } - where the level starts and which way the player faces.
  constructor(spawn) {
    this.pos = { x: spawn.x, y: 0, z: spawn.z };
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.vy = 0;
    this.keys = new Set();
    this.stick = { x: 0, y: 0 }; // touch joystick: x to the right, y forward, each -1..1
    this.speed = 0;
    this.bob = 0;
    this.shake = 0;
  }

  look(dx, dy, sensitivity = SENSITIVITY) {
    this.yaw -= dx * sensitivity;
    this.pitch = clamp(this.pitch - dy * sensitivity, -1.5, 1.5);
  }

  update(dt, colliders) {
    const k = this.keys;
    const down = (...codes) => codes.some((code) => k.has(code));
    let forward = (down('KeyW', 'ArrowUp') ? 1 : 0) - (down('KeyS', 'ArrowDown') ? 1 : 0);
    let strafe = (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0);
    let length = Math.hypot(forward, strafe);
    this.speed = length ? (down('ShiftLeft', 'ShiftRight') ? RUN : WALK) : 0;
    if (length) {
      forward /= length;
      strafe /= length;
    } else if (this.stick.x || this.stick.y) {
      // The joystick walks at the speed it is pushed, and runs when pushed to the rim.
      const push = Math.min(Math.hypot(this.stick.x, this.stick.y), 1);
      forward = this.stick.y / Math.max(push, 1e-6);
      strafe = this.stick.x / Math.max(push, 1e-6);
      length = push;
      this.speed = push > 0.92 ? RUN : WALK * Math.max(push, 0.35);
    }

    if (length) {
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      const moveX = (-sin * forward + cos * strafe) * this.speed * dt;
      const moveZ = (-cos * forward - sin * strafe) * this.speed * dt;
      const steps = Math.max(1, Math.ceil(Math.hypot(moveX, moveZ) / MAX_STEP));
      for (let i = 0; i < steps; i++) {
        this.pos.x += moveX / steps;
        this.pos.z += moveZ / steps;
        resolveCollisions(this.pos, RADIUS, colliders);
      }
      this.pos.x = clamp(this.pos.x, -WORLD_LIMIT, WORLD_LIMIT);
      this.pos.z = clamp(this.pos.z, -WORLD_LIMIT, WORLD_LIMIT);
      if (this.pos.y === 0) this.bob += dt * this.speed * 1.7;
    }

    if (k.has('Space') && this.pos.y === 0) this.vy = JUMP;
    if (this.vy !== 0 || this.pos.y > 0) {
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.vy = 0;
      }
    }

    this.shake = Math.max(0, this.shake - dt);
  }

  applyTo(camera) {
    const bob = Math.sin(this.bob) * 0.035;
    const jolt = this.shake > 0 ? this.shake * 0.12 : 0;
    camera.position.set(this.pos.x, this.pos.y + EYE_HEIGHT + bob, this.pos.z);
    camera.rotation.set(
      this.pitch + (Math.random() - 0.5) * jolt,
      this.yaw + (Math.random() - 0.5) * jolt,
      0,
    );
  }
}
