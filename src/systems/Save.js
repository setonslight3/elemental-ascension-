/**
 * Save.js — persistence.
 *
 * Design notes / loopholes closed:
 *  - localStorage throws in private-browsing modes on some mobile browsers, so
 *    every access is guarded and falls back to an in-memory store. The game
 *    stays playable; it just warns that progress will not survive a reload.
 *  - Saves are versioned and migrated forward, so an old save never wipes.
 *  - Saves carry a checksum. A half-written save (phone killed the tab
 *    mid-write) is detected and the previous good backup is used instead.
 *  - Writes are debounced and double-buffered (`slot` + `slot.bak`) so a
 *    crash during a write can only ever destroy the newer of two copies.
 */

import { PLAYER, PROGRESSION } from '../data/Balance.js';

const KEY = 'elemental-ascension/profile';
const BAK = 'elemental-ascension/profile.bak';
export const SAVE_VERSION = 3;

/* --------------------------------------------------------------- storage io */

let memoryStore = Object.create(null);
let storageWorks = null;

function storage() {
  if (storageWorks === null) {
    try {
      const probe = '__ea_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      storageWorks = true;
    } catch (err) {
      storageWorks = false;
      console.warn('[save] localStorage unavailable — progress is session-only.', err && err.name);
    }
  }
  return storageWorks ? window.localStorage : null;
}

export const persistenceAvailable = () => storage() !== null;

function readRaw(key) {
  const s = storage();
  try {
    return s ? s.getItem(key) : (memoryStore[key] ?? null);
  } catch {
    return memoryStore[key] ?? null;
  }
}

function writeRaw(key, value) {
  const s = storage();
  memoryStore[key] = value;
  if (!s) return false;
  try {
    s.setItem(key, value);
    return true;
  } catch (err) {
    // Quota exceeded — most likely a bloated inventory. Trim and retry once.
    console.warn('[save] write failed', err && err.name);
    return false;
  }
}

function removeRaw(key) {
  const s = storage();
  delete memoryStore[key];
  try { if (s) s.removeItem(key); } catch { /* ignore */ }
}

/* --------------------------------------------------------------- checksum */

/** FNV-1a. Not cryptographic — just enough to catch a truncated write. */
function checksum(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function envelope(profile) {
  const body = JSON.stringify(profile);
  return JSON.stringify({ v: SAVE_VERSION, sum: checksum(body), body });
}

function unwrap(raw) {
  if (!raw) return null;
  try {
    const outer = JSON.parse(raw);
    if (!outer || typeof outer.body !== 'string') return null;
    if (outer.sum !== checksum(outer.body)) {
      console.warn('[save] checksum mismatch — treating save as corrupt');
      return null;
    }
    return JSON.parse(outer.body);
  } catch (err) {
    console.warn('[save] could not parse save', err);
    return null;
  }
}

/* ------------------------------------------------------------ default shape */

export function freshProfile() {
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    playtimeMs: 0,

    level: 1,
    xp: 0,
    skillPoints: 0,

    ember: 0,
    shards: 0,
    potions: PLAYER.START_POTIONS,

    /**
     * Health persists between stages — the Hub is the only full heal, exactly
     * as the blueprint specifies. `null` means "full" (a fresh character, or
     * one that has just rested).
     */
    currentHp: null,

    skills: {},                                 // skillId -> rank
    equipped: { weapon: null, armour: null, relic: null },
    inventory: [],
    itemSeq: 1,

    highestUnlocked: 1,
    abilities: ['fireball'],
    stages: {},                                 // index -> { cleared, bestGrade, bestTimeMs, flawless }

    metrics: {
      kills: 0, deaths: 0, bossKills: 0, parries: 0,
      damageDealt: 0, damageTaken: 0, bestCombo: 0,
      stagesCleared: 0, itemsFound: 0, ultimatesUsed: 0
    },

    settings: {
      sfxVolume: 0.75,
      musicVolume: 0.45,
      quality: 'auto',            // auto | high | low
      screenShake: 1,
      hitstop: true,
      damageNumbers: true,
      touchScale: 1,
      touchOpacity: 0.55,
      leftHanded: false,
      haptics: true,
      autoSprint: false,
      showFps: false
    },

    seenTutorial: false
  };
}

/* -------------------------------------------------------------- migrations */

/**
 * Each migration takes a profile at version N and returns it at N+1. They are
 * intentionally forgiving: an unknown field is left alone, a missing field is
 * filled from `freshProfile()`.
 */
const MIGRATIONS = {
  1: (p) => {
    p.metrics = { ...freshProfile().metrics, ...(p.metrics || {}) };
    p.version = 2;
    return p;
  },
  2: (p) => {
    // v3 added per-stage records and the ability unlock list.
    p.stages = p.stages || {};
    p.abilities = Array.isArray(p.abilities) && p.abilities.length ? p.abilities : ['fireball'];
    p.itemSeq = p.itemSeq || (p.inventory ? p.inventory.length + 1 : 1);
    p.version = 3;
    return p;
  }
};

