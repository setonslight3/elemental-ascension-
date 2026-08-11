/**
 * TouchControls.js — the on-screen controls for phones and tablets.
 *
 * Deliberate choices, all of them learned from mobile action games that get
 * this wrong:
 *
 *  - **Multi-touch by hand.** Pointers are tracked manually rather than via
 *    per-object hit areas, so holding block with one thumb while the other
 *    drives the stick works, and sliding off a button mid-press does not
 *    silently release it.
 *  - **Floating stick.** The stick materialises wherever the left thumb lands
 *    instead of living at a fixed spot the player has to find without looking.
 *  - **Sprint by push.** Pushing the stick past ~75% sprints, so there is no
 *    extra button competing for thumb space.
 *  - **Generous hit radii.** Every button accepts touches well outside its
 *    drawn circle; the visual is smaller than the target on purpose.
 *  - **Sticky claim.** A pointer that grabs a button keeps it until release,
 *    so a drifting thumb never swaps buttons mid-combo.
 *  - **Auto-hide.** The whole layer fades out when a keyboard or pad is used
 *    and fades back in on the next touch.
 */

import { VIEW } from '../data/Balance.js';

const BASE_LAYOUT = [
  // action      x     y    r    glyph            tint
  { action: 'potion',   x: 622,  y: 655, r: 30, glyph: 'gl_potion',   tint: 0x6bff9c, small: true },
  { action: 'ability1', x: 700,  y: 655, r: 33, glyph: 'gl_fireball', tint: 0xff8a3d, ability: 0 },
  { action: 'ability2', x: 774,  y: 655, r: 33, glyph: 'gl_flamedash',tint: 0xffb43d, ability: 1 },
  { action: 'ability3', x: 848,  y: 655, r: 33, glyph: 'gl_eruption', tint: 0xff5a2a, ability: 2 },
  { action: 'ability4', x: 922,  y: 655, r: 33, glyph: 'gl_infernoWave', tint: 0xff3d6b, ability: 3 },
  { action: 'ultimate', x: 862,  y: 556, r: 38, glyph: 'gl_ultimate', tint: 0xffd451 },
  { action: 'block',    x: 1182, y: 452, r: 47, glyph: 'gl_block',    tint: 0x59f2ff },
  { action: 'roll',     x: 1056, y: 506, r: 45, glyph: 'gl_roll',     tint: 0xc074ff },
  { action: 'jump',     x: 1048, y: 646, r: 49, glyph: 'gl_jump',     tint: 0x9ad3ff },
  { action: 'attack',   x: 1180, y: 592, r: 57, glyph: 'gl_attack',   tint: 0xff6b3d }
];

export class TouchControls {
  /**
   * @param {Phaser.Scene} scene the HUD scene (screen-space, no camera scroll)
   * @param {import('./Input.js').InputManager} input
   * @param {import('./Profile.js').Profile} profile
   */
  constructor(scene, input, profile) {
    this.scene = scene;
    this.input = input;
    this.profile = profile;

    this.enabled = scene.game.device.input.touch || scene.sys.game.device.os.android || scene.sys.game.device.os.iOS;
    this.visible = this.enabled;
    this.alphaTarget = this.enabled ? (profile.settings.touchOpacity ?? 0.55) : 0;

    this.buttons = [];
    this.actionState = Object.create(null);
    this.stick = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };

    /** pointerId -> button (sticky claim) */
    this.claims = new Map();

    this.container = scene.add.container(0, 0).setDepth(900).setScrollFactor(0);
    this.container.setAlpha(0);

    this._buildStick();
    this._buildButtons();
    this._wirePointers();

