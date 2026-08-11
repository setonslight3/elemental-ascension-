/**
 * Hazards.js — timed area effects, for both sides.
 *
 * Each hazard is a tiny object with `update(dt)` returning false when it is
 * finished; the scene keeps them in one list and sweeps the dead ones. They
 * are deliberately not physics bodies: an area-of-effect is a shape and a
 * timer, and treating it as one keeps the collision cost flat.
 *
 * Every enemy hazard shows its footprint before it hurts anyone. The warning
 * shape is the exact damage shape — no "that looked like it missed" moments.
 */

import { rnd } from '../utils/Rand.js';
import { FIRE_RAMP } from '../systems/Art.js';

/* ------------------------------------------------------------ enemy hazards */

/** Telegraphed circle on the ground that detonates after a delay. */
export class MortarStrike {
  constructor(scene, { x, radius, delay, damage, owner }) {
    this.scene = scene;
    this.x = x;
    this.y = scene.groundYAt(x);
    this.radius = radius;
    this.timer = delay;
    this.delay = delay;
    this.damage = damage;
    this.owner = owner;
    this.exploded = false;
    this.g = scene.add.graphics().setDepth(20);
  }

  update(dt) {
    this.timer -= dt;
    const g = this.g;
    g.clear();

    if (!this.exploded) {
      const k = 1 - Math.max(0, this.timer) / this.delay;
      g.fillStyle(0xff3b5c, 0.12 + k * 0.16);
      g.fillCircle(this.x, this.y, this.radius);
      g.lineStyle(3, 0xff3b5c, 0.85);
      g.strokeCircle(this.x, this.y, this.radius);
      g.lineStyle(5, 0xffc247, 0.95);
      g.strokeCircle(this.x, this.y, this.radius * k);

      if (this.timer <= 0) {
        this.exploded = true;
        this.fade = 0.25;
        const player = this.scene.player;
        if (player && player.alive &&
            Phaser.Math.Distance.Between(this.x, this.y, player.centre.x, player.centre.y) < this.radius) {
          player.takeDamage(this.damage, {
            unblockable: true,
            dir: Math.sign(player.centre.x - this.x) || 1,
            knockback: 240, launch: -280, source: this.owner
          });
        }
        this.scene.fx.fireBurst(this.x, this.y - 10, 22, this.radius * 0.4);
        this.scene.fx.shockwave(this.x, this.y, { radius: this.radius, tint: 0xff7a2f, duration: 380 });
        this.scene.fx.shake(0.006, 200);
        this.scene.fx.debris(this.x, this.y, 0x6b4a52, 8);
        this.scene.audio.play('explode', { rate: rnd.range(0.9, 1.2), gain: 0.6 });
      }
      return true;
    }

    this.fade -= dt;
    g.fillStyle(0xff7a2f, Math.max(0, this.fade) * 0.6);
    g.fillCircle(this.x, this.y, this.radius);
    if (this.fade <= 0) { this.destroy(); return false; }
    return true;
  }

  destroy() { this.g.destroy(); }
}

/** A column of fire that erupts from the ground after a warning. */
export class FlamePillar {
  constructor(scene, { x, delay, damage, owner, height = 260 }) {
    this.scene = scene;
    this.x = x;
    this.y = scene.groundYAt(x);
    this.timer = delay;
    this.damage = damage;
    this.owner = owner;
    this.height = height;
    this.state = 'warn';
    this.activeTime = 0.55;
    this.hit = false;
    this.g = scene.add.graphics().setDepth(46);
  }

