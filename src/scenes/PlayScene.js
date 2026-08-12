/**
 * PlayScene — a stage, start to finish.
 *
 * Owns the world, the entity lists, the spawn director and the objective. It
 * also exposes the small API that entities call into (`queryEnemies`,
 * `spawnMortar`, `groundYAt`…), which is deliberately the *only* coupling
 * between entities and the scene.
 *
 * Two systems here do the heavy lifting for how the game feels:
 *
 *  - **Hitstop** freezes physics for a few frames on impact. Particles keep
 *    moving so it reads as punch, not as a stutter.
 *  - **The attack token** caps how many enemies may be mid-attack at once.
 *    Without it, eight robots winding up simultaneously is not difficulty, it
 *    is a coin flip. With it, crowds pressure you in readable waves.
 */

import { ctx } from '../core/Context.js';
import { VIEW, PLAYER, REWARDS, PROGRESSION, ENEMY_SCALING, STYLE } from '../data/Balance.js';
import { getStage, MODIFIERS, BIOMES } from '../data/Stages.js';
import { ARCHETYPES } from '../data/Enemies.js';
import { buildWorld, WORLD_HEIGHT } from '../systems/Terrain.js';
import { InputManager } from '../systems/Input.js';
import { FX } from '../systems/FX.js';
import { StyleMeter } from '../systems/Style.js';
import { Player } from '../entities/Player.js';
import { Enemy } from '../entities/Enemy.js';
import { Boss } from '../entities/Boss.js';
import { Projectile } from '../entities/Projectile.js';
import { MortarStrike, FlamePillar, FlameWall, Eruption, InfernoWave, Pickup } from '../entities/Hazards.js';
import { rollEnemyDrop, rollElite, generateItem } from '../systems/Loot.js';
import { rnd, clamp } from '../utils/Rand.js';

const MAX_ALIVE = 9;
const PROJECTILE_POOL = 48;

/** A destructible objective, dressed up as an enemy so it reuses damage code. */
const CORE_DEF = {
  id: 'core', name: 'Reactor Core',
  hp: 240, damage: 0, speed: 0, xp: 60,
  width: 54, height: 76,
  colour: 0x4a3a6b, accent: 0xffd166,
  stationary: true, staggerMax: 9999,
  aggroRange: 0, preferredRange: 0,
  attacks: []
};

export default class PlayScene extends Phaser.Scene {
  constructor() { super('PlayScene'); }

  init(data) {
    this.stageIndex = data?.stageIndex ?? 1;
    this.stage = getStage(this.stageIndex);
    this.profile = ctx.profile;
    this.audio = ctx.audio;
  }

  create() {
    this.finished = false;
    this.elapsed = 0;
    this.paused = false;

    // Fold the stage's modifiers into one object the entities can read.
    this.mods = {};
    for (const key of this.stage.modifiers || []) Object.assign(this.mods, MODIFIERS[key] || {});

    /* ------------------------------------------------------------- world */

    this.world = buildWorld(this, this.stage);
    this.worldBounds = this.world.bounds;
    this.physics.world.setBounds(-80, -400, this.world.width + 160, WORLD_HEIGHT + 700);
    if (this.mods.gravity) this.physics.world.gravity.y = 2100 * this.mods.gravity;
    else this.physics.world.gravity.y = 2100;

    this.fx = new FX(this, this.profile);
    this.style = new StyleMeter(this.profile.stats);
    this.style.onRankChange = (nu, old, up) => {
      if (!up) return;
      this.audio.play('rank', { rate: 1 + this.style.rankIndex * 0.08 });
      this.fx.callout(`${nu.key} RANK`, {
        colour: `#${nu.colour.toString(16).padStart(6, '0')}`,
        y: 150, scale: 0.8 + this.style.rankIndex * 0.06, duration: 900
      });
    };

    /* ------------------------------------------------------------ player */

    const spawn = this.world.segments[0];
    this.player = new Player(this, 140, spawn.y - 60, this.profile);
    this.player.onDeath = () => this._onPlayerDeath();

    // Health persists between stages; the Hub is the only full heal.
    const savedHp = this.profile.data.currentHp;
    if (savedHp != null) this.player.hp = clamp(savedHp, 1, this.player.maxHp);

    this.input.addPointer(4);
    this.inputManager = new InputManager(this, this.profile);

    this.physics.add.collider(this.player.sprite, this.world.solids);

    /* ------------------------------------------------------------- pools */

    this.enemies = [];
    this.hazards = [];
    this.pickups = [];
    this.projectiles = [];
    for (let i = 0; i < PROJECTILE_POOL; i++) this.projectiles.push(new Projectile(this));

    this.projectileGroup = this.physics.add.group();
    for (const p of this.projectiles) this.projectileGroup.add(p.sprite);
    this.physics.add.collider(this.projectileGroup, this.world.solids, (sprite) => {
      const proj = sprite.getData('owner');
      if (proj && !proj.ground) proj.onTerrain();
    });

    /* -------------------------------------------------- attack throttling */

    this.attackTokens = new Set();
    this.maxAttackers = this.stageIndex >= 13 ? 3 : this.stageIndex >= 6 ? 2 : 2;

    /* ---------------------------------------------------------- objective */

    this.objective = { type: this.stage.objective.type, done: false, progress: 0, target: 1, label: '' };
    this.waveIndex = -1;
    this.waveTimer = 1.4;
    this.spawnTimer = 0;
    this.killCount = 0;
    this.runEmber = 0;
    this.runShards = 0;
    this.runXp = 0;
    this.runLoot = [];
    this.huntKills = 0;
    this.cores = [];
    this.survivalLeft = this.stage.objective.duration ?? 0;

    this._setupObjective();

    /* ------------------------------------------------------------- camera */

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.world.width, WORLD_HEIGHT);
    /**
     * A phone shows the same 720px-tall design surface as a monitor, which
     * makes a 56px-tall character physically tiny in the hand. Zooming the
     * world camera (never the HUD, which is its own scene) trades a little
     * peripheral vision for characters and telegraphs you can actually read.
     */
    cam.setZoom(this.game.device.input.touch ? 1.2 : 1);
    cam.startFollow(this.player.sprite, true, 0.12, 0.12);
    cam.setDeadzone(180 / cam.zoom, 120 / cam.zoom);
    cam.setFollowOffset(0, 40);
    cam.fadeIn(320, 8, 4, 12);

