/**
 * Profile.js — the live player account.
 *
 * One instance exists for the whole session (see Game.js). Scenes read from it
 * and call its mutators; it debounce-saves and re-derives stats on change.
 * Nothing else is allowed to write into the raw save object, which keeps
 * "where did my ember go?" answerable.
 */

import { loadProfile, saveProfile, saveProfileNow, freshProfile, deleteProfile } from './Save.js';
import { deriveStats } from './Stats.js';
import { PLAYER, PROGRESSION, SHOP, RARITY, LOOT } from '../data/Balance.js';
import { SKILL_BY_ID, tierRequirement } from '../data/Skills.js';
import { getStage, STAGES } from '../data/Stages.js';
import { ABILITIES } from '../data/Balance.js';

export class Profile {
  constructor(data) {
    this.data = data || loadProfile();
    this._stats = null;
    this._listeners = new Map();
    this._sessionStart = Date.now();
  }

  /* --------------------------------------------------------------- events */

  on(evt, fn) {
    if (!this._listeners.has(evt)) this._listeners.set(evt, new Set());
    this._listeners.get(evt).add(fn);
    return () => this.off(evt, fn);
  }

  off(evt, fn) { this._listeners.get(evt)?.delete(fn); }

  emit(evt, payload) {
    const set = this._listeners.get(evt);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.error(`[profile] listener for "${evt}" threw`, err); }
    }
  }

  /* ---------------------------------------------------------------- stats */

  get stats() {
    if (!this._stats) this._stats = deriveStats(this.data);
    return this._stats;
  }

  invalidate() {
    this._stats = null;
    this.emit('change', this.data);
  }

  touch(immediate = false) {
    this.data.playtimeMs = (this.data.playtimeMs || 0) + (Date.now() - this._sessionStart);
    this._sessionStart = Date.now();
    this.invalidate();
    if (immediate) saveProfileNow(this.data); else saveProfile(this.data);
  }

  /* ------------------------------------------------------------ progression */

  get level() { return this.data.level; }
  get xp() { return this.data.xp; }

  xpIntoLevel() {
    const cur = PROGRESSION.xpForLevel(this.data.level);
    return Math.max(0, this.data.xp - cur);
  }

  xpForNextLevel() {
    if (this.data.level >= PLAYER.MAX_LEVEL) return 0;
    return PROGRESSION.xpForLevel(this.data.level + 1) - PROGRESSION.xpForLevel(this.data.level);
  }

  /** @returns {{levels:number, points:number}} */
  addXp(amount) {
    if (!(amount > 0)) return { levels: 0, points: 0 };
    this.data.xp += Math.round(amount);
    let levels = 0;
    let points = 0;
    while (
      this.data.level < PLAYER.MAX_LEVEL &&
      this.data.xp >= PROGRESSION.xpForLevel(this.data.level + 1)
    ) {
      this.data.level++;
      levels++;
      points += PROGRESSION.SKILL_POINTS_PER_LEVEL;
    }
    if (points) this.data.skillPoints += points;
    if (levels) this.emit('levelup', { level: this.data.level, levels, points });
    this.touch();
    return { levels, points };
  }

  addEmber(amount) {
    this.data.ember = Math.max(0, this.data.ember + Math.round(amount));
    this.touch();
  }

  addShards(amount) {
    this.data.shards = Math.max(0, this.data.shards + Math.round(amount));
    this.touch();
  }

  spend(ember = 0, shards = 0) {
    if (this.data.ember < ember || this.data.shards < shards) return false;
    this.data.ember -= ember;
    this.data.shards -= shards;
    this.touch();
    return true;
  }

  /* -------------------------------------------------------------- potions */

  get potionCap() { return this.stats.potionCap; }

  buyPotion() {
    if (this.data.potions >= this.potionCap) return { ok: false, reason: 'Potion belt is full.' };
    const price = SHOP.potionPrice(this.data.potions);
    if (this.data.ember < price) return { ok: false, reason: 'Not enough Ember.' };
    this.data.ember -= price;
    this.data.potions++;
    this.touch();
    return { ok: true, price };
  }

  consumePotion() {
    if (this.data.potions <= 0) return false;
    this.data.potions--;
    this.touch();
    return true;
  }

  /* ---------------------------------------------------------- skill tree */

  skillRank(id) { return this.data.skills[id] || 0; }

  pointsSpentIn(branch) {
    let total = 0;
    for (const [id, rank] of Object.entries(this.data.skills)) {
      const node = SKILL_BY_ID[id];
      if (node && node.branch === branch) total += node.cost * rank;
    }
    return total;
  }

  totalPointsSpent() {
    let total = 0;
    for (const [id, rank] of Object.entries(this.data.skills)) {
      const node = SKILL_BY_ID[id];
      if (node) total += node.cost * rank;
    }
    return total;
  }

  /** Why a node cannot be taken right now — null when it can. */
  skillBlockedReason(id) {
    const node = SKILL_BY_ID[id];
    if (!node) return 'Unknown skill.';
    const rank = this.skillRank(id);
    if (rank >= node.maxRank) return 'Maxed out.';
    if (this.data.skillPoints < node.cost) return `Needs ${node.cost} point${node.cost > 1 ? 's' : ''}.`;
    const need = tierRequirement(node.tier);
    const have = this.pointsSpentIn(node.branch);
    if (have < need) return `Needs ${need} points in ${node.branch} (you have ${have}).`;
    return null;
  }

  canLearn(id) { return this.skillBlockedReason(id) === null; }

  learnSkill(id) {
    if (!this.canLearn(id)) return false;
    const node = SKILL_BY_ID[id];
    this.data.skills[id] = this.skillRank(id) + 1;
    this.data.skillPoints -= node.cost;
    this.touch();
    this.emit('skill', { id, rank: this.data.skills[id] });
    return true;
  }

  respecCost() { return PROGRESSION.RESPEC_COST(this.totalPointsSpent()); }

  respec() {
    const spent = this.totalPointsSpent();
    if (spent === 0) return { ok: false, reason: 'Nothing to refund.' };
    const cost = this.respecCost();
    if (this.data.ember < cost) return { ok: false, reason: `Costs ${cost} Ember.` };
    this.data.ember -= cost;
    this.data.skillPoints += spent;
    this.data.skills = {};
    this.touch();
    this.emit('respec', { refunded: spent, cost });
    return { ok: true, refunded: spent, cost };
  }

  /* ------------------------------------------------------------ inventory */

  get inventory() { return this.data.inventory; }

  itemById(uid) { return this.data.inventory.find((i) => i.uid === uid) || null; }

  equippedItem(slot) { return this.itemById(this.data.equipped[slot]); }

  nextItemUid() { return `i${this.data.itemSeq++}`; }

  /**
   * Add an item. If the bag is full the *worst* item is auto-salvaged rather
   * than silently dropping the new one — the player always keeps the best 60.
   * @returns {{item:object, salvaged:object|null, ember:number}}
   */
  addItem(item) {
    item.uid = item.uid || this.nextItemUid();
    this.data.inventory.push(item);
    this.data.metrics.itemsFound++;

    let salvaged = null;
    let ember = 0;
    if (this.data.inventory.length > LOOT.INVENTORY_CAP) {
      const equipped = new Set(Object.values(this.data.equipped));
      const candidates = this.data.inventory
        .filter((i) => !equipped.has(i.uid) && i.uid !== item.uid)
        .sort((a, b) => RARITY.order.indexOf(a.rarity) - RARITY.order.indexOf(b.rarity) || a.ilvl - b.ilvl);
      if (candidates.length) {
        salvaged = candidates[0];
        ember = this.salvageValue(salvaged);
        this.removeItem(salvaged.uid);
        this.data.ember += ember;
      }
    }
    this.touch();
    return { item, salvaged, ember };
  }

  removeItem(uid) {
    const idx = this.data.inventory.findIndex((i) => i.uid === uid);
    if (idx === -1) return false;
    for (const slot of Object.keys(this.data.equipped)) {
      if (this.data.equipped[slot] === uid) this.data.equipped[slot] = null;
    }
    this.data.inventory.splice(idx, 1);
    this.touch();
    return true;
  }

  equip(uid) {
    const item = this.itemById(uid);
    if (!item) return false;
    this.data.equipped[item.slot] = uid;
    this.touch();
    this.emit('equip', item);
    return true;
  }

  unequip(slot) {
    if (!this.data.equipped[slot]) return false;
    this.data.equipped[slot] = null;
    this.touch();
    return true;
  }

  salvageValue(item) {
    const base = SHOP.salvageValue[item.rarity] || 20;
    return Math.round(base * (1 + (item.ilvl || 1) * 0.06) + (item.upgrade || 0) * 40);
  }

  salvage(uid) {
    const item = this.itemById(uid);
    if (!item) return { ok: false, reason: 'No such item.' };
    if (Object.values(this.data.equipped).includes(uid)) {
      return { ok: false, reason: 'Unequip it first.' };
    }
    const value = this.salvageValue(item);
    this.removeItem(uid);
    this.data.ember += value;
    this.touch();
    return { ok: true, ember: value };
  }

  /** Salvage everything not equipped and at or below `maxRarity`. */
  salvageBulk(maxRarity = 'uncommon') {
    const cutoff = RARITY.order.indexOf(maxRarity);
    const equipped = new Set(Object.values(this.data.equipped));
    const doomed = this.data.inventory.filter(
      (i) => !equipped.has(i.uid) && RARITY.order.indexOf(i.rarity) <= cutoff
    );
    let ember = 0;
    for (const item of doomed) {
      ember += this.salvageValue(item);
      this.removeItem(item.uid);
    }
    if (ember) this.data.ember += ember;
    this.touch();
    return { count: doomed.length, ember };
  }

  upgradeCost(item) {
    const lvl = item.upgrade || 0;
    return { ember: SHOP.upgradeCost(lvl), shards: SHOP.upgradeShards(lvl), maxed: lvl >= 5 };
  }

  upgradeItem(uid) {
    const item = this.itemById(uid);
    if (!item) return { ok: false, reason: 'No such item.' };
    const cost = this.upgradeCost(item);
    if (cost.maxed) return { ok: false, reason: 'Already at +5.' };
    if (this.data.ember < cost.ember) return { ok: false, reason: `Costs ${cost.ember} Ember.` };
    if (this.data.shards < cost.shards) return { ok: false, reason: `Costs ${cost.shards} Shards.` };
    this.data.ember -= cost.ember;
    this.data.shards -= cost.shards;
    item.upgrade = (item.upgrade || 0) + 1;
    this.touch();
    return { ok: true, level: item.upgrade };
  }

  /* ---------------------------------------------------------------- stages */

  stageRecord(index) {
    return this.data.stages[index] || { cleared: 0, bestGrade: null, bestTimeMs: null, flawless: false };
  }

  isStageUnlocked(index) { return index <= this.data.highestUnlocked; }

  /** Reward scaling for repeat clears — first clear pays full. */
  replayMultiplier(index) {
    const cleared = this.stageRecord(index).cleared;
    if (cleared === 0) return 1;
    const decayed = PROGRESSION.REPLAY_REWARD * Math.pow(PROGRESSION.REPLAY_DECAY, cleared - 1);
    return Math.max(PROGRESSION.REPLAY_FLOOR, decayed);
  }

  recordClear(index, { grade, timeMs, flawless }) {
    const rec = this.stageRecord(index);
    const gradeOrder = ['C', 'B', 'A', 'S', 'SS', 'SSS'];
    const better = !rec.bestGrade || gradeOrder.indexOf(grade) > gradeOrder.indexOf(rec.bestGrade);
    const next = {
      cleared: rec.cleared + 1,
      bestGrade: better ? grade : rec.bestGrade,
      bestTimeMs: rec.bestTimeMs == null ? timeMs : Math.min(rec.bestTimeMs, timeMs),
      flawless: rec.flawless || !!flawless
    };
    this.data.stages[index] = next;
    if (rec.cleared === 0) this.data.metrics.stagesCleared++;

    const stage = getStage(index);
    let unlockedAbility = null;
    if (stage?.unlocks?.ability && !this.data.abilities.includes(stage.unlocks.ability)) {
      this.data.abilities.push(stage.unlocks.ability);
      unlockedAbility = ABILITIES[stage.unlocks.ability];
    }

    let bossPoints = 0;
    if (stage?.boss && rec.cleared === 0) {
      this.data.metrics.bossKills++;
      bossPoints = PROGRESSION.SKILL_POINTS_PER_BOSS;
      this.data.skillPoints += bossPoints;
    }

    let newStage = null;
    if (index === this.data.highestUnlocked && index < STAGES.length) {
      this.data.highestUnlocked = index + 1;
      newStage = getStage(this.data.highestUnlocked);
    }

    this.touch(true);
    return { record: next, unlockedAbility, newStage, bossPoints, firstClear: rec.cleared === 0 };
  }

  recordDeath() {
    this.data.metrics.deaths++;
    this.touch();
  }

  addMetrics(patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (typeof v !== 'number') continue;
      if (k === 'bestCombo') this.data.metrics.bestCombo = Math.max(this.data.metrics.bestCombo, v);
      else this.data.metrics[k] = (this.data.metrics[k] || 0) + v;
    }
    this.touch();
  }

  /* -------------------------------------------------------------- settings */

  get settings() { return this.data.settings; }

  setSetting(key, value) {
    this.data.settings[key] = value;
    this.touch();
    this.emit('setting', { key, value });
  }

  /* ------------------------------------------------------------------ misc */

  get unlockedAbilities() {
    return this.data.abilities.filter((id) => ABILITIES[id]);
  }

  reset() {
    deleteProfile();
    this.data = freshProfile();
    this.touch(true);
    this.emit('reset');
  }

  replaceWith(profileData) {
    this.data = profileData;
    this.touch(true);
    this.emit('reset');
  }

  /** Fraction of the campaign completed, for the hub display. */
  completion() {
    const cleared = Object.values(this.data.stages).filter((s) => s.cleared > 0).length;
    return cleared / STAGES.length;
  }
}
