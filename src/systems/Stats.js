/**
 * Stats.js — folds level, skill tree and equipment into one derived stat block.
 *
 * Everything that wants to know "how much damage does a jab do right now" asks
 * this module. Gear affixes and skill nodes use the same stat keys, so both
 * flow through a single accumulator and there is exactly one place where a
 * bonus can go missing.
 */

import { PLAYER, BURN, ULTIMATE } from '../data/Balance.js';
import { SKILL_BY_ID } from '../data/Skills.js';
import { BASES, AFFIX_BY_ID, UNIQUES } from '../data/Items.js';

const UNIQUE_BY_ID = Object.fromEntries(UNIQUES.map((u) => [u.id, u]));

/** Keys whose default is a plain starting value that bonuses add onto. */
function defaults(level) {
  return {
    // offence
    attackMult: 1,
    abilityMult: 1,
    burnMult: 1,
    burnDuration: BURN.duration,
    critChance: PLAYER.BASE_CRIT_CHANCE,
    critMult: PLAYER.BASE_CRIT_MULT,
    ultGainMult: 1,
    comboRamp: 0,
    staggerMult: 1,

    // movement
    moveSpeedMult: 1,
    sprintMult: 1,
    cooldownMult: 1,
    staminaMax: PLAYER.BASE_STAMINA,
    staminaRegenMult: 1,
    rollIframes: PLAYER.ROLL_IFRAMES,
    rollCostMult: 1,
    airJumps: 0,
    dashCharges: 1,
    sprintGrace: 0,

    // survival / resources
    hpMult: 1,
    manaMax: PLAYER.BASE_MANA + PLAYER.MANA_PER_LEVEL * (level - 1),
    manaRegenMult: 1,
    manaOnHit: PLAYER.MANA_ON_HIT,
    blockReduction: 0,
    parryWindow: PLAYER.PARRY_WINDOW,
    parryMana: PLAYER.MANA_ON_PARRY,
    lifesteal: 0,
    potionPowerMult: 1,
    potionCap: 5,

    // meta
    styleGainMult: 1,
    styleDecayMult: 1,
    emberFind: 1
  };
}

/** Item upgrade levels scale every roll on the item by this much. */
export const UPGRADE_STEP = 0.08;

/** Total contribution of a single item, as { statKey: delta }. */
export function itemStats(item) {
  const out = {};
  if (!item) return out;
  const add = (stat, value) => { out[stat] = (out[stat] || 0) + value; };

  const upgradeMult = 1 + (item.upgrade || 0) * UPGRADE_STEP;

  if (item.uniqueId && UNIQUE_BY_ID[item.uniqueId]) {
    for (const f of UNIQUE_BY_ID[item.uniqueId].fixed) add(f.stat, f.value * upgradeMult);
  } else {
    const base = (BASES[item.slot] || []).find((b) => b.id === item.base);
    if (base) add(base.implicit.stat, base.implicit.value * upgradeMult);
  }

  for (const aff of item.affixes || []) {
    if (!AFFIX_BY_ID[aff.id]) continue;
    add(AFFIX_BY_ID[aff.id].stat, aff.value * upgradeMult);
  }
  return out;
}

/** Item power score — used for sorting and the "is this an upgrade?" arrow. */
export function itemScore(item) {
  if (!item) return 0;
  const stats = itemStats(item);
  const weight = {
    attackMult: 100, abilityMult: 100, hpMult: 90, critChance: 120, critMult: 55,
    burnMult: 45, manaMax: 1.2, manaRegenMult: 40, staminaMax: 0.8,
    staminaRegenMult: 25, cooldownMult: -110, moveSpeedMult: 80,
    blockReduction: 60, lifesteal: 900, styleGainMult: 30, ultGainMult: 35,
    emberFind: 18, staggerMult: 25, manaOnHit: 5, parryWindow: 300
  };
  let score = 0;
  for (const [k, v] of Object.entries(stats)) score += (weight[k] ?? 20) * v;
  return Math.round(score);
}

