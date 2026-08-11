/**
 * Player.js — the Ascendant.
 *
 * Structure: physics live on an invisible collider image; the visible rig is a
 * separate container that follows it. Decoupling them means squash, tilt and
 * roll-spin never touch the hitbox, and shrinking the hitbox for a slide is a
 * one-liner that cannot desync from the art.
 *
 * Feel features that matter more than any stat on the sheet:
 *   coyote time, jump buffering, jump-cut, combo cancel windows, i-frames on
 *   roll, a real parry window, hitstop on connect, and a landing squash.
 */

import { PLAYER, COMBO, AIR_ATTACK, DASH_ATTACK, ABILITIES, ULTIMATE, BURN, STYLE } from '../data/Balance.js';
import { createRig, poseHumanoid } from './Rig.js';
import { clamp, rnd } from '../utils/Rand.js';

const STATE = {
  IDLE: 'idle', RUN: 'run', AIR: 'air', ATTACK: 'attack', CAST: 'cast',
  BLOCK: 'block', ROLL: 'roll', SLIDE: 'slide', HURT: 'hurt', DEAD: 'dead'
};

export class Player {
  constructor(scene, x, y, profile) {
    this.scene = scene;
    this.profile = profile;
    this.stats = profile.stats;

    this.width = 30;
    this.height = 56;

    // --- collider ----------------------------------------------------------
    this.sprite = scene.physics.add.image(x, y, 'px').setVisible(false);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setMaxVelocity(1600, 1900);
    this.sprite.body.setAllowGravity(true);
    this.sprite.setDataEnabled();
    this.sprite.setData('owner', this);
    this._setBodySize(this.width, this.height);

    // --- visuals -----------------------------------------------------------
    // Light enough to read against every biome's dark palette — the player
    // must never be the hardest thing on screen to find.
    this.rig = createRig(scene, {
      height: this.height,
      colour: 0x6a5a86,
      accent: 0xff8a3d,
      visorColour: 0xffd166
    });
    this.rig.setDepth(50);

    // The fire inside: a chest light that brightens with available mana.
    this.chestLight = scene.add.image(0, 0, 'spark')
      .setTint(0xffb43d).setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(16, 16).setDepth(51);

    this.aura = scene.add.image(x, y, 'soft')
      .setTint(0xff7a2f).setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(90, 90).setAlpha(0.22).setDepth(48);

    this.trailTimer = 0;

    // --- vitals ------------------------------------------------------------
    this.maxHp = this.stats.maxHp;
    this.hp = this.maxHp;
    this.maxMana = this.stats.maxMana;
    this.mana = this.maxMana;
    this.maxStamina = this.stats.maxStamina;
    this.stamina = this.maxStamina;
    this.ultimate = 0;

    // --- state -------------------------------------------------------------
    this.state = STATE.IDLE;
    this.dir = 1;
    this.alive = true;
    this.time = 0;

    this.stateTimer = 0;
    this.coyote = 0;
    this.airJumpsLeft = 0;
    this.wasGrounded = true;
    this.jumpHeld = false;

    this.attackIndex = -1;
    this.attackTimer = 0;
    this.attackTotal = 0;
    this.attackDef = null;
    this.attackHits = new Set();
    this.attackDidHit = false;
    this.comboWindow = 0;
    this.comboRampStacks = 0;
    this.queuedAttack = false;

    this.blockTime = 0;
    this.parryLock = 0;
    this.guardBroken = 0;

    this.rollTimer = 0;
    this.rollCooldown = 0;
    this.slideCooldown = 0;
    this.iframes = 0;

    this.hurtTimer = 0;
    this.combatTimer = 0;      // time since taking damage, for regen gating
    this.manaHitStreak = 0;
    this.manaHitWindow = 0;
    this.staminaDelay = 0;
    this.sprintTime = 0;

    this.cooldowns = Object.create(null);
    this.dashCharges = this.stats.dashCharges;
    this.dashRecharge = 0;
    this.potionCooldown = 0;

    this.ascended = 0;         // remaining seconds of ultimate
    this.doused = 0;           // Nullflame mechanic: fire suppressed
    this.dousedHitsNeeded = 0;
    this.lastEmberUsed = false;

    this.comboCount = 0;
    this.comboTimer = 0;

    this.damageDealt = 0;
    this.damageTaken = 0;
    this.kills = 0;
    this.parries = 0;
    this.tookDamage = false;

    /** Set by the scene; fired on death. */
    this.onDeath = null;
  }

  /* ------------------------------------------------------------ collider */

  _setBodySize(w, h) {
    const body = this.sprite.body;
    body.setSize(w, h, false);
    // Keep the feet anchored where they were, whatever the new height is.
    body.setOffset(2 - w / 2, this.height / 2 - h + 2);
    this._bodyH = h;
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }
  get feetY() { return this.sprite.y + this.height / 2; }
  get body() { return this.sprite.body; }
  get grounded() { return this.sprite.body.blocked.down || this.sprite.body.touching.down; }

  get bounds() {
    return new Phaser.Geom.Rectangle(
      this.sprite.x - this.width / 2,
      this.sprite.y + this.height / 2 - this._bodyH,
      this.width,
      this._bodyH
    );
  }

  /** Centre of mass — where enemies aim and where hits land visually. */
  get centre() {
    return { x: this.sprite.x, y: this.sprite.y + this.height / 2 - this._bodyH / 2 };
  }

  /* --------------------------------------------------------------- update */

  update(dt, input) {
    // Cached so helpers invoked deeper in the state machine can read the stick
    // without every one of them taking an `input` parameter.
    this._input = input;
    if (!this.alive) { this._updateVisuals(dt); return; }

    this.time += dt;
    this._tickTimers(dt);

    switch (this.state) {
      case STATE.ROLL: this._updateRoll(dt, input); break;
      case STATE.SLIDE: this._updateSlide(dt, input); break;
      case STATE.ATTACK: this._updateAttack(dt, input); break;
      case STATE.CAST: this._updateCast(dt, input); break;
      case STATE.HURT: this._updateHurt(dt, input); break;
      default: this._updateFree(dt, input); break;
    }

    this._updateVisuals(dt);
  }