function migrate(profile) {
  let p = profile;
  let guard = 0;
  while (p.version < SAVE_VERSION && guard++ < 20) {
    const step = MIGRATIONS[p.version];
    if (!step) { p.version = SAVE_VERSION; break; }
    p = step(p);
  }
  // Backfill anything a migration did not cover.
  const base = freshProfile();
  const merged = { ...base, ...p };
  merged.settings = { ...base.settings, ...(p.settings || {}) };
  merged.metrics = { ...base.metrics, ...(p.metrics || {}) };
  merged.equipped = { ...base.equipped, ...(p.equipped || {}) };
  merged.skills = p.skills && typeof p.skills === 'object' ? p.skills : {};
  merged.inventory = Array.isArray(p.inventory) ? p.inventory : [];
  merged.stages = p.stages && typeof p.stages === 'object' ? p.stages : {};
  merged.abilities = Array.isArray(p.abilities) && p.abilities.length ? p.abilities : ['fireball'];
  merged.version = SAVE_VERSION;
  return sanitise(merged);
}

/**
 * Clamp anything that could have been hand-edited into an impossible value.
 * This is not anti-cheat (it is a single-player game and the save is right
 * there in devtools) — it stops a malformed save from producing NaN HP or an
 * infinite loop in the level-up routine.
 */
function sanitise(p) {
  const num = (v, min, max, dflt) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    return Math.min(max, Math.max(min, n));
  };
  p.level = Math.floor(num(p.level, 1, PLAYER.MAX_LEVEL, 1));
  p.xp = Math.floor(num(p.xp, 0, Number.MAX_SAFE_INTEGER, 0));

  // Reconcile level against XP. A save edited by hand, or one written by an
  // older curve, can hold more XP than its level accounts for; without this the
  // player sits on an over-full XP bar that never resolves.
  while (p.level < PLAYER.MAX_LEVEL && p.xp >= PROGRESSION.xpForLevel(p.level + 1)) {
    p.level++;
  }
  p.skillPoints = Math.floor(num(p.skillPoints, 0, 9999, 0));
  p.ember = Math.floor(num(p.ember, 0, Number.MAX_SAFE_INTEGER, 0));
  p.shards = Math.floor(num(p.shards, 0, Number.MAX_SAFE_INTEGER, 0));
  p.potions = Math.floor(num(p.potions, 0, 99, 0));
  p.highestUnlocked = Math.floor(num(p.highestUnlocked, 1, 20, 1));
  p.playtimeMs = num(p.playtimeMs, 0, Number.MAX_SAFE_INTEGER, 0);
  if (p.currentHp != null) p.currentHp = num(p.currentHp, 1, 100000, null);
  p.inventory = p.inventory.filter((it) => it && typeof it === 'object' && it.uid && it.slot);
  for (const slot of Object.keys(p.equipped)) {
    const uid = p.equipped[slot];
    if (uid && !p.inventory.some((it) => it.uid === uid)) p.equipped[slot] = null;
  }
  return p;
}

/* -------------------------------------------------------------- public api */

export function loadProfile() {
  const primary = unwrap(readRaw(KEY));
  if (primary) return migrate(primary);

  const backup = unwrap(readRaw(BAK));
  if (backup) {
    console.warn('[save] primary save unreadable — recovered from backup');
    return migrate(backup);
  }
  return freshProfile();
}

let pendingTimer = null;
let pendingProfile = null;

/** Write immediately. Rotates the previous save into the backup slot first. */
export function saveProfileNow(profile) {
  if (!profile) return false;
  profile.updatedAt = Date.now();
  profile.version = SAVE_VERSION;

  const previous = readRaw(KEY);
  if (previous) writeRaw(BAK, previous);

  let ok = writeRaw(KEY, envelope(profile));
  if (!ok) {
    // Most likely quota. Drop the oldest unequipped items and try once more.
    const equipped = new Set(Object.values(profile.equipped || {}));
    if (profile.inventory.length > 20) {
      profile.inventory = profile.inventory
        .filter((it, i) => equipped.has(it.uid) || i >= profile.inventory.length - 20);
      ok = writeRaw(KEY, envelope(profile));
    }
  }
  return ok;
}

/** Debounced save — safe to call on every small state change. */
export function saveProfile(profile, delay = 600) {
  pendingProfile = profile;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    if (pendingProfile) saveProfileNow(pendingProfile);
  }, delay);
}

/** Force any debounced write to land right now (used on pagehide/blur). */
export function flushSave() {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (pendingProfile) saveProfileNow(pendingProfile);
}

export function deleteProfile() {
  removeRaw(KEY);
  removeRaw(BAK);
  memoryStore = Object.create(null);
}

/* ------------------------------------------------------------ export/import */

const toB64 = (str) => btoa(unescape(encodeURIComponent(str)));
const fromB64 = (str) => decodeURIComponent(escape(atob(str)));

export function exportProfile(profile) {
  return `EA1:${toB64(envelope(profile))}`;
}

export function importProfile(code) {
  if (typeof code !== 'string') throw new Error('Save code must be text.');
  const trimmed = code.trim();
  if (!trimmed.startsWith('EA1:')) throw new Error('That does not look like an Elemental Ascension save code.');
  const parsed = unwrap(fromB64(trimmed.slice(4)));
  if (!parsed) throw new Error('Save code is damaged or incomplete.');
  return migrate(parsed);
}
