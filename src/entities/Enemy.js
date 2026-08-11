/**
 * Enemy.js — every robot in the game.
 *
 * All archetypes share one state machine and one *declarative* attack
 * executor: the data in Enemies.js says what an attack does, and the code here
 * knows how to perform each `type`. Adding a new enemy is a data change.
 *
 * Readability rules that make the combat fair:
 *  - Every attack telegraphs. Amber outline = blockable/parryable. Crimson =
 *    unblockable, move. The shape drawn is the actual hitbox, not a guess.
 *  - Enemies commit. Once the active frames start, the attack plays out; you
 *    can always trade or punish rather than being tracked forever.
 *  - Attacks stagger out. A shared "attack token" in the scene stops six
 *    robots from all swinging on the same frame.
 */

import { ENEMY_SCALING, BURN } from '../data/Balance.js';
import { ARCHETYPES } from '../data/Enemies.js';
import { createRig, poseRig, addShield, addWeapon } from './Rig.js';
import { clamp, rnd } from '../utils/Rand.js';

const TELEGRAPH_COLOUR = { blockable: 0xffc247, unblockable: 0xff3b5c };

export class Enemy {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts { x, y, archetype, stage, elite, modifiers, isBoss }
   */
  constructor(scene, opts) {
    this.scene = scene;
    this.def = opts.def || ARCHETYPES[opts.archetype];
    this.archetypeId = this.def.id;
    this.stage = opts.stage ?? 1;
    this.elite = !!opts.elite;
    this.isBoss = !!opts.isBoss;
    this.mods = opts.modifiers || {};

    const scale = this.elite ? ENEMY_SCALING.ELITE_SCALE : 1;
    this.width = this.def.width * scale;
    this.height = this.def.height * scale;

    // --- stats --------------------------------------------------------------
    const hpScale = ENEMY_SCALING.hp(this.stage) * (this.mods.enemyHp ?? 1);
    const dmgScale = ENEMY_SCALING.damage(this.stage);
    this.maxHp = Math.round(this.def.hp * hpScale * (this.elite ? ENEMY_SCALING.ELITE_HP : 1));
    this.hp = this.maxHp;
    this.damage = this.def.damage * dmgScale * (this.elite ? ENEMY_SCALING.ELITE_DAMAGE : 1);
    this.speed = this.def.speed * (this.mods.enemySpeed ?? 1) * (this.elite ? 1.08 : 1);
    this.armour = (this.def.armour ?? 0) + (this.mods.armour ?? 0);
    this.staggerMax = (this.def.staggerMax ?? 30) * (this.mods.staggerMult ?? 1) * (this.elite ? 1.5 : 1);
    this.stagger = 0;
    this.xpValue = this.def.xp;

    // --- collider -----------------------------------------------------------
    this.sprite = scene.physics.add.image(opts.x, opts.y, 'px').setVisible(false);
    this.sprite.body.setSize(this.width, this.height, false);
    this.sprite.body.setOffset(2 - this.width / 2, 2 - this.height / 2);
    this.sprite.setData('owner', this);
    this.sprite.body.setAllowGravity(!this.def.flying);
    this.sprite.body.setMaxVelocity(900, 1500);
    if (this.def.stationary) {
      this.sprite.body.setImmovable(true);
      this.sprite.body.moves = false;
    }

    // --- visuals ------------------------------------------------------------
    const kind = this.def.flying ? 'drone'
      : this.def.stationary ? 'turret'
      : this.def.explodeOnDeath ? 'blob'
      : 'humanoid';
    this.rig = createRig(scene, {
      height: this.height,
      colour: this.elite ? this._eliteTint(this.def.colour) : this.def.colour,
      accent: this.def.accent,
      visorColour: this.def.accent,
      kind,
      heavy: this.def.id === 'brute' || this.isBoss
    });
    this.rig.setDepth(40);
    if (this.def.frontalGuard) addShield(scene, this.rig, this._eliteTint(this.def.colour, 20));
    if (this.def.id === 'sniper') addWeapon(scene, this.rig, { length: 0.9, tint: this.def.accent, thickness: 0.08 });
    if (this.def.id === 'lancer') addWeapon(scene, this.rig, { length: 1.1, tint: this.def.accent, thickness: 0.07 });

    this.telegraph = scene.add.graphics().setDepth(45);

    if (this.elite) {
      this.eliteGlow = scene.add.image(opts.x, opts.y, 'soft')
        .setTint(0xffd166).setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(this.width * 3.2, this.height * 2.4).setAlpha(0.2).setDepth(38);
    }

    // --- state --------------------------------------------------------------
    this.alive = true;
    this.state = 'spawn';
    this.time = rnd.range(0, 10);
    this.stateTimer = 0;
    this.dir = -1;
    this.homeX = opts.x;
    this.homeY = opts.y;
    this.hoverY = opts.y;
    this.action = null;
    this.cooldowns = Object.create(null);
    this.globalCooldown = rnd.range(0.2, 1.1);
    this.staggerTimer = 0;
    this.burns = [];
    this.burnTick = 0;
    this.flashTimer = 0;
    this.guardBroken = false;
    this.repositionTimer = 0;
    this.strafeDir = rnd.sign();
    this.spawnTimer = 0.35;
    this.markedTarget = !!opts.marked;

    this.sprite.setAlpha(1);
    this.rig.setScale(0);
    scene.tweens.add({ targets: this.rig, scaleX: 1, scaleY: 1, duration: 260, ease: 'Back.easeOut' });

    if (this.markedTarget) {
      this.marker = scene.add.image(opts.x, opts.y, 'star')
        .setTint(0xffd451).setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(30, 30).setDepth(46);
    }
  }

