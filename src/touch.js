// Touch controls for phones and tablets: a floating joystick wherever the left thumb lands,
// drag anywhere on the right half to look, and buttons to fire, jump, switch blaster and
// pause. The fire button keeps aiming while held, so a shot can be lined up and fired
// without lifting the thumb.

// Radians of turn per CSS pixel of drag. The mouse uses 0.0022 per (device) count.
const LOOK = 0.0052;
const STICK_RADIUS = 56; // CSS pixels from the centre of the joystick to its rim
const DEAD_ZONE = 0.12;

// A first guess, before the player has pressed anything: a screen with no mouse that can
// hover. Only a guess (it sets the start screen's help and the default graphics); the
// controls follow whatever actually presses Start, since touch-screen laptops and some
// Linux setups report a coarse pointer while a mouse is in use.
export function looksLikeTouch(params) {
  if (params.has('touch')) return true;
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export class TouchControls {
  // player: the Player, which reads `stick` and `keys`.
  // actions: { fire(), pause(), active() } - `active` says whether the game takes input now.
  constructor(player, actions) {
    this.player = player;
    this.actions = actions;
    this.layer = document.getElementById('touch');
    this.base = document.getElementById('stick');
    this.knob = document.getElementById('stick-knob');
    this.stick = null; // { id, x, y } - the pointer driving the joystick and where it landed
    this.looks = new Map(); // pointer id -> last { x, y }

    const on = (type, fn) => this.layer.addEventListener(type, fn);
    on('pointerdown', (e) => this.down(e));
    on('pointermove', (e) => this.move(e));
    on('pointerup', (e) => this.up(e));
    on('pointercancel', (e) => this.up(e));
    // Stop long presses from opening the context menu or selecting text.
    on('contextmenu', (e) => e.preventDefault());
  }

  down(event) {
    event.preventDefault();
    if (!this.actions.active()) return;
    const id = event.pointerId;
    const button = event.target.closest('[data-touch]');
    const kind = button && button.dataset.touch;

    if (kind === 'pause') {
      this.actions.pause();
      return;
    }
    if (kind === 'jump') {
      this.player.keys.add('Space');
      button.classList.add('held');
      this.jumpId = id;
      return;
    }
    if (kind === 'fire') {
      button.classList.add('held');
      this.actions.fire();
      // ...and dragging from the button carries on aiming.
    }
    if (!kind && event.clientX < window.innerWidth / 2 && !this.stick) {
      this.stick = { id, x: event.clientX, y: event.clientY };
      this.base.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      this.knob.style.transform = 'translate(0, 0)';
      this.base.hidden = false;
      return;
    }
    this.looks.set(id, { x: event.clientX, y: event.clientY, button });
  }

  move(event) {
    const id = event.pointerId;
    if (this.stick && this.stick.id === id) {
      let dx = event.clientX - this.stick.x;
      let dy = event.clientY - this.stick.y;
      const length = Math.hypot(dx, dy);
      if (length > STICK_RADIUS) {
        dx *= STICK_RADIUS / length;
        dy *= STICK_RADIUS / length;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const amount = Math.min(length / STICK_RADIUS, 1);
      const scale = amount < DEAD_ZONE ? 0 : 1 / STICK_RADIUS;
      this.player.stick.x = dx * scale;
      this.player.stick.y = -dy * scale;
      this.base.classList.toggle('run', amount > 0.92);
      return;
    }
    const last = this.looks.get(id);
    if (!last) return;
    if (this.actions.active()) {
      this.player.look(event.clientX - last.x, event.clientY - last.y, LOOK);
    }
    last.x = event.clientX;
    last.y = event.clientY;
  }

  up(event) {
    const id = event.pointerId;
    if (this.stick && this.stick.id === id) this.releaseStick();
    if (this.jumpId === id) this.releaseJump();
    const look = this.looks.get(id);
    if (look && look.button) look.button.classList.remove('held');
    this.looks.delete(id);
  }

  releaseStick() {
    this.stick = null;
    this.player.stick.x = 0;
    this.player.stick.y = 0;
    this.base.hidden = true;
    this.base.classList.remove('run');
  }

  releaseJump() {
    this.player.keys.delete('Space');
    this.jumpId = null;
    for (const button of this.layer.querySelectorAll('[data-touch="jump"]')) button.classList.remove('held');
  }

  // Lets go of everything, e.g. when the game pauses with a thumb still down.
  reset() {
    this.releaseStick();
    this.releaseJump();
    for (const button of this.layer.querySelectorAll('.held')) button.classList.remove('held');
    this.looks.clear();
  }
}
