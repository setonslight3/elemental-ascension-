/**
 * Loot.js — item generation and drop rolling.
 *
 * Rules that keep the loot table from collapsing into noise:
 *  - An item never rolls the same affix twice.
 *  - Affixes are filtered by slot, so a Sigil can't roll "Max Stamina".
 *  - Rarity decides both the affix count and a power multiplier, so a
 *    legendary is meaningfully better than a rare of the same item level.
 *  - Uniques are hand-authored and gated behind a minimum stage, so they read
 *    as landmarks rather than another random drop.
 */

import { BASES, AFFIXES, PREFIXES, SUFFIXES, UNIQUES } from '../data/Items.js';
import { RARITY, LOOT, ENEMY_SCALING, REWARDS } from '../data/Balance.js';
import { rnd } from '../utils/Rand.js';

const SLOT_IDS = ['weapon', 'armour', 'relic'];

function rollRarity(stage, bias = 0) {
  const weights = LOOT.weights(stage);
  if (bias > 0) {
    // Elites and bosses tilt the table upward without ever guaranteeing.
    weights.common *= Math.max(0.05, 1 - bias * 0.9);
    weights.uncommon *= Math.max(0.2, 1 - bias * 0.5);
    weights.rare *= 1 + bias * 1.1;
    weights.epic *= 1 + bias * 2.2;
    weights.legendary *= 1 + bias * 4;
  }
  return rnd.weighted(weights) || 'common';
}

function rollAffixes(slot, rarity, ilvl) {
  const count = RARITY.affixes[rarity];
  const pool = AFFIXES.filter((a) => a.slots.includes(slot));
  const picked = [];
  const used = new Set();
  const power = RARITY.power[rarity];

  for (let i = 0; i < count && used.size < pool.length; i++) {
    let affix = null;
    let guard = 0;
    do {
      affix = rnd.pick(pool);
      guard++;
    } while (used.has(affix.id) && guard < 40);
    if (used.has(affix.id)) break;
    used.add(affix.id);

    const roll = rnd.range(affix.min, affix.max);
    const scaled = (roll + affix.scale * (ilvl - 1)) * power;
    // Keep more decimals on the tiny stats (life steal) than the big ones.
    const rounded = Math.abs(scaled) < 0.1
      ? Math.round(scaled * 10000) / 10000
      : Math.round(scaled * 1000) / 1000;
    picked.push({ id: affix.id, value: rounded });
  }
  return picked;
}

function nameFor(base, rarity, affixes) {
  const idx = RARITY.order.indexOf(rarity);
  if (idx <= 0) return base.name;
  if (idx === 1) return `${rnd.pick(PREFIXES)} ${base.name}`;
  if (idx === 2) return `${base.name} ${rnd.pick(SUFFIXES)}`;
  return `${rnd.pick(PREFIXES)} ${base.name} ${rnd.pick(SUFFIXES)}`;
}

/**
 * Roll a fresh item.
 * @param {object} opts
 * @param {number} opts.stage       stage index, drives item level and rarity
 * @param {string} [opts.slot]      force a slot
 * @param {string} [opts.rarity]    force a rarity
 * @param {number} [opts.bias]      0..1 upward pressure on the rarity table
 * @param {boolean} [opts.allowUnique]
 */
export function generateItem(opts = {}) {
  const stage = opts.stage ?? 1;
  const slot = opts.slot ?? rnd.pick(SLOT_IDS);
  const bias = opts.bias ?? 0;
  const rarity = opts.rarity ?? rollRarity(stage, bias);
  const ilvl = Math.max(1, Math.round(stage + rnd.range(-1, 2)));

  // Unique roll: only from legendary drops, only if the stage is deep enough.
  if (opts.allowUnique !== false && rarity === 'legendary') {
    const eligible = UNIQUES.filter((u) => u.slot === slot && stage >= u.minStage);
    if (eligible.length && rnd.chance(0.45)) {
      const u = rnd.pick(eligible);
      return {
        uid: null,
        slot,
        base: u.base,
        uniqueId: u.id,
        name: u.name,
        rarity: 'legendary',
        ilvl,
        upgrade: 0,
        affixes: [],
        flavour: u.flavour,
        uniqueText: u.unique
      };
    }
  }

  const base = rnd.pick(BASES[slot]);
  const affixes = rollAffixes(slot, rarity, ilvl);

  return {
    uid: null,
    slot,
    base: base.id,
    name: nameFor(base, rarity, affixes),
    rarity,
    ilvl,
    upgrade: 0,
    affixes,
    flavour: base.flavour
  };
}

/**
 * What an enemy leaves behind.
 * @returns {{items: object[], ember: number, shards: number, xp: number}}
 */
export function rollEnemyDrop(archetype, stage, { elite = false, boss = false } = {}) {
  const out = { items: [], ember: 0, shards: 0, xp: archetype.xp || 10 };

  if (boss) {
    for (let i = 0; i < LOOT.bossDrops; i++) {
      out.items.push(generateItem({ stage, bias: 0.75 }));
    }
    out.ember = Math.round(REWARDS.baseEmber(stage) * 1.4);
    out.shards = REWARDS.shardsPerBoss;
    out.xp = archetype.xp;
    return out;
  }

  const chance = elite ? LOOT.eliteDropChance : LOOT.dropChance;
  if (rnd.chance(chance)) {
    out.items.push(generateItem({ stage, bias: elite ? 0.45 : 0 }));
  }
  out.ember = Math.round((6 + stage * 2.2) * (elite ? 2.6 : 1) * rnd.range(0.8, 1.25));
  if (elite && rnd.chance(REWARDS.shardChanceElite)) out.shards = 1;
  if (elite) out.xp = Math.round(out.xp * 2.3);
  return out;
}

/** Should this spawn be an elite? */
export function rollElite(stage) {
  return rnd.chance(ENEMY_SCALING.eliteChance(stage));
}

/** Short one-line summary used in the results screen and toasts. */
export function itemSummary(item) {
  const base = (BASES[item.slot] || []).find((b) => b.id === item.base);
  return `${item.name}${item.upgrade ? ` +${item.upgrade}` : ''} — ${base ? base.name : item.slot} (i${item.ilvl})`;
}
