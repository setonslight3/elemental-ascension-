/**
 * Items.js — equipment bases, affix pool and naming.
 *
 * An item instance is plain JSON so it saves and loads for free:
 *   { uid, slot, base, rarity, ilvl, upgrade, affixes: [{ id, value }] }
 *
 * Affix stat keys deliberately match the skill-tree stat keys, so Stats.js can
 * fold gear and skills through exactly the same accumulator.
 */

export const SLOTS = [
  { id: 'weapon', name: 'Gauntlet', icon: 'fist' },
  { id: 'armour', name: 'Core',     icon: 'core' },
  { id: 'relic',  name: 'Sigil',    icon: 'sigil' }
];

/** Each base carries an implicit stat that defines its identity. */
export const BASES = {
  weapon: [
    { id: 'searing_fist',  name: 'Searing Fist',  implicit: { stat: 'attackMult',   value: 0.10 }, flavour: 'Plate knuckles that glow between hits.' },
    { id: 'cinder_claw',   name: 'Cinder Claw',   implicit: { stat: 'critChance',   value: 0.05 }, flavour: 'Four blades, all of them hungry.' },
    { id: 'forge_hammer',  name: 'Forge Hammer',  implicit: { stat: 'staggerMult',  value: 0.25 }, flavour: 'Heavy enough to make a Brute reconsider.' },
    { id: 'ember_talon',   name: 'Ember Talon',   implicit: { stat: 'burnMult',     value: 0.22 }, flavour: 'Leaves embers in the wound.' },
    { id: 'ashen_edge',    name: 'Ashen Edge',    implicit: { stat: 'abilityMult',  value: 0.12 }, flavour: 'Channels flame better than it cuts.' }
  ],
  armour: [
    { id: 'slag_plating',  name: 'Slag Plating',  implicit: { stat: 'hpMult',           value: 0.10 }, flavour: 'Ugly. Effective.' },
    { id: 'kiln_harness',  name: 'Kiln Harness',  implicit: { stat: 'staminaMax',       value: 20   }, flavour: 'Built for people who never stop moving.' },
    { id: 'coolant_weave', name: 'Coolant Weave', implicit: { stat: 'blockReduction',   value: 0.08 }, flavour: 'Salvaged from the works. Still cold.' },
    { id: 'furnace_shell', name: 'Furnace Shell', implicit: { stat: 'manaRegenMult',    value: 0.18 }, flavour: 'Runs hot on purpose.' },
    { id: 'phoenix_mail',  name: 'Phoenix Mail',  implicit: { stat: 'lifesteal',        value: 0.012 }, flavour: 'Feeds on what you burn.' }
  ],
  relic: [
    { id: 'flame_sigil',   name: 'Flame Sigil',   implicit: { stat: 'abilityMult',   value: 0.14 }, flavour: 'Old mark of the first ascendant.' },
    { id: 'swift_sigil',   name: 'Swift Sigil',   implicit: { stat: 'moveSpeedMult', value: 0.08 }, flavour: 'Weightless in the hand.' },
    { id: 'aegis_sigil',   name: 'Aegis Sigil',   implicit: { stat: 'parryWindow',   value: 0.04 }, flavour: 'Slows the world by a hair.' },
    { id: 'greed_sigil',   name: 'Greed Sigil',   implicit: { stat: 'emberFind',     value: 0.20 }, flavour: 'Finds the shine in the scrap.' },
    { id: 'style_sigil',   name: 'Vanity Sigil',  implicit: { stat: 'styleGainMult', value: 0.18 }, flavour: 'Winning is not enough.' }
  ]
};

/**
 * Affix pool. `min`/`max` are rolled at ilvl 1 and scale with item level.
 * `pct: true` items are displayed as percentages.
 */
export const AFFIXES = [
  { id: 'atk',      stat: 'attackMult',      name: 'Melee Damage',    min: 0.03, max: 0.08,  scale: 0.004, pct: true,  slots: ['weapon', 'relic'] },
  { id: 'abl',      stat: 'abilityMult',     name: 'Ability Damage',  min: 0.04, max: 0.09,  scale: 0.005, pct: true,  slots: ['weapon', 'relic'] },
  { id: 'crit',     stat: 'critChance',      name: 'Crit Chance',     min: 0.02, max: 0.05,  scale: 0.002, pct: true,  slots: ['weapon', 'relic'] },
  { id: 'critdmg',  stat: 'critMult',        name: 'Crit Damage',     min: 0.08, max: 0.18,  scale: 0.01,  pct: true,  slots: ['weapon', 'relic'] },
  { id: 'burn',     stat: 'burnMult',        name: 'Burn Damage',     min: 0.08, max: 0.20,  scale: 0.012, pct: true,  slots: ['weapon', 'relic'] },
  { id: 'hp',       stat: 'hpMult',          name: 'Max Health',      min: 0.04, max: 0.09,  scale: 0.005, pct: true,  slots: ['armour', 'relic'] },
  { id: 'mana',     stat: 'manaMax',         name: 'Max Mana',        min: 5,    max: 14,    scale: 0.9,   pct: false, slots: ['armour', 'relic'] },
  { id: 'manareg',  stat: 'manaRegenMult',   name: 'Mana Regen',      min: 0.06, max: 0.16,  scale: 0.009, pct: true,  slots: ['armour', 'relic'] },
  { id: 'stam',     stat: 'staminaMax',      name: 'Max Stamina',     min: 6,    max: 16,    scale: 1.0,   pct: false, slots: ['armour'] },
  { id: 'stamreg',  stat: 'staminaRegenMult',name: 'Stamina Regen',   min: 0.06, max: 0.15,  scale: 0.008, pct: true,  slots: ['armour'] },
  { id: 'cdr',      stat: 'cooldownMult',    name: 'Cooldown Reduction', min: -0.10, max: -0.03, scale: -0.004, pct: true, slots: ['relic', 'armour'] },
  { id: 'speed',    stat: 'moveSpeedMult',   name: 'Move Speed',      min: 0.02, max: 0.06,  scale: 0.003, pct: true,  slots: ['armour', 'relic'] },
  { id: 'block',    stat: 'blockReduction',  name: 'Block Efficiency',min: 0.03, max: 0.08,  scale: 0.004, pct: true,  slots: ['armour'] },
  { id: 'leech',    stat: 'lifesteal',       name: 'Life Steal',      min: 0.006,max: 0.018, scale: 0.001, pct: true,  slots: ['weapon', 'armour'] },
  { id: 'style',    stat: 'styleGainMult',   name: 'Style Gain',      min: 0.06, max: 0.16,  scale: 0.008, pct: true,  slots: ['relic'] },
  { id: 'ult',      stat: 'ultGainMult',     name: 'Ultimate Charge', min: 0.06, max: 0.15,  scale: 0.008, pct: true,  slots: ['relic', 'weapon'] },
  { id: 'ember',    stat: 'emberFind',       name: 'Ember Find',      min: 0.06, max: 0.18,  scale: 0.01,  pct: true,  slots: ['relic'] },
  { id: 'stagger',  stat: 'staggerMult',     name: 'Stagger Power',   min: 0.08, max: 0.20,  scale: 0.011, pct: true,  slots: ['weapon'] },
  { id: 'onhit',    stat: 'manaOnHit',       name: 'Mana on Hit',     min: 0.5,  max: 1.6,   scale: 0.09,  pct: false, slots: ['weapon'] }
];