  _tickTimers(dt) {
    const s = this.stats;

    this.stateTimer += dt;
    this.combatTimer += dt;
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0 && this.comboCount > 0) {
      this.profile.addMetrics({ bestCombo: this.comboCount });
      this.comboCount = 0;
      this.comboRampStacks = 0;
    }

    this.rollCooldown = Math.max(0, this.rollCooldown - dt);
    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    this.parryLock = Math.max(0, this.parryLock - dt);
    this.guardBroken = Math.max(0, this.guardBroken - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.comboWindow = Math.max(0, this.comboWindow - dt);
    this.potionCooldown = Math.max(0, this.potionCooldown - dt);
    this.manaHitWindow = Math.max(0, this.manaHitWindow - dt);
    if (this.manaHitWindow === 0) this.manaHitStreak = 0;

    for (const key of Object.keys(this.cooldowns)) {
      this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    }

    // Dash charges refill on their own timer so Slipstream feels like a pool.
    if (this.dashCharges < s.dashCharges) {
      this.dashRecharge += dt;
      const perCharge = ABILITIES.flamedash.cooldown * s.cooldownMult;
      if (this.dashRecharge >= perCharge) {
        this.dashRecharge = 0;
        this.dashCharges++;
      }
    }

    // Ultimate.
    if (this.ascended > 0) {
      this.ascended = Math.max(0, this.ascended - dt);
      if (this.ascended === 0) this._endAscension();
    }

    // Doused (Nullflame): fire is suppressed until enough hits land.
    if (this.doused > 0) this.doused = Math.max(0, this.doused - dt);

    // Mana.
    const manaRate = PLAYER.MANA_REGEN * s.manaRegenMult * (this.doused > 0 ? 0.4 : 1);
    this.mana = Math.min(this.maxMana, this.mana + manaRate * dt);

    // Stamina — pauses briefly after any spend so it can't be spammed.
    this.staminaDelay = Math.max(0, this.staminaDelay - dt);
    if (this.staminaDelay === 0 && this.state !== STATE.BLOCK) {
      this.stamina = Math.min(this.maxStamina, this.stamina + PLAYER.STAMINA_REGEN * s.staminaRegenMult * dt);
    }

    // Health: full heals happen in the Hub, but a slow trickle out of combat
    // keeps a bad run from becoming an unwinnable one.
    if (this.combatTimer > PLAYER.REGEN_COMBAT_DELAY) {
      const floor = this.maxHp * PLAYER.REGEN_SAFETY_FLOOR;
      if (this.hp < floor) {
        this.hp = Math.min(floor, this.hp + PLAYER.REGEN_OUT_OF_COMBAT * dt);
      }
    }

    if (this.grounded) {
      this.coyote = PLAYER.COYOTE_TIME;
      if (!this.wasGrounded) this._onLand();
      this.airJumpsLeft = this.stats.airJumps;
      this.wasGrounded = true;
    } else {
      this.coyote = Math.max(0, this.coyote - dt);
      this.wasGrounded = false;
    }
  }

  _onLand() {
    this.squash = 0.78;
    this.stretch = 1.16;
    const vy = this.sprite.body.velocity.y;
    if (vy > 420) {
      this.scene.fx.dust(this.sprite.x, this.feetY, 0);
      this.scene.audio.play('land', { gain: clamp(vy / 1200, 0.2, 1) });
      if (vy > 900) this.scene.fx.shake(0.0016, 90);
    }
  }

  /* ------------------------------------------------------- free movement */

