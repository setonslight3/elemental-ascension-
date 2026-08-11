/**
 * FX.js — particles, damage numbers, shake, hitstop and screen flashes.
 *
 * The particle system is hand-rolled rather than using Phaser's emitters: a
 * fixed pool of recycled Images with a tiny integrator. That gives a hard
 * ceiling on how many sprites can ever exist (critical on phones), lets the
 * quality setting shrink the budget on the fly, and keeps every effect a
 * single function call from gameplay code.
 */

import { FX as FXCONF, HITSTOP_CAP } from '../data/Balance.js';
import { FIRE_RAMP } from './Art.js';
import { rnd } from '../utils/Rand.js';

class Particle {
  constructor(sprite) {
    this.s = sprite;
    this.alive = false;
    this.vx = 0; this.vy = 0;
    this.gravity = 0;
    this.drag = 0;
    this.life = 0; this.maxLife = 1;
    this.scaleFrom = 1; this.scaleTo = 0;
    this.alphaFrom = 1; this.alphaTo = 0;
    this.spin = 0;
    this.ramp = null;
  }
}

export class FX {
  constructor(scene, profile) {
    this.scene = scene;
    this.profile = profile;

    this.quality = this._resolveQuality();
    this.budget = this.quality === 'low' ? FXCONF.PARTICLE_BUDGET_LOW : FXCONF.PARTICLE_BUDGET_HIGH;

    this.pool = [];
    this.active = [];
    this.hitstopTimer = 0;

    this._layer = scene.add.container(0, 0).setDepth(60);
    this._prewarm();

    this._numbers = [];
    this._numberIdx = 0;
    this._buildNumbers();
  }

  _resolveQuality() {
    const setting = this.profile?.settings?.quality ?? 'auto';
    if (setting !== 'auto') return setting;
    // Auto: assume a phone or a low-core device wants the cheap path.
    const cores = navigator.hardwareConcurrency || 4;
    const touch = this.scene.game.device.input.touch;
    const mem = navigator.deviceMemory || 4;
    return (touch && (cores <= 6 || mem <= 4)) ? 'low' : 'high';
  }

  _prewarm() {
    for (let i = 0; i < this.budget; i++) {
      const s = this.scene.add.image(0, 0, 'spark')
        .setActive(false).setVisible(false).setDepth(60);
      this._layer.add(s);
      this.pool.push(new Particle(s));
    }
  }

  _buildNumbers() {
    for (let i = 0; i < FXCONF.DAMAGE_NUMBER_POOL; i++) {
      const t = this.scene.add.text(0, 0, '', {
        fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
        stroke: '#160b14',
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(70).setVisible(false).setActive(false);
      this._numbers.push(t);
    }
  }

  /* ---------------------------------------------------------------- spawn */

  _take() {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.alive) return p;
    }
    // Budget exhausted: steal the oldest so new, more relevant effects win.
    return this.active.length ? this.active[0] : null;
  }

  /**
   * Fire off a burst of particles.
   * @param {number} x @param {number} y
   * @param {object} o
   *   count, texture, tint | ramp, speed [min,max], angle [min,max] (radians),
   *   life [min,max], scale [from,to], alpha [from,to], gravity, drag, spin,
   *   blend, depth
   */
  burst(x, y, o = {}) {
    const scale = this.quality === 'low' ? 0.55 : 1;
    const count = Math.max(1, Math.round((o.count ?? 8) * scale));
    const tex = o.texture || 'spark';
    const [sMin, sMax] = o.speed || [80, 240];
    const [aMin, aMax] = o.angle || [0, Math.PI * 2];
    const [lMin, lMax] = o.life || [0.25, 0.6];
    const [scFrom, scTo] = o.scale || [0.7, 0];
    const [alFrom, alTo] = o.alpha || [1, 0];

    for (let i = 0; i < count; i++) {
      const p = this._take();
      if (!p) return;
      if (!p.alive) this.active.push(p);

      const ang = rnd.range(aMin, aMax);
      const spd = rnd.range(sMin, sMax);
      p.alive = true;
      p.vx = Math.cos(ang) * spd;
      p.vy = Math.sin(ang) * spd;
      p.gravity = o.gravity ?? 0;
      p.drag = o.drag ?? 1.6;
      p.maxLife = rnd.range(lMin, lMax);
      p.life = p.maxLife;
      p.scaleFrom = rnd.range(scFrom * 0.75, scFrom * 1.25);
      p.scaleTo = scTo;
      p.alphaFrom = alFrom;
      p.alphaTo = alTo;
      p.spin = o.spin ? rnd.range(-o.spin, o.spin) : 0;
      p.ramp = o.ramp || null;

      const s = p.s;
      s.setTexture(tex);
      s.setPosition(x + (o.spread ? rnd.range(-o.spread, o.spread) : 0),
        y + (o.spread ? rnd.range(-o.spread, o.spread) : 0));
      s.setTint(o.ramp ? o.ramp[0] : (o.tint ?? 0xffffff));
      s.setScale(p.scaleFrom);
      s.setAlpha(alFrom);
      s.setRotation(o.rotate ?? 0);
      s.setBlendMode(o.blend ?? Phaser.BlendModes.ADD);
      s.setDepth(o.depth ?? 60);
      s.setActive(true).setVisible(true);
    }
  }

