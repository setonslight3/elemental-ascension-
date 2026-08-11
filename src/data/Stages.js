/**
 * Stages.js — the 20-stage Version 1 campaign.
 *
 * Layouts are described as *parameters*, not hand-placed tiles: the terrain
 * builder seeds its RNG from the stage id, so every stage is identical on
 * every device and every replay while still being cheap to author and tweak.
 *
 * Objectives:
 *   waves   — clear every wave
 *   survive — hold out for `duration` seconds against an endless trickle
 *   core    — destroy N reactor cores while the facility fights back
 *   hunt    — kill N marked elites hidden among the trash
 *   boss    — a single boss encounter (adds included, boss-dependent)
 */

export const BIOMES = {
  foundry: {
    id: 'foundry', name: 'Foundry Yard',
    sky: [0x1a1016, 0x2e1a20],
    far: 0x2b1d28, mid: 0x3a2634, near: 0x4a3040,
    ground: 0x3d2a34, groundTop: 0x6b4a52,
    fog: 0xff7a2f, fogAlpha: 0.06,
    hazard: 'lava', ambient: 'ember'
  },
  coolant: {
    id: 'coolant', name: 'Coolant Works',
    sky: [0x081420, 0x0f2634],
    far: 0x123040, mid: 0x1a4055, near: 0x235068,
    ground: 0x18303d, groundTop: 0x2f6076,
    fog: 0x59f2ff, fogAlpha: 0.07,
    hazard: 'saw', ambient: 'drip'
  },
  ashfall: {
    id: 'ashfall', name: 'Ashfall Ridge',
    sky: [0x1c1620, 0x33262c],
    far: 0x2e2630, mid: 0x3d323c, near: 0x4d4049,
    ground: 0x342a32, groundTop: 0x5d4d58,
    fog: 0xb8a8c0, fogAlpha: 0.1,
    hazard: 'none', ambient: 'ash'
  },
  magma: {
    id: 'magma', name: 'Magma Vault',
    sky: [0x1f0a0a, 0x3d1410],
    far: 0x40160f, mid: 0x561d13, near: 0x6b2617,
    ground: 0x43180f, groundTop: 0x8a3a1c,
    fog: 0xff4a1a, fogAlpha: 0.12,
    hazard: 'lava', ambient: 'ember'
  },
  skyforge: {
    id: 'skyforge', name: 'Sky Forge',
    sky: [0x120b26, 0x241640],
    far: 0x241a3d, mid: 0x33244f, near: 0x443063,
    ground: 0x2a1d45, groundTop: 0x5c4489,
    fog: 0xc074ff, fogAlpha: 0.09,
    hazard: 'void', ambient: 'spark'
  }
};

/** Optional per-stage rule twists. Kept few and legible. */
export const MODIFIERS = {
  overclocked: { name: 'Overclocked', desc: 'Robots move and attack 20% faster.', enemySpeed: 1.2, enemyCooldown: 0.82 },
  volatile:    { name: 'Volatile',    desc: 'Every robot detonates on death.', explodeOnDeath: true },
  plated:      { name: 'Heavy Plating', desc: 'Robots take 25% less damage but stagger easier.', armour: 0.25, staggerMult: 0.7 },
  lowgrav:     { name: 'Low Gravity', desc: 'Everything falls slower. Air combos last longer.', gravity: 0.62 },
  stormfire:   { name: 'Stormfire',   desc: 'Burning debris rains across the arena.', rain: true },
  blackout:    { name: 'Blackout',    desc: 'Emergency lighting only. Your fire is the lamp.', dark: true },
  swarm:       { name: 'Swarm Protocol', desc: '50% more robots, each with less armour.', countMult: 1.5, enemyHp: 0.72 }
};

const S = (index, cfg) => ({
  index,
  id: `stage-${index}`,
  boss: null,
  modifiers: [],
  reward: {},
  ...cfg
});