  _updateFree(dt, input) {
    const s = this.stats;
    const body = this.sprite.body;

    // --- block / parry ----------------------------------------------------
    const wantsBlock = input.down('block') && this.grounded && this.guardBroken === 0 && this.stamina > 1;
    if (wantsBlock) {
      if (this.state !== STATE.BLOCK) {
        this.state = STATE.BLOCK;
        this.blockTime = 0;
        this.stateTimer = 0;
      }
      this.blockTime += dt;
      this.stamina = Math.max(0, this.stamina - PLAYER.STAMINA_BLOCK_DRAIN * dt);
      this.staminaDelay = PLAYER.STAMINA_REGEN_DELAY;
      if (this.stamina <= 0) this._breakGuard();
      body.setVelocityX(body.velocity.x * 0.72);
      // Face whatever is closest while guarding — you cannot block your back.
      const threat = this.scene.nearestEnemy?.(this.sprite.x, this.sprite.y, 420);
      if (threat) this.dir = threat.x < this.sprite.x ? -1 : 1;
      this._checkActionInputs(dt, input, true);
      return;
    }
    if (this.state === STATE.BLOCK) this.state = STATE.IDLE;

    // --- horizontal -------------------------------------------------------
    const ax = input.axis.x;
    const sprinting = input.down('sprint') && Math.abs(ax) > 0.1 && this.grounded &&
      (this.stamina > 0 || this.sprintTime < s.sprintGrace);

    if (sprinting) {
      this.sprintTime += dt;
      if (this.sprintTime > s.sprintGrace) {
        this.stamina = Math.max(0, this.stamina - PLAYER.STAMINA_SPRINT * dt);
        this.staminaDelay = PLAYER.STAMINA_REGEN_DELAY;
      }
    } else if (this.grounded) {
      this.sprintTime = Math.max(0, this.sprintTime - dt * 2);
    }

    const maxSpeed = (sprinting ? PLAYER.SPRINT_SPEED * s.sprintMult : PLAYER.WALK_SPEED)
      * s.moveSpeedMult * (this.ascended > 0 ? ULTIMATE.speedMult : 1);

    const accel = (this.grounded ? PLAYER.ACCEL_GROUND : PLAYER.ACCEL_AIR)
      * (this.grounded ? 1 : PLAYER.AIR_CONTROL);

    if (Math.abs(ax) > 0.12) {
      const target = ax * maxSpeed;
      const delta = target - body.velocity.x;
      const step = Math.sign(delta) * Math.min(Math.abs(delta), accel * dt);
      body.setVelocityX(body.velocity.x + step);
      this.dir = ax > 0 ? 1 : -1;
    } else {
      const friction = (this.grounded ? PLAYER.FRICTION_GROUND : PLAYER.FRICTION_AIR) * dt;
      const v = body.velocity.x;
      body.setVelocityX(Math.abs(v) <= friction ? 0 : v - Math.sign(v) * friction);
    }

    // --- slide ------------------------------------------------------------
    if (input.down('down') && this.grounded && this.slideCooldown === 0 &&
        Math.abs(body.velocity.x) > PLAYER.WALK_SPEED * 0.75 && this.stamina >= PLAYER.STAMINA_SLIDE) {
      this._startSlide();
      return;
    }

    // --- jump -------------------------------------------------------------
    if (input.pressed('jump')) {
      if (this.coyote > 0 || this.grounded) {
        input.consume('jump');
        this._jump(PLAYER.JUMP_VELOCITY);
      } else if (this.airJumpsLeft > 0) {
        input.consume('jump');
        this.airJumpsLeft--;
        this._jump(PLAYER.DOUBLE_JUMP_VELOCITY);
        this.scene.fx.burst(this.sprite.x, this.feetY, {
          count: 12, texture: 'spark', tint: 0xffb43d, speed: [80, 260],
          angle: [0.2, Math.PI - 0.2], life: [0.2, 0.45], scale: [0.7, 0]
        });
        this.scene.fx.shockwave(this.sprite.x, this.feetY, { radius: 46, tint: 0xffb43d, duration: 260, thickness: 0.4 });
      }
    }
    // Jump-cut: releasing early trims the arc, so height is controllable.
    if (input.justUp('jump') && body.velocity.y < 0) {
      body.setVelocityY(body.velocity.y * PLAYER.JUMP_CUT);
    }

    // --- roll -------------------------------------------------------------
    if (input.pressed('roll') && this.rollCooldown === 0) {
      const cost = PLAYER.STAMINA_ROLL * s.rollCostMult;
      if (this.stamina >= cost) {
        input.consume('roll');
        this._startRoll(cost);
        return;
      }
      input.consume('roll');
      this.scene.audio.play('error');
    }

    this._checkActionInputs(dt, input, false);

    // --- state for the animator ------------------------------------------
    if (!this.grounded) this.state = STATE.AIR;
    else if (Math.abs(body.velocity.x) > 24) this.state = STATE.RUN;
    else this.state = STATE.IDLE;

    this.speedRatio = Math.min(1.6, Math.abs(body.velocity.x) / PLAYER.WALK_SPEED);
  }

  /** Attacks, abilities, ultimate and potions — usable from most states. */
  _checkActionInputs(dt, input, blocking) {
    if (input.take('potion')) this._drinkPotion();

    if (input.take('ultimate')) this._tryAscend();

    const abilityIdx = input.takeAbility();
    if (abilityIdx >= 0) this._tryAbility(abilityIdx);

    if (!blocking && input.take('attack')) this._startAttack();
  }

  /* ------------------------------------------------------------- movement */

  _jump(velocity) {
    this.sprite.body.setVelocityY(velocity);
    this.coyote = 0;
    this.squash = 1.14;
    this.stretch = 0.88;
    this.scene.audio.play('jump', { rate: rnd.range(0.95, 1.08) });
    this.scene.fx.dust(this.sprite.x, this.feetY, 0);
  }

  _startRoll(cost) {
    this.state = STATE.ROLL;
    this.stateTimer = 0;
    this.rollTimer = PLAYER.ROLL_TIME;
    this.iframes = Math.max(this.iframes, this.stats.rollIframes);
    this.stamina -= cost;
    this.staminaDelay = PLAYER.STAMINA_REGEN_DELAY;
    this.rollCooldown = PLAYER.ROLL_COOLDOWN;
    const axisX = this._input?.axis?.x ?? 0;
    const dir = Math.abs(axisX) > 0.2 ? Math.sign(axisX) : this.dir;
    this.dir = dir;
    this.sprite.body.setVelocityX(dir * PLAYER.ROLL_SPEED);
    this.scene.audio.play('roll');
    this.scene.style.add(4, 'roll');
    this.rollSpin = 0;
  }

  _updateRoll(dt, input) {
    this.rollTimer -= dt;
    this.rollSpin += dt * (Math.PI * 2) / PLAYER.ROLL_TIME * this.dir;
    const body = this.sprite.body;
    body.setVelocityX(this.dir * PLAYER.ROLL_SPEED * (0.4 + 0.6 * Math.max(0, this.rollTimer / PLAYER.ROLL_TIME)));

    if (this.scene.fx.quality !== 'low' && Math.random() < 0.6) {
      this.scene.fx.afterimage(this.rig, 0xc074ff, 220);
    }

    // Roll-cancel into an attack once the i-frames are spent — rewards timing.
    if (this.rollTimer < PLAYER.ROLL_TIME - this.stats.rollIframes && input.take('attack')) {
      this._startAttack(true);
      return;
    }
    if (this.rollTimer <= 0) {
      this.rollSpin = 0;
      this.state = this.grounded ? STATE.IDLE : STATE.AIR;
    }
  }

  _startSlide() {
    this.state = STATE.SLIDE;
    this.stateTimer = 0;
    this.slideTimer = PLAYER.SLIDE_TIME;
    this.stamina -= PLAYER.STAMINA_SLIDE;
    this.staminaDelay = PLAYER.STAMINA_REGEN_DELAY;
    this.slideCooldown = PLAYER.SLIDE_COOLDOWN;
    this._setBodySize(this.width, this.height * PLAYER.SLIDE_HEIGHT_SCALE);
    this.sprite.body.setVelocityX(this.dir * PLAYER.SLIDE_SPEED);
    this.scene.audio.play('roll', { rate: 0.8 });
    this.scene.style.add(5, 'slide');
    this.scene.fx.dust(this.sprite.x - this.dir * 14, this.feetY, -this.dir);
  }

