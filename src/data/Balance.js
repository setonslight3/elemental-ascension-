/**
 * Balance.js — every tuning number the game leans on, in one place.
 *
 * Rule for this file: no logic, no imports, no randomness. If a value decides
 * how the game *feels*, it lives here so it can be tuned without spelunking
 * through systems code.
 */

/**
 * The design surface. Height is fixed at 720; the width adapts to the device's
 * aspect ratio so a 20:9 phone gets play area instead of letterboxing.
 *
 * WIDTH is deliberately mutable: Viewport.js measures the real host element and
 * rewrites it whenever the visible area changes (URL bar sliding away, rotation,
 * entering fullscreen), then re-lays out the UI. Every module reads it through
 * this shared object, so they all follow. The value here is only a placeholder
 * for the moment before the first measurement.
 */
export const VIEW = {
  WIDTH: 1280,
  HEIGHT: 720,
  // Anything that must hug a device edge uses the safe-area pad.
  SAFE_PAD: 18
};

export const PHYSICS = {
  GRAVITY: 2100,
  TERMINAL_VELOCITY: 1400
};

/* ------------------------------------------------------------------ player */

export const PLAYER = {
  // --- vitals -------------------------------------------------------------
  BASE_HP: 120,
  HP_PER_LEVEL: 9,
  BASE_MANA: 100,
  MANA_PER_LEVEL: 3,
  BASE_STAMINA: 100,

  /**
   * Blueprint says "health is restored only in the Hub". Taken literally that
   * dead-ends a player who limps out of a stage with 4 HP and no potions:
   * every subsequent run is unwinnable and the only way forward is grinding a
   * stage they cannot survive. So: the Hub is still the only *full* heal, but
   * out of combat the player trickles back to a safety floor. Enough to keep
   * a run possible, far too slow to replace potions or the Hub.
   */
  REGEN_OUT_OF_COMBAT: 1.6,      // hp/sec once out of combat
  REGEN_COMBAT_DELAY: 6.0,       // seconds since last damage before it starts
  REGEN_SAFETY_FLOOR: 0.35,      // regen stops at 35% max hp

  /**
   * "Mana regenerates slowly; attacks speed it up." Rewarding *attacks* would
   * pay out for swinging at empty air, so the reward is on connecting.
   */
  MANA_REGEN: 3.2,               // mana/sec, always ticking
  MANA_ON_HIT: 4.0,              // per landed melee hit
  MANA_ON_PARRY: 18.0,
  MANA_ON_HIT_DIMINISH: 0.55,    // multiplier per extra hit inside one second

  STAMINA_REGEN: 26,             // stamina/sec
  STAMINA_REGEN_DELAY: 0.42,     // seconds after spending before regen resumes
  STAMINA_BLOCK_DRAIN: 14,       // per second while holding block
  STAMINA_ROLL: 22,
  STAMINA_SLIDE: 16,
  STAMINA_SPRINT: 7,             // per second
  STAMINA_BLOCK_HIT: 16,         // taking a hit on the guard
  GUARD_BREAK_STUN: 1.1,         // seconds stunned when stamina hits zero on a block

  // --- movement -----------------------------------------------------------
  WALK_SPEED: 235,
  SPRINT_SPEED: 395,
  AIR_CONTROL: 0.72,             // fraction of ground accel usable airborne
  ACCEL_GROUND: 2600,
  ACCEL_AIR: 1500,
  FRICTION_GROUND: 2400,
  FRICTION_AIR: 320,

  JUMP_VELOCITY: -760,
  JUMP_CUT: 0.42,                // velocity kept when the jump key is released early
  COYOTE_TIME: 0.11,             // seconds of grace after walking off a ledge
  JUMP_BUFFER: 0.13,             // seconds a jump press is remembered before landing
  DOUBLE_JUMP_VELOCITY: -680,

  ROLL_SPEED: 520,
  ROLL_TIME: 0.42,
  ROLL_IFRAMES: 0.24,            // invulnerable window inside the roll
  ROLL_COOLDOWN: 0.5,

  SLIDE_SPEED: 520,
  SLIDE_TIME: 0.46,
  SLIDE_COOLDOWN: 0.55,
  SLIDE_HEIGHT_SCALE: 0.5,       // hitbox shrink, lets the player go under beams

  // --- defence ------------------------------------------------------------
  BLOCK_DAMAGE_MULT: 0.28,       // damage that still gets through a guard
  BLOCK_CHIP_MULT: 0.12,         // of the blocked damage, taken as unavoidable chip
  PARRY_WINDOW: 0.18,            // seconds after raising guard that count as a parry
  PARRY_COOLDOWN: 0.32,          // stops "mash block" from being a permanent parry
  PARRY_HITSTOP: 0.14,
  PARRY_STAGGER: 1.25,           // seconds the attacker is staggered

  IFRAME_ON_HIT: 0.45,           // post-hit invulnerability so crowds can't chain-lock

  // --- offence ------------------------------------------------------------
  BASE_ATTACK: 11,
  ATTACK_PER_LEVEL: 1.35,
  BASE_CRIT_CHANCE: 0.05,
  BASE_CRIT_MULT: 1.65,

  KNOCKBACK_RESIST: 0.4,

  MAX_LEVEL: 30,
  START_POTIONS: 3,
  MAX_POTIONS: 9,
  POTION_HEAL_PCT: 0.42,
  POTION_COOLDOWN: 1.2,

  // Fall-out-of-the-world guard: teleport back rather than freeze forever.
  VOID_DAMAGE_PCT: 0.12
};

