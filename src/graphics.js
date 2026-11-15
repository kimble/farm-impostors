// The renderer and the finishing touches on each frame: film-like tone mapping, soft
// shadows, and a bloom that makes everything that gives off light actually glow.
//
// Two quality levels. 'high' is the full picture. 'low' skips the bloom and draws at a
// lower resolution, for computers that cannot keep up.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const QUALITY_LEVELS = ['high', 'low'];
export const QUALITY_LABELS = { high: 'High', low: 'Low' };

// Now and then a single pixel comes out of the lighting maths as not-a-number or
// absurdly bright (seen on the far ground at a grazing angle). On its own it is one
// invisible dot, but the bloom would smear it over the whole picture and black the
// screen out. This pass replaces any such pixel with black before the bloom sees it.
const DropBrokenPixels = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      bool sound = c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0 && max(c.r, max(c.g, c.b)) < 1000.0;
      gl_FragColor = vec4(sound ? c : vec3(0.0), 1.0);
    }`,
};

export class Graphics {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    container.appendChild(this.renderer.domElement);
    this.quality = 'high';
    this.composer = null;
  }

  // The world is drawn first, then the held blaster on top of it (with its own depth,
  // so it never pokes through a wall), then broken pixels are dropped and both are
  // bloomed together.
  setScenes(world, worldCamera, held, heldCamera) {
    this.world = world;
    this.worldCamera = worldCamera;
    this.held = held;
    this.heldCamera = heldCamera;

    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.heldPass = new RenderPass(held, heldCamera);
    this.heldPass.clear = false;
    this.heldPass.clearDepth = true;
    this.bloom = new UnrealBloomPass(size.clone(), 0.42, 0.55, 0.9);
    this.composer.addPass(new RenderPass(world, worldCamera));
    this.composer.addPass(this.heldPass);
    this.composer.addPass(new ShaderPass(DropBrokenPixels));
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setQuality(level) {
    this.quality = level === 'low' ? 'low' : 'high';
    this.resize(this.width, this.height);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    const ratio = this.quality === 'high' ? Math.min(window.devicePixelRatio, 2) : 1;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setPixelRatio(ratio);
      this.composer.setSize(width, height);
    }
  }

  render(showHeld) {
    if (this.quality === 'high') {
      this.heldPass.enabled = showHeld;
      this.composer.render();
      return;
    }
    this.renderer.autoClear = true;
    this.renderer.render(this.world, this.worldCamera);
    if (showHeld) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.held, this.heldCamera);
    }
  }
}