  _updateSlide(dt, input) {
    this.slideTimer -= dt;
    const body = this.sprite.body;
    const k = Math.max(0, this.slideTimer / PLAYER.SLIDE_TIME);
    body.setVelocityX(this.dir * PLAYER.SLIDE_SPEED * (0.35 + 0.65 * k));

    if (Math.random() < 0.4) this.scene.fx.dust(this.sprite.x - this.dir * 12, this.feetY, -this.dir);

    // Sliding into a jump is the classic movement-tech reward.
    if (input.pressed('jump')) {
      input.consume('jump');
      this._endSlide();
      this._jump(PLAYER.JUMP_VELOCITY * 1.05);
      this.scene.style.add(6, 'slidejump');
      return;
    }
    if (input.take('attack')) {
      this._endSlide();
      this._startAttack(true);
      return;
    }
    if (this.slideTimer <= 0 || !this.grounded) this._endSlide();
  }

  _endSlide() {
    this._setBodySize(this.width, this.height);
    this.state = this.grounded ? STATE.IDLE : STATE.AIR;
  }

  /* --------------------------------------------------------------- attacks */

  _startAttack(fromCancel = false) {
    if (this.state === STATE.HURT || !this.alive) return;

    let def;
    let index;
    if (!this.grounded) {
      def = AIR_ATTACK;
      index = 3;
    } else if (this.state === STATE.SLIDE || fromCancel || Math.abs(this.sprite.body.velocity.x) > PLAYER.SPRINT_SPEED * 0.85) {
      def = DASH_ATTACK;
      index = 4;
    } else {
      index = this.comboWindow > 0 ? (this.attackIndex + 1) % COMBO.length : 0;
      def = COMBO[index];
    }

    this.state = STATE.ATTACK;
    this.stateTimer = 0;
    this.attackIndex = index;
    this.attackDef = def;
    this.attackTimer = 0;
    this.attackTotal = def.windup + def.active + def.recover;
    this.attackHits.clear();
    this.attackDidHit = false;
    this.queuedAttack = false;
    this.comboWindow = 0;

    if (def.advance && this.grounded) {
      this.sprite.body.setVelocityX(this.dir * def.advance);
    }
    if (def.launch) this.sprite.body.setVelocityY(def.launch * 0.35);
    this.scene.audio.play('swing', { rate: 0.85 + index * 0.12 });
  }

  _updateAttack(dt, input) {
    const def = this.attackDef;
    this.attackTimer += dt;
    const body = this.sprite.body;

    if (this.grounded) body.setVelocityX(body.velocity.x * 0.86);

    const inActive = this.attackTimer >= def.windup && this.attackTimer < def.windup + def.active;
    if (inActive) this._sweepHitbox(def);

    // Buffer the next input so the combo continues even if pressed early.
    if (input.take('attack')) this.queuedAttack = true;
    const abilityIdx = input.takeAbility();
    if (abilityIdx >= 0 && this.attackTimer > def.windup) {
      // Cancelling a swing into a fire ability is the core of stylish play.
      if (this._tryAbility(abilityIdx)) return;
    }
    if (input.pressed('roll') && this.attackTimer > def.windup && this.rollCooldown === 0) {
      const cost = PLAYER.STAMINA_ROLL * this.stats.rollCostMult;
      if (this.stamina >= cost) {
        input.consume('roll');
        this._startRoll(cost);
        return;
      }
    }

    const cancelAt = def.windup + def.active + (def.cancelAfter ?? 0.12);
    if (this.attackTimer >= cancelAt && this.queuedAttack && def !== AIR_ATTACK) {
      this._startAttack();
      return;
    }

    if (this.attackTimer >= this.attackTotal) {
      this.comboWindow = 0.32;   // grace period to chain the next link
      this.state = this.grounded ? STATE.IDLE : STATE.AIR;
      if (this.queuedAttack) this._startAttack();
    }
  }

  /** Build the swing's hitbox and damage everything newly inside it. */
  _sweepHitbox(def) {
    const c = this.centre;
    const rect = new Phaser.Geom.Rectangle(
      this.dir > 0 ? c.x : c.x - def.reach,
      c.y - def.height / 2,
      def.reach,
      def.height
    );

    const targets = this.scene.queryEnemies(rect);
    for (const enemy of targets) {
      if (this.attackHits.has(enemy)) continue;
      this.attackHits.add(enemy);

      const ramp = 1 + Math.min(3, this.comboRampStacks) * this.stats.comboRamp;
      const crit = Math.random() < this.stats.critChance;
      let dmg = this.stats.attackPower * def.damage * ramp;
      if (crit) dmg *= this.stats.critMult;
      if (this.ascended > 0) dmg *= ULTIMATE.damageMult;
      dmg *= this._situationalDamageMult();

      const result = enemy.takeDamage(dmg, {
        crit,
        dir: this.dir,
        knockback: def.knockback,
        stagger: (def.knockback || 100) * 0.14 * this.stats.staggerMult,
        launch: def.launch,
        spike: def.spike,
        source: this,
        burn: { damage: dmg * BURN.damagePerTick * this.stats.burnMult, duration: this.stats.burnDuration }
      });

      if (result.hit) this._onHitLanded(enemy, result, def, crit);
    }
  }

  /** Bonus damage from uniques and situational conditions. */
  _situationalDamageMult() {
    let mult = 1;
    if (this.stats.has('lastlight') && this.hp / this.maxHp < 0.35) mult *= 1.6;
    if (this.stats.has('ascendant') && this.scene.style?.rankIndex >= 3) mult *= 1.25;
    return mult;
  }

