/**
 * Rand.js — small deterministic RNG helpers.
 *
 * Terrain and stage layout use a seeded generator so a stage looks identical
 * on every device and every replay; loot uses the unseeded global for variety.
 */

/** mulberry32 — fast, good enough, 32-bit seed. */
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  next.range = (min, max) => min + next() * (max - min);
  next.int = (min, max) => Math.floor(min + next() * (max - min + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  next.shuffle = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return next;
}

/** Hash a string into a 32-bit seed (FNV-1a). */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/* ------------------------------------------------- unseeded convenience api */

export const rnd = {
  range: (min, max) => min + Math.random() * (max - min),
  int: (min, max) => Math.floor(min + Math.random() * (max - min + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  chance: (p) => Math.random() < p,
  sign: () => (Math.random() < 0.5 ? -1 : 1),
  /**
   * Weighted pick from `{ key: weight }`. Non-positive weights are ignored.
   * Returns null when every weight is zero.
   */
  weighted: (weights) => {
    let total = 0;
    for (const w of Object.values(weights)) if (w > 0) total += w;
    if (total <= 0) return null;
    let roll = Math.random() * total;
    for (const [key, w] of Object.entries(weights)) {
      if (w <= 0) continue;
      roll -= w;
      if (roll <= 0) return key;
    }
    return Object.keys(weights)[0];
  }
};

/** Clamp helper used all over gameplay code. */
export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

/** Linear interpolation. */
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Frame-rate independent exponential smoothing.
 * `t` is the fraction remaining after one second.
 */
export const damp = (a, b, t, dt) => lerp(a, b, 1 - Math.pow(t, dt));
