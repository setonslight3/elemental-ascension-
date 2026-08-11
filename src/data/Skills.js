/**
 * Skills.js — the three-branch skill tree (Aggression / Speed / Control).
 *
 * Nodes are pure data: each grants a list of stat deltas per rank, or a flag.
 * Stats.js folds them into the derived stat block, so adding a node never
 * requires touching gameplay code.
 *
 * `tier` gates progression: a tier-N node needs `tierRequirement(N)` points
 * already spent in the same branch. That keeps all three branches meaningful
 * instead of letting a level-3 player reach a capstone.
 */

export const BRANCHES = {
  aggression: {
    id: 'aggression', name: 'Aggression',
    colour: 0xff4d3d, hex: '#ff4d3d',
    blurb: 'Raw output. Bigger hits, hotter burns, faster ultimates.'
  },
  speed: {
    id: 'speed', name: 'Speed',
    colour: 0x59f2ff, hex: '#59f2ff',
    blurb: 'Movement and uptime. Dashes, jumps, cooldowns, stamina.'
  },
  control: {
    id: 'control', name: 'Control',
    colour: 0xc074ff, hex: '#c074ff',
    blurb: 'Defence and resources. Parries, mana, survivability, style.'
  }
};

/** Points that must already be spent in a branch to unlock each tier. */
export const tierRequirement = (tier) => [0, 0, 3, 7, 12][tier] ?? 0;

/**
 * STAT KEYS (all additive unless noted; *Mult keys are additive into a
 * multiplier that starts at 1.0):
 *   attackMult, abilityMult, burnMult, critChance, critMult, ultGainMult
 *   moveSpeedMult, sprintMult, cooldownMult (lower is better), staminaMax,
 *   staminaRegenMult, rollIframes, airJumps, dashCharges
 *   hpMult, manaMax, manaRegenMult, manaOnHit, blockReduction, parryWindow,
 *   styleGainMult, lifesteal, potionPowerMult, potionCap
 */

