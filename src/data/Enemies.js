/**
 * Enemies.js — robot archetypes and boss scripts.
 *
 * Every attack is described declaratively so one generic executor in Enemy.js
 * can run all of them. The important field is `telegraph`:
 *
 *   'blockable'   — flashes amber. Guard it, or parry it for a big payoff.
 *   'unblockable' — flashes crimson. Guard does nothing; you must roll, slide
 *                   or leave. This is what stops "hold block forever" from
 *                   being a winning strategy.
 */

export const ARCHETYPES = {
  scrapper: {
    id: 'scrapper',
    name: 'Scrapper',
    hp: 58, damage: 9, speed: 118, xp: 16,
    width: 34, height: 52,
    colour: 0x7d8ba3, accent: 0xff6b3d,
    staggerMax: 34,
    aggroRange: 460, preferredRange: 46, leap: true,
    attacks: [
      { id: 'swing', type: 'melee', telegraph: 'blockable', damage: 1.0,
        windup: 0.40, active: 0.12, recover: 0.45, range: 62, height: 48,
        cooldown: 1.15, knockback: 190, advance: 130 }
    ]
  },

  drone: {
    id: 'drone',
    name: 'Wasp Drone',
    hp: 34, damage: 7, speed: 168, xp: 14,
    width: 30, height: 26,
    colour: 0x9ad3ff, accent: 0xffd166,
    flying: true, hoverHeight: 120, staggerMax: 18,
    aggroRange: 560, preferredRange: 150,
    attacks: [
      { id: 'dive', type: 'dash', telegraph: 'blockable', damage: 0.9,
        windup: 0.48, active: 0.30, recover: 0.55, range: 300, height: 34,
        cooldown: 1.9, speed: 560, knockback: 160 }
    ]
  },

  lancer: {
    id: 'lancer',
    name: 'Lancer',
    hp: 82, damage: 12, speed: 104, xp: 26,
    width: 36, height: 56,
    colour: 0x6f7fb5, accent: 0x59f2ff,
    staggerMax: 52,
    /** Frontal guard: hits from the front are heavily reduced until stagger
     *  breaks it, so the player has to flank, launch, or parry it open. */
    frontalGuard: 0.25, guardBreakOnParry: true,
    aggroRange: 500, preferredRange: 78,
    attacks: [
      { id: 'thrust', type: 'melee', telegraph: 'blockable', damage: 1.1,
        windup: 0.46, active: 0.14, recover: 0.5, range: 92, height: 34,
        cooldown: 1.5, knockback: 240, advance: 220 },
      { id: 'shieldbash', type: 'melee', telegraph: 'unblockable', damage: 0.85,
        windup: 0.62, active: 0.16, recover: 0.62, range: 66, height: 50,
        cooldown: 3.4, knockback: 340, advance: 180 }
    ]
  },

  sniper: {
    id: 'sniper',
    name: 'Marksman',
    hp: 44, damage: 15, speed: 92, xp: 24,
    width: 32, height: 54,
    colour: 0xb58ad6, accent: 0xff3d6b,
    staggerMax: 22,
    aggroRange: 900, preferredRange: 420, kiter: true,
    attacks: [
      { id: 'beam', type: 'beam', telegraph: 'unblockable', damage: 1.0,
        windup: 0.95, active: 0.18, recover: 0.85, range: 820, height: 12,
        cooldown: 3.0 }
    ]
  },

  bomber: {
    id: 'bomber',
    name: 'Sapper',
    hp: 40, damage: 22, speed: 190, xp: 22,
    width: 32, height: 40,
    colour: 0xd6a45a, accent: 0xff2f2f,
    staggerMax: 16, explodeOnDeath: true,
    aggroRange: 700, preferredRange: 20, relentless: true,
    attacks: [
      { id: 'detonate', type: 'nova', telegraph: 'unblockable', damage: 1.0,
        windup: 0.85, active: 0.14, recover: 0.1, range: 118,
        cooldown: 99, suicide: true }
    ]
  },

  brute: {
    id: 'brute',
    name: 'Brute',
    hp: 165, damage: 17, speed: 84, xp: 48,
    width: 52, height: 72,
    colour: 0x5c6470, accent: 0xff8a3d,
    staggerMax: 90, armour: 0.22, knockbackResist: 0.75,
    aggroRange: 520, preferredRange: 70,
    attacks: [
      { id: 'sweep', type: 'melee', telegraph: 'blockable', damage: 1.0,
        windup: 0.52, active: 0.16, recover: 0.55, range: 96, height: 60,
        cooldown: 2.0, knockback: 280, advance: 120 },
      { id: 'slam', type: 'slam', telegraph: 'unblockable', damage: 1.45,
        windup: 0.85, active: 0.2, recover: 0.85, range: 150, height: 70,
        cooldown: 5.0, knockback: 420, shockwave: true }
    ]
  },

  sentinel: {
    id: 'sentinel',
    name: 'Sentinel',
    hp: 95, damage: 11, speed: 0, xp: 30,
    width: 40, height: 46,
    colour: 0x4a5a6b, accent: 0x59f2ff,
    stationary: true, staggerMax: 40,
    aggroRange: 720, preferredRange: 720,
    attacks: [
      { id: 'spread', type: 'projectile', telegraph: 'blockable', damage: 0.8,
        windup: 0.55, active: 0.1, recover: 0.7, range: 720,
        cooldown: 2.4, count: 3, spread: 0.22, speed: 420 }
    ]
  },

  warden: {
    id: 'warden',
    name: 'Warden',
    hp: 128, damage: 16, speed: 140, xp: 55,
    width: 40, height: 60,
    colour: 0x8a5ad6, accent: 0xffd166,
    staggerMax: 66, blink: true,
    aggroRange: 780, preferredRange: 220,
    attacks: [
      { id: 'blades', type: 'projectile', telegraph: 'blockable', damage: 0.85,
        windup: 0.42, active: 0.1, recover: 0.5, range: 640,
        cooldown: 2.2, count: 2, spread: 0.1, speed: 500, homingTurn: 1.4 },
      { id: 'rush', type: 'dash', telegraph: 'unblockable', damage: 1.2,
        windup: 0.55, active: 0.28, recover: 0.6, range: 420, height: 56,
        cooldown: 4.2, speed: 720, knockback: 300 }
    ]
  }
};