    /**
     * Full-screen blended layers are the one thing that reliably costs frames
     * on a mid-range phone GPU, so the low-quality path drops two of the three
     * (grain and the additive biome fog) and keeps only the vignette, which is
     * doing the most work for readability.
     */
    this.add.image(0, 0, 'vignette').setOrigin(0)
      .setDisplaySize(VIEW.WIDTH, VIEW.HEIGHT)
      .setScrollFactor(0).setDepth(57).setAlpha(0.85);
    if (this.fx.quality === 'low') {
      this.world.fog.setVisible(false);
    } else {
      this.grain = this.add.tileSprite(0, 0, VIEW.WIDTH, VIEW.HEIGHT, 'grain')
        .setOrigin(0).setScrollFactor(0).setDepth(58).setAlpha(0.35);
    }

    /* ---------------------------------------------------------------- hud */

    this.scene.launch('HudScene', { play: this });
    this.audio.playMusic(this.stage.boss ? 'boss' : 'combat');

    /* --------------------------------------------------------------- misc */

    this.input.keyboard.on('keydown-ESC', () => this.requestPause('key'));
    this.input.keyboard.on('keydown-P', () => this.requestPause('key'));

    /**
     * Teardown works on a snapshot of *this* run's resources rather than on
     * `this.*`. Phaser reuses one scene instance, so a queued shutdown can
     * fire after a restart has already rebuilt the fields; cleaning the
     * snapshot destroys the run that actually ended instead of the new one.
     */
    const session = {
      world: this.world, fx: this.fx, player: this.player,
      inputManager: this.inputManager,
      enemies: this.enemies, projectiles: this.projectiles,
      hazards: this.hazards, pickups: this.pickups
    };
    this.events.once('shutdown', () => this._cleanup(session));

