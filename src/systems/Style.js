/**
 * Style.js — the C → B → A → S → SS → SSS meter.
 *
 * The blueprint asks for a style rank but not for what stops it being free.
 * Three rules do that work here:
 *
 *  1. **Repetition tax.** Points are scaled down for each recent use of the
 *     same move, so mashing one button plateaus at a low rank while varied
 *     play climbs. This is the difference between a style meter and a hit
 *     counter.
 *  2. **Decay.** Standing still bleeds the meter, so rank reflects what you
 *     are doing now, not what you did a minute ago.
 *  3. **Damage taken hurts.** Getting hit cuts the meter hard — the rank is
 *     supposed to mean "in control", not "still alive".
 *
 * The end-of-stage grade blends peak and average rank, so a single lucky
 * flurry cannot carry an otherwise sloppy run.
 */

import { STYLE } from '../data/Balance.js';

export class StyleMeter {
  constructor(stats) {
    this.stats = stats;
    this.points = 0;
    this.rankIndex = 0;
    this.sinceGain = 0;
    this.recent = [];          // recent move keys, newest last
    this.peakIndex = 0;
    this._rankSum = 0;
    this._rankTime = 0;
    this.onRankChange = null;  // (newRank, oldRank, up) => void
    this.totalEarned = 0;
  }

  get rank() { return STYLE.RANKS[this.rankIndex]; }
  get nextRank() { return STYLE.RANKS[this.rankIndex + 1] || null; }

  /** 0..1 progress toward the next rank (1 at max rank). */
  get progress() {
    const cur = STYLE.RANKS[this.rankIndex];
    const next = this.nextRank;
    if (!next) return 1;
    return Math.min(1, Math.max(0, (this.points - cur.at) / (next.at - cur.at)));
  }

  /**
   * @param {number} amount base points
   * @param {string} moveKey identity of the move, for the repetition tax
   */
  add(amount, moveKey = 'generic') {
    if (amount <= 0) return 0;

    let repeats = 0;
    for (const key of this.recent) if (key === moveKey) repeats++;
    const falloff = Math.max(STYLE.REPEAT_FLOOR, Math.pow(STYLE.REPEAT_FALLOFF, repeats));

    const gained = amount * falloff * (this.stats?.styleGainMult ?? 1);
    this.points += gained;
    this.totalEarned += gained;
    this.sinceGain = 0;

    this.recent.push(moveKey);
    if (this.recent.length > STYLE.REPEAT_WINDOW) this.recent.shift();

    this._recheckRank();
    return gained;
  }

  /** Taking damage is the fastest way to lose rank. */
  onDamaged() {
    this.points *= STYLE.HIT_TAKEN_PENALTY;
    this.recent.length = 0;
    this.sinceGain = 0;
    this._recheckRank();
  }

  /** Dropped to the floor — used on death and stage transitions. */
  reset() {
    this.points = 0;
    this.recent.length = 0;
    this._recheckRank();
  }

  update(dt) {
    this.sinceGain += dt;
    if (this.sinceGain > STYLE.DECAY_DELAY && this.points > 0) {
      const rate = STYLE.DECAY_RATE * (this.stats?.styleDecayMult ?? 1);
      this.points = Math.max(0, this.points - rate * dt);
      this._recheckRank();
    }
    // Track the time-weighted average rank for the end-of-stage grade.
    this._rankSum += this.rankIndex * dt;
    this._rankTime += dt;
    if (this.rankIndex > this.peakIndex) this.peakIndex = this.rankIndex;
  }

  _recheckRank() {
    let idx = 0;
    for (let i = 0; i < STYLE.RANKS.length; i++) {
      if (this.points >= STYLE.RANKS[i].at) idx = i;
    }
    if (idx !== this.rankIndex) {
      const old = this.rankIndex;
      this.rankIndex = idx;
      if (this.onRankChange) this.onRankChange(STYLE.RANKS[idx], STYLE.RANKS[old], idx > old);
    }
  }

  /**
   * Final grade for the stage. Peak counts for a third, sustained play for
   * two thirds, plus a bonus for never being hit.
   * @param {boolean} flawless
   */
  grade(flawless = false) {
    const avg = this._rankTime > 0 ? this._rankSum / this._rankTime : 0;
    let score = avg * 0.66 + this.peakIndex * 0.34;
    if (flawless) score += STYLE.NO_HIT_BONUS * (STYLE.RANKS.length - 1) * 0.5;
    const idx = Math.max(0, Math.min(STYLE.RANKS.length - 1, Math.round(score)));
    return STYLE.RANKS[idx];
  }
}
