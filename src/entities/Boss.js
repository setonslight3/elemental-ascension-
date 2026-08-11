/**
 * Boss.js — multi-phase encounters.
 *
 * A boss is an Enemy with three things layered on:
 *   1. A **phase machine**. Crossing a health threshold plays an invulnerable
 *      transition that clears the arena, so a fight reads as chapters instead
 *      of one long bar. Each phase swaps the attack pool and the cadence.
 *   2. A **cadence timer** rather than opportunistic attacking, so the fight
 *      breathes: pressure, opening, pressure. The opening is where you get to
 *      play, and it is deliberately generous at first and tighter later.
 *   3. **Stagger payoff**. Filling the stagger meter buys a long punish
 *      window, which gives melee builds a reason to stay close.
 */

import { Enemy } from './Enemy.js';
import { BOSSES } from '../data/Enemies.js';
import { ENEMY_SCALING } from '../data/Balance.js';
import { addWeapon } from './Rig.js';
import { rnd, clamp } from '../utils/Rand.js';

export class Boss extends Enemy {
  constructor(scene, opts) {
    const def = BOSSES[opts.bossId];
    super(scene, {
      ...opts,
      def: { ...def, attacks: [] },   // base class expects an array; we override selection
      isBoss: true,
      elite: false
    });

    this.bossDef = def;
    this.bossId = def.id;
    this.displayName = def.name;
    this.title = def.title;
    this.attackTable = def.attacks;
    this.phases = def.phases;
    this.phaseIndex = 0;
    this.phase = this.phases[0];
    this.transitioning = false;
    this.invulnerable = true;        // until the intro finishes
    this.introDone = false;
    this.nextAttack = 1.6;
    this.enrage = 1;
    this.speedMult = 1;
    this.summonCount = 0;

    addWeapon(scene, this.rig, { length: 1.25, tint: def.accent, thickness: 0.1 });

    this.crownGlow = scene.add.image(this.x, this.y, 'soft')
      .setTint(def.accent).setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(this.width * 3.4, this.height * 2.6)
      .setAlpha(0.22).setDepth(38);
  }

  /** Called by the scene once the cinematic intro is over. */
  beginFight() {
    this.invulnerable = false;
    this.introDone = true;
    this.nextAttack = 1.2;
  }

  /* ------------------------------------------------------------- targeting */

  _think(dt) {
    if (!this.introDone || this.transitioning) { this._brake(dt); return; }

    const player = this.scene.player;
    if (!player || !player.alive) { this._brake(dt); return; }

    const dx = player.centre.x - this.sprite.x;
    this.dir = dx >= 0 ? 1 : -1;
    this.state = 'chase';

    this.nextAttack -= dt;
    if (this.nextAttack <= 0) {
      const choice = this._selectBossAttack();
      if (choice) {
        this._startAttack(choice.key, choice.def);
        return;
      }
      this.nextAttack = 0.4;
    }

    // Between attacks the boss closes distance at a readable pace.
    const dist = Math.abs(dx);
    const preferred = this.width * 1.4;
    const b = this.sprite.body;
    if (dist > preferred) {
      b.setVelocityX(Math.sign(dx) * this.speed * this.speedMult);
    } else {
      b.setVelocityX(b.velocity.x * Math.max(0, 1 - 5 * dt));
    }
  }