export const STAGES = [
  /* ---------------------------------------------------------- act I: foundry */
  S(1, {
    name: 'Cold Start', biome: 'foundry',
    brief: 'The foundry line woke up angry. Show it what fire actually is.',
    objective: { type: 'waves' },
    layout: { width: 3000, platforms: 0.35, gaps: 0.0, ceiling: false, hazardDensity: 0 },
    waves: [
      { pool: ['scrapper'], count: 3, delay: 0 },
      { pool: ['scrapper', 'drone'], count: 4, delay: 1.2 },
      { pool: ['scrapper', 'scrapper', 'drone'], count: 5, delay: 1.2 }
    ],
    unlocks: { ability: 'fireball' }
  }),
  S(2, {
    name: 'Slag Line', biome: 'foundry',
    brief: 'Molten channels below, patrol drones above. Keep moving.',
    objective: { type: 'waves' },
    layout: { width: 3400, platforms: 0.55, gaps: 0.25, ceiling: false, hazardDensity: 0.35 },
    waves: [
      { pool: ['scrapper', 'drone'], count: 4, delay: 0 },
      { pool: ['scrapper', 'sentinel'], count: 5, delay: 1.2 },
      { pool: ['scrapper', 'drone', 'lancer'], count: 5, delay: 1.2 }
    ]
  }),
  S(3, {
    name: 'Shield Wall', biome: 'foundry',
    brief: 'Lancers guard the ramp. Their guard only faces one way.',
    objective: { type: 'waves' },
    layout: { width: 3200, platforms: 0.5, gaps: 0.15, ceiling: false, hazardDensity: 0.2 },
    waves: [
      { pool: ['lancer', 'scrapper'], count: 4, delay: 0 },
      { pool: ['lancer', 'drone', 'scrapper'], count: 6, delay: 1.2 },
      { pool: ['lancer', 'lancer', 'sniper'], count: 6, delay: 1.2 }
    ],
    unlocks: { ability: 'flamedash' }
  }),
  S(4, {
    name: 'CINDERJAW', biome: 'foundry',
    brief: 'The foundry enforcer. It has never lost. Neither have you.',
    objective: { type: 'boss' },
    boss: 'cinderjaw',
    layout: { width: 1900, platforms: 0.3, gaps: 0.0, ceiling: false, hazardDensity: 0, arena: true }
  }),

  /* --------------------------------------------------------- act II: coolant */
  S(5, {
    name: 'Deep Freeze', biome: 'coolant',
    brief: 'Coolant Works. They built this place to put fires out.',
    objective: { type: 'waves' },
    layout: { width: 3600, platforms: 0.6, gaps: 0.3, ceiling: true, hazardDensity: 0.4 },
    modifiers: ['overclocked'],
    waves: [
      { pool: ['scrapper', 'drone', 'sniper'], count: 5, delay: 0 },
      { pool: ['lancer', 'drone', 'sentinel'], count: 6, delay: 1.2 },
      { pool: ['brute', 'scrapper', 'sniper'], count: 6, delay: 1.4 }
    ]
  }),
  S(6, {
    name: 'Pressure Test', biome: 'coolant',
    brief: 'Hold the pump chamber until the pressure blows the doors.',
    objective: { type: 'survive', duration: 105 },
    layout: { width: 2400, platforms: 0.7, gaps: 0.1, ceiling: true, hazardDensity: 0.3, arena: true },
    waves: [{ pool: ['scrapper', 'drone', 'bomber', 'lancer'], count: 4, delay: 4.5, endless: true }],
    unlocks: { ability: 'eruption' }
  }),
  S(7, {
    name: 'Reactor Row', biome: 'coolant',
    brief: 'Three cores keep the sprinklers alive. Kill the cores.',
    objective: { type: 'core', cores: 3 },
    layout: { width: 4000, platforms: 0.65, gaps: 0.28, ceiling: true, hazardDensity: 0.35 },
    modifiers: ['plated'],
    waves: [{ pool: ['lancer', 'sentinel', 'sniper', 'drone'], count: 5, delay: 6, endless: true }]
  }),
  S(8, {
    name: 'SLAGMAW', biome: 'coolant',
    brief: 'The Crucible Warden floods the room and calls for help. Deny it both.',
    objective: { type: 'boss' },
    boss: 'slagmaw',
    layout: { width: 2100, platforms: 0.45, gaps: 0.0, ceiling: true, hazardDensity: 0, arena: true }
  }),

  /* --------------------------------------------------------- act III: ashfall */
  S(9, {
    name: 'Ashfall', biome: 'ashfall',
    brief: 'Open ridge. Nothing between you and the marksmen but distance.',
    objective: { type: 'waves' },
    layout: { width: 4200, platforms: 0.75, gaps: 0.35, ceiling: false, hazardDensity: 0 },
    modifiers: ['stormfire'],
    waves: [
      { pool: ['sniper', 'drone', 'scrapper'], count: 6, delay: 0 },
      { pool: ['warden', 'sniper', 'lancer'], count: 6, delay: 1.4 },
      { pool: ['brute', 'bomber', 'sniper', 'drone'], count: 7, delay: 1.4 }
    ]
  }),
  S(10, {
    name: 'Hunter\'s Mark', biome: 'ashfall',
    brief: 'Four elite units are hiding in the column. Find them. End them.',
    objective: { type: 'hunt', targets: 4 },
    layout: { width: 4400, platforms: 0.7, gaps: 0.3, ceiling: false, hazardDensity: 0 },
    waves: [{ pool: ['scrapper', 'drone', 'lancer', 'sniper', 'bomber'], count: 6, delay: 5.5, endless: true }],
    unlocks: { ability: 'infernoWave' }
  }),
  S(11, {
    name: 'Blackout Ridge', biome: 'ashfall',
    brief: 'Lights are gone. You are the only thing burning out here.',
    objective: { type: 'waves' },
    layout: { width: 3800, platforms: 0.65, gaps: 0.3, ceiling: false, hazardDensity: 0 },
    modifiers: ['blackout', 'swarm'],
    waves: [
      { pool: ['drone', 'bomber', 'scrapper'], count: 7, delay: 0 },
      { pool: ['warden', 'lancer', 'drone'], count: 7, delay: 1.3 },
      { pool: ['brute', 'warden', 'sniper', 'bomber'], count: 8, delay: 1.4 }
    ]
  }),
  S(12, {
    name: 'NULLFLAME', biome: 'ashfall',
    brief: 'It was built to put you out. Relight yourself and prove it wrong.',
    objective: { type: 'boss' },
    boss: 'nullflame',
    layout: { width: 2200, platforms: 0.55, gaps: 0.0, ceiling: false, hazardDensity: 0, arena: true }
  }),

  /* ----------------------------------------------------------- act IV: magma */
  S(13, {
    name: 'Vault Descent', biome: 'magma',
    brief: 'Down into the Magma Vault. The floor is a suggestion.',
    objective: { type: 'waves' },
    layout: { width: 4200, platforms: 0.8, gaps: 0.45, ceiling: false, hazardDensity: 0.55 },
    modifiers: ['lowgrav'],
    waves: [
      { pool: ['drone', 'warden', 'sniper'], count: 6, delay: 0 },
      { pool: ['brute', 'lancer', 'drone'], count: 7, delay: 1.3 },
      { pool: ['warden', 'brute', 'bomber', 'sentinel'], count: 8, delay: 1.4 }
    ]
  }),
  S(14, {
    name: 'Crucible', biome: 'magma',
    brief: 'A sealed room, a rising floor, and a great many robots.',
    objective: { type: 'survive', duration: 125 },
    layout: { width: 2600, platforms: 0.75, gaps: 0.15, ceiling: true, hazardDensity: 0.5, arena: true },
    modifiers: ['volatile'],
    waves: [{ pool: ['scrapper', 'lancer', 'bomber', 'warden', 'drone'], count: 5, delay: 4.0, endless: true }]
  }),
  S(15, {
    name: 'Forge Cores', biome: 'magma',
    brief: 'Four cores feed the Sovereign. Starve it before you meet it.',
    objective: { type: 'core', cores: 4 },
    layout: { width: 4600, platforms: 0.7, gaps: 0.4, ceiling: false, hazardDensity: 0.5 },
    modifiers: ['plated', 'stormfire'],
    waves: [{ pool: ['brute', 'warden', 'sentinel', 'sniper'], count: 6, delay: 6, endless: true }]
  }),
  S(16, {
    name: 'EMBERLORD', biome: 'magma',
    brief: 'The Forge Sovereign rules a kingdom of fire. Take the throne.',
    objective: { type: 'boss' },
    boss: 'emberlord',
    layout: { width: 2400, platforms: 0.5, gaps: 0.0, ceiling: false, hazardDensity: 0.25, arena: true }
  }),

  /* --------------------------------------------------------- act V: skyforge */
  S(17, {
    name: 'Ascent', biome: 'skyforge',
    brief: 'The Sky Forge floats above the world. Nothing below it but the drop.',
    objective: { type: 'waves' },
    layout: { width: 4400, platforms: 0.9, gaps: 0.55, ceiling: false, hazardDensity: 0 },
    modifiers: ['overclocked'],
    waves: [
      { pool: ['warden', 'drone', 'sniper'], count: 7, delay: 0 },
      { pool: ['brute', 'warden', 'lancer', 'drone'], count: 8, delay: 1.3 },
      { pool: ['warden', 'brute', 'sniper', 'bomber', 'sentinel'], count: 9, delay: 1.3 }
    ]
  }),
  S(18, {
    name: 'The Long Watch', biome: 'skyforge',
    brief: 'Six elites hold the gantry. The Protocol is watching you work.',
    objective: { type: 'hunt', targets: 6 },
    layout: { width: 4800, platforms: 0.85, gaps: 0.5, ceiling: false, hazardDensity: 0 },
    modifiers: ['swarm'],
    waves: [{ pool: ['warden', 'brute', 'sniper', 'lancer', 'bomber', 'drone'], count: 7, delay: 5, endless: true }]
  }),
  S(19, {
    name: 'Last Gate', biome: 'skyforge',
    brief: 'Everything left in the Forge is standing between you and the Core.',
    objective: { type: 'survive', duration: 140 },
    layout: { width: 2800, platforms: 0.8, gaps: 0.2, ceiling: true, hazardDensity: 0, arena: true },
    modifiers: ['volatile', 'overclocked'],
    waves: [{ pool: ['warden', 'brute', 'lancer', 'bomber', 'sniper', 'drone'], count: 6, delay: 3.6, endless: true }]
  }),
  S(20, {
    name: 'ASCENDANT CORE', biome: 'skyforge',
    brief: 'The Last Protocol. Four phases. One of you walks out.',
    objective: { type: 'boss' },
    boss: 'ascendantCore',
    layout: { width: 2600, platforms: 0.6, gaps: 0.0, ceiling: false, hazardDensity: 0, arena: true }
  })
];

export const getStage = (index) => STAGES.find((s) => s.index === index) || null;

export const BOSS_STAGES = STAGES.filter((s) => s.boss).map((s) => s.index);

export const ACTS = [
  { name: 'Act I — Foundry Yard', biome: 'foundry', stages: [1, 2, 3, 4] },
  { name: 'Act II — Coolant Works', biome: 'coolant', stages: [5, 6, 7, 8] },
  { name: 'Act III — Ashfall Ridge', biome: 'ashfall', stages: [9, 10, 11, 12] },
  { name: 'Act IV — Magma Vault', biome: 'magma', stages: [13, 14, 15, 16] },
  { name: 'Act V — Sky Forge', biome: 'skyforge', stages: [17, 18, 19, 20] }
];