/**
 * The ground melee chain. Each link declares its own timing so combos can be
 * re-tuned per hit without touching player code.
 *   windup  — animation lead-in, no hitbox yet
 *   active  — hitbox live
 *   recover — endlag; cancellable into the next link via `cancelAfter`
 */
export const COMBO = [
  { name: 'jab',    damage: 0.85, windup: 0.06, active: 0.09, recover: 0.16, cancelAfter: 0.10, reach: 62, height: 54, knockback: 130, hitstop: 0.035, style: 5,  advance: 90 },
  { name: 'slash',  damage: 1.00, windup: 0.07, active: 0.10, recover: 0.18, cancelAfter: 0.12, reach: 70, height: 58, knockback: 180, hitstop: 0.045, style: 6,  advance: 120 },
  { name: 'rise',   damage: 1.35, windup: 0.10, active: 0.12, recover: 0.30, cancelAfter: 0.20, reach: 74, height: 92, knockback: 210, hitstop: 0.075, style: 11, advance: 60,  launch: -430 }
];

export const AIR_ATTACK = {
  name: 'airslash', damage: 1.05, windup: 0.06, active: 0.12, recover: 0.20,
  reach: 68, height: 66, knockback: 150, hitstop: 0.05, style: 9, spike: 260
};

export const DASH_ATTACK = {
  name: 'dashstrike', damage: 1.25, windup: 0.05, active: 0.14, recover: 0.24,
  reach: 82, height: 56, knockback: 260, hitstop: 0.06, style: 10, advance: 320
};

/* ---------------------------------------------------------------- abilities */

export const ABILITIES = {
  fireball: {
    id: 'fireball', name: 'Fireball', short: 'FB',
    manaCost: 12, cooldown: 0.55, damage: 1.5, style: 8,
    unlockStage: 1, colour: 0xff8a3d,
    desc: 'Hurl a bolt of flame. Applies Burn.'
  },
  flamedash: {
    id: 'flamedash', name: 'Flame Dash', short: 'FD',
    manaCost: 16, cooldown: 2.6, damage: 1.15, style: 12,
    unlockStage: 3, colour: 0xffb43d,
    desc: 'Blink forward in a trail of fire. Invulnerable, ignites everything you pass through.'
  },
  eruption: {
    id: 'eruption', name: 'Eruption', short: 'ER',
    manaCost: 26, cooldown: 4.5, damage: 2.3, style: 16,
    unlockStage: 6, colour: 0xff5a2a,
    desc: 'Split the ground. Launches and burns everything nearby.'
  },
  infernoWave: {
    id: 'infernoWave', name: 'Inferno Wave', short: 'IW',
    manaCost: 22, cooldown: 3.2, damage: 1.7, style: 14,
    unlockStage: 10, colour: 0xff3d6b,
    desc: 'A rolling wall of fire that pierces every robot in its path.'
  }
};

/** Ability order in the HUD / on the touch ring. */
export const ABILITY_ORDER = ['fireball', 'flamedash', 'eruption', 'infernoWave'];

export const ULTIMATE = {
  name: 'Ascension',
  chargeOnDamageDealt: 0.55,   // charge per point of damage dealt
  chargeOnDamageTaken: 0.9,
  chargeOnStyle: 0.9,          // charge per style point earned
  max: 1000,
  duration: 9.0,
  damageMult: 1.6,
  speedMult: 1.18,
  costFree: true,              // abilities are free while ascended
  novaDamage: 4.0,             // on-activation shockwave
  style: 40
};

export const BURN = {
  duration: 4.0,
  tickInterval: 0.5,
  damagePerTick: 0.16,   // fraction of the applying hit's damage
  maxStacks: 5
};

/* -------------------------------------------------------------- style ranks */

/**
 * Style rank. Points come from *varied* aggression; the repeat penalty is what
 * stops a player from parking on one button and riding it to SSS.
 */