/* -------------------------------------------------------------------- bosses */

/**
 * Bosses run the same attack executor, wrapped in a phase machine. Each phase
 * declares its attack pool and a health threshold; crossing a threshold plays
 * a transition (invulnerable, clears the arena of projectiles) so the fight
 * reads in chapters rather than as one long HP bar.
 */
export const BOSSES = {
  cinderjaw: {
    id: 'cinderjaw',
    name: 'MK-I "CINDERJAW"',
    title: 'Foundry Enforcer',
    hp: 900, damage: 16, speed: 128, xp: 420,
    width: 78, height: 96,
    colour: 0x8a4a3a, accent: 0xff7a2f,
    staggerMax: 160,
    arena: 'foundry',
    phases: [
      { at: 1.0, name: 'Ignition', pool: ['chomp', 'lunge', 'spit'], cadence: [1.5, 2.2] },
      { at: 0.5, name: 'Overheat', pool: ['chomp', 'lunge', 'spit', 'flamewall'], cadence: [1.0, 1.7], speedMult: 1.2, enrage: 1.15 }
    ],
    attacks: {
      chomp:     { type: 'melee', telegraph: 'blockable', damage: 1.0, windup: 0.5, active: 0.16, recover: 0.5, range: 104, height: 80, knockback: 300, advance: 140 },
      lunge:     { type: 'dash', telegraph: 'unblockable', damage: 1.3, windup: 0.7, active: 0.32, recover: 0.7, range: 560, height: 90, speed: 760, knockback: 380 },
      spit:      { type: 'projectile', telegraph: 'blockable', damage: 0.9, windup: 0.5, active: 0.1, recover: 0.6, range: 800, count: 3, spread: 0.18, speed: 430, arc: true },
      flamewall: { type: 'wall', telegraph: 'unblockable', damage: 1.1, windup: 0.9, active: 1.4, recover: 0.8, speed: 260, gapWidth: 150 }
    }
  },

  slagmaw: {
    id: 'slagmaw',
    name: 'MK-II "SLAGMAW"',
    title: 'Crucible Warden',
    hp: 1650, damage: 20, speed: 112, xp: 720,
    width: 92, height: 104,
    colour: 0x4a5a6b, accent: 0x59f2ff,
    staggerMax: 210,
    arena: 'coolant',
    phases: [
      { at: 1.0,  name: 'Pressure', pool: ['sweep', 'mortar', 'summon'], cadence: [1.4, 2.0] },
      { at: 0.65, name: 'Venting',  pool: ['sweep', 'mortar', 'slamquake', 'summon'], cadence: [1.1, 1.7], speedMult: 1.15 },
      { at: 0.3,  name: 'Meltdown', pool: ['slamquake', 'mortar', 'beamsweep'], cadence: [0.85, 1.35], speedMult: 1.3, enrage: 1.25 }
    ],
    attacks: {
      sweep:     { type: 'melee', telegraph: 'blockable', damage: 1.0, windup: 0.48, active: 0.18, recover: 0.5, range: 128, height: 88, knockback: 320, advance: 100 },
      mortar:    { type: 'mortar', telegraph: 'unblockable', damage: 1.15, windup: 0.7, active: 0.2, recover: 0.7, count: 4, radius: 92, delay: 1.0 },
      slamquake: { type: 'slam', telegraph: 'unblockable', damage: 1.35, windup: 0.9, active: 0.22, recover: 0.9, range: 240, knockback: 460, shockwave: true, quake: true },
      beamsweep: { type: 'beamsweep', telegraph: 'unblockable', damage: 1.0, windup: 1.0, active: 1.5, recover: 0.9, sweepArc: 1.1 },
      summon:    { type: 'summon', telegraph: 'blockable', damage: 0, windup: 0.8, active: 0.2, recover: 0.8, spawn: ['drone', 'drone', 'scrapper'] }
    }
  },

  nullflame: {
    id: 'nullflame',
    name: 'MK-III "NULLFLAME"',
    title: 'Quench Protocol',
    hp: 2500, damage: 24, speed: 152, xp: 1150,
    width: 74, height: 100,
    colour: 0x3d5a8a, accent: 0x7ce8ff,
    staggerMax: 240,
    arena: 'ashfall',
    /** Signature mechanic: periodically douses the player's fire, cutting mana
     *  regen and ability damage until they land enough hits to reignite. */
    mechanic: 'douse',
    phases: [
      { at: 1.0,  name: 'Suppression', pool: ['blinkslash', 'frostlance', 'douse'], cadence: [1.2, 1.8] },
      { at: 0.6,  name: 'Cascade',     pool: ['blinkslash', 'frostlance', 'douse', 'orbital'], cadence: [1.0, 1.5], speedMult: 1.2 },
      { at: 0.25, name: 'Zero Point',  pool: ['blinkslash', 'orbital', 'nova', 'frostlance'], cadence: [0.8, 1.2], speedMult: 1.35, enrage: 1.3 }
    ],
    attacks: {
      blinkslash: { type: 'blinkstrike', telegraph: 'blockable', damage: 1.1, windup: 0.42, active: 0.16, recover: 0.44, range: 110, height: 84, knockback: 280 },
      frostlance: { type: 'projectile', telegraph: 'blockable', damage: 0.95, windup: 0.45, active: 0.1, recover: 0.5, count: 5, spread: 0.3, speed: 520, range: 900 },
      douse:      { type: 'douse', telegraph: 'unblockable', damage: 0.6, windup: 1.1, active: 0.3, recover: 0.9, range: 420 },
      orbital:    { type: 'mortar', telegraph: 'unblockable', damage: 1.2, windup: 0.65, active: 0.2, recover: 0.6, count: 6, radius: 80, delay: 0.9 },
      nova:       { type: 'nova', telegraph: 'unblockable', damage: 1.5, windup: 1.15, active: 0.25, recover: 1.0, range: 320, knockback: 480 }
    }
  },

  emberlord: {
    id: 'emberlord',
    name: 'MK-IV "EMBERLORD"',
    title: 'Forge Sovereign',
    hp: 3600, damage: 28, speed: 138, xp: 1800,
    width: 96, height: 118,
    colour: 0x7a2f3a, accent: 0xffb43d,
    staggerMax: 300,
    arena: 'magma',
    phases: [
      { at: 1.0,  name: 'Sovereign',  pool: ['cleave', 'firestorm', 'chargeline', 'summon'], cadence: [1.2, 1.8] },
      { at: 0.7,  name: 'Wrath',      pool: ['cleave', 'firestorm', 'chargeline', 'pillars'], cadence: [1.0, 1.5], speedMult: 1.15 },
      { at: 0.35, name: 'Cataclysm',  pool: ['pillars', 'firestorm', 'chargeline', 'novaburst'], cadence: [0.8, 1.2], speedMult: 1.32, enrage: 1.28 }
    ],
    attacks: {
      cleave:     { type: 'melee', telegraph: 'blockable', damage: 1.05, windup: 0.44, active: 0.18, recover: 0.46, range: 140, height: 100, knockback: 340, advance: 130 },
      firestorm:  { type: 'mortar', telegraph: 'unblockable', damage: 1.1, windup: 0.6, active: 0.2, recover: 0.6, count: 7, radius: 78, delay: 0.85 },
      chargeline: { type: 'dash', telegraph: 'unblockable', damage: 1.4, windup: 0.68, active: 0.36, recover: 0.65, range: 700, height: 110, speed: 880, knockback: 440 },
      pillars:    { type: 'pillars', telegraph: 'unblockable', damage: 1.25, windup: 0.85, active: 0.9, recover: 0.7, count: 5, delay: 0.55 },
      novaburst:  { type: 'nova', telegraph: 'unblockable', damage: 1.6, windup: 1.0, active: 0.25, recover: 0.95, range: 360, knockback: 520 },
      summon:     { type: 'summon', telegraph: 'blockable', damage: 0, windup: 0.75, active: 0.2, recover: 0.7, spawn: ['lancer', 'bomber', 'drone'] }
    }
  },

  ascendantCore: {
    id: 'ascendantCore',
    name: 'MK-V "ASCENDANT CORE"',
    title: 'The Last Protocol',
    hp: 5400, damage: 32, speed: 158, xp: 3000,
    width: 104, height: 128,
    colour: 0x2f2340, accent: 0xff4d6d,
    staggerMax: 360,
    arena: 'skyforge',
    mechanic: 'douse',
    phases: [
      { at: 1.0,  name: 'Protocol I',   pool: ['cleave', 'orbital', 'chargeline', 'summon'], cadence: [1.1, 1.6] },
      { at: 0.75, name: 'Protocol II',  pool: ['blinkslash', 'orbital', 'pillars', 'beamsweep'], cadence: [0.95, 1.4], speedMult: 1.15 },
      { at: 0.45, name: 'Protocol III', pool: ['blinkslash', 'firestorm', 'chargeline', 'douse', 'pillars'], cadence: [0.85, 1.25], speedMult: 1.3 },
      { at: 0.18, name: 'ASCENSION',    pool: ['novaburst', 'firestorm', 'blinkslash', 'chargeline', 'beamsweep'], cadence: [0.65, 1.0], speedMult: 1.45, enrage: 1.35 }
    ],
    attacks: {
      cleave:     { type: 'melee', telegraph: 'blockable', damage: 1.0, windup: 0.42, active: 0.18, recover: 0.44, range: 148, height: 112, knockback: 360, advance: 140 },
      blinkslash: { type: 'blinkstrike', telegraph: 'blockable', damage: 1.15, windup: 0.38, active: 0.16, recover: 0.4, range: 120, height: 96, knockback: 300 },
      orbital:    { type: 'mortar', telegraph: 'unblockable', damage: 1.15, windup: 0.6, active: 0.2, recover: 0.55, count: 6, radius: 82, delay: 0.85 },
      firestorm:  { type: 'mortar', telegraph: 'unblockable', damage: 1.2, windup: 0.55, active: 0.2, recover: 0.55, count: 9, radius: 76, delay: 0.75 },
      chargeline: { type: 'dash', telegraph: 'unblockable', damage: 1.45, windup: 0.6, active: 0.38, recover: 0.6, range: 760, height: 120, speed: 920, knockback: 460 },
      pillars:    { type: 'pillars', telegraph: 'unblockable', damage: 1.3, windup: 0.8, active: 0.95, recover: 0.65, count: 6, delay: 0.5 },
      beamsweep:  { type: 'beamsweep', telegraph: 'unblockable', damage: 1.05, windup: 0.9, active: 1.5, recover: 0.8, sweepArc: 1.2 },
      douse:      { type: 'douse', telegraph: 'unblockable', damage: 0.7, windup: 1.0, active: 0.3, recover: 0.8, range: 480 },
      novaburst:  { type: 'nova', telegraph: 'unblockable', damage: 1.7, windup: 0.95, active: 0.25, recover: 0.9, range: 400, knockback: 540 },
      summon:     { type: 'summon', telegraph: 'blockable', damage: 0, windup: 0.7, active: 0.2, recover: 0.65, spawn: ['warden', 'sniper', 'bomber'] }
    }
  }
};
