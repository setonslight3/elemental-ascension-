/**
 * Context.js — the one global the game allows itself.
 *
 * Scenes come and go; the player's profile and the audio engine must not.
 * Rather than threading them through every scene's init data (and losing them
 * the first time someone forgets), they live here and are created once in
 * BootScene.
 */

export const ctx = {
  /** @type {import('../systems/Profile.js').Profile|null} */
  profile: null,
  /** @type {import('../systems/Audio.js').AudioManager|null} */
  audio: null,
  /** @type {import('../systems/Cloud.js').CloudSaves|null} */
  cloud: null,
  /** Set once the boot sequence has generated textures. */
  ready: false,
  /** Filled in by PlayScene when a run ends, read by ResultsScene. */
  lastResult: null,
  /** Where the Hub should return the camera focus to after a menu. */
  hubFocus: 'missions',
  /** True after the player has seen the controls card at least once. */
  tutorialShown: false
};

/** Convenience accessors so scenes can stay terse. */
export const getProfile = () => ctx.profile;
export const getAudio = () => ctx.audio;