  update(dt) {
    const g = this.g;
    g.clear();
    this.timer -= dt;

    if (this.state === 'warn') {
      const k = Math.max(0, 1 - this.timer / 0.55);
      g.fillStyle(0xff3b5c, 0.15 + k * 0.2);
      g.fillRect(this.x - 32, this.y - 6, 64, 12);
      g.lineStyle(3, 0xff3b5c, 0.9);
      g.strokeRect(this.x - 32, this.y - 6, 64, 12);
      if (this.timer <= 0) {
        this.state = 'fire';
        this.timer = this.activeTime;
        this.scene.fx.fireBurst(this.x, this.y - 30, 22, 16);
        this.scene.audio.play('eruption', { rate: 1.3, gain: 0.5 });
        this.scene.fx.shake(0.004, 160);
      }
      return true;
    }

    const k = this.timer / this.activeTime;
    const h = this.height * Math.min(1, (1 - k) * 4 + 0.2) * (0.6 + k * 0.4);
    const w = 58 * (0.6 + k * 0.5);
    g.fillStyle(0xff7a2f, 0.42 * k + 0.2);
    g.fillRect(this.x - w / 2, this.y - h, w, h);
    g.fillStyle(0xffd166, 0.5 * k);
    g.fillRect(this.x - w / 4, this.y - h * 0.9, w / 2, h * 0.9);

    if (rnd.chance(dt * 30)) {
      this.scene.fx.burst(this.x + rnd.range(-w / 2, w / 2), this.y - rnd.range(0, h), {
        count: 1, texture: 'spark', ramp: FIRE_RAMP, speed: [20, 90],
        life: [0.3, 0.6], scale: [0.8, 0], gravity: -260
      });
    }

    const player = this.scene.player;
    if (!this.hit && player && player.alive) {
      const rect = new Phaser.Geom.Rectangle(this.x - w / 2, this.y - h, w, h);
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, player.bounds)) {
        this.hit = true;
        player.takeDamage(this.damage, {
          unblockable: true, dir: Math.sign(player.centre.x - this.x) || 1,
          knockback: 180, launch: -320, source: this.owner
        });
      }
    }

    if (this.timer <= 0) { this.destroy(); return false; }
    return true;
  }

  destroy() { this.g.destroy(); }
}

/** A sweeping wall of fire with one survivable gap. */
export class FlameWall {
  constructor(scene, { x, dir, speed, damage, gapWidth, owner }) {
    this.scene = scene;
    this.x = x;
    this.dir = dir;
    this.speed = speed;
    this.damage = damage;
    this.owner = owner;
    this.life = 6;
    this.hitCooldown = 0;

    const bounds = scene.worldBounds;
    this.top = bounds.y;
    this.bottom = scene.groundYAt(x);
    // Gap sits somewhere the player can actually reach: jump height above the
    // floor, never flush with the ceiling.
    this.gapY = this.bottom - rnd.range(gapWidth * 0.9, gapWidth * 1.8);
    this.gapWidth = gapWidth;
    this.g = scene.add.graphics().setDepth(47);
  }

  update(dt) {
    this.life -= dt;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    this.x += this.dir * this.speed * dt;
    this.bottom = this.scene.groundYAt(this.x);

    const g = this.g;
    g.clear();
    const w = 46;
    const drawSeg = (y0, y1) => {
      g.fillStyle(0xff3b1f, 0.55);
      g.fillRect(this.x - w / 2, y0, w, y1 - y0);
      g.fillStyle(0xffd166, 0.35);
      g.fillRect(this.x - w / 5, y0, w / 2.5, y1 - y0);
    };
    drawSeg(this.top, this.gapY);
    drawSeg(this.gapY + this.gapWidth, this.bottom);

    if (rnd.chance(dt * 40)) {
      const y = rnd.chance(0.5) ? rnd.range(this.top, this.gapY) : rnd.range(this.gapY + this.gapWidth, this.bottom);
      this.scene.fx.burst(this.x, y, {
        count: 1, texture: 'spark', ramp: FIRE_RAMP, speed: [20, 110],
        life: [0.3, 0.7], scale: [0.9, 0], gravity: -200
      });
    }

    const player = this.scene.player;
    if (player && player.alive && this.hitCooldown === 0) {
      const pb = player.bounds;
      const inColumn = Math.abs(player.centre.x - this.x) < w / 2 + pb.width / 2;
      const inGap = pb.y > this.gapY && pb.y + pb.height < this.gapY + this.gapWidth;
      if (inColumn && !inGap) {
        this.hitCooldown = 0.8;
        player.takeDamage(this.damage, {
          unblockable: true, dir: this.dir, knockback: 320, source: this.owner
        });
      }
    }

    const bounds = this.scene.worldBounds;
    if (this.life <= 0 || this.x < bounds.x - 80 || this.x > bounds.x + bounds.width + 80) {
      this.destroy();
      return false;
    }
    return true;
  }

