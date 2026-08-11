/**
 * Projectile.js — pooled bolts for both sides of the fight.
 *
 * One class serves player fireballs, enemy shots, homing blades and rolling
 * ground shockwaves; the differences are all flags. Instances are recycled
 * through a pool so a boss can spray without ever allocating mid-fight.
 */

import { rnd } from '../utils/Rand.js';

export class Projectile {
  constructor(scene) {
    this.scene = scene;
    this.sprite = scene.physics.add.image(0, 0, 'bolt');
    this.sprite.setActive(false).setVisible(false);
    this.sprite.body.setAllowGravity(false);
    this.sprite.setDepth(55);
    this.sprite.setData('owner', this);
    this.glow = scene.add.image(0, 0, 'soft')
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(54)
      .setActive(false).setVisible(false);
    this.active = false;
    this.hits = new Set();
  }

  /**
   * @param {object} o
   *   x, y, vx, vy, damage, tint, life, fromPlayer, pierce, burn, unblockable,
   *   arc (gravity), homingTurn, ground, scale, radius, owner
   */
  fire(o) {
    this.active = true;
    this.fromPlayer = !!o.fromPlayer;
    this.damage = o.damage;
    this.life = o.life ?? 2.5;
    this.pierce = o.pierce ?? 0;
    this.burn = o.burn ?? this.fromPlayer;
    this.unblockable = !!o.unblockable;
    this.homingTurn = o.homingTurn ?? 0;
    this.ownerEntity = o.owner || null;
    this.radius = o.radius ?? 14;
    this.hits.clear();
    this.age = 0;
    this.spin = o.ground ? 0 : rnd.range(-6, 6);

    const s = this.sprite;
    s.setTexture(o.ground ? 'flame' : 'bolt');
    s.setPosition(o.x, o.y);
    s.setActive(true).setVisible(true);
    s.body.enable = true;
    s.body.reset(o.x, o.y);
    s.body.setAllowGravity(!!o.arc);
    if (o.arc) s.body.setGravityY(620);
    s.body.setVelocity(o.vx, o.vy);
    const scale = o.scale ?? 1;
    s.setDisplaySize(38 * scale, 16 * scale);
    if (o.ground) s.setDisplaySize(30 * scale, 46 * scale);
    s.setTint(o.tint ?? 0xff8a3d);
    s.setRotation(Math.atan2(o.vy, o.vx));
    s.body.setSize(this.radius * 2, this.radius * 2, true);

    this.glow.setPosition(o.x, o.y)
      .setTint(o.tint ?? 0xff8a3d)
      .setDisplaySize(this.radius * 4.4, this.radius * 4.4)
      .setAlpha(0.5)
      .setActive(true).setVisible(true);
  }

  update(dt) {
    if (!this.active) return;
    const s = this.sprite;
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) { this.kill(false); return; }

    // Homing: turn the velocity vector toward the target, never snap to it.
    if (this.homingTurn > 0) {
      const target = this.fromPlayer
        ? this.scene.nearestEnemy(s.x, s.y, 520)
        : this.scene.player;
      if (target && target.alive !== false) {
        const tx = target.centre ? target.centre.x : target.x;
        const ty = target.centre ? target.centre.y : target.y;
        const want = Math.atan2(ty - s.y, tx - s.x);
        const cur = Math.atan2(s.body.velocity.y, s.body.velocity.x);
        const diff = Phaser.Math.Angle.Wrap(want - cur);
        const step = Phaser.Math.Clamp(diff, -this.homingTurn * dt, this.homingTurn * dt);
        const speed = Math.hypot(s.body.velocity.x, s.body.velocity.y);
        s.body.setVelocity(Math.cos(cur + step) * speed, Math.sin(cur + step) * speed);
      }
    }

    if (this.spin) s.rotation += this.spin * dt;
    else s.setRotation(Math.atan2(s.body.velocity.y, s.body.velocity.x));

    this.glow.setPosition(s.x, s.y);
    this.glow.setAlpha(0.35 + Math.sin(this.age * 22) * 0.14);

    if (rnd.chance(dt * 26)) {
      this.scene.fx.burst(s.x, s.y, {
        count: 1, texture: 'spark', tint: s.tintTopLeft,
        speed: [10, 60], life: [0.2, 0.4], scale: [0.5, 0], gravity: -60
      });
    }

    this._checkTargets();
  }

  _checkTargets() {
    const s = this.sprite;
    const rect = new Phaser.Geom.Rectangle(s.x - this.radius, s.y - this.radius, this.radius * 2, this.radius * 2);

    if (this.fromPlayer) {
      const targets = this.scene.queryEnemies(rect);
      for (const enemy of targets) {
        if (this.hits.has(enemy)) continue;
        this.hits.add(enemy);
        const player = this.scene.player;
        const crit = Math.random() < (player?.stats.critChance ?? 0);
        let dmg = this.damage * (crit ? player.stats.critMult : 1);
        const res = enemy.takeDamage(dmg, {
          crit,
          dir: Math.sign(s.body.velocity.x) || 1,
          knockback: 160,
          stagger: 18 * (player?.stats.staggerMult ?? 1),
          source: player,
          burn: this.burn && player
            ? { damage: dmg * 0.16 * player.stats.burnMult, duration: player.stats.burnDuration }
            : null
        });
        if (res.hit && player) {
          player._onHitLanded(enemy, res, { style: 6, name: 'projectile', hitstop: 0.02 }, crit);
        }
        if (this.pierce > 0) this.pierce--;
        else { this.kill(true); return; }
      }
    } else {
      const player = this.scene.player;
      if (player && player.alive && !this.hits.has('player') &&
          Phaser.Geom.Intersects.RectangleToRectangle(rect, player.bounds)) {
        this.hits.add('player');
        const result = player.takeDamage(this.damage, {
          unblockable: this.unblockable,
          dir: Math.sign(s.body.velocity.x) || 1,
          knockback: 220,
          x: s.x,
          source: this.ownerEntity
        });
        // A parried shot is sent back at whoever fired it.
        if (result.parried) {
          this.fromPlayer = true;
          this.hits.clear();
          this.damage *= 2;
          this.sprite.body.setVelocity(-s.body.velocity.x * 1.35, -s.body.velocity.y * 1.35);
          this.sprite.setTint(0xffd166);
          this.glow.setTint(0xffd166);
          this.life = Math.max(this.life, 1.6);
          return;
        }
        if (this.pierce > 0) this.pierce--;
        else { this.kill(true); }
      }
    }
  }

  /** Called by the scene's terrain collider. */
  onTerrain() {
    if (!this.active) return;
    this.kill(true);
  }

  kill(impact) {
    if (!this.active) return;
    this.active = false;
    const s = this.sprite;
    if (impact) {
      this.scene.fx.burst(s.x, s.y, {
        count: 10, texture: 'spark', tint: s.tintTopLeft,
        speed: [80, 260], life: [0.15, 0.35], scale: [0.6, 0]
      });
      this.scene.fx.shockwave(s.x, s.y, { radius: 44, tint: s.tintTopLeft, duration: 220, thickness: 0.5 });
    }
    s.body.enable = false;
    s.setActive(false).setVisible(false);
    this.glow.setActive(false).setVisible(false);
  }

  destroy() {
    this.sprite.destroy();
    this.glow.destroy();
  }
}