export const AFFIX_BY_ID = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));

/** Flavour naming: rarity picks how many name parts an item gets. */
export const PREFIXES = [
  'Scorched', 'Molten', 'Ashen', 'Blazing', 'Riven', 'Tempered', 'Volcanic',
  'Sundered', 'Radiant', 'Charred', 'Kindled', 'Searing', 'Obsidian', 'Gilded'
];

export const SUFFIXES = [
  'of the Furnace', 'of Cinders', 'of the First Flame', 'of Ruin', 'of Ascent',
  'of the Kiln', 'of Wildfire', 'of the Ember Court', 'of Slag', 'of Dawnbreak',
  'of the Long Burn', 'of Quenching'
];

/** Hand-authored legendaries: guaranteed identity rather than random noise. */
export const UNIQUES = [
  {
    id: 'uq_pyreclasp', slot: 'weapon', base: 'ember_talon', name: 'Pyreclasp',
    flavour: '"It only ever asked for more."',
    minStage: 8,
    fixed: [{ stat: 'burnMult', value: 0.75 }, { stat: 'attackMult', value: 0.18 }],
    unique: 'Burn stacks twice as high on you and your enemies alike.',
    flag: 'pyreclasp'
  },
  {
    id: 'uq_stillheart', slot: 'armour', base: 'coolant_weave', name: 'Stillheart',
    flavour: '"Quench Protocol, repurposed."',
    minStage: 10,
    fixed: [{ stat: 'blockReduction', value: 0.22 }, { stat: 'parryWindow', value: 0.05 }],
    unique: 'Perfect parries also refund a dash charge.',
    flag: 'stillheart'
  },
  {
    id: 'uq_lastlight', slot: 'relic', base: 'flame_sigil', name: 'Last Light',
    flavour: '"Carried by the one who did not come back."',
    minStage: 14,
    fixed: [{ stat: 'abilityMult', value: 0.35 }, { stat: 'ultGainMult', value: 0.3 }],
    unique: 'Below 35% health, ability damage is doubled.',
    flag: 'lastlight'
  },
  {
    id: 'uq_ascendant', slot: 'relic', base: 'style_sigil', name: 'Crown of Ascent',
    flavour: '"Worn only by whoever is winning."',
    minStage: 18,
    fixed: [{ stat: 'styleGainMult', value: 0.5 }, { stat: 'attackMult', value: 0.15 }, { stat: 'abilityMult', value: 0.15 }],
    unique: 'At rank S or above, all damage is increased by 25%.',
    flag: 'ascendant'
  }
];

/** Human-readable label for a stat key. */
export const STAT_LABEL = {
  attackMult: 'Melee Damage', abilityMult: 'Ability Damage', burnMult: 'Burn Damage',
  critChance: 'Crit Chance', critMult: 'Crit Damage', ultGainMult: 'Ultimate Charge',
  moveSpeedMult: 'Move Speed', sprintMult: 'Sprint Speed', cooldownMult: 'Cooldowns',
  staminaMax: 'Max Stamina', staminaRegenMult: 'Stamina Regen', rollIframes: 'Roll I-Frames',
  rollCostMult: 'Roll Cost', airJumps: 'Air Jumps', dashCharges: 'Dash Charges',
  sprintGrace: 'Free Sprint', hpMult: 'Max Health', manaMax: 'Max Mana',
  manaRegenMult: 'Mana Regen', manaOnHit: 'Mana on Hit', blockReduction: 'Block Efficiency',
  parryWindow: 'Parry Window', parryMana: 'Parry Mana', styleGainMult: 'Style Gain',
  styleDecayMult: 'Style Decay', lifesteal: 'Life Steal', potionPowerMult: 'Potion Power',
  potionCap: 'Potion Capacity', emberFind: 'Ember Find', staggerMult: 'Stagger Power',
  comboRamp: 'Combo Ramp', burnDuration: 'Burn Duration'
};

/** Stats where a lower number is the good number. */
export const LOWER_IS_BETTER = new Set(['cooldownMult', 'rollCostMult', 'styleDecayMult']);