  destroy() { this.g.destroy(); }
}

/* ----------------------------------------------------------- player hazards */

/** Eruption: a burst of ground fire that launches everything nearby. */
export class Eruption {
  constructor(scene, { x, y, damage, owner, radius = 170 }) {
    this.scene = scene;
    this.x = x; this.y = y;
    this.radius = radius;
    this.damage = damage;
    this.owner = owner;
    this.timer = 0.55;
    this.total = 0.55;
    this.hits = new Set();
    this.g = scene.add.graphics().setDepth(46);

    scene.fx.shockwave(x, y, { radius, tint: 0xff5a2a, duration: 460 });
    scene.fx.fireBurst(x, y - 10, 30, radius * 0.35);
    scene.fx.debris(x, y, 0x6b4a52, 12);
  }

  update(dt) {
    this.timer -= dt;
    const k = Math.max(0, this.timer / this.total);
    const g = this.g;
    g.clear();

    const spikes = 7;
    for (let i = 0; i < spikes; i++) {
      const t = i / (spikes - 1);
      const px = this.x + (t - 0.5) * this.radius * 2;
      const h = (1 - Math.abs(t - 0.5) * 1.6) * this.radius * (0.5 + k * 0.9);
      if (h <= 0) continue;
      g.fillStyle(0xff5a2a, 0.5 * k + 0.1);
      g.fillTriangle(px - 20, this.y, px + 20, this.y, px, this.y - h);
      g.fillStyle(0xffd166, 0.5 * k);
      g.fillTriangle(px - 8, this.y, px + 8, this.y, px, this.y - h * 0.7);
    }

    const rect = new Phaser.Geom.Rectangle(
      this.x - this.radius, this.y - this.radius * 1.1, this.radius * 2, this.radius * 1.3
    );
    for (const enemy of this.scene.queryEnemies(rect)) {
      if (this.hits.has(enemy)) continue;
      this.hits.add(enemy);
      const player = this.owner;
      const crit = Math.random() < player.stats.critChance;
      const dmg = this.damage * (crit ? player.stats.critMult : 1);
      const res = enemy.takeDamage(dmg, {
        crit, dir: Math.sign(enemy.x - this.x) || 1,
        knockback: 240, launch: -520,
        stagger: 40 * player.stats.staggerMult, source: player,
        burn: { damage: dmg * 0.16 * player.stats.burnMult, duration: player.stats.burnDuration }
      });
      if (res.hit) player._onHitLanded(enemy, res, { style: 14, name: 'eruption', hitstop: 0.05 }, crit);
    }

    if (this.timer <= 0) { this.destroy(); return false; }
    return true;
  }

  destroy() { this.g.destroy(); }
}

/** Inferno Wave: a rolling wall of fire that pierces everything. */
export class InfernoWave {
  constructor(scene, { x, y, dir, damage, owner }) {
    this.scene = scene;
    this.x = x; this.y = y;
    this.dir = dir;
    this.damage = damage;
    this.owner = owner;
    this.speed = 520;
    this.life = 1.5;
    this.height = 96;
    this.hits = new Set();
    this.g = scene.add.graphics().setDepth(46);
  }