    // Opening callout.
    this.time.delayedCall(260, () => {
      this.fx.callout(`${this.stage.index}. ${this.stage.name.toUpperCase()}`, {
        colour: '#ffd166', y: 180, scale: 1.1, duration: 1800
      });
    });
  }

  /* -------------------------------------------------------------- objective */

  _setupObjective() {
    const o = this.stage.objective;
    switch (o.type) {
      case 'waves':
        this.objective.target = (this.stage.waves || []).length;
        this.objective.label = 'WAVES';
        break;
      case 'survive':
        this.objective.target = o.duration;
        this.objective.label = 'SURVIVE';
        break;
      case 'core':
        this.objective.target = o.cores;
        this.objective.label = 'CORES';
        this._placeCores(o.cores);
        break;
      case 'hunt':
        this.objective.target = o.targets;
        this.objective.label = 'MARKED';
        break;
      case 'boss':
        this.objective.target = 1;
        this.objective.label = 'BOSS';
        this._spawnBoss();
        break;
      default:
        this.objective.label = 'CLEAR';
    }
  }

  _placeCores(count) {
    const points = this.world.spawnPoints.filter((p) => p.kind === 'ground' && p.x > 500);
    const step = Math.max(1, Math.floor(points.length / count));
    for (let i = 0; i < count; i++) {
      const p = points[Math.min(points.length - 1, i * step + Math.floor(step / 2))];
      if (!p) continue;
      const core = new Enemy(this, {
        x: p.x, y: p.y - 20, def: { ...CORE_DEF, hp: CORE_DEF.hp + this.stageIndex * 42 },
        stage: this.stageIndex, modifiers: this.mods
      });
      core.isCore = true;
      this.enemies.push(core);
      this.cores.push(core);
      this.physics.add.collider(core.sprite, this.world.solids);

      // A beacon so cores are findable across a 4000px level.
      const beam = this.add.rectangle(p.x, 0, 10, WORLD_HEIGHT, 0xffd166, 0.12)
        .setOrigin(0.5, 0).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
      core.beacon = beam;
    }
  }

  _spawnBoss() {
    // Far enough to make an entrance, close enough that the walk in is a beat
    // rather than a hike.
    const mid = this.world.width * 0.62;
    const y = this.world.groundYAt(mid) - 120;
    this.boss = new Boss(this, {
      x: mid, y, bossId: this.stage.boss, stage: this.stageIndex, modifiers: this.mods
    });
    this.enemies.push(this.boss);
    this.physics.add.collider(this.boss.sprite, this.world.solids);

    // Cinematic: pan to the boss, name card, then hand control back.
    const cam = this.cameras.main;
    this.bossIntro = true;
    cam.stopFollow();
    this.time.delayedCall(500, () => {
      cam.pan(mid, y - 40, 900, 'Sine.easeInOut');
      this.audio.play('bossIntro');
      this.audio.duck(0.3, 2.2);
    });
    this.time.delayedCall(1500, () => {
      this.fx.callout(this.boss.displayName, { colour: '#ff8a9b', y: 190, scale: 1.4, duration: 2200 });
      this.time.delayedCall(400, () =>
        this.fx.callout(this.boss.title.toUpperCase(), { colour: '#ffd166', y: 246, scale: 0.7, duration: 1800 }));
      this.fx.shake(0.006, 900);
    });
    this.time.delayedCall(3400, () => {
      cam.startFollow(this.player.sprite, true, 0.12, 0.12);
      this.bossIntro = false;
      this.boss.beginFight();
    });
  }

  /* ---------------------------------------------------------------- spawns */

  _spawnEnemy(archetypeId, x, y, { elite = false, marked = false } = {}) {
    if (this.enemies.filter((e) => e.alive && !e.isCore).length >= MAX_ALIVE) return null;
    const def = ARCHETYPES[archetypeId];
    if (!def) return null;

    const enemy = new Enemy(this, {
      x, y, def, stage: this.stageIndex, elite, marked, modifiers: this.mods
    });
    // Director-spawned robots hunt: they were dispatched at you, so they close
    // the distance instead of standing around until you wander into range.
    enemy.hunting = true;
    this.enemies.push(enemy);
    this.physics.add.collider(enemy.sprite, this.world.solids);

    // Spawn flourish so robots do not simply appear.
    this.fx.burst(x, y, {
      count: 10, texture: 'spark', tint: def.accent, speed: [60, 220],
      life: [0.2, 0.5], scale: [0.6, 0]
    });
    return enemy;
  }

  /**
   * Pick a spawn point that is off-camera but close enough that the wave
   * arrives within a couple of seconds. Popping in on screen looks cheap;
   * spawning across a 4000px level means the player fights nothing.
   */
  _pickSpawnPoint() {
    const cam = this.cameras.main;
    const px = this.player.centre.x;
    // worldView, not scrollX + width: the camera is zoomed on touch devices,
    // so the two differ and "off screen" would otherwise be wrong.
    const left = cam.worldView.x - 60;
    const right = cam.worldView.right + 60;
    const points = this.world.spawnPoints;

    const offScreen = points.filter((p) => p.x < left || p.x > right);
    const inBand = offScreen.filter((p) => {
      const d = Math.abs(p.x - px);
      return d > 40 && d < 1000;
    });

    if (inBand.length) return rnd.pick(inBand);
    if (offScreen.length) {
      // Nothing in the sweet spot — take the closest off-screen point instead.
      offScreen.sort((a, b) => Math.abs(a.x - px) - Math.abs(b.x - px));
      return rnd.pick(offScreen.slice(0, 3));
    }
    // Tiny arena where everything is on camera: drop them in at the edges.
    const side = px > this.world.width / 2 ? -1 : 1;
    const x = clamp(px + side * (cam.worldView.width * 0.55), 60, this.world.width - 60);
    return { x, y: this.world.groundYAt(x) - 60 };
  }

  _spawnWave(wave, countOverride = null) {
    const count = Math.round((countOverride ?? wave.count) * (this.mods.countMult ?? 1));
    for (let i = 0; i < count; i++) {
      const point = this._pickSpawnPoint();
      const id = rnd.pick(wave.pool);
      const elite = rollElite(this.stageIndex);
      this._spawnEnemy(id, point.x, point.y, { elite });
    }
  }

  _spawnMarked() {
    const point = this._pickSpawnPoint();
    const pool = this.stage.waves?.[0]?.pool || ['warden'];
    const enemy = this._spawnEnemy(rnd.pick(pool), point.x, point.y, { elite: true, marked: true });
    if (enemy) enemy.isMarked = true;
    return enemy;
  }

  spawnSummon(archetypeId, x, y, owner) {
    const point = { x: clamp(x, 60, this.world.width - 60), y };
    return this._spawnEnemy(archetypeId, point.x, point.y, { elite: false });
  }

  /* ------------------------------------------------------------ scene api */

  groundYAt(x) { return this.world.groundYAt(x); }

  queryEnemies(rect) {
    const out = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, e.bounds)) out.push(e);
    }
    return out;
  }

  playerOverlaps(rect) {
    if (!this.player || !this.player.alive) return false;
    return Phaser.Geom.Intersects.RectangleToRectangle(rect, this.player.bounds);
  }

  nearestEnemy(x, y, maxDist = Infinity) {
    let best = null;
    let bestD = maxDist;
    for (const e of this.enemies) {
      if (!e.alive || e.isCore) continue;
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  requestAttackToken(enemy) {
    if (this.attackTokens.has(enemy)) return true;
    if (this.attackTokens.size >= this.maxAttackers) return false;
    this.attackTokens.add(enemy);
    return true;
  }

  releaseAttackToken(enemy) { this.attackTokens.delete(enemy); }

  _takeProjectile() {
    for (const p of this.projectiles) if (!p.active) return p;
    // Pool exhausted: recycle the oldest rather than allocating mid-fight.
    const victim = this.projectiles[0];
    victim.kill(false);
    return victim;
  }

  spawnPlayerProjectile(opts) {
    const p = this._takeProjectile();
    p.fire({ ...opts, fromPlayer: true });
    return p;
  }

  spawnEnemyProjectile(opts) {
    const p = this._takeProjectile();
    p.fire({ ...opts, fromPlayer: false });
    return p;
  }

  spawnEruption(x, y, damage, owner) {
    this.hazards.push(new Eruption(this, { x, y, damage, owner }));
  }

  spawnWave(x, y, dir, damage, owner) {
    this.hazards.push(new InfernoWave(this, { x, y, dir, damage, owner }));
  }

  spawnMortar(opts) {
    this.hazards.push(new MortarStrike(this, opts));
  }

  spawnPillar(opts) {
    this.hazards.push(new FlamePillar(this, opts));
  }

  spawnFlameWall(opts) {
    this.hazards.push(new FlameWall(this, opts));
  }

  clearHazards() {
    for (const h of this.hazards) h.destroy();
    this.hazards.length = 0;
    for (const p of this.projectiles) if (p.active && !p.fromPlayer) p.kill(false);
  }

  collectPickup(pickup) {
    if (pickup.kind === 'ember') {
      this.runEmber += pickup.value;
      this.audio.play('coin', { gain: 0.4 });
    } else if (pickup.kind === 'shard') {
      this.runShards += pickup.value;
      this.audio.play('pickup', { rate: 0.8 });
    } else if (pickup.kind === 'heal') {
      this.player.heal(pickup.value);
      this.audio.play('pickup');
    }
  }

  /* -------------------------------------------------------------- on kill */

  onEnemyKilled(enemy) {
    this.killCount++;
    this.noteProgress();
    this.player.onKill();
    this.profile.addMetrics({ kills: 1 });
    this.style.add(enemy.isBoss ? 60 : enemy.elite ? 18 : 9, `kill:${enemy.archetypeId}`);

    if (enemy.beacon) enemy.beacon.destroy();

    if (enemy.isCore) {
      this.fx.shockwave(enemy.x, enemy.y, { radius: 260, tint: 0xffd166, duration: 620 });
      this.fx.shake(0.01, 400);
      this.audio.play('explode');
      this.objective.progress = this.cores.filter((c) => !c.alive).length;
      if (this.objective.progress >= this.objective.target) this._complete();
      return;
    }

    if (enemy.isMarked) {
      this.huntKills++;
      this.objective.progress = this.huntKills;
      this.fx.callout(`MARKED TARGET DOWN  ${this.huntKills}/${this.objective.target}`, {
        colour: '#ffd451', y: 220, scale: 0.75, duration: 1200
      });
      if (this.huntKills >= this.objective.target) this._complete();
    }

    // Loot.
    const drop = rollEnemyDrop(enemy.def, this.stageIndex, {
      elite: enemy.elite, boss: enemy.isBoss
    });
    this.runXp += drop.xp;

    const emberFind = this.profile.stats.emberFind;
    const emberValue = Math.round(drop.ember * emberFind);
    const orbCount = clamp(Math.round(emberValue / 12), 1, 6);
    for (let i = 0; i < orbCount; i++) {
      this.pickups.push(new Pickup(this, {
        x: enemy.x + rnd.range(-14, 14), y: enemy.y - 10,
        kind: 'ember', value: Math.round(emberValue / orbCount)
      }));
    }
    for (let i = 0; i < drop.shards; i++) {
      this.pickups.push(new Pickup(this, { x: enemy.x, y: enemy.y - 10, kind: 'shard', value: 1 }));
    }
    for (const item of drop.items) {
      this.runLoot.push(item);
      this._itemDropFx(enemy.x, enemy.y, item);
    }

    // Occasional health pickup so a long stage is survivable without potions.
    if (!enemy.isBoss && this.player.hp / this.player.maxHp < 0.5 && rnd.chance(0.12)) {
      this.pickups.push(new Pickup(this, {
        x: enemy.x, y: enemy.y - 10, kind: 'heal',
        value: this.player.maxHp * 0.1
      }));
    }

    if (enemy.isBoss) {
      this.time.delayedCall(2600, () => this._complete());
    }
  }

  _itemDropFx(x, y, item) {
    const colour = { common: 0xbfc8d6, uncommon: 0x64dd8a, rare: 0x4fa8ff, epic: 0xc074ff, legendary: 0xffa726 }[item.rarity];
    const beam = this.add.rectangle(x, y, 8, 220, colour, 0.35)
      .setOrigin(0.5, 1).setDepth(30).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: beam, alpha: 0, duration: 1400, onComplete: () => beam.destroy() });
    this.fx.burst(x, y, {
      count: 14, texture: 'star', tint: colour, speed: [60, 220],
      life: [0.4, 0.9], scale: [0.5, 0], gravity: -60
    });
    this.audio.play('pickup', { rate: 0.7 + ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(item.rarity) * 0.12 });
    if (['epic', 'legendary'].includes(item.rarity)) {
      this.fx.callout(item.name.toUpperCase(), {
        colour: item.rarity === 'legendary' ? '#ffa726' : '#c074ff',
        y: 270, scale: 0.7, duration: 1600
      });
    }
  }

  /* --------------------------------------------------------------- update */

  update(time, delta) {
    if (this.finished) { this._updateVisualsOnly(delta / 1000); return; }

    const dt = Math.min(delta / 1000, 0.045);

    // Hitstop: freeze the simulation, keep the spectacle moving.
    this.fx.update(dt);
    if (this.fx.frozen) {
      if (!this.physics.world.isPaused) this.physics.world.pause();
      this._updateAmbient(dt, time / 1000);
      return;
    }
    if (this.physics.world.isPaused) this.physics.world.resume();

    this.elapsed += dt;
    this.inputManager.update();
    this.player.update(dt, this.inputManager);
    this.style.update(dt);

    for (const enemy of this.enemies) enemy.update(dt);
    for (const p of this.projectiles) p.update(dt);

    for (let i = this.hazards.length - 1; i >= 0; i--) {
      if (!this.hazards[i].update(dt)) this.hazards.splice(i, 1);
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      if (!this.pickups[i].update(dt)) this.pickups.splice(i, 1);
    }

    // Sweep dead entities on a delay so death animations can play out.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.alive) continue;
      e.deadFor = (e.deadFor || 0) + dt;
      if (e.deadFor > (e.isBoss ? 4.0 : 1.2)) {
        e.destroy();
        this.enemies.splice(i, 1);
      }
    }

    this._separateEnemies();
    this._policeEnemies(dt);
    this.world.update(dt, time / 1000, this.player, this.enemies);
    this._updateAmbient(dt, time / 1000);
    this._updateDirector(dt);
    this._checkBounds();
  }

  _updateVisualsOnly(dt) {
    this.fx.update(dt);
    this.world.update(dt, this.time?.now ?? 0, this.player);
  }

  _updateAmbient(dt, time) {
    if (this.grain) {
      this.grain.tilePositionX += dt * 40;
      this.grain.tilePositionY += dt * 26;
    }
    // Stormfire: burning debris rains across the arena.
    if (this.mods.rain && !this.finished) {
      this._rainTimer = (this._rainTimer || 0) - dt;
      if (this._rainTimer <= 0) {
        this._rainTimer = rnd.range(1.6, 3.4);
        const view = this.cameras.main.worldView;
        const x = rnd.range(view.x + 80, view.right - 80);
        this.spawnMortar({
          x, radius: 70, delay: 1.1,
          damage: 8 + this.stageIndex * 1.6, owner: null
        });
      }
    }
  }

  /**
   * Nudge overlapping robots apart. Physics colliders between enemies cause
   * shoving matches and jitter; a soft positional push keeps a crowd readable
   * without ever fighting the AI's own movement. O(n²) is fine at nine units.
   */
  _separateEnemies() {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive || a.def.stationary || a.isBoss) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive || b.def.stationary || b.isBoss) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minX = (a.width + b.width) * 0.42;
        if (Math.abs(dx) > minX || Math.abs(dy) > (a.height + b.height) * 0.4) continue;
        const push = (minX - Math.abs(dx)) * 0.5;
        const dir = dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx);
        if (a.sprite.body.moves) a.sprite.x -= dir * push * 0.5;
        if (b.sprite.body.moves) b.sprite.x += dir * push * 0.5;
      }
    }
  }

  /**
   * The anti-softlock net.
   *
   * A wave only ends when every robot is dead, so any robot that becomes
   * permanently unreachable freezes the stage. Three ways that happened:
   * falling out of the world, wedging in terrain it could not climb, and
   * wandering far off-screen and never coming back. All three now resolve
   * themselves within seconds.
   */
  _policeEnemies(dt) {
    if (!this.player) return;
    const px = this.player.centre.x;

    for (const e of this.enemies) {
      if (!e.alive || e.isCore) continue;

      // 1. Fell out of the world — it is gone, so make that official rather
      //    than leaving a live enemy the player can never reach.
      if (e.sprite.y > WORLD_HEIGHT + 120) {
        if (e.isBoss) {
          // A boss must never be lost this way; put it back on solid ground.
          const safe = this.world.segments[Math.floor(this.world.segments.length / 2)];
          e.sprite.setPosition((safe.x1 + safe.x2) / 2, safe.y - 140);
          e.sprite.body.setVelocity(0, 0);
        } else {
          e.takeDamage(e.maxHp * 10, { dir: 0, knockback: 0 });
        }
        continue;
      }

      if (e.isBoss) continue;

      const dist = Math.abs(e.x - px);

      // 2. Chasing but going nowhere — wedged against geometry. Turrets are
      //    meant to stand still, so only mobile units can be "stuck".
      if (!e.def.stationary) {
        const moving = Math.abs(e.sprite.body.velocity.x) > 12;
        const engaged = e.state === 'chase' || e.state === 'idle';
        if (engaged && !moving && dist > 160) e.stuckTimer = (e.stuckTimer || 0) + dt;
        else e.stuckTimer = 0;
      }

      // 3. Drifted (or was placed) far away and stopped mattering. This
      //    applies to turrets too: a Sentinel that spawned across the level is
      //    exactly as blocking as one that walked there.
      if (dist > 1500) e.strandedTimer = (e.strandedTimer || 0) + dt;
      else e.strandedTimer = 0;

      if (e.stuckTimer > 3.5 || e.strandedTimer > 6) this._recallEnemy(e);
    }

    // 4. Last resort: nothing has died for a long time and the wave still has
    //    hostiles. Something is wrong that the checks above did not catch, so
    //    bring everything to the player rather than stranding the run.
    const alive = this.enemies.filter((x) => x.alive && !x.isCore && !x.isBoss);
    if (alive.length > 0 && !this.objective.done) {
      this._stallTimer = (this._stallTimer || 0) + dt;
      if (this._stallTimer > 22) {
        this._stallTimer = 0;
        for (const e of alive) this._recallEnemy(e);
        this.fx.callout('REINFORCEMENTS REROUTED', {
          colour: '#ffb43d', y: 250, scale: 0.6, duration: 1200
        });
      }
    } else {
      this._stallTimer = 0;
    }
  }

  /** Teleport a robot back into the fight, with a visible arrival. */
  _recallEnemy(enemy) {
    const point = this._pickSpawnPoint();
    this.fx.burst(enemy.x, enemy.y, {
      count: 8, texture: 'spark', tint: enemy.def.accent,
      speed: [60, 200], life: [0.2, 0.4], scale: [0.6, 0]
    });
    // body.reset moves the physics body as well as the sprite, which matters
    // for turrets whose bodies do not follow the game object on their own.
    enemy.sprite.body.reset(point.x, point.y);
    enemy.sprite.setPosition(point.x, point.y);
    enemy.homeX = point.x;
    enemy.homeY = point.y;
    enemy.hoverY = point.y;
    enemy.stuckTimer = 0;
    enemy.strandedTimer = 0;
    enemy.hunting = true;
    this.fx.burst(point.x, point.y, {
      count: 10, texture: 'spark', tint: enemy.def.accent,
      speed: [80, 240], life: [0.2, 0.5], scale: [0.7, 0]
    });
  }

  /** Reset the stall timer whenever the fight is visibly progressing. */
  noteProgress() { this._stallTimer = 0; }

  /** Keep the player inside the world; falling off is survivable, not fatal. */
  _checkBounds() {
    const p = this.player;
    if (!p.alive) return;
    if (p.sprite.y > WORLD_HEIGHT + 120) {
      const safe = this.world.segments.reduce((best, seg) => {
        const d = Math.abs((seg.x1 + seg.x2) / 2 - p.sprite.x);
        return d < best.d ? { d, seg } : best;
      }, { d: Infinity, seg: this.world.segments[0] }).seg;
      p.voidReset((safe.x1 + safe.x2) / 2, safe.y - 90);
      this.fx.callout('CAUGHT YOURSELF', { colour: '#ff9b3d', y: 260, scale: 0.7, duration: 800 });
    }
    p.sprite.x = clamp(p.sprite.x, 20, this.world.width - 20);
  }

  /* ------------------------------------------------------------- director */

  _updateDirector(dt) {
    if (this.objective.done) return;
    const aliveCombatants = this.enemies.filter((e) => e.alive && !e.isCore).length;

    switch (this.objective.type) {
      case 'waves': {
        const waves = this.stage.waves || [];
        if (this.waveIndex < 0) {
          this.waveTimer -= dt;
          if (this.waveTimer <= 0) {
            this.waveIndex = 0;
            this._announceWave();
            this._spawnWave(waves[0]);
          }
          return;
        }
        if (aliveCombatants === 0) {
          if (this.waveIndex >= waves.length - 1) { this._complete(); return; }
          this.waveTimer -= dt;
          if (this.waveTimer <= 0) {
            this.waveIndex++;
            this.waveTimer = waves[this.waveIndex].delay ?? 1.2;
            this._announceWave();
            this._spawnWave(waves[this.waveIndex]);
          }
        } else {
          this.waveTimer = waves[Math.min(this.waveIndex + 1, waves.length - 1)]?.delay ?? 1.2;
        }
        this.objective.progress = Math.max(0, this.waveIndex);
        break;
      }

      case 'survive': {
        this.survivalLeft -= dt;
        this.objective.progress = this.objective.target - this.survivalLeft;
        if (this.survivalLeft <= 0) { this._complete(); return; }
        this._trickleSpawn(dt, aliveCombatants);
        break;
      }

      case 'core': {
        this.objective.progress = this.cores.filter((c) => !c.alive).length;
        this._trickleSpawn(dt, aliveCombatants);
        break;
      }

      case 'hunt': {
        this._trickleSpawn(dt, aliveCombatants);
        const markedAlive = this.enemies.filter((e) => e.alive && e.isMarked).length;
        const remaining = this.objective.target - this.huntKills;
        if (markedAlive === 0 && remaining > 0) {
          this._markTimer = (this._markTimer || 0) - dt;
          if (this._markTimer <= 0) {
            this._markTimer = 3.5;
            this._spawnMarked();
          }
        }
        break;
      }

      case 'boss': {
        this.objective.progress = this.boss && this.boss.alive ? 1 - this.boss.healthFraction : 1;
        break;
      }
      default: break;
    }
  }

  _trickleSpawn(dt, aliveCombatants) {
    const wave = this.stage.waves?.[0];
    if (!wave) return;
    this.spawnTimer -= dt;
    const target = Math.min(MAX_ALIVE, Math.round(wave.count * (this.mods.countMult ?? 1)));
    if (this.spawnTimer <= 0 && aliveCombatants < target) {
      this.spawnTimer = (wave.delay ?? 5) / Math.max(1, target - aliveCombatants);
      const point = this._pickSpawnPoint();
      this._spawnEnemy(rnd.pick(wave.pool), point.x, point.y, { elite: rollElite(this.stageIndex) });
    }
  }

  _announceWave() {
    const total = (this.stage.waves || []).length;
    this.fx.callout(`WAVE ${this.waveIndex + 1} / ${total}`, {
      colour: '#ffd166', y: 220, scale: 0.75, duration: 1100
    });
    this.audio.play('danger', { gain: 0.5 });
  }

  /* ---------------------------------------------------------------- pause */

  requestPause(reason = 'user') {
    if (this.finished || this.paused) return;
    this.paused = true;
    this.scene.pause();
    this.scene.pause('HudScene');
    this.scene.launch('PauseScene', { play: this, reason });
    this.audio.suspend();
  }

  resumeFromPause() {
    this.paused = false;
    this.inputManager.setTouch(0, 0, {}, false);
    this.audio.resume();
    this.scene.resume();
    this.scene.resume('HudScene');
  }

  /* --------------------------------------------------------------- ending */

  _onPlayerDeath() {
    if (this.finished) return;
    this.finished = true;
    this.profile.recordDeath();
    this.audio.stopMusic();
    this.audio.play('defeat');
    this.cameras.main.shake(600, 0.01);

    this.time.delayedCall(1800, () => this._finish(false));
  }

  _complete() {
    if (this.finished || this.objective.done) return;
    this.objective.done = true;
    this.finished = true;
    this.audio.stopMusic();
    this.audio.play('victory');
    this.fx.callout('STAGE CLEAR', { colour: '#6bff9c', y: 200, scale: 1.4, duration: 2000 });
    this.fx.flash(0xffffff, 400, 0.4);

    // Vacuum everything left on the floor so nothing is lost to a ledge.
    for (const p of this.pickups) p.age = 10;

    this.time.delayedCall(2200, () => this._finish(true));
  }

  /**
   * Settle the run: commit rewards, then hand off to the results screen.
   * On defeat the player keeps a fraction — dying costs the *run*, never the
   * account, which is what keeps a hard stage worth attempting again.
   */
  _finish(victory) {
    const flawless = !this.player.tookDamage;
    const grade = this.style.grade(flawless);
    const replay = this.profile.replayMultiplier(this.stageIndex);
    const isBoss = !!this.stage.boss;

    const keepXp = victory ? 1 : PROGRESSION.DEATH_KEEP_XP;
    const keepLoot = victory ? 1 : PROGRESSION.DEATH_KEEP_LOOT;

    const baseXp = REWARDS.baseXp(this.stageIndex) * (isBoss ? REWARDS.bossXpMult : 1);
    const baseEmber = REWARDS.baseEmber(this.stageIndex) * (isBoss ? REWARDS.bossEmberMult : 1);

    const xp = Math.round((baseXp * replay * grade.mult + this.runXp) * keepXp);
    const ember = Math.round((baseEmber * replay * grade.mult + this.runEmber) *
      keepXp * this.profile.stats.emberFind);
    const shards = Math.round(this.runShards * keepXp) + (victory && isBoss ? REWARDS.shardsPerBoss : 0);

    // Loot: on defeat, a random subset survives.
    const keptLoot = victory
      ? this.runLoot
      : this.runLoot.filter(() => rnd.chance(keepLoot));

    const levelResult = this.profile.addXp(xp);
    if (ember) this.profile.addEmber(ember);
    if (shards) this.profile.addShards(shards);

    const added = [];
    for (const item of keptLoot) added.push(this.profile.addItem(item));

    this.profile.addMetrics({
      damageDealt: Math.round(this.player.damageDealt),
      bestCombo: this.player.comboCount
    });

    // Persist the wounded state — the Hub is what heals it.
    this.profile.data.currentHp = victory
      ? Math.max(1, Math.round(this.player.hp))
      : Math.max(1, Math.round(this.player.maxHp * 0.35));

    let clearResult = null;
    if (victory) {
      clearResult = this.profile.recordClear(this.stageIndex, {
        grade: grade.key,
        timeMs: Math.round(this.elapsed * 1000),
        flawless
      });
    } else {
      this.profile.touch(true);
    }

    ctx.lastResult = {
      victory,
      stageIndex: this.stageIndex,
      stageName: this.stage.name,
      grade,
      flawless,
      timeMs: Math.round(this.elapsed * 1000),
      kills: this.killCount,
      xp, ember, shards,
      loot: added,
      levels: levelResult.levels,
      skillPoints: levelResult.points + (clearResult?.bossPoints ?? 0),
      unlockedAbility: clearResult?.unlockedAbility ?? null,
      newStage: clearResult?.newStage ?? null,
      firstClear: clearResult?.firstClear ?? false,
      styleTotal: Math.round(this.style.totalEarned),
      damageDealt: Math.round(this.player.damageDealt),
      damageTaken: Math.round(this.player.damageTaken),
      parries: this.player.parries,
      replayMult: replay
    };

    // Back up the run to the player's account, if they have one. Fire and
    // forget: a sync failure must never block the results screen.
    ctx.cloud?.autoPush();

    this.scene.stop('HudScene');
    this.scene.start('ResultsScene');
  }

  /**
   * Teardown runs during scene shutdown, after Phaser has already destroyed
   * the display list, so every step is guarded — a double-destroy here would
   * otherwise abort the shutdown and leave the next scene half-built.
   */
  _cleanup(session) {
    const safe = (fn) => { try { fn(); } catch (err) { console.warn('[play] cleanup step failed', err); } };
    safe(() => session.inputManager?.destroy());
    for (const e of session.enemies) safe(() => e.destroy());
    for (const p of session.projectiles) safe(() => p.destroy());
    for (const h of session.hazards) safe(() => h.destroy());
    for (const p of session.pickups) safe(() => p.destroy());
    session.enemies.length = 0;
    session.projectiles.length = 0;
    session.hazards.length = 0;
    session.pickups.length = 0;
    safe(() => session.player?.destroy());
    safe(() => session.world?.destroy());
    safe(() => session.fx?.destroy());
    safe(() => { if (this.physics?.world?.isPaused) this.physics.world.resume(); });
  }
}