  _eliteTint(hex, extra = 0) {
    const c = Phaser.Display.Color.IntegerToColor(hex);
    return Phaser.Display.Color.GetColor(
      clamp(c.red + 40 + extra, 0, 255),
      clamp(c.green + 12 + extra, 0, 255),
      clamp(c.blue + 30 + extra, 0, 255)
    );
  }

  /* ------------------------------------------------------------- geometry */

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }
  get centre() { return { x: this.sprite.x, y: this.sprite.y }; }
  get feetY() { return this.sprite.y + this.height / 2; }

  get bounds() {
    return new Phaser.Geom.Rectangle(
      this.sprite.x - this.width / 2,
      this.sprite.y - this.height / 2,
      this.width, this.height
    );
  }

  distanceToPlayer() {
    const p = this.scene.player;
    if (!p) return Infinity;
    return Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, p.centre.x, p.centre.y);
  }

  /* ---------------------------------------------------------------- update */

  update(dt) {
    if (!this.alive) return;
    this.time += dt;
    this.stateTimer += dt;
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.globalCooldown = Math.max(0, this.globalCooldown - dt);
    for (const k of Object.keys(this.cooldowns)) {
      this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }

    this._updateBurns(dt);
    if (!this.alive) return;

    this.stagger = Math.max(0, this.stagger - ENEMY_SCALING.STAGGER_DECAY * dt);
    this.telegraph.clear();

    switch (this.state) {
      case 'spawn':
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) this.state = 'idle';
        this._brake(dt);
        break;
      case 'stagger':
        this.staggerTimer -= dt;
        this._brake(dt);
        if (this.staggerTimer <= 0) this.state = 'idle';
        break;
      case 'attack':
        this._updateAction(dt);
        break;
      default:
        this._think(dt);
        break;
    }

    this._updateVisuals(dt);
  }

  _brake(dt) {
    const b = this.sprite.body;
    if (!b || !b.moves) return;
    b.setVelocityX(b.velocity.x * Math.max(0, 1 - 6 * dt));
    if (this.def.flying) b.setVelocityY(b.velocity.y * Math.max(0, 1 - 6 * dt));
  }

  /* --------------------------------------------------------------- brains */

  _think(dt) {
    const player = this.scene.player;
    if (!player || !player.alive) { this._idleWander(dt); return; }

    const dist = this.distanceToPlayer();
    const dx = player.centre.x - this.sprite.x;
    const dy = player.centre.y - this.sprite.y;

    /**
     * Robots spawned by the wave director are *hunting* — they were sent for
     * you, so they cross the level rather than waiting to be walked into.
     * Garrison units (placed with the terrain) keep their normal aggro range
     * and leash, so exploring still feels like approaching a defended position.
     */
    const aggroRange = this.hunting ? Infinity : this.def.aggroRange;

    if (!this.hunting && !this.isBoss) {
      const fromHome = Math.abs(this.sprite.x - this.homeX);
      if (fromHome > ENEMY_SCALING.LEASH_DISTANCE && dist > aggroRange) {
        this._moveToward(this.homeX, this.homeY, dt, 0.7);
        return;
      }
    }

    if (dist > aggroRange * (this.state === 'idle' ? 1 : 1.35)) {
      this._idleWander(dt);
      return;
    }

    this.dir = dx >= 0 ? 1 : -1;
    this.state = 'chase';

    // Pick an attack if one is off cooldown, in range, and the scene lets us.
    const choice = this._selectAttack(dist);
    if (choice && this.globalCooldown <= 0 && this.scene.requestAttackToken?.(this)) {
      this._startAttack(choice.key, choice.def);
      return;
    }

    // Positioning.
    const preferred = this.def.preferredRange ?? 60;
    if (this.def.stationary) return;

    if (this.def.kiter && dist < preferred * 0.7) {
      this._moveToward(this.sprite.x - dx, this.sprite.y, dt, 0.9);   // back off
    } else if (this.def.flying) {
      this._flyToward(player.centre.x - this.dir * preferred * 0.4,
        player.centre.y - (this.def.hoverHeight ?? 90), dt,
        this.hunting && dist > 520 ? 1.6 : 1);
    } else if (dist > preferred) {
      // Catch-up: a robot dispatched from across the level closes at a jog, not
      // a stroll. Without this a wave spawned off-camera spends most of a 2-3
      // minute stage walking, and the player spends it waiting.
      const catchUp = this.hunting && dist > 520 ? 1.75 : 1;
      this._moveToward(player.centre.x, player.centre.y, dt, catchUp);
      // Small hop over ledges and low walls instead of grinding into them.
      if (this.def.leap !== false && this.sprite.body.blocked.down &&
          (this.sprite.body.blocked.left || this.sprite.body.blocked.right)) {
        this.sprite.body.setVelocityY(-560);
      }
      if (this.def.leap && dy < -70 && this.sprite.body.blocked.down && rnd.chance(dt * 1.5)) {
        this.sprite.body.setVelocityY(-720);
      }
    } else {
      // In range but no attack ready: strafe so fights are not a shoving match.
      this.repositionTimer -= dt;
      if (this.repositionTimer <= 0) {
        this.repositionTimer = rnd.range(0.5, 1.3);
        this.strafeDir = rnd.sign();
      }
      const b = this.sprite.body;
      if (b.moves) b.setVelocityX(this.strafeDir * this.speed * 0.45);
    }
  }

  _idleWander(dt) {
    this.state = 'idle';
    if (this.def.stationary || this.def.flying) {
      if (this.def.flying) this._flyToward(this.homeX, this.hoverY - 40, dt, 0.5);
      return;
    }
    this.repositionTimer -= dt;
    if (this.repositionTimer <= 0) {
      this.repositionTimer = rnd.range(1.2, 2.8);
      this.strafeDir = rnd.chance(0.4) ? rnd.sign() : 0;
    }
    const b = this.sprite.body;
    if (b.moves) b.setVelocityX(this.strafeDir * this.speed * 0.32);
    if (this.strafeDir !== 0) this.dir = this.strafeDir;
  }

  _moveToward(x, y, dt, mult = 1) {
    const b = this.sprite.body;
    if (!b.moves) return;
    const dir = Math.sign(x - this.sprite.x) || 1;
    b.setVelocityX(dir * this.speed * mult);
    this.dir = dir;
  }

  _flyToward(x, y, dt, mult = 1) {
    const b = this.sprite.body;
    if (!b.moves) return;
    const dx = x - this.sprite.x;
    const dy = y - this.sprite.y;
    const len = Math.hypot(dx, dy) || 1;
    const accel = this.speed * mult;
    b.setVelocityX(Phaser.Math.Linear(b.velocity.x, (dx / len) * accel, 0.08));
    b.setVelocityY(Phaser.Math.Linear(b.velocity.y, (dy / len) * accel, 0.08));
    if (Math.abs(dx) > 12) this.dir = Math.sign(dx);
  }

  _selectAttack(dist) {
    const options = [];
    for (const def of this.def.attacks || []) {
      if ((this.cooldowns[def.id] || 0) > 0) continue;
      const range = def.range ?? 60;
      if (dist > range * 1.05) continue;
      if (def.type === 'beam' && dist < 120) continue;   // snipers need space
      options.push({ key: def.id, def });
    }
    if (!options.length) return null;
    return rnd.pick(options);
  }

  /* --------------------------------------------------------- attack engine */

  _startAttack(key, def) {
    this.state = 'attack';
    this.stateTimer = 0;
    this.action = {
      key, def, t: 0,
      total: (def.windup ?? 0.4) + (def.active ?? 0.15) + (def.recover ?? 0.4),
      phase: 'windup', fired: false, hits: new Set(),
      anchorX: this.sprite.x, anchorY: this.sprite.y
    };
    const player = this.scene.player;
    if (player) this.dir = player.centre.x >= this.sprite.x ? 1 : -1;
    this.scene.audio.play('telegraph', { rate: def.telegraph === 'unblockable' ? 0.7 : 1.2, gain: 0.5 });
  }

  _updateAction(dt) {
    const a = this.action;
    if (!a) { this.state = 'idle'; return; }
    const def = a.def;
    a.t += dt;

    const windupEnd = def.windup ?? 0.4;
    const activeEnd = windupEnd + (def.active ?? 0.15);

    if (a.phase === 'windup') {
      this._drawTelegraph(def, a.t / windupEnd);
      this._windupMotion(def, dt);
      if (a.t >= windupEnd) {
        a.phase = 'active';
        this._fireAttack(def, a);
      }
    } else if (a.phase === 'active') {
      this._activeMotion(def, a, dt);
      if (a.t >= activeEnd) {
        a.phase = 'recover';
        if (def.suicide) { this._die(true); return; }
      }
    } else {
      this._brake(dt);
    }

    if (a.t >= a.total) {
      this.cooldowns[a.key] = (def.cooldown ?? 2) * (this.mods.enemyCooldown ?? 1);
      this.globalCooldown = rnd.range(0.3, 0.8);
      this.scene.releaseAttackToken?.(this);
      this.action = null;
      this.state = 'idle';
    }
  }

  _windupMotion(def, dt) {
    if (def.type === 'dash' || def.type === 'blinkstrike') { this._brake(dt); return; }
    if (def.type === 'melee' || def.type === 'slam') { this._brake(dt); return; }
    this._brake(dt);
  }

  _activeMotion(def, a, dt) {
    switch (def.type) {
      case 'dash': {
        const b = this.sprite.body;
        if (b.moves) {
          b.setVelocityX(this.dir * (def.speed ?? 600));
          if (this.def.flying) {
            const p = this.scene.player;
            if (p) b.setVelocityY(clamp((p.centre.y - this.sprite.y) * 3, -420, 620));
          }
        }
        this._meleeHitCheck(def, a, def.range ? 46 : 40, def.height ?? this.height);
        break;
      }
      case 'melee':
        this._brake(dt);
        this._meleeHitCheck(def, a, def.range ?? 60, def.height ?? this.height);
        break;
      case 'slam':
        this._brake(dt);
        this._radialHitCheck(def, a, def.range ?? 140);
        break;
      case 'nova':
        this._radialHitCheck(def, a, def.range ?? 120);
        break;
      case 'beam':
        this._beamHitCheck(def, a);
        break;
      case 'beamsweep':
        this._beamSweepUpdate(def, a, dt);
        break;
      default:
        this._brake(dt);
        break;
    }
  }

  /** One-shot effects that happen the instant the active frames begin. */
  _fireAttack(def, a) {
    const scene = this.scene;
    const player = scene.player;
    const c = this.centre;

    switch (def.type) {
      case 'projectile': {
        const count = def.count ?? 1;
        const spread = def.spread ?? 0;
        const baseAngle = player
          ? Math.atan2(player.centre.y - c.y, player.centre.x - c.x)
          : (this.dir > 0 ? 0 : Math.PI);
        for (let i = 0; i < count; i++) {
          const offset = count > 1 ? (i - (count - 1) / 2) * spread : 0;
          const ang = baseAngle + offset;
          scene.spawnEnemyProjectile({
            x: c.x + Math.cos(ang) * this.width * 0.6,
            y: c.y + Math.sin(ang) * this.width * 0.6,
            vx: Math.cos(ang) * (def.speed ?? 420),
            vy: Math.sin(ang) * (def.speed ?? 420),
            damage: this.damage * (def.damage ?? 1),
            tint: this.def.accent,
            life: 3.2,
            unblockable: def.telegraph === 'unblockable',
            arc: def.arc,
            homingTurn: def.homingTurn,
            owner: this
          });
        }
        scene.audio.play('fireball', { rate: 1.4, gain: 0.5 });
        break;
      }
      case 'mortar': {
        const count = def.count ?? 3;
        for (let i = 0; i < count; i++) {
          const tx = player
            ? player.centre.x + rnd.range(-1, 1) * (90 + i * 70)
            : c.x + rnd.range(-260, 260);
          scene.spawnMortar({
            x: tx,
            radius: def.radius ?? 80,
            delay: (def.delay ?? 0.9) + i * 0.12,
            damage: this.damage * (def.damage ?? 1),
            owner: this
          });
        }
        scene.audio.play('danger', { gain: 0.5 });
        break;
      }
      case 'summon': {
        for (const id of def.spawn || []) {
          scene.spawnSummon(id, c.x + rnd.range(-160, 160), c.y - 40, this);
        }
        scene.fx.shockwave(c.x, c.y, { radius: 200, tint: this.def.accent, duration: 420 });
        scene.audio.play('unlock', { gain: 0.4 });
        break;
      }
      case 'blinkstrike': {
        if (player) {
          const side = player.centre.x > c.x ? -1 : 1;
          const tx = player.centre.x + side * 70;
          this.sprite.setPosition(tx, player.centre.y);
          this.dir = -side;
          scene.fx.afterimage(this.rig, this.def.accent, 300);
          scene.fx.burst(c.x, c.y, {
            count: 14, texture: 'spark', tint: this.def.accent,
            speed: [80, 300], life: [0.2, 0.5], scale: [0.7, 0]
          });
        }
        break;
      }
      case 'douse': {
        if (player && this.distanceToPlayer() < (def.range ?? 400)) {
          player.douse(9);
          player.takeDamage(this.damage * (def.damage ?? 0.5), {
            unblockable: true, dir: Math.sign(player.centre.x - c.x) || 1,
            knockback: 160, source: this
          });
        }
        scene.fx.shockwave(c.x, c.y, { radius: def.range ?? 400, tint: 0x7ce8ff, duration: 620 });
        scene.fx.flash(0x2f6fb0, 220, 0.35);
        break;
      }
      case 'wall': {
        scene.spawnFlameWall({
          x: c.x, dir: this.dir, speed: def.speed ?? 240,
          damage: this.damage * (def.damage ?? 1), gapWidth: def.gapWidth ?? 140, owner: this
        });
        break;
      }
      case 'pillars': {
        const count = def.count ?? 5;
        const startX = c.x;
        const dir = player && player.centre.x < c.x ? -1 : 1;
        for (let i = 0; i < count; i++) {
          scene.spawnPillar({
            x: startX + dir * (110 + i * 130),
            delay: i * (def.delay ?? 0.5),
            damage: this.damage * (def.damage ?? 1),
            owner: this
          });
        }
        break;
      }
      case 'slam': {
        scene.fx.shake(0.01, 300);
        scene.fx.shockwave(c.x, this.feetY, { radius: def.range ?? 160, tint: this.def.accent, duration: 420, thickness: 0.4 });
        scene.fx.debris(c.x, this.feetY, 0x8a8f9a, 16);
        scene.audio.play('explode', { gain: 0.7 });
        if (def.shockwave) {
          for (const sdir of [-1, 1]) {
            scene.spawnEnemyProjectile({
              x: c.x + sdir * 40, y: this.feetY - 14,
              vx: sdir * 420, vy: 0,
              damage: this.damage * (def.damage ?? 1) * 0.6,
              tint: this.def.accent, life: 1.6, unblockable: true,
              ground: true, scale: 1.6, owner: this
            });
          }
        }
        break;
      }
      case 'nova': {
        scene.fx.shockwave(c.x, c.y, { radius: def.range ?? 140, tint: this.def.accent, duration: 380 });
        scene.fx.shake(0.009, 260);
        scene.audio.play('explode');
        break;
      }
      case 'beam': {
        scene.audio.play('wave', { rate: 1.5, gain: 0.6 });
        break;
      }
      case 'beamsweep': {
        a.sweepAngle = -(def.sweepArc ?? 1) / 2;
        scene.audio.play('wave', { rate: 0.8 });
        break;
      }
      default: break;
    }
  }

  /* -------------------------------------------------------- hit resolution */

  _hitPlayer(def, a, damageMult = 1, knockbackMult = 1) {
    const player = this.scene.player;
    if (!player || !player.alive || a.hits.has('player')) return;
    a.hits.add('player');
    player.takeDamage(this.damage * (def.damage ?? 1) * damageMult, {
      unblockable: def.telegraph === 'unblockable',
      dir: Math.sign(player.centre.x - this.sprite.x) || this.dir,
      knockback: (def.knockback ?? 200) * knockbackMult,
      x: this.sprite.x,
      source: this
    });
  }

  _meleeHitCheck(def, a, reach, height) {
    const c = this.centre;
    const rect = new Phaser.Geom.Rectangle(
      this.dir > 0 ? c.x : c.x - reach,
      c.y - height / 2,
      reach, height
    );
    if (this.scene.playerOverlaps(rect)) this._hitPlayer(def, a);
  }

  _radialHitCheck(def, a, radius) {
    const player = this.scene.player;
    if (!player) return;
    if (this.distanceToPlayer() <= radius) this._hitPlayer(def, a);
  }

  _beamHitCheck(def, a) {
    const player = this.scene.player;
    if (!player) return;
    const c = this.centre;
    const ang = a.beamAngle ?? (a.beamAngle = player
      ? Math.atan2(player.centre.y - c.y, player.centre.x - c.x)
      : 0);
    const len = def.range ?? 700;
    const line = new Phaser.Geom.Line(c.x, c.y, c.x + Math.cos(ang) * len, c.y + Math.sin(ang) * len);
    this._drawBeam(line, TELEGRAPH_COLOUR.unblockable, 8);
    if (Phaser.Geom.Intersects.LineToRectangle(line, player.bounds)) this._hitPlayer(def, a);
  }

  _beamSweepUpdate(def, a, dt) {
    const player = this.scene.player;
    const c = this.centre;
    const arc = def.sweepArc ?? 1;
    a.sweepAngle = (a.sweepAngle ?? -arc / 2) + (arc / (def.active ?? 1.4)) * dt;
    const baseAngle = Math.PI / 2;    // sweeping across the ground
    const ang = baseAngle + a.sweepAngle * (this.dir > 0 ? 1 : -1);
    const len = 900;
    const line = new Phaser.Geom.Line(c.x, c.y, c.x + Math.cos(ang) * len, c.y + Math.sin(ang) * len);
    this._drawBeam(line, TELEGRAPH_COLOUR.unblockable, 10);
    if (player && Phaser.Geom.Intersects.LineToRectangle(line, player.bounds)) {
      // A sweeping beam can hit more than once, but not every frame.
      if (!a.lastSweepHit || this.time - a.lastSweepHit > 0.55) {
        a.lastSweepHit = this.time;
        a.hits.delete('player');
        this._hitPlayer(def, a);
      }
    }
  }

  _drawBeam(line, colour, width) {
    const g = this.telegraph;
    g.lineStyle(width, colour, 0.9);
    g.beginPath();
    g.moveTo(line.x1, line.y1);
    g.lineTo(line.x2, line.y2);
    g.strokePath();
    g.lineStyle(width * 2.6, colour, 0.22);
    g.beginPath();
    g.moveTo(line.x1, line.y1);
    g.lineTo(line.x2, line.y2);
    g.strokePath();
  }

  /* ------------------------------------------------------------ telegraphs */

  _drawTelegraph(def, progress) {
    const g = this.telegraph;
    const colour = TELEGRAPH_COLOUR[def.telegraph] || TELEGRAPH_COLOUR.blockable;
    const c = this.centre;
    const pulse = 0.35 + Math.abs(Math.sin(progress * Math.PI * 3)) * 0.45;
    const fill = clamp(progress, 0, 1);

    g.lineStyle(3, colour, 0.85);

    switch (def.type) {
      case 'melee':
      case 'dash': {
        const reach = def.type === 'dash' ? (def.range ?? 300) : (def.range ?? 60);
        const h = def.height ?? this.height;
        const x = this.dir > 0 ? c.x : c.x - reach;
        g.fillStyle(colour, 0.14 * pulse);
        g.fillRect(x, c.y - h / 2, reach, h);
        g.strokeRect(x, c.y - h / 2, reach, h);
        // A filling bar shows exactly when the hit lands.
        g.fillStyle(colour, 0.55);
        g.fillRect(x, c.y + h / 2 - 5, reach * fill, 5);
        break;
      }
      case 'slam':
      case 'nova':
      case 'douse': {
        const r = def.range ?? 140;
        g.fillStyle(colour, 0.1 * pulse);
        g.fillCircle(c.x, def.type === 'slam' ? this.feetY : c.y, r);
        g.strokeCircle(c.x, def.type === 'slam' ? this.feetY : c.y, r);
        g.lineStyle(5, colour, 0.9);
        g.strokeCircle(c.x, def.type === 'slam' ? this.feetY : c.y, r * fill);
        break;
      }
      case 'beam': {
        const player = this.scene.player;
        if (!player) break;
        const ang = Math.atan2(player.centre.y - c.y, player.centre.x - c.x);
        const len = def.range ?? 700;
        g.lineStyle(2 + fill * 6, colour, 0.35 + fill * 0.5);
        g.beginPath();
        g.moveTo(c.x, c.y);
        g.lineTo(c.x + Math.cos(ang) * len, c.y + Math.sin(ang) * len);
        g.strokePath();
        break;
      }
      case 'projectile': {
        g.fillStyle(colour, 0.5 * pulse);
        g.fillCircle(c.x + this.dir * this.width * 0.5, c.y, 6 + fill * 8);
        break;
      }
      default: {
        g.fillStyle(colour, 0.35 * pulse);
        g.fillCircle(c.x, c.y - this.height * 0.7, 6 + fill * 6);
        break;
      }
    }
  }

  /* --------------------------------------------------------------- damage */

  /**
   * @returns {{hit:boolean, damage:number, x:number, y:number, killed:boolean, guarded?:boolean}}
   */
  takeDamage(amount, opts = {}) {
    if (!this.alive) return { hit: false, damage: 0, x: this.x, y: this.y, killed: false };

    let damage = amount;
    let guarded = false;

    // Frontal guard (Lancers): attacking into the shield is nearly pointless.
    if (this.def.frontalGuard && !this.guardBroken) {
      const attackFromFront = Math.sign(opts.dir ?? 1) === -Math.sign(this.dir) ||
        (opts.dir != null && Math.sign(opts.dir) !== Math.sign(this.dir));
      const attackerSide = Math.sign((opts.source?.x ?? this.x) - this.x);
      if (attackerSide === this.dir || attackFromFront) {
        damage *= this.def.frontalGuard;
        guarded = true;
      }
    }

    if (this.armour > 0) damage *= (1 - this.armour);
    damage = Math.max(1, damage);

    this.hp -= damage;
    this.flashTimer = 0.09;

    // Stagger meter: enough pressure interrupts whatever it was doing.
    this.stagger += opts.stagger ?? 12;
    if (this.stagger >= this.staggerMax && !this.isBoss) {
      this._enterStagger();
    } else if (this.isBoss && this.stagger >= this.staggerMax) {
      this._enterStagger(true);
    }

    // Knockback, resisted by heavies.
    const resist = this.def.knockbackResist ?? 0;
    const b = this.sprite.body;
    if (b && b.moves) {
      if (opts.knockback) b.setVelocityX((opts.dir ?? 1) * opts.knockback * (1 - resist));
      if (opts.launch && !this.def.flying) b.setVelocityY(opts.launch * (1 - resist));
      if (opts.spike && this.def.flying) b.setVelocityY(opts.spike);
    }

    if (opts.burn && !this.def.immuneBurn) this.applyBurn(opts.burn);

    if (guarded) {
      this.scene.audio.play('block', { rate: 0.8, gain: 0.6 });
      this.scene.fx.burst(this.x + this.dir * this.width * 0.5, this.y, {
        count: 6, texture: 'spark', tint: 0x9fd8ff, speed: [80, 200], life: [0.15, 0.3], scale: [0.5, 0]
      });
    }

    const killed = this.hp <= 0;
    if (killed) this._die();

    return {
      hit: true, damage, guarded, killed,
      x: this.x + (opts.dir ?? 0) * this.width * 0.3,
      y: this.y - this.height * 0.1
    };
  }

  _enterStagger(bossVariant = false) {
    this.stagger = 0;
    this.state = 'stagger';
    this.staggerTimer = ENEMY_SCALING.STAGGER_DURATION * (bossVariant ? 1.6 : 1);
    if (this.action) {
      this.scene.releaseAttackToken?.(this);
      this.action = null;
    }
    this.telegraph.clear();
    if (this.def.frontalGuard) this.guardBroken = true;
    this.scene.fx.burst(this.x, this.y, {
      count: 12, texture: 'spark', tint: 0xffd166, speed: [100, 280],
      life: [0.25, 0.5], scale: [0.7, 0]
    });
    if (bossVariant) {
      this.scene.fx.callout('STAGGERED!', { colour: '#ffd451', y: 190, scale: 0.9, duration: 800 });
      this.scene.audio.play('rank');
    }
  }

  /* ----------------------------------------------------------------- burn */

  applyBurn({ damage, duration }) {
    if (this.burns.length >= BURN.maxStacks * (this.scene.player?.stats.has('pyreclasp') ? 2 : 1)) {
      // Refresh the shortest stack instead of adding beyond the cap.
      this.burns.sort((a, b) => a.remaining - b.remaining);
      this.burns[0].remaining = duration;
      this.burns[0].damage = Math.max(this.burns[0].damage, damage);
      return;
    }
    this.burns.push({ damage, remaining: duration });
  }

  _updateBurns(dt) {
    if (!this.burns.length) return;
    this.burnTick += dt;
    let total = 0;
    for (let i = this.burns.length - 1; i >= 0; i--) {
      const burn = this.burns[i];
      burn.remaining -= dt;
      if (burn.remaining <= 0) this.burns.splice(i, 1);
      else total += burn.damage;
    }
    if (this.burnTick >= BURN.tickInterval) {
      this.burnTick = 0;
      if (total > 0) {
        const dmg = Math.max(1, Math.round(total));
        this.hp -= dmg;
        this.scene.fx.damageNumber(this.x, this.y - this.height * 0.4, dmg, { colour: '#ff9b3d' });
        this.scene.player?.addUltimate(dmg * 0.3);
        if (this.hp <= 0) { this._die(); return; }
      }
    }
    if (rnd.chance(dt * 8)) {
      this.scene.fx.burst(this.x + rnd.range(-8, 8), this.y + rnd.range(-10, 10), {
        count: 1, texture: 'spark', tint: 0xff8a3d, speed: [10, 50],
        life: [0.3, 0.6], scale: [0.5, 0], gravity: -120
      });
    }
  }

  /* ---------------------------------------------------------------- death */

  _die(selfDestruct = false) {
    if (!this.alive) return;
    this.alive = false;
    this.telegraph.clear();
    this.scene.releaseAttackToken?.(this);

    const explodes = selfDestruct || this.def.explodeOnDeath || this.mods.explodeOnDeath;
    if (explodes) {
      const radius = this.def.attacks?.[0]?.range ?? 110;
      this.scene.fx.shockwave(this.x, this.y, { radius, tint: 0xff8a3d, duration: 420 });
      this.scene.fx.fireBurst(this.x, this.y, 26, 12);
      this.scene.fx.shake(0.008, 240);
      this.scene.audio.play('explode');
      const player = this.scene.player;
      if (player && player.alive && Phaser.Math.Distance.Between(this.x, this.y, player.centre.x, player.centre.y) < radius) {
        player.takeDamage(this.damage, {
          unblockable: true, dir: Math.sign(player.centre.x - this.x) || 1,
          knockback: 320, source: this
        });
      }
      // Chain into other robots — Volatile stages become fireworks.
      for (const other of this.scene.queryEnemies(
        new Phaser.Geom.Rectangle(this.x - radius, this.y - radius, radius * 2, radius * 2))) {
        if (other === this || !other.alive) continue;
        other.takeDamage(this.damage * 0.8, { dir: Math.sign(other.x - this.x) || 1, knockback: 180 });
      }
    } else {
      this.scene.fx.debris(this.x, this.y, this.def.colour, 14);
      this.scene.fx.smoke(this.x, this.y, 0x2a2028, 5);
      this.scene.fx.burst(this.x, this.y, {
        count: 10, texture: 'spark', tint: this.def.accent, speed: [120, 320],
        life: [0.25, 0.55], scale: [0.7, 0], gravity: 400
      });
      this.scene.audio.play('die', { rate: rnd.range(0.9, 1.15) });
    }

    // Wildfire: burning deaths spread the fire and refund mana.
    const player = this.scene.player;
    if (player?.stats.has('wildfire') && this.burns.length) {
      player.mana = Math.min(player.maxMana, player.mana + 8);
      const r = 150;
      for (const other of this.scene.queryEnemies(new Phaser.Geom.Rectangle(this.x - r, this.y - r, r * 2, r * 2))) {
        if (other === this || !other.alive) continue;
        other.applyBurn({ damage: this.burns[0].damage, duration: player.stats.burnDuration });
      }
      this.scene.fx.shockwave(this.x, this.y, { radius: r, tint: 0xff6b2b, duration: 380 });
    }

    this.scene.tweens.add({
      targets: this.rig, alpha: 0, scaleY: 0.3, duration: 220, ease: 'Quad.easeIn'
    });
    this.scene.onEnemyKilled(this);
    this.sprite.body.enable = false;
    if (this.marker) this.marker.destroy();
    if (this.eliteGlow) this.eliteGlow.destroy();
  }

  /* ------------------------------------------------------------- visuals */

  _updateVisuals(dt) {
    this.rig.x = this.sprite.x;
    this.rig.y = this.def.flying || this.def.stationary ? this.sprite.y + this.height / 2 : this.feetY;

    const moving = Math.abs(this.sprite.body.velocity.x) > 20;
    const player = this.scene.player;
    poseRig(this.rig, {
      pose: this.state === 'stagger' ? 'hurt'
        : this.state === 'attack' ? (this.action?.def.type === 'projectile' || this.action?.def.type === 'beam' ? 'cast' : 'attack')
        : !this.sprite.body.blocked.down && !this.def.flying && !this.def.stationary ? 'air'
        : moving ? 'run' : 'idle',
      time: this.time,
      dir: this.dir,
      vx: this.sprite.body.velocity.x,
      vy: this.sprite.body.velocity.y,
      speedRatio: Math.min(1.5, Math.abs(this.sprite.body.velocity.x) / Math.max(40, this.speed)),
      phase: this.action ? clamp(this.action.t / this.action.total, 0, 1) : 0,
      attackIndex: 0,
      moving,
      priming: this.state === 'attack' && this.action?.phase === 'windup',
      aimAngle: player ? Math.atan2(player.centre.y - this.y, player.centre.x - this.x) : 0,
      blend: 0.3
    });

    // Hit flash — a white pop that reads even through a screen of particles.
    const parts = this.rig.parts;
    const flash = this.flashTimer > 0;
    if (flash) {
      for (const key of ['torso', 'head', 'armFront', 'armBack', 'legFront', 'legBack']) {
        if (parts[key]) parts[key].setTintFill(0xffffff);
      }
    } else if (this._wasFlashing) {
      this._restoreTints();
    }
    this._wasFlashing = flash;

    // Telegraph glow on the visor while winding up.
    if (parts.visor) {
      const winding = this.state === 'attack' && this.action?.phase === 'windup';
      const unblockable = this.action?.def.telegraph === 'unblockable';
      parts.visor.setTint(winding
        ? (unblockable ? 0xff3b5c : 0xffc247)
        : this.def.accent);
      parts.visor.setAlpha(winding ? 0.6 + Math.abs(Math.sin(this.time * 22)) * 0.4 : 1);
    }

    if (this.eliteGlow) {
      this.eliteGlow.setPosition(this.x, this.y);
      this.eliteGlow.setAlpha(0.14 + Math.sin(this.time * 3) * 0.06);
    }
    if (this.marker) {
      this.marker.setPosition(this.x, this.y - this.height * 0.9 - 14);
      this.marker.rotation += dt * 2;
      this.marker.setScale(0.9 + Math.sin(this.time * 5) * 0.12);
    }
  }

  _restoreTints() {
    const parts = this.rig.parts;
    const base = this.elite ? this._eliteTint(this.def.colour) : this.def.colour;
    const light = this._eliteTint(base, 26);
    const dark = this._eliteTint(base, -34);
    if (parts.torso) parts.torso.setTint(base);
    if (parts.head) parts.head.setTint(light);
    if (parts.armFront) parts.armFront.setTint(light);
    if (parts.armBack) parts.armBack.setTint(dark);
    if (parts.legFront) parts.legFront.setTint(base);
    if (parts.legBack) parts.legBack.setTint(dark);
  }

  destroy() {
    this.sprite.destroy();
    this.rig.destroy(true);
    this.telegraph.destroy();
    if (this.marker) this.marker.destroy();
    if (this.eliteGlow) this.eliteGlow.destroy();
  }
}