  update(dt) {
    this.life -= dt;
    this.x += this.dir * this.speed * dt;
    this.y = this.scene.groundYAt(this.x) - 6;

    const g = this.g;
    g.clear();
    const k = Math.max(0, Math.min(1, this.life / 1.5));
    const h = this.height * (0.6 + k * 0.5);
    for (let i = 0; i < 3; i++) {
      const off = -this.dir * i * 22;
      g.fillStyle(i === 0 ? 0xffd166 : 0xff5a2a, (0.5 - i * 0.13) * (0.5 + k * 0.5));
      g.fillTriangle(
        this.x + off - 30, this.y,
        this.x + off + 30, this.y,
        this.x + off + this.dir * 26, this.y - h * (1 - i * 0.2)
      );
    }

    if (rnd.chance(dt * 50)) {
      this.scene.fx.burst(this.x + rnd.range(-24, 24), this.y - rnd.range(0, h), {
        count: 1, texture: 'spark', ramp: FIRE_RAMP, speed: [30, 120],
        life: [0.3, 0.6], scale: [0.8, 0], gravity: -180
      });
    }

    const rect = new Phaser.Geom.Rectangle(this.x - 40, this.y - h, 80, h);
    for (const enemy of this.scene.queryEnemies(rect)) {
      if (this.hits.has(enemy)) continue;
      this.hits.add(enemy);
      const player = this.owner;
      const crit = Math.random() < player.stats.critChance;
      const dmg = this.damage * (crit ? player.stats.critMult : 1);
      const res = enemy.takeDamage(dmg, {
        crit, dir: this.dir, knockback: 300,
        stagger: 30 * player.stats.staggerMult, source: player,
        burn: { damage: dmg * 0.2 * player.stats.burnMult, duration: player.stats.burnDuration }
      });
      if (res.hit) player._onHitLanded(enemy, res, { style: 12, name: 'wave', hitstop: 0.04 }, crit);
    }

    if (this.life <= 0) { this.destroy(); return false; }
    return true;
  }

  destroy() { this.g.destroy(); }
}

/* ------------------------------------------------------------------ pickups */

/**
 * Ember/shard orbs. They idle briefly, then home in on the player so nothing
 * is ever left behind on a ledge the player cannot reach.
 */
export class Pickup {
  constructor(scene, { x, y, kind = 'ember', value = 1 }) {
    this.scene = scene;
    this.kind = kind;
    this.value = value;
    this.age = 0;
    this.collected = false;

    const tint = kind === 'ember' ? 0xffb43d : kind === 'shard' ? 0xc074ff : 0x6bff9c;
    this.sprite = scene.add.image(x, y, kind === 'ember' ? 'spark' : 'star')
      .setTint(tint).setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(kind === 'ember' ? 18 : 26, kind === 'ember' ? 18 : 26)
      .setDepth(52);
    this.vx = rnd.range(-120, 120);
    this.vy = rnd.range(-320, -160);
    this.tint = tint;
  }

  update(dt) {
    if (this.collected) return false;
    this.age += dt;
    const player = this.scene.player;

    if (this.age < 0.45 || !player || !player.alive) {
      this.vy += 1600 * dt;
      this.sprite.x += this.vx * dt;
      this.sprite.y += this.vy * dt;
      const groundY = this.scene.groundYAt(this.sprite.x);
      if (this.sprite.y > groundY - 8) {
        this.sprite.y = groundY - 8;
        this.vy *= -0.35;
        this.vx *= 0.6;
      }
    } else {
      // Home in, accelerating — the classic "loot vacuum" feel.
      const dx = player.centre.x - this.sprite.x;
      const dy = player.centre.y - this.sprite.y;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = Math.min(1400, 260 + (this.age - 0.45) * 1500);
      this.sprite.x += (dx / dist) * speed * dt;
      this.sprite.y += (dy / dist) * speed * dt;
      if (dist < 26) {
        this.collected = true;
        this.scene.collectPickup(this);
        this.scene.fx.burst(this.sprite.x, this.sprite.y, {
          count: 5, texture: 'spark', tint: this.tint, speed: [40, 140],
          life: [0.15, 0.3], scale: [0.5, 0]
        });
        this.sprite.destroy();
        return false;
      }
    }

    this.sprite.setScale(this.sprite.scaleX);
    this.sprite.setAlpha(0.75 + Math.sin(this.age * 14) * 0.25);
    if (this.age > 22) { this.sprite.destroy(); return false; }
    return true;
  }

  destroy() { if (this.sprite.active) this.sprite.destroy(); }
}