  _onHitLanded(enemy, result, def, crit) {
    const scene = this.scene;

    this.damageDealt += result.damage;
    this.comboCount++;
    this.comboTimer = 2.2;
    this.comboRampStacks = Math.min(3, this.comboRampStacks + 1);

    // Mana on hit, with a diminishing streak so flailing at a crowd is not a
    // mana fountain.
    const falloff = Math.pow(PLAYER.MANA_ON_HIT_DIMINISH, this.manaHitStreak);
    this.mana = Math.min(this.maxMana, this.mana + this.stats.manaOnHit * falloff);
    this.manaHitStreak = Math.min(6, this.manaHitStreak + 1);
    this.manaHitWindow = 1.0;

    if (this.stats.lifesteal > 0) {
      this.heal(result.damage * this.stats.lifesteal, false);
    }

    this.addUltimate(result.damage * ULTIMATE.chargeOnDamageDealt);
    const styleGain = (def.style ?? 5) * (crit ? 1.35 : 1);
    scene.style.add(styleGain, def.name);
    this.addUltimate(styleGain * ULTIMATE.chargeOnStyle);

    // Landing hits relights you after a Nullflame douse.
    if (this.doused > 0) {
      this.dousedHitsNeeded--;
      if (this.dousedHitsNeeded <= 0) this.relight();
    }

    scene.fx.hitstop(def.hitstop ?? 0.04);
    scene.fx.hitSpark(result.x, result.y, this.dir, crit);
    scene.fx.damageNumber(result.x, result.y - 12, Math.round(result.damage), { crit });
    scene.fx.shake(crit ? 0.004 : 0.002, crit ? 130 : 80);
    scene.audio.play(crit ? 'crit' : 'hit', { rate: rnd.range(0.94, 1.1) });
    this.attackDidHit = true;
  }

  /* ------------------------------------------------------------- abilities */

  get abilityList() {
    return this.profile.unlockedAbilities.map((id) => ABILITIES[id]);
  }

  abilityStatus() {
    const list = this.profile.unlockedAbilities;
    const out = [];
    for (let i = 0; i < 4; i++) {
      const id = list[i];
      if (!id) { out.push({ locked: true, ready: false, ratio: 0 }); continue; }
      const def = ABILITIES[id];
      const cd = this.cooldowns[id] || 0;
      const full = def.cooldown * this.stats.cooldownMult;
      const affordable = this.ascended > 0 || this.mana >= def.manaCost;
      if (id === 'flamedash') {
        out.push({
          locked: false, id,
          ready: this.dashCharges > 0 && affordable,
          ratio: this.dashCharges > 0 ? 1 : Math.min(1, this.dashRecharge / Math.max(0.001, full)),
          charges: this.dashCharges
        });
      } else {
        out.push({
          locked: false, id,
          ready: cd === 0 && affordable,
          ratio: full > 0 ? 1 - cd / full : 1
        });
      }
    }
    return out;
  }

  _tryAbility(slot) {
    const id = this.profile.unlockedAbilities[slot];
    if (!id) return false;
    const def = ABILITIES[id];
    const free = this.ascended > 0 && ULTIMATE.costFree;

    if (id === 'flamedash') {
      if (this.dashCharges <= 0) { this.scene.audio.play('error'); return false; }
      if (!free && this.mana < def.manaCost) { this._noMana(); return false; }
      if (!this.grounded && !this.stats.has('airDash')) { this.scene.audio.play('error'); return false; }
    } else {
      if ((this.cooldowns[id] || 0) > 0) { this.scene.audio.play('error'); return false; }
      if (!free && this.mana < def.manaCost) { this._noMana(); return false; }
    }

    if (!free) this.mana -= def.manaCost;
    if (id === 'flamedash') {
      this.dashCharges--;
      this.dashRecharge = 0;
    } else {
      this.cooldowns[id] = def.cooldown * this.stats.cooldownMult;
    }

    this.scene.style.add(def.style, id);
    this.addUltimate(def.style * ULTIMATE.chargeOnStyle);
    this._castAbility(id, def);
    return true;
  }

  _noMana() {
    this.scene.audio.play('error');
    this.scene.fx.callout('NOT ENOUGH MANA', { colour: '#7ca7ff', y: 300, scale: 0.6, duration: 700 });
  }

  _castAbility(id, def) {
    const scene = this.scene;
    const c = this.centre;
    const powerMult = this.doused > 0 ? 0.6 : 1;
    const power = this.stats.abilityPower * def.damage * powerMult *
      (this.ascended > 0 ? ULTIMATE.damageMult : 1) * this._situationalDamageMult();

    switch (id) {
      case 'fireball': {
        this.state = STATE.CAST;
        this.castTimer = 0.28;
        this.stateTimer = 0;
        scene.spawnPlayerProjectile({
          x: c.x + this.dir * 26, y: c.y - 4,
          vx: this.dir * 620, vy: 0,
          damage: power, radius: 16, life: 1.6,
          tint: def.colour, pierce: 0, burn: true, owner: this
        });
        scene.audio.play('fireball');
        scene.fx.fireBurst(c.x + this.dir * 26, c.y - 4, 10, 4);
        break;
      }
      case 'flamedash': {
        const dist = 260;
        const startX = this.sprite.x;
        const targetX = startX + this.dir * dist;
        this.iframes = Math.max(this.iframes, 0.28);
        this.sprite.body.setVelocityY(0);
        // Sweep damage along the dash path rather than teleporting through.
        const rect = new Phaser.Geom.Rectangle(
          Math.min(startX, targetX) - 20, c.y - 34, dist + 40, 68
        );
        for (const enemy of scene.queryEnemies(rect)) {
          const res = enemy.takeDamage(power, {
            dir: this.dir, knockback: 200, stagger: 26 * this.stats.staggerMult, source: this,
            burn: { damage: power * BURN.damagePerTick * this.stats.burnMult, duration: this.stats.burnDuration }
          });
          if (res.hit) this._onHitLanded(enemy, res, { style: def.style, name: id, hitstop: 0.03 }, false);
        }
        scene.tweens.add({
          targets: this.sprite, x: targetX, duration: 150, ease: 'Cubic.easeOut',
          onUpdate: () => {
            scene.fx.afterimage(this.rig, 0xff8a3d, 240);
            scene.fx.fireBurst(this.sprite.x, this.centre.y, 3, 8);
          }
        });
        scene.audio.play('dash');
        scene.fx.shake(0.003, 120);
        break;
      }
      case 'eruption': {
        this.state = STATE.CAST;
        this.castTimer = 0.4;
        this.stateTimer = 0;
        const gx = this.sprite.x;
        const gy = this.feetY;
        scene.spawnEruption(gx, gy, power, this);
        scene.audio.play('eruption');
        scene.fx.shake(0.008, 260);
        break;
      }
      case 'infernoWave': {
        this.state = STATE.CAST;
        this.castTimer = 0.34;
        this.stateTimer = 0;
        scene.spawnWave(c.x + this.dir * 20, this.feetY - 6, this.dir, power, this);
        scene.audio.play('wave');
        scene.fx.shake(0.004, 160);
        break;
      }
      default: break;
    }
  }

