// The swarm on the ridge: drones circling high overhead. With each signal one of them
// peels off and dives at the player as the hunter (drone.js), wearing its number, so the
// swarm overhead thins out as the player brings them down.

import * as THREE from 'three';
import { buildDrone } from './models.js';

const RING = 15; // radius of the formation, in metres
const HEIGHT = 30;

export class Swarm {
  // centre: the point on the ground the swarm circles over.
  constructor(scene, centre, count) {
    this.scene = scene;
    this.centre = centre.clone();
    this.drones = [];
    this.reset(count);
  }

  // A full swarm of `count` drones (for a new run).
  reset(count) {
    for (const d of this.drones) this.scene.remove(d.group);
    this.drones = [];
    for (let i = 0; i < count; i++) {
      const { group, ring } = buildDrone();
      group.scale.setScalar(1.1);
      this.scene.add(group);
      // Two loose rings, one above the other, turning opposite ways.
      const tier = i % 2;
      this.drones.push({ group, ring, angle: (i / count) * Math.PI * 2, tier, phase: i * 1.7 });
    }
  }

  get remaining() {
    return this.drones.length;
  }

  // Takes one drone out of the formation (the one nearest `toward`, if given) and
  // returns where it was, for the hunter to launch from.
  release(toward = null) {
    if (!this.drones.length) return this.centre.clone().setY(HEIGHT);
    let index = 0;
    if (toward) {
      let best = Infinity;
      this.drones.forEach((d, i) => {
        const gap = d.group.position.distanceToSquared(toward);
        if (gap < best) {
          best = gap;
          index = i;
        }
      });
    }
    const [drone] = this.drones.splice(index, 1);
    this.scene.remove(drone.group);
    return drone.group.position.clone();
  }

  update(dt, time) {
    for (const d of this.drones) {
      const turn = d.tier ? -0.18 : 0.13;
      const angle = d.angle + time * turn;
      const r = RING + d.tier * 6 + Math.sin(time * 0.7 + d.phase) * 1.5;
      d.group.position.set(
        this.centre.x + Math.cos(angle) * r,
        HEIGHT + d.tier * 7 + Math.sin(time * 1.3 + d.phase) * 1.2,
        this.centre.z + Math.sin(angle) * r,
      );
      // Facing along its path, with the ring spinning.
      d.group.rotation.set(0, -angle + (d.tier ? 0 : Math.PI), 0);
      d.ring.rotation.x = time * 3 + d.phase;
    }
  }
}