  /* ----------------------------------------------------------- named effects */

  fireBurst(x, y, count = 12, spread = 6) {
    this.burst(x, y, {
      count, texture: 'spark', ramp: FIRE_RAMP, spread,
      speed: [90, 280], life: [0.28, 0.62], scale: [0.9, 0], gravity: -160, drag: 2.2
    });
  }

  hitSpark(x, y, dir = 1, crit = false) {
    this.burst(x, y, {
      count: crit ? 16 : 9, texture: 'spark', ramp: FIRE_RAMP,
      speed: crit ? [220, 520] : [140, 330],
      angle: [-1.1 + (dir > 0 ? 0 : Math.PI), 1.1 + (dir > 0 ? 0 : Math.PI)],
      life: [0.16, 0.34], scale: [crit ? 1.1 : 0.75, 0], gravity: 420, drag: 2.6
    });
    const flash = this.scene.add.image(x, y, 'soft')
      .setTint(crit ? 0xffe9a8 : 0xffc27a)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(crit ? 1.5 : 1)
      .setDepth(62);
    this.scene.tweens.add({
      targets: flash, scale: crit ? 2.6 : 1.7, alpha: 0,
      duration: crit ? 220 : 150, ease: 'Quad.easeOut',
      onComplete: () => flash.destroy()
    });
  }

  bloodSpark(x, y, tint = 0x9ad3ff) {
    this.burst(x, y, {
      count: 10, texture: 'shard', tint, speed: [120, 340],
      life: [0.3, 0.7], scale: [0.5, 0], gravity: 900, drag: 1.2, spin: 12,
      blend: Phaser.BlendModes.NORMAL
    });
  }

  dust(x, y, dir = 0) {
    this.burst(x, y, {
      count: 7, texture: 'soft', tint: 0xd9c8b8,
      speed: [40, 140], angle: dir ? [-0.5, 0.5] : [Math.PI * 0.85, Math.PI * 2.15],
      life: [0.25, 0.55], scale: [0.5, 1.1], alpha: [0.42, 0],
      gravity: -30, drag: 3, blend: Phaser.BlendModes.NORMAL, rotate: dir < 0 ? Math.PI : 0
    });
  }

  smoke(x, y, tint = 0x2a2028, count = 6) {
    this.burst(x, y, {
      count, texture: 'soft', tint, speed: [20, 90], life: [0.5, 1.2],
      scale: [0.8, 2.2], alpha: [0.5, 0], gravity: -60, drag: 2.4,
      blend: Phaser.BlendModes.NORMAL, spread: 10
    });
  }

  debris(x, y, tint = 0x8a8f9a, count = 12) {
    this.burst(x, y, {
      count, texture: 'shard', tint, speed: [160, 460], life: [0.5, 1.1],
      scale: [0.6, 0.1], gravity: 1200, drag: 0.8, spin: 16,
      blend: Phaser.BlendModes.NORMAL
    });
  }

  /** Expanding ring — shockwaves, parries, nova attacks. */
  shockwave(x, y, { radius = 180, tint = 0xffd166, duration = 320, thickness = 1 } = {}) {
    const ring = this.scene.add.image(x, y, 'ring')
      .setTint(tint).setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(40, 40).setDepth(63).setAlpha(0.95);
    this.scene.tweens.add({
      targets: ring,
      displayWidth: radius * 2, displayHeight: radius * 2 * thickness,
      alpha: 0, duration, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });
    return ring;
  }