  _updateCast(dt, input) {
    this.castTimer -= dt;
    const body = this.sprite.body;
    if (this.grounded) body.setVelocityX(body.velocity.x * 0.8);
    this._checkActionInputs(dt, input, false);
    if (this.castTimer <= 0) this.state = this.grounded ? STATE.IDLE : STATE.AIR;
  }

  /* -------------------------------------------------------------- ultimate */

  addUltimate(amount) {
    if (this.ascended > 0) return;
    this.ultimate = Math.min(ULTIMATE.max, this.ultimate + amount * this.stats.ultGainMult);
  }

  get ultimateReady() { return this.ultimate >= ULTIMATE.max; }

  _tryAscend() {
    if (this.ascended > 0 || !this.ultimateReady) {
      if (!this.ultimateReady) this.scene.audio.play('error');
      return;
    }
    this.ultimate = 0;
    this.ascended = ULTIMATE.duration;
    this.iframes = Math.max(this.iframes, 0.6);
    this.profile.addMetrics({ ultimatesUsed: 1 });

    const scene = this.scene;
    const c = this.centre;
    scene.audio.play('ultimate');
    scene.audio.duck(0.3, 1.4);
    scene.fx.flash(0xffb43d, 320, 0.6);
    scene.fx.shake(0.012, 520);
    scene.fx.shockwave(c.x, c.y, { radius: 460, tint: 0xffd166, duration: 620 });
    scene.fx.callout('ASCENSION', { colour: '#ffd451', y: 200, scale: 1.35, duration: 1400 });
    scene.style.add(ULTIMATE.style, 'ultimate');

    // Nova: everything nearby gets hit hard and launched.
    const rect = new Phaser.Geom.Rectangle(c.x - 320, c.y - 220, 640, 440);
    for (const enemy of scene.queryEnemies(rect)) {
      const dmg = this.stats.abilityPower * ULTIMATE.novaDamage;
      const res = enemy.takeDamage(dmg, {
        dir: Math.sign(enemy.x - c.x) || 1, knockback: 520, launch: -360,
        stagger: 999, source: this,
        burn: { damage: dmg * BURN.damagePerTick * this.stats.burnMult, duration: this.stats.burnDuration * 1.5 }
      });
      if (res.hit) {
        scene.fx.hitSpark(res.x, res.y, 1, true);
        scene.fx.damageNumber(res.x, res.y - 14, Math.round(res.damage), { crit: true });
      }
    }
    this.relight();
  }

  _endAscension() {
    this.scene.fx.callout('BURNT OUT', { colour: '#ff9b3d', y: 220, scale: 0.75, duration: 800 });
  }

  /* ------------------------------------------------------ damage & healing */

