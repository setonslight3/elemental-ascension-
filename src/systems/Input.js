/**
 * Input.js — one action model, three sources (keyboard, gamepad, touch).
 *
 * Gameplay code never asks "is the D key down"; it asks for `axis.x` and
 * `pressed('jump')`. That is what lets the same Player class run identically
 * on a desktop keyboard, a controller and a phone.
 *
 * Buffering lives here too: `pressed()` reports a press that happened within
 * the last `bufferMs`, and `consume()` clears it. That is how a jump pressed
 * two frames before landing still fires — the single biggest feel difference
 * between a platformer that responds and one that "eats inputs".
 */

export const ACTIONS = [
  'left', 'right', 'up', 'down',
  'jump', 'attack', 'block', 'roll', 'sprint',
  'ability1', 'ability2', 'ability3', 'ability4',
  'ultimate', 'potion', 'pause', 'interact'
];

const KEY_MAP = {
  left: ['A', 'LEFT'],
  right: ['D', 'RIGHT'],
  up: ['W', 'UP'],
  down: ['S', 'DOWN'],
  jump: ['SPACE'],
  attack: ['J', 'Z'],
  block: ['K', 'X'],
  roll: ['L', 'C', 'SHIFT'],
  sprint: ['SHIFT'],
  ability1: ['ONE', 'U'],
  ability2: ['TWO', 'I'],
  ability3: ['THREE', 'O'],
  ability4: ['FOUR', 'P'],
  ultimate: ['Q', 'FIVE'],
  potion: ['R'],
  pause: ['ESC'],
  interact: ['E', 'ENTER']
};

/** Standard gamepad button indices -> actions. */
const PAD_MAP = {
  0: 'jump',
  1: 'roll',
  2: 'attack',
  3: 'potion',
  4: 'block',
  5: 'ability1',
  6: 'ability2',
  7: 'ability3',
  9: 'pause',
  10: 'ultimate',
  11: 'ability4',
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right'
};

const STICK_DEADZONE = 0.22;
const SPRINT_THRESHOLD = 0.74;

export class InputManager {
  constructor(scene, profile) {
    this.scene = scene;
    this.profile = profile;
    this.bufferMs = 130;

    this.state = Object.create(null);
    this.prev = Object.create(null);
    this.pressedAt = Object.create(null);
    for (const a of ACTIONS) { this.state[a] = false; this.prev[a] = false; this.pressedAt[a] = -1e9; }

    /** Written by TouchControls each frame. */
    this.touch = { x: 0, y: 0, active: false, actions: Object.create(null) };

    this.axis = { x: 0, y: 0 };
    this.analogMagnitude = 0;
    this.lastSource = 'keyboard';

    this._keys = {};
    this._bindKeyboard();

    this.pad = null;
    if (scene.input.gamepad) {
      scene.input.gamepad.once('connected', (pad) => { this.pad = pad; });
      // A pad connected before this scene started is already in the list.
      if (scene.input.gamepad.total > 0) this.pad = scene.input.gamepad.getPad(0);
    }
  }