export const SKILLS = [
  /* ------------------------------------------------------------- aggression */
  { id: 'ag_strike',  branch: 'aggression', tier: 1, maxRank: 5, cost: 1,
    name: 'Kindling Strikes', icon: 'sword',
    desc: (r) => `Melee damage +${(r * 5)}%.`,
    effects: [{ stat: 'attackMult', per: 0.05 }] },

  { id: 'ag_spell',   branch: 'aggression', tier: 1, maxRank: 5, cost: 1,
    name: 'Open Flame', icon: 'flame',
    desc: (r) => `Fire ability damage +${(r * 6)}%.`,
    effects: [{ stat: 'abilityMult', per: 0.06 }] },

  { id: 'ag_crit',    branch: 'aggression', tier: 2, maxRank: 4, cost: 1,
    name: 'Weak Point Scan', icon: 'crosshair',
    desc: (r) => `Critical chance +${(r * 3)}%.`,
    effects: [{ stat: 'critChance', per: 0.03 }] },

  { id: 'ag_burn',    branch: 'aggression', tier: 2, maxRank: 4, cost: 1,
    name: 'Slow Burn', icon: 'ember',
    desc: (r) => `Burn damage +${(r * 15)}% and lasts ${(r * 0.4).toFixed(1)}s longer.`,
    effects: [{ stat: 'burnMult', per: 0.15 }, { stat: 'burnDuration', per: 0.4 }] },

  { id: 'ag_critdmg', branch: 'aggression', tier: 3, maxRank: 3, cost: 2,
    name: 'Overkill', icon: 'burst',
    desc: (r) => `Critical damage +${(r * 20)}%.`,
    effects: [{ stat: 'critMult', per: 0.20 }] },

  { id: 'ag_momentum', branch: 'aggression', tier: 3, maxRank: 3, cost: 2,
    name: 'Momentum', icon: 'chevron',
    desc: (r) => `Each combo hit adds +${(r * 4)}% damage to the next, up to 3 stacks.`,
    effects: [{ stat: 'comboRamp', per: 0.04 }] },

  { id: 'ag_ult',     branch: 'aggression', tier: 4, maxRank: 3, cost: 2,
    name: 'Ascendant Hunger', icon: 'star',
    desc: (r) => `Ultimate charges ${(r * 18)}% faster.`,
    effects: [{ stat: 'ultGainMult', per: 0.18 }] },

  { id: 'ag_capstone', branch: 'aggression', tier: 4, maxRank: 1, cost: 3,
    name: 'CAPSTONE — Wildfire', icon: 'nova',
    desc: () => 'Killing a burning enemy spreads Burn to everything near it and refunds 8 mana.',
    effects: [{ flag: 'wildfire' }] },

  /* ------------------------------------------------------------------ speed */
  { id: 'sp_move',    branch: 'speed', tier: 1, maxRank: 5, cost: 1,
    name: 'Light Frame', icon: 'boot',
    desc: (r) => `Movement speed +${(r * 4)}%.`,
    effects: [{ stat: 'moveSpeedMult', per: 0.04 }] },

  { id: 'sp_stam',    branch: 'speed', tier: 1, maxRank: 5, cost: 1,
    name: 'Second Wind', icon: 'lung',
    desc: (r) => `Max stamina +${(r * 8)} and stamina regen +${(r * 8)}%.`,
    effects: [{ stat: 'staminaMax', per: 8 }, { stat: 'staminaRegenMult', per: 0.08 }] },

  { id: 'sp_cdr',     branch: 'speed', tier: 2, maxRank: 4, cost: 1,
    name: 'Heat Cycling', icon: 'cycle',
    desc: (r) => `Ability cooldowns −${(r * 5)}%.`,
    effects: [{ stat: 'cooldownMult', per: -0.05 }] },

  { id: 'sp_roll',    branch: 'speed', tier: 2, maxRank: 3, cost: 1,
    name: 'Ghost Step', icon: 'ghost',
    desc: (r) => `Roll invulnerability +${(r * 0.05).toFixed(2)}s and rolls cost ${(r * 15)}% less stamina.`,
    effects: [{ stat: 'rollIframes', per: 0.05 }, { stat: 'rollCostMult', per: -0.15 }] },

  { id: 'sp_djump',   branch: 'speed', tier: 3, maxRank: 1, cost: 2,
    name: 'Updraft', icon: 'wing',
    desc: () => 'Gain a second jump. Air attacks refresh it once per landing.',
    effects: [{ flag: 'doubleJump' }, { stat: 'airJumps', per: 1 }] },

  { id: 'sp_airdash', branch: 'speed', tier: 3, maxRank: 2, cost: 2,
    name: 'Slipstream', icon: 'dash',
    desc: (r) => `Flame Dash gains ${r} extra charge${r > 1 ? 's' : ''} and can be used in the air.`,
    effects: [{ stat: 'dashCharges', per: 1 }, { flag: 'airDash' }] },

  { id: 'sp_sprint',  branch: 'speed', tier: 4, maxRank: 3, cost: 2,
    name: 'Afterburner', icon: 'jet',
    desc: (r) => `Sprint speed +${(r * 7)}% and sprinting costs no stamina for the first ${(r * 1.2).toFixed(1)}s.`,
    effects: [{ stat: 'sprintMult', per: 0.07 }, { stat: 'sprintGrace', per: 1.2 }] },

  { id: 'sp_capstone', branch: 'speed', tier: 4, maxRank: 1, cost: 3,
    name: 'CAPSTONE — Perpetual', icon: 'infinity',
    desc: () => 'Landing a killing blow refunds one dash charge and resets your air jump.',
    effects: [{ flag: 'perpetual' }] },

  /* ---------------------------------------------------------------- control */
  { id: 'co_hp',      branch: 'control', tier: 1, maxRank: 5, cost: 1,
    name: 'Reinforced Core', icon: 'heart',
    desc: (r) => `Max health +${(r * 6)}%.`,
    effects: [{ stat: 'hpMult', per: 0.06 }] },

  { id: 'co_mana',    branch: 'control', tier: 1, maxRank: 5, cost: 1,
    name: 'Deep Well', icon: 'drop',
    desc: (r) => `Max mana +${(r * 8)} and mana regen +${(r * 8)}%.`,
    effects: [{ stat: 'manaMax', per: 8 }, { stat: 'manaRegenMult', per: 0.08 }] },

  { id: 'co_block',   branch: 'control', tier: 2, maxRank: 4, cost: 1,
    name: 'Bulwark', icon: 'shield',
    desc: (r) => `Blocked damage reduced by a further ${(r * 5)}%.`,
    effects: [{ stat: 'blockReduction', per: 0.05 }] },

  { id: 'co_parry',   branch: 'control', tier: 2, maxRank: 3, cost: 1,
    name: 'Read the Servo', icon: 'eye',
    desc: (r) => `Parry window +${(r * 0.03).toFixed(2)}s and parries restore ${(r * 6)} extra mana.`,
    effects: [{ stat: 'parryWindow', per: 0.03 }, { stat: 'parryMana', per: 6 }] },

  { id: 'co_leech',   branch: 'control', tier: 3, maxRank: 3, cost: 2,
    name: 'Emberfeed', icon: 'leech',
    desc: (r) => `Heal for ${(r * 1.5).toFixed(1)}% of the damage you deal.`,
    effects: [{ stat: 'lifesteal', per: 0.015 }] },

  { id: 'co_style',   branch: 'control', tier: 3, maxRank: 3, cost: 2,
    name: 'Showmanship', icon: 'flair',
    desc: (r) => `Style gain +${(r * 12)}% and the meter decays ${(r * 15)}% slower.`,
    effects: [{ stat: 'styleGainMult', per: 0.12 }, { stat: 'styleDecayMult', per: -0.15 }] },

  { id: 'co_potion',  branch: 'control', tier: 4, maxRank: 3, cost: 2,
    name: 'Field Chemistry', icon: 'flask',
    desc: (r) => `Potions heal ${(r * 15)}% more and you can carry ${r} more.`,
    effects: [{ stat: 'potionPowerMult', per: 0.15 }, { stat: 'potionCap', per: 1 }] },

  { id: 'co_capstone', branch: 'control', tier: 4, maxRank: 1, cost: 3,
    name: 'CAPSTONE — Last Ember', icon: 'phoenix',
    desc: () => 'Once per stage, a killing blow instead leaves you at 1 HP with 2s of invulnerability and a full ultimate.',
    effects: [{ flag: 'lastEmber' }] }
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export const SKILLS_BY_BRANCH = (branch) =>
  SKILLS.filter((s) => s.branch === branch).sort((a, b) => a.tier - b.tier);