    this.lastTouchTime = 0;
  }

  /* ------------------------------------------------------------------ setup */

  get scale() { return this.profile.settings.touchScale ?? 1; }
  get leftHanded() { return !!this.profile.settings.leftHanded; }

  /** Mirror a design-space x when the player is left-handed. */
  _mx(x) { return this.leftHanded ? VIEW.WIDTH - x : x; }

  /**
   * Scale a button around the bottom-outer corner so that shrinking the
   * controls keeps them under the thumb instead of drifting to the middle.
   */
  _place(base) {
    const s = this.scale;
    const anchorX = this.leftHanded ? 0 : VIEW.WIDTH;
    const anchorY = VIEW.HEIGHT;
    const x = this._mx(base.x);
    return {
      x: anchorX + (x - anchorX) * s,
      y: anchorY + (base.y - anchorY) * s,
      r: base.r * s
    };
  }

  _buildStick() {
    this.stickBase = this.scene.add.image(0, 0, 'stickBase')
      .setScrollFactor(0).setAlpha(0).setDepth(899);
    this.stickNub = this.scene.add.image(0, 0, 'stickNub')
      .setScrollFactor(0).setAlpha(0).setDepth(900);
    this.stickBase.setDisplaySize(150 * this.scale, 150 * this.scale);
    this.stickNub.setDisplaySize(66 * this.scale, 66 * this.scale);
    this.container.add([this.stickBase, this.stickNub]);
  }

  _buildButtons() {
    for (const base of BASE_LAYOUT) {
      const pos = this._place(base);
      const ring = this.scene.add.image(pos.x, pos.y, 'btn')
        .setDisplaySize(pos.r * 2, pos.r * 2)
        .setTint(base.tint)
        .setScrollFactor(0);
      const glow = this.scene.add.image(pos.x, pos.y, 'btnFill')
        .setDisplaySize(pos.r * 2.1, pos.r * 2.1)
        .setTint(base.tint)
        .setAlpha(0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScrollFactor(0);
      const icon = this.scene.add.image(pos.x, pos.y, base.glyph)
        .setDisplaySize(pos.r * 1.15, pos.r * 1.15)
        .setTint(0xffffff)
        .setScrollFactor(0);
      const cd = this.scene.add.graphics().setScrollFactor(0);

      const btn = {
        ...base, x: pos.x, y: pos.y, r: pos.r,
        hitR: pos.r * 1.32, ring, glow, icon, cd,
        held: false, ready: true, ratio: 1, label: null
      };
      this.buttons.push(btn);
      this.container.add([glow, ring, icon, cd]);
    }
  }

  _wirePointers() {
    const input = this.scene.input;
    // Five simultaneous touches covers stick + four buttons.
    input.addPointer(4);

    this._onDown = (pointer) => this._handleDown(pointer);
    this._onMove = (pointer) => this._handleMove(pointer);
    this._onUp = (pointer) => this._handleUp(pointer);

    input.on('pointerdown', this._onDown);
    input.on('pointermove', this._onMove);
    input.on('pointerup', this._onUp);
    input.on('pointerupoutside', this._onUp);
    input.on('gameout', () => this.releaseAll());
  }

  /* ------------------------------------------------------------- pointer io */

  /** Convert a pointer's screen position into design-space coordinates. */
  _toDesign(pointer) {
    const cam = this.scene.cameras.main;
    return { x: pointer.x + cam.scrollX * 0, y: pointer.y };
  }

  _stickZoneContains(x) {
    const edge = VIEW.WIDTH * 0.44;
    return this.leftHanded ? x > VIEW.WIDTH - edge : x < edge;
  }

  _buttonAt(x, y) {
    let best = null;
    let bestDist = Infinity;
    for (const btn of this.buttons) {
      if (btn.hidden) continue;
      const d = Phaser.Math.Distance.Between(x, y, btn.x, btn.y);
      if (d <= btn.hitR && d < bestDist) { best = btn; bestDist = d; }
    }
    return best;
  }

  _handleDown(pointer) {
    if (!this.enabled) return;
    this.lastTouchTime = performance.now();
    const { x, y } = this._toDesign(pointer);

    const btn = this._buttonAt(x, y);
    if (btn) {
      this.claims.set(pointer.id, btn);
      btn.held = true;
      this._flash(btn);
      return;
    }
    if (!this.stick.active && this._stickZoneContains(x)) {
      this.stick.active = true;
      this.stick.id = pointer.id;
      this.stick.ox = x;
      this.stick.oy = y;
      this.stick.x = 0;
      this.stick.y = 0;
    }
  }

  _handleMove(pointer) {
    if (!this.enabled) return;
    const { x, y } = this._toDesign(pointer);
    if (this.stick.active && this.stick.id === pointer.id) {
      const radius = 78 * this.scale;
      let dx = x - this.stick.ox;
      let dy = y - this.stick.oy;
      const len = Math.hypot(dx, dy);
      // Drag the stick origin along if the thumb travels past the ring, so the
      // stick never "runs out" mid-sprint.
      if (len > radius * 1.6) {
        const pull = len - radius * 1.6;
        this.stick.ox += (dx / len) * pull;
        this.stick.oy += (dy / len) * pull;
        dx = x - this.stick.ox;
        dy = y - this.stick.oy;
      }
      const clamped = Math.min(1, Math.hypot(dx, dy) / radius);
      const ang = Math.atan2(dy, dx);
      this.stick.x = Math.cos(ang) * clamped;
      this.stick.y = Math.sin(ang) * clamped;
    }
  }

  _handleUp(pointer) {
    const btn = this.claims.get(pointer.id);
    if (btn) {
      btn.held = false;
      this.claims.delete(pointer.id);
    }
    if (this.stick.active && this.stick.id === pointer.id) {
      this.stick.active = false;
      this.stick.id = -1;
      this.stick.x = 0;
      this.stick.y = 0;
    }
  }

  releaseAll() {
    for (const btn of this.buttons) btn.held = false;
    this.claims.clear();
    this.stick.active = false;
    this.stick.id = -1;
    this.stick.x = 0;
    this.stick.y = 0;
  }

  _flash(btn) {
    btn.glow.setAlpha(0.85);
    this.scene.tweens.add({ targets: btn.glow, alpha: 0, duration: 260, ease: 'Quad.easeOut' });
    if (this.profile.settings.haptics && navigator.vibrate) {
      try { navigator.vibrate(8); } catch { /* unsupported */ }
    }
  }

  /* ------------------------------------------------------------------ frame */

  /**
   * @param {object} status live per-button state from the play scene:
   *   { abilities: [{ready, ratio, locked, cost}], ultimate: {ready, ratio},
   *     potions: n, blockLocked: bool }
   */
  update(dt, status = {}) {
    // Fade the layer with input source.
    if (this.enabled) {
      const usingTouch = this.input.lastSource === 'touch' ||
        performance.now() - this.lastTouchTime < 4000;
      const target = usingTouch ? (this.profile.settings.touchOpacity ?? 0.55) : 0.12;
      this.container.setAlpha(Phaser.Math.Linear(this.container.alpha, target, Math.min(1, dt * 6)));
    }

    // Publish action state to the input manager.
    const actions = this.actionState;
    for (const k of Object.keys(actions)) actions[k] = false;
    for (const btn of this.buttons) {
      if (btn.held && !btn.hidden) actions[btn.action] = true;
    }
    this.input.setTouch(this.stick.x, this.stick.y, actions, this.stick.active);

    // Stick visuals.
    const showStick = this.stick.active;
    this.stickBase.setPosition(this.stick.ox, this.stick.oy).setAlpha(showStick ? 0.85 : 0);
    this.stickNub
      .setPosition(this.stick.ox + this.stick.x * 74 * this.scale, this.stick.oy + this.stick.y * 74 * this.scale)
      .setAlpha(showStick ? 1 : 0);
    // Tint the nub when the push is deep enough to sprint.
    this.stickNub.setTint(Math.abs(this.stick.x) > 0.74 ? 0xffd166 : 0xffffff);

    // Button state: cooldown wedges, lock-out dimming, ready pulses.
    const abilities = status.abilities || [];
    for (const btn of this.buttons) {
      let ready = true;
      let ratio = 1;
      let hidden = false;

      if (btn.ability !== undefined) {
        const a = abilities[btn.ability];
        if (!a || a.locked) { hidden = true; }
        else { ready = a.ready; ratio = a.ratio; }
      } else if (btn.action === 'ultimate') {
        const u = status.ultimate || { ready: false, ratio: 0 };
        ready = u.ready;
        ratio = u.ratio;
      } else if (btn.action === 'potion') {
        ready = (status.potions || 0) > 0;
        ratio = ready ? 1 : 0;
      }

      btn.hidden = hidden;
      const baseAlpha = hidden ? 0 : 1;
      btn.ring.setAlpha(baseAlpha * (ready ? 1 : 0.45));
      btn.icon.setAlpha(baseAlpha * (ready ? 1 : 0.35));
      if (hidden) { btn.cd.clear(); continue; }

      // Radial "filling up" wedge for anything on cooldown or charging.
      btn.cd.clear();
      if (ratio < 1) {
        btn.cd.fillStyle(0x000000, 0.45);
        btn.cd.slice(btn.x, btn.y, btn.r - 2, Phaser.Math.DegToRad(-90 + 360 * ratio), Phaser.Math.DegToRad(270), false);
        btn.cd.fillPath();
      } else if (ready && btn.action === 'ultimate') {
        // Ultimate ready: a soft breathing halo so it reads at a glance.
        const pulse = 0.35 + Math.sin(performance.now() / 220) * 0.25;
        btn.glow.setAlpha(Math.max(btn.glow.alpha, pulse));
      }

      if (btn.held) btn.ring.setScale(btn.ring.scaleX * 0.98, btn.ring.scaleY * 0.98);
    }

    // Potion count badge.
    if (!this._potionLabel) {
      const potionBtn = this.buttons.find((b) => b.action === 'potion');
      this._potionLabel = this.scene.add.text(potionBtn.x + potionBtn.r * 0.7, potionBtn.y + potionBtn.r * 0.6, '', {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '18px', color: '#eaffef'
      }).setOrigin(0.5).setScrollFactor(0);
      this.container.add(this._potionLabel);
    }
    this._potionLabel.setText(String(status.potions ?? 0));
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) { this.releaseAll(); this.container.setAlpha(0); }
  }

  /** Rebuild after a settings change (scale / handedness). */
  refreshLayout() {
    for (const btn of this.buttons) {
      const base = BASE_LAYOUT.find((b) => b.action === btn.action);
      const pos = this._place(base);
      btn.x = pos.x; btn.y = pos.y; btn.r = pos.r; btn.hitR = pos.r * 1.32;
      btn.ring.setPosition(pos.x, pos.y).setDisplaySize(pos.r * 2, pos.r * 2);
      btn.glow.setPosition(pos.x, pos.y).setDisplaySize(pos.r * 2.1, pos.r * 2.1);
      btn.icon.setPosition(pos.x, pos.y).setDisplaySize(pos.r * 1.15, pos.r * 1.15);
    }
    this.stickBase.setDisplaySize(150 * this.scale, 150 * this.scale);
    this.stickNub.setDisplaySize(66 * this.scale, 66 * this.scale);
    if (this._potionLabel) {
      const p = this.buttons.find((b) => b.action === 'potion');
      this._potionLabel.setPosition(p.x + p.r * 0.7, p.y + p.r * 0.6);
    }
  }

  destroy() {
    const input = this.scene.input;
    input.off('pointerdown', this._onDown);
    input.off('pointermove', this._onMove);
    input.off('pointerup', this._onUp);
    input.off('pointerupoutside', this._onUp);
    this.container.destroy(true);
    this.stickBase.destroy();
    this.stickNub.destroy();
  }
}