/**
 * Build the full derived block.
 * @param {object} profile the saved profile
 * @returns {object} stats plus convenience fields (maxHp, maxMana, flags…)
 */
export function deriveStats(profile) {
  const level = profile.level || 1;
  const stats = defaults(level);
  const flags = new Set();

  // --- skill tree ---------------------------------------------------------
  for (const [id, rank] of Object.entries(profile.skills || {})) {
    const node = SKILL_BY_ID[id];
    if (!node || !rank) continue;
    const r = Math.min(rank, node.maxRank);
    for (const eff of node.effects) {
      if (eff.flag) { flags.add(eff.flag); continue; }
      stats[eff.stat] = (stats[eff.stat] ?? 0) + eff.per * r;
    }
  }

  // --- equipment ----------------------------------------------------------
  const equippedItems = [];
  for (const slot of ['weapon', 'armour', 'relic']) {
    const uid = profile.equipped?.[slot];
    if (!uid) continue;
    const item = (profile.inventory || []).find((i) => i.uid === uid);
    if (!item) continue;
    equippedItems.push(item);
    if (item.uniqueId && UNIQUE_BY_ID[item.uniqueId]?.flag) flags.add(UNIQUE_BY_ID[item.uniqueId].flag);
    for (const [k, v] of Object.entries(itemStats(item))) {
      stats[k] = (stats[k] ?? 0) + v;
    }
  }

  // --- clamps: no stat may invert its own meaning -------------------------
  stats.cooldownMult = Math.max(0.35, stats.cooldownMult);
  stats.rollCostMult = Math.max(0.3, stats.rollCostMult);
  stats.styleDecayMult = Math.max(0.35, stats.styleDecayMult);
  stats.critChance = Math.min(0.85, Math.max(0, stats.critChance));
  stats.blockReduction = Math.min(0.75, Math.max(0, stats.blockReduction));
  stats.lifesteal = Math.min(0.25, Math.max(0, stats.lifesteal));
  stats.parryWindow = Math.min(0.45, stats.parryWindow);
  stats.potionCap = Math.min(PLAYER.MAX_POTIONS, Math.round(stats.potionCap));
  stats.airJumps = Math.min(2, Math.round(stats.airJumps));
  stats.dashCharges = Math.max(1, Math.min(4, Math.round(stats.dashCharges)));

  // --- derived ------------------------------------------------------------
  const baseHp = PLAYER.BASE_HP + PLAYER.HP_PER_LEVEL * (level - 1);
  stats.maxHp = Math.round(baseHp * stats.hpMult);
  stats.maxMana = Math.round(stats.manaMax);
  stats.maxStamina = Math.round(stats.staminaMax);
  stats.attackPower = (PLAYER.BASE_ATTACK + PLAYER.ATTACK_PER_LEVEL * (level - 1)) * stats.attackMult;
  stats.abilityPower = (PLAYER.BASE_ATTACK + PLAYER.ATTACK_PER_LEVEL * (level - 1)) * stats.abilityMult;
  stats.ultimateMax = ULTIMATE.max;
  stats.flags = flags;
  stats.has = (flag) => flags.has(flag);
  stats.equippedItems = equippedItems;

  return stats;
}

/** Pretty-print a stat value for UI. */
export function formatStat(key, value) {
  const pctKeys = new Set([
    'attackMult', 'abilityMult', 'burnMult', 'critChance', 'critMult', 'ultGainMult',
    'moveSpeedMult', 'sprintMult', 'cooldownMult', 'staminaRegenMult', 'rollCostMult',
    'hpMult', 'manaRegenMult', 'blockReduction', 'styleGainMult', 'styleDecayMult',
    'lifesteal', 'potionPowerMult', 'emberFind', 'staggerMult', 'comboRamp'
  ]);
  if (pctKeys.has(key)) {
    const pct = value * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`;
  }
  if (key === 'parryWindow' || key === 'rollIframes' || key === 'sprintGrace' || key === 'burnDuration') {
    return `+${value.toFixed(2)}s`;
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${Math.round(value * 10) / 10}`;
}