  /**
   * @returns {{ hit:boolean, blocked?:boolean, parried?:boolean, damage:number }}
   */
  takeDamage(amount, opts = {}) {
    if (!this.alive) return { hit: false, damage: 0 };
    if (this.iframes > 0 || this.state === STATE.ROLL && this.rollTimer > PLAYER.ROLL_TIME - this.stats.rollIframes) {
      return { hit: false, damage: 0, dodged: true };
    }

    const scene = this.scene;
    const unblockable = !!opts.unblockable;
    const fromDir = opts.dir ?? (opts.x != null ? Math.sign(opts.x - this.sprite.x) : -this.dir);
    const facingAttack = Math.sign(fromDir) !== Math.sign(this.dir) || opts.x == null;

    // --- parry ------------------------------------------------------------
    if (this.state === STATE.BLOCK && !unblockable && facingAttack &&
        this.blockTime <= this.stats.parryWindow && this.parryLock === 0) {
      this.parryLock = PLAYER.PARRY_COOLDOWN;
      this.parries++;
      this.profile.addMetrics({ parries: 1 });
      this.mana = Math.min(this.maxMana, this.mana + this.stats.parryMana);
      this.addUltimate(60);
      scene.style.add(28, 'parry');
      scene.fx.hitstop(PLAYER.PARRY_HITSTOP);
      scene.fx.flash(0xffffff, 90, 0.5);
      scene.fx.shockwave(this.centre.x, this.centre.y, { radius: 150, tint: 0xfff3c4, duration: 380 });
      scene.fx.callout('PARRY!', { colour: '#fff3c4', y: 230, scale: 0.95, duration: 700 });
      scene.audio.play('parry');
      scene.audio.duck(0.5, 0.5);
      if (this.stats.has('stillheart')) {
        this.dashCharges = Math.min(this.stats.dashCharges, this.dashCharges + 1);
      }
      if (opts.source && opts.source.onParried) opts.source.onParried(this);
      return { hit: false, damage: 0, parried: true };
    }

    // --- block ------------------------------------------------------------
    let damage = amount;
    let blocked = false;
    if (this.state === STATE.BLOCK && !unblockable && facingAttack && this.guardBroken === 0) {
      blocked = true;
      const reduction = PLAYER.BLOCK_DAMAGE_MULT * (1 - this.stats.blockReduction);
      damage = amount * Math.max(PLAYER.BLOCK_CHIP_MULT, reduction);
      this.stamina -= PLAYER.STAMINA_BLOCK_HIT;
      this.staminaDelay = PLAYER.STAMINA_REGEN_DELAY;
      scene.audio.play('block');
      scene.fx.burst(this.centre.x + this.dir * 18, this.centre.y, {
        count: 10, texture: 'spark', tint: 0x59f2ff, speed: [120, 320],
        angle: [-1.2 + (this.dir > 0 ? 0 : Math.PI), 1.2 + (this.dir > 0 ? 0 : Math.PI)],
        life: [0.16, 0.36], scale: [0.6, 0]
      });
      if (this.stamina <= 0) this._breakGuard();
      this.sprite.body.setVelocityX(fromDir * 120);
    }

    damage = Math.max(1, Math.round(damage));
    this.hp -= damage;
    this.damageTaken += damage;
    this.tookDamage = true;
    this.combatTimer = 0;
    this.profile.addMetrics({ damageTaken: damage });

    scene.style.onDamaged();
    this.comboCount = 0;
    this.comboRampStacks = 0;
    this.addUltimate(damage * ULTIMATE.chargeOnDamageTaken);

    scene.fx.damageNumber(this.centre.x, this.centre.y - 26, damage, {
      colour: blocked ? '#9fe8ff' : '#ff6b6b'
    });

    if (!blocked) {
      this.iframes = PLAYER.IFRAME_ON_HIT;
      this.state = STATE.HURT;
      this.hurtTimer = 0.28;
      this.stateTimer = 0;
      const kb = (opts.knockback ?? 200) * (1 - PLAYER.KNOCKBACK_RESIST);
      this.sprite.body.setVelocityX(fromDir * kb);
      if (opts.launch) this.sprite.body.setVelocityY(opts.launch * 0.6);
      scene.audio.play('hurt');
      scene.fx.shake(0.007, 200);
      scene.fx.flash(0xff2f4f, 140, 0.3);
      scene.fx.bloodSpark(this.centre.x, this.centre.y, 0xff7a3d);
      if (this.profile.settings.haptics && navigator.vibrate) {
        try { navigator.vibrate(28); } catch { /* unsupported */ }
      }
    }

    if (this.hp <= 0) this._die();
    return { hit: true, blocked, damage };
  }

  _breakGuard() {
    this.guardBroken = PLAYER.GUARD_BREAK_STUN;
    this.state = STATE.HURT;
    this.hurtTimer = PLAYER.GUARD_BREAK_STUN;
    this.stamina = 0;
    this.scene.audio.play('error');
    this.scene.fx.callout('GUARD BROKEN', { colour: '#ff6b6b', y: 250, scale: 0.8, duration: 800 });
  }

  _updateHurt(dt, input) {
    this.hurtTimer -= dt;
    const body = this.sprite.body;
    if (this.grounded) body.setVelocityX(body.velocity.x * 0.9);
    if (this.hurtTimer <= 0) this.state = this.grounded ? STATE.IDLE : STATE.AIR;
  }

  _die() {
    // Last Ember: one cheat-death per stage, if the capstone is taken.
    if (this.stats.has('lastEmber') && !this.lastEmberUsed) {
      this.lastEmberUsed = true;
      this.hp = 1;
      this.iframes = 2.0;
      this.ultimate = ULTIMATE.max;
      this.scene.fx.flash(0xffd166, 420, 0.7);
      this.scene.fx.shockwave(this.centre.x, this.centre.y, { radius: 380, tint: 0xffd166, duration: 620 });
      this.scene.fx.callout('LAST EMBER', { colour: '#ffd451', y: 210, scale: 1.2, duration: 1400 });
      this.scene.audio.play('unlock');
      return;
    }

    this.alive = false;
    this.hp = 0;
    this.state = STATE.DEAD;
    this.sprite.body.setVelocity(0, -220);
    this.scene.audio.play('die');
    this.scene.fx.shake(0.012, 500);
    this.scene.fx.smoke(this.centre.x, this.centre.y, 0x3a2a34, 14);
    if (this.onDeath) this.onDeath();
  }

  heal(amount, showNumber = true) {
    if (!this.alive || amount <= 0) return;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    const gained = this.hp - before;
    if (showNumber && gained >= 1) {
      this.scene.fx.damageNumber(this.centre.x, this.centre.y - 30, Math.round(gained), {
        colour: '#6bff9c', prefix: '+'
      });
    }
  }

  _drinkPotion() {
    if (this.potionCooldown > 0) return;
    if (this.hp >= this.maxHp) {
      this.scene.fx.callout('ALREADY FULL', { colour: '#8fa3b8', y: 300, scale: 0.6, duration: 600 });
      return;
    }
    if (!this.profile.consumePotion()) {
      this.scene.audio.play('error');
      this.scene.fx.callout('NO POTIONS', { colour: '#ff6b6b', y: 300, scale: 0.6, duration: 700 });
      return;
    }
    this.potionCooldown = PLAYER.POTION_COOLDOWN;
    this.heal(this.maxHp * PLAYER.POTION_HEAL_PCT * this.stats.potionPowerMult);
    this.scene.audio.play('pickup');
    this.scene.fx.burst(this.centre.x, this.centre.y, {
      count: 16, texture: 'spark', tint: 0x6bff9c, speed: [60, 200],
      angle: [Math.PI * 1.1, Math.PI * 1.9], life: [0.4, 0.8], scale: [0.6, 0], gravity: -140
    });
  }

  /* --------------------------------------------------------------- douse */

  douse(seconds = 8) {
    if (this.doused > 0) return;
    this.doused = seconds;
    this.dousedHitsNeeded = 6;
    this.scene.fx.callout('DOUSED — LAND 6 HITS', { colour: '#7ce8ff', y: 250, scale: 0.85, duration: 1500 });
    this.scene.audio.play('danger');
  }