  /** Fading afterimage of a sprite — dashes, rolls, ultimate. */
  afterimage(source, tint = 0xff8a3d, life = 260) {
    if (this.quality === 'low') return;
    const clone = this.scene.add.container(source.x, source.y).setDepth(source.depth - 1);
    // Snapshot children as flat images so the ghost never animates.
    const parts = source.list ? source.list : [source];
    for (const part of parts) {
      if (!part.texture || !part.visible) continue;
      const img = this.scene.add.image(part.x, part.y, part.texture.key)
        .setDisplaySize(part.displayWidth, part.displayHeight)
        .setRotation(part.rotation)
        .setOrigin(part.originX, part.originY)
        .setTint(tint)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.5);
      clone.add(img);
    }
    clone.setScale(source.scaleX, source.scaleY);
    this.scene.tweens.add({
      targets: clone, alpha: 0, duration: life, ease: 'Quad.easeOut',
      onComplete: () => clone.destroy(true)
    });
  }

  /* -------------------------------------------------------- damage numbers */

  damageNumber(x, y, amount, { crit = false, colour = '#ffe9c4', prefix = '', suffix = '', big = false } = {}) {
    if (this.profile?.settings?.damageNumbers === false) return;
    const t = this._numbers[this._numberIdx];
    this._numberIdx = (this._numberIdx + 1) % this._numbers.length;

    this.scene.tweens.killTweensOf(t);
    const size = big ? 34 : crit ? 30 : 22;
    t.setText(`${prefix}${amount}${suffix}`)
      .setPosition(x + rnd.range(-8, 8), y)
      .setFontSize(size)
      .setColor(crit ? '#ffd451' : colour)
      .setAlpha(1)
      .setScale(crit ? 1.25 : 1)
      .setVisible(true)
      .setActive(true);

    this.scene.tweens.add({
      targets: t,
      y: y - (crit ? 62 : 44),
      alpha: 0,
      scale: crit ? 0.85 : 0.7,
      duration: crit ? 780 : 620,
      ease: 'Quad.easeOut',
      onComplete: () => t.setVisible(false).setActive(false)
    });
  }

  /** Big centred callout: "PARRY!", "PERFECT", rank-ups. */
  callout(text, { colour = '#ffd451', y = 240, scale = 1, duration = 900 } = {}) {
    const cam = this.scene.cameras.main;
    const t = this.scene.add.text(cam.width / 2, y, text, {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: `${Math.round(38 * scale)}px`,
      color: colour,
      stroke: '#150b12',
      strokeThickness: 6
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setScale(0.6).setAlpha(0);

    this.scene.tweens.add({
      targets: t, scale: 1, alpha: 1, duration: 160, ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: t, alpha: 0, y: y - 26, delay: duration - 320,
          duration: 260, ease: 'Quad.easeIn', onComplete: () => t.destroy()
        });
      }
    });
    return t;
  }

  /* --------------------------------------------------------- camera effects */

  shake(intensity = 0.005, duration = 140) {
    const mult = this.profile?.settings?.screenShake ?? 1;
    if (mult <= 0) return;
    this.scene.cameras.main.shake(duration, intensity * mult, true);
  }

  /**
   * Screen flash. Phaser's `camera.flash()` has no alpha parameter — it always
   * starts fully opaque, which turns a "hit" cue into a solid colour wipe. So
   * this draws its own screen-space quad and tweens it out.
   */
  flash(colour = 0xffffff, duration = 120, alpha = 0.45) {
    const cam = this.scene.cameras.main;
    if (!this._flashRect) {
      this._flashRect = this.scene.add.rectangle(0, 0, cam.width, cam.height, 0xffffff, 0)
        .setOrigin(0).setScrollFactor(0).setDepth(80).setBlendMode(Phaser.BlendModes.ADD);
    }
    const rect = this._flashRect;
    this.scene.tweens.killTweensOf(rect);
    rect.setFillStyle(colour, 1).setAlpha(alpha).setVisible(true);
    this.scene.tweens.add({
      targets: rect, alpha: 0, duration, ease: 'Quad.easeOut',
      onComplete: () => rect.setVisible(false)
    });
  }

  /** Freeze-frame on impact. Capped so a big combo can't stall the game. */
  hitstop(seconds) {
    if (this.profile?.settings?.hitstop === false) return;
    this.hitstopTimer = Math.min(HITSTOP_CAP, Math.max(this.hitstopTimer, seconds));
  }

  /* ----------------------------------------------------------------- frame */

  update(dt) {
    // Particles keep moving during hitstop — a frozen spark looks like a bug,
    // and the motion sells the impact.
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      if (!p.alive) { this.active.splice(i, 1); continue; }

      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        p.s.setActive(false).setVisible(false);
        this.active.splice(i, 1);
        continue;
      }

      p.vy += p.gravity * dt;
      const drag = Math.max(0, 1 - p.drag * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      if (p.spin) p.s.rotation += p.spin * dt;

      const k = 1 - p.life / p.maxLife;
      p.s.setScale(p.scaleFrom + (p.scaleTo - p.scaleFrom) * k);
      p.s.setAlpha(p.alphaFrom + (p.alphaTo - p.alphaFrom) * k);
      if (p.ramp) {
        const idx = Math.min(p.ramp.length - 1, Math.floor(k * p.ramp.length));
        p.s.setTint(p.ramp[idx]);
      }
    }

    if (this.hitstopTimer > 0) this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
  }

  get frozen() { return this.hitstopTimer > 0; }

  setQuality(q) {
    this.quality = q === 'auto' ? this._resolveQuality() : q;
  }

  destroy() {
    for (const p of this.pool) p.s.destroy();
    for (const t of this._numbers) t.destroy();
    this.pool = [];
    this.active = [];
    this._numbers = [];
    this._layer.destroy();
    this._flashRect?.destroy();
    this._flashRect = null;
  }
}