  _bindKeyboard() {
    const kb = this.scene.input.keyboard;
    if (!kb) return;
    const codes = Phaser.Input.Keyboard.KeyCodes;
    for (const [action, keys] of Object.entries(KEY_MAP)) {
      this._keys[action] = keys
        .map((k) => (codes[k] !== undefined ? kb.addKey(codes[k], true, false) : null))
        .filter(Boolean);
    }
    // Stop the browser from scrolling the page on arrows/space.
    kb.addCapture(['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
  }

  /** Feed synthetic state from the on-screen controls. */
  setTouch(axisX, axisY, actions, active) {
    this.touch.x = axisX;
    this.touch.y = axisY;
    this.touch.active = active;
    this.touch.actions = actions;
  }

  update() {
    for (const a of ACTIONS) this.prev[a] = this.state[a];

    const next = Object.create(null);
    for (const a of ACTIONS) next[a] = false;

    // --- keyboard ---------------------------------------------------------
    let keyboardActive = false;
    for (const [action, keys] of Object.entries(this._keys)) {
      for (const key of keys) {
        if (key.isDown) { next[action] = true; keyboardActive = true; }
      }
    }

    // --- gamepad ----------------------------------------------------------
    let padX = 0, padY = 0;
    if (this.scene.input.gamepad && this.scene.input.gamepad.total > 0) {
      this.pad = this.pad || this.scene.input.gamepad.getPad(0);
    }
    if (this.pad && this.pad.connected) {
      const buttons = this.pad.buttons || [];
      for (const [idx, action] of Object.entries(PAD_MAP)) {
        const b = buttons[idx];
        if (b && (b.pressed || b.value > 0.5)) next[action] = true;
      }
      const ax = this.pad.axes?.[0]?.getValue?.() ?? 0;
      const ay = this.pad.axes?.[1]?.getValue?.() ?? 0;
      if (Math.abs(ax) > STICK_DEADZONE) padX = ax;
      if (Math.abs(ay) > STICK_DEADZONE) padY = ay;
      if (padX || padY || buttons.some((b) => b && b.pressed)) this.lastSource = 'gamepad';
    }

    // --- touch ------------------------------------------------------------
    // Holding the stick counts as touch input on its own. Without this, a
    // player who only ever drives the stick is still classed as a keyboard
    // user, and push-to-sprint (which is gated on not being on a keyboard)
    // silently never fires.
    if (this.touch.active) this.lastSource = 'touch';
    for (const [action, on] of Object.entries(this.touch.actions)) {
      if (on) { next[action] = true; this.lastSource = 'touch'; }
    }

    if (keyboardActive) this.lastSource = 'keyboard';

    // --- resolve the movement axis ---------------------------------------
    let x = 0, y = 0;
    if (next.left) x -= 1;
    if (next.right) x += 1;
    if (next.up) y -= 1;
    if (next.down) y += 1;

    if (Math.abs(padX) > Math.abs(x)) x = padX;
    if (Math.abs(padY) > Math.abs(y)) y = padY;
    if (this.touch.active) {
      if (Math.abs(this.touch.x) > Math.abs(x)) x = this.touch.x;
      if (Math.abs(this.touch.y) > Math.abs(y)) y = this.touch.y;
    }

    this.axis.x = Math.max(-1, Math.min(1, x));
    this.axis.y = Math.max(-1, Math.min(1, y));
    this.analogMagnitude = Math.abs(this.axis.x);

    // Directional flags stay in sync with the analog axis so gameplay can use
    // either without them ever disagreeing.
    next.left = next.left || this.axis.x < -STICK_DEADZONE;
    next.right = next.right || this.axis.x > STICK_DEADZONE;
    next.up = next.up || this.axis.y < -STICK_DEADZONE;
    next.down = next.down || this.axis.y > STICK_DEADZONE;

    // Pushing the stick to the edge is a sprint — no extra button on mobile.
    if (this.analogMagnitude > SPRINT_THRESHOLD && this.lastSource !== 'keyboard') next.sprint = true;
    if (this.profile?.settings?.autoSprint && Math.abs(this.axis.x) > STICK_DEADZONE) next.sprint = true;

    const now = performance.now();
    for (const a of ACTIONS) {
      this.state[a] = next[a];
      if (next[a] && !this.prev[a]) this.pressedAt[a] = now;
    }
  }

  /* -------------------------------------------------------------- queries */

  down(action) { return !!this.state[action]; }

  /** True on the frame the action went down. */
  justDown(action) { return !!this.state[action] && !this.prev[action]; }

  justUp(action) { return !this.state[action] && !!this.prev[action]; }

  /** True if the action was pressed within the buffer window and not consumed. */
  pressed(action, windowMs = this.bufferMs) {
    return performance.now() - this.pressedAt[action] <= windowMs;
  }

  /** Clear a buffered press so it can't fire twice. */
  consume(action) { this.pressedAt[action] = -1e9; }

  /** Convenience: buffered press that is consumed on read. */
  take(action, windowMs = this.bufferMs) {
    if (this.pressed(action, windowMs)) { this.consume(action); return true; }
    return false;
  }

  /** Which of the four ability slots was requested this frame, or -1. */
  takeAbility() {
    for (let i = 1; i <= 4; i++) {
      if (this.take(`ability${i}`)) return i - 1;
    }
    return -1;
  }

  destroy() {
    const kb = this.scene.input.keyboard;
    if (kb) {
      for (const keys of Object.values(this._keys)) {
        for (const key of keys) kb.removeKey(key, true);
      }
    }
    this._keys = {};
  }
}