  _selectBossAttack() {
    const pool = this.phase.pool.filter((key) => {
      if ((this.cooldowns[key] || 0) > 0) return false;
      // Cap how many adds can be alive at once, or the arena floods.
      if (this.attackTable[key]?.type === 'summon' && this.scene.enemies.length > 8) return false;
      return true;
    });
    if (!pool.length) return null;

    // Prefer an attack that suits the current distance — reads as intent
    // rather than a dice roll.
    const dist = this.distanceToPlayer();
    const scored = pool.map((key) => {
      const def = this.attackTable[key];
      let score = rnd.range(0.6, 1.4);
      const range = def.range ?? 300;
      if (def.type === 'melee' || def.type === 'blinkstrike') score *= dist < range * 1.2 ? 1.8 : 0.35;
      if (def.type === 'dash') score *= dist > 200 ? 1.7 : 0.5;
      if (def.type === 'mortar' || def.type === 'pillars') score *= dist > 260 ? 1.5 : 0.8;
      if (def.type === 'nova') score *= dist < 320 ? 1.6 : 0.4;
      if (def.type === 'summon') score *= this.scene.enemies.length < 4 ? 1.6 : 0.2;
      return { key, def, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0];
  }

  _startAttack(key, def) {
    super._startAttack(key, def);
    // Bosses ignore the shared attack token — they are always allowed to act.
    this.scene.releaseAttackToken?.(this);
  }

  _updateAction(dt) {
    super._updateAction(dt);
    if (!this.action && this.state === 'idle') {
      const [minC, maxC] = this.phase.cadence || [1.2, 1.8];
      this.nextAttack = rnd.range(minC, maxC);
    }
  }

  /* ------------------------------------------------------------- damage */

  takeDamage(amount, opts = {}) {
    if (this.invulnerable || this.transitioning) {
      this.scene.fx.burst(this.x, this.y, {
        count: 4, texture: 'spark', tint: 0xffffff, speed: [60, 160], life: [0.15, 0.3], scale: [0.4, 0]
      });
      return { hit: false, damage: 0, x: this.x, y: this.y, killed: false };
    }

    const result = super.takeDamage(amount, opts);
    if (result.hit && this.alive) this._checkPhase();
    return result;
  }

  _checkPhase() {
    const frac = this.hp / this.maxHp;
    const nextIdx = this.phaseIndex + 1;
    if (nextIdx < this.phases.length && frac <= this.phases[nextIdx].at) {
      this._enterPhase(nextIdx);
    }
  }

  _enterPhase(index) {
    this.phaseIndex = index;
    this.phase = this.phases[index];
    this.transitioning = true;
    this.invulnerable = true;
    this.telegraph.clear();
    if (this.action) {
      this.scene.releaseAttackToken?.(this);
      this.action = null;
    }
    this.state = 'idle';
    this.speedMult = this.phase.speedMult ?? 1;
    if (this.phase.enrage) {
      this.enrage = this.phase.enrage;
      this.damage = this.bossDef.damage * ENEMY_SCALING.damage(this.stage) * this.enrage;
    }

    const scene = this.scene;
    scene.clearHazards?.();
    scene.audio.play('bossIntro', { gain: 0.7 });
    scene.audio.duck(0.25, 1.6);
    scene.fx.shake(0.012, 700);
    scene.fx.flash(this.bossDef.accent, 300, 0.5);
    scene.fx.shockwave(this.x, this.y, { radius: 620, tint: this.bossDef.accent, duration: 800 });
    scene.fx.callout(`PHASE ${index + 1} — ${this.phase.name.toUpperCase()}`, {
      colour: '#ff9b3d', y: 190, scale: 1.1, duration: 1800
    });

    scene.tweens.add({
      targets: this.rig, scaleX: this.rig.scaleX * 1.06, scaleY: 1.06,
      duration: 220, yoyo: true, repeat: 2
    });

    scene.time.delayedCall(1500, () => {
      if (!this.alive) return;
      this.transitioning = false;
      this.invulnerable = false;
      this.nextAttack = 0.5;
    });
  }

  _enterStagger() {
    // Bosses get a longer, more valuable punish window and cannot be stunned
    // during a phase transition.
    if (this.transitioning) return;
    super._enterStagger(true);
    this.staggerTimer = ENEMY_SCALING.STAGGER_DURATION * 2.2;
    this.staggerMax *= 1.15;   // each stagger is harder to earn than the last
  }

  _die() {
    if (!this.alive) return;
    const scene = this.scene;
    this.alive = false;
    this.telegraph.clear();
    scene.releaseAttackToken?.(this);

    // A long, loud death: staggered explosions along the body, then a nova.
    scene.audio.duck(0.2, 2.4);
    for (let i = 0; i < 10; i++) {
      scene.time.delayedCall(i * 130, () => {
        if (!this.rig.active) return;
        const ox = rnd.range(-this.width * 0.5, this.width * 0.5);
        const oy = rnd.range(-this.height * 0.6, this.height * 0.3);
        scene.fx.fireBurst(this.x + ox, this.y + oy, 12, 10);
        scene.fx.shake(0.005, 140);
        scene.audio.play('explode', { rate: rnd.range(0.8, 1.3), gain: 0.5 });
      });
    }
    scene.time.delayedCall(1400, () => {
      scene.fx.shockwave(this.x, this.y, { radius: 700, tint: this.bossDef.accent, duration: 900 });
      scene.fx.flash(0xffffff, 500, 0.75);
      scene.fx.shake(0.016, 700);
      scene.fx.debris(this.x, this.y, this.bossDef.colour, 28);
      scene.audio.play('explode');
    });

    scene.tweens.add({
      targets: this.rig, alpha: 0, duration: 1500, delay: 900, ease: 'Quad.easeIn'
    });
    if (this.crownGlow) {
      scene.tweens.add({ targets: this.crownGlow, alpha: 0, duration: 1200 });
    }

    scene.onEnemyKilled(this);
    this.sprite.body.enable = false;
  }

  /* ------------------------------------------------------------- visuals */

  _updateVisuals(dt) {
    super._updateVisuals(dt);
    if (this.crownGlow) {
      this.crownGlow.setPosition(this.x, this.y);
      const pulse = this.transitioning ? 0.5 + Math.sin(this.time * 18) * 0.3 : 0.2 + Math.sin(this.time * 2.5) * 0.06;
      this.crownGlow.setAlpha(pulse);
    }
    if (this.invulnerable && !this.introDone) {
      this.rig.setAlpha(0.85 + Math.sin(this.time * 6) * 0.15);
    } else if (this.transitioning) {
      this.rig.setAlpha(0.6 + Math.abs(Math.sin(this.time * 16)) * 0.4);
    } else {
      this.rig.setAlpha(1);
    }
  }

  /** 0..1 health, exposed for the HUD's boss bar. */
  get healthFraction() { return clamp(this.hp / this.maxHp, 0, 1); }

  get staggerFraction() { return clamp(this.stagger / this.staggerMax, 0, 1); }

  destroy() {
    if (this.crownGlow) this.crownGlow.destroy();
    super.destroy();
  }
}