  relight() {
    if (this.doused <= 0) return;
    this.doused = 0;
    this.dousedHitsNeeded = 0;
    this.scene.fx.callout('RELIT', { colour: '#ffb43d', y: 250, scale: 0.9, duration: 800 });
    this.scene.fx.shockwave(this.centre.x, this.centre.y, { radius: 200, tint: 0xffb43d, duration: 420 });
    this.scene.audio.play('unlock');
  }

  /* -------------------------------------------------------------- visuals */

  _updateVisuals(dt) {
    const body = this.sprite.body;
    this.rig.x = this.sprite.x;
    this.rig.y = this.feetY;

    // Ease squash/stretch back to neutral.
    if (this.squash != null) {
      this.squash = Phaser.Math.Linear(this.squash, 1, Math.min(1, dt * 12));
      this.stretch = Phaser.Math.Linear(this.stretch ?? 1, 1, Math.min(1, dt * 12));
      if (Math.abs(this.squash - 1) < 0.01) { this.squash = null; this.stretch = null; }
    }

    let pose = 'idle';
    switch (this.state) {
      case STATE.RUN: pose = Math.abs(body.velocity.x) > PLAYER.WALK_SPEED * 1.1 ? 'run' : 'walk'; break;
      case STATE.AIR: pose = 'air'; break;
      case STATE.ATTACK: pose = 'attack'; break;
      case STATE.CAST: pose = 'cast'; break;
      case STATE.BLOCK: pose = 'block'; break;
      case STATE.SLIDE: pose = 'slide'; break;
      case STATE.HURT: pose = 'hurt'; break;
      case STATE.DEAD: pose = 'dead'; break;
      case STATE.ROLL: pose = 'air'; break;
      default: pose = 'idle';
    }

    poseHumanoid(this.rig, {
      pose,
      time: this.time,
      dir: this.dir,
      airborne: !this.grounded,
      vy: body.velocity.y,
      vx: body.velocity.x,
      speedRatio: this.speedRatio ?? 1,
      phase: this.state === STATE.ATTACK ? Math.min(1, this.attackTimer / this.attackTotal)
        : this.state === STATE.CAST ? 1 - Math.max(0, this.castTimer / 0.4) : 0,
      attackIndex: this.attackIndex,
      blend: this.state === STATE.ATTACK ? 0.55 : 0.3,
      squash: this.squash,
      stretch: this.stretch
    });

    // Roll spins the whole rig; every other state keeps it upright.
    this.rig.rotation = this.state === STATE.ROLL
      ? (this.rollSpin ?? 0)
      : Phaser.Math.Linear(this.rig.rotation, this.state === STATE.SLIDE ? this.dir * 0.16 : 0, 0.25);

    // Aura: brighter when ascended, blue when doused, flickers with mana.
    const c = this.centre;
    this.aura.setPosition(c.x, c.y);
    const manaPct = this.mana / this.maxMana;
    let auraTint = 0xff7a2f;
    let auraAlpha = 0.14 + manaPct * 0.12;
    let auraSize = 86 + Math.sin(this.time * 5) * 5;
    if (this.doused > 0) { auraTint = 0x59a8ff; auraAlpha *= 0.6; }
    if (this.ascended > 0) {
      auraTint = 0xffd166;
      auraAlpha = 0.4 + Math.sin(this.time * 14) * 0.12;
      auraSize = 140 + Math.sin(this.time * 9) * 14;
    }
    this.aura.setTint(auraTint).setAlpha(auraAlpha).setDisplaySize(auraSize, auraSize);

    // I-frame flicker.
    const flicker = this.iframes > 0 && this.state !== STATE.ROLL
      ? (Math.floor(this.time * 30) % 2 === 0 ? 0.35 : 1)
      : 1;
    this.rig.setAlpha(flicker);

    // Chest light rides the torso so it stays put through every pose.
    const torso = this.rig.parts.torso;
    const cos = Math.cos(this.rig.rotation);
    const sin = Math.sin(this.rig.rotation);
    const lx = torso.x * this.dir;
    const ly = torso.y * this.rig.scaleY;
    this.chestLight
      .setPosition(this.rig.x + lx * cos - ly * sin, this.rig.y + lx * sin + ly * cos)
      .setAlpha(flicker * (0.45 + manaPct * 0.5))
      .setDisplaySize(13 + manaPct * 7 + Math.sin(this.time * 6) * 1.5,
        13 + manaPct * 7 + Math.sin(this.time * 6) * 1.5)
      .setTint(this.doused > 0 ? 0x59a8ff : this.ascended > 0 ? 0xfff3c4 : 0xffb43d);

    // Ascension trail.
    if (this.ascended > 0) {
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        this.trailTimer = 0.05;
        this.scene.fx.burst(c.x, c.y, {
          count: 2, texture: 'spark', tint: 0xffd166, speed: [10, 70],
          life: [0.3, 0.6], scale: [0.7, 0], gravity: -120, spread: 14
        });
      }
    }
  }

  /* ----------------------------------------------------------------- misc */

  /** Called when the player falls out of the world. */
  voidReset(x, y) {
    this.sprite.setPosition(x, y);
    this.sprite.body.setVelocity(0, 0);
    this.takeDamage(this.maxHp * PLAYER.VOID_DAMAGE_PCT, { unblockable: true, knockback: 0 });
    this.iframes = Math.max(this.iframes, 1.0);
  }

  onKill() {
    this.kills++;
    if (this.stats.has('perpetual')) {
      this.dashCharges = Math.min(this.stats.dashCharges, this.dashCharges + 1);
      this.airJumpsLeft = this.stats.airJumps;
    }
  }

  destroy() {
    this.sprite.destroy();
    this.rig.destroy(true);
    this.aura.destroy();
    this.chestLight.destroy();
  }
}

export { STATE as PLAYER_STATE };