export const STYLE = {
  RANKS: [
    { key: 'C',   at: 0,    colour: 0x8fa3b8, mult: 1.00 },
    { key: 'B',   at: 90,   colour: 0x5ad0ff, mult: 1.10 },
    { key: 'A',   at: 220,  colour: 0x6bff9c, mult: 1.25 },
    { key: 'S',   at: 400,  colour: 0xffd451, mult: 1.45 },
    { key: 'SS',  at: 640,  colour: 0xff9b3d, mult: 1.70 },
    { key: 'SSS', at: 950,  colour: 0xff4d6d, mult: 2.00 }
  ],
  DECAY_DELAY: 2.4,          // seconds of inactivity before the meter bleeds
  DECAY_RATE: 62,            // points/sec once decaying
  HIT_TAKEN_PENALTY: 0.45,   // meter kept after taking a hit
  REPEAT_WINDOW: 6,          // how many recent moves are remembered
  REPEAT_FALLOFF: 0.55,      // multiplier per repeat of the same move in that window
  REPEAT_FLOOR: 0.12,        // spamming one move never drops below this share
  NO_HIT_BONUS: 0.25         // end-of-stage bonus for a flawless clear
};

/* ---------------------------------------------------------- progression */

export const PROGRESSION = {
  /**
   * Cumulative XP required to reach `level`. Level 1 must be 0 — clamping the
   * base to 1 instead of 0 made levels 1 and 2 cost the same, which read as
   * "MAX LEVEL" on a brand new character.
   */
  xpForLevel: (level) => Math.round(85 * Math.pow(Math.max(0, level - 1), 1.42)),
  SKILL_POINTS_PER_LEVEL: 1,
  SKILL_POINTS_PER_BOSS: 2,

  /**
   * Replaying a cleared stage still pays, but not at full rate — otherwise the
   * optimal play is farming stage 1 forever instead of pushing forward.
   */
  REPLAY_REWARD: 0.55,
  REPLAY_FLOOR: 0.4,
  REPLAY_DECAY: 0.9,          // per extra clear, down to REPLAY_FLOOR

  /** Dying costs progress on the *run*, never the account. */
  DEATH_KEEP_LOOT: 0.5,       // half the loot rolled during the run survives
  DEATH_KEEP_XP: 0.35,

  RESPEC_COST: (spent) => 120 + spent * 45
};

export const REWARDS = {
  baseXp: (stage) => 55 + stage * 26,
  baseEmber: (stage) => 40 + stage * 17,
  bossXpMult: 2.4,
  bossEmberMult: 2.2,
  shardsPerBoss: 3,
  shardChanceElite: 0.35
};

export const SHOP = {
  potionPrice: (owned) => 60 + owned * 30,
  rerollPrice: 150,
  upgradeCost: (level) => 90 + level * level * 55,
  upgradeShards: (level) => (level >= 3 ? level - 2 : 0),
  salvageValue: { common: 18, uncommon: 42, rare: 95, epic: 210, legendary: 480 }
};

/* ------------------------------------------------------------------- enemy */

export const ENEMY_SCALING = {
  /** Enemy stat multiplier for a given stage index (1-based). */
  hp: (stage) => 1 + (stage - 1) * 0.185,
  damage: (stage) => 1 + (stage - 1) * 0.135,
  /** Elites are rarer early, common late; they hit harder and drop better. */
  eliteChance: (stage) => Math.min(0.34, 0.03 + stage * 0.017),
  ELITE_HP: 2.4,
  ELITE_DAMAGE: 1.35,
  ELITE_SCALE: 1.22,
  /** How far an enemy chases before giving up and returning to its post. */
  LEASH_DISTANCE: 900,
  STAGGER_DECAY: 9,          // stagger meter points shed per second
  STAGGER_DURATION: 1.05
};

export const HITSTOP_CAP = 0.16;

export const FX = {
  SHAKE_SMALL: 0.0022,
  SHAKE_MED: 0.006,
  SHAKE_BIG: 0.013,
  DAMAGE_NUMBER_POOL: 40,
  PARTICLE_BUDGET_HIGH: 260,
  PARTICLE_BUDGET_LOW: 90
};

export const RARITY = {
  order: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
  colour: {
    common: 0xbfc8d6,
    uncommon: 0x64dd8a,
    rare: 0x4fa8ff,
    epic: 0xc074ff,
    legendary: 0xffa726
  },
  hex: {
    common: '#bfc8d6',
    uncommon: '#64dd8a',
    rare: '#4fa8ff',
    epic: '#c074ff',
    legendary: '#ffa726'
  },
  /** Affix count per rarity. */
  affixes: { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 },
  /** Base power multiplier per rarity. */
  power: { common: 1.0, uncommon: 1.14, rare: 1.32, epic: 1.55, legendary: 1.85 }
};

/** Drop weights shift toward the good stuff as stages get harder. */
export const LOOT = {
  dropChance: 0.42,
  eliteDropChance: 0.85,
  bossDrops: 3,
  weights: (stage) => ({
    common:    Math.max(4, 58 - stage * 2.6),
    uncommon:  30,
    rare:      8 + stage * 1.3,
    epic:      2 + stage * 0.85,
    legendary: Math.max(0, (stage - 5) * 0.32)
  }),
  INVENTORY_CAP: 60
};
