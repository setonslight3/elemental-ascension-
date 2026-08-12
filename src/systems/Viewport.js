/**
 * Viewport.js — screen fitting and fullscreen.
 *
 * The problem this solves: the game is laid out against a fixed-height design
 * surface (720px tall, variable width). Pick the width wrong and the canvas
 * letterboxes — on a 20:9 phone with a browser URL bar, that can waste a third
 * of the screen.
 *
 * Getting it right needs three things that are easy to get wrong:
 *
 *  1. **Measure the right box.** `window.innerHeight` on Android Chrome is the
 *     *layout* viewport, which stays at the "URL bar hidden" size even while
 *     the bar is covering part of the screen. The box Phaser actually scales
 *     into is the parent element. Measure that.
 *  2. **Re-measure when it changes.** The URL bar slides away on first scroll,
 *     the device rotates, the keyboard opens. Each changes the aspect ratio,
 *     and a surface chosen at boot is wrong forever after.
 *  3. **Offer fullscreen.** It is the only way to actually get the whole screen
 *     on a phone browser, and it removes the URL bar — and with it an entire
 *     class of viewport-offset bugs.
 */

import { VIEW } from '../data/Balance.js';

/** Widest and narrowest surfaces we will lay out for. */
const MIN_RATIO = 16 / 9;    // never narrower than the authored layouts
/**
 * Wide enough to fill a 21:9 phone, and to absorb most of the extra width a
 * visible browser URL bar creates by shortening the viewport. Beyond this the
 * play area starts to differ enough between devices to matter, and the right
 * answer is fullscreen — which brings the ratio back under this cap anyway.
 */
const MAX_RATIO = 2.6;

/** Aspect change that justifies re-laying out the UI. */
const RELAYOUT_THRESHOLD = 0.04;

/** Scenes that rebuild cheaply and safely when the surface changes. */
const RELAYOUTABLE = new Set([
  'MenuScene', 'HubScene', 'MissionScene', 'SkillTreeScene',
  'LoadoutScene', 'ShopScene', 'SettingsScene', 'CodexScene', 'ResultsScene'
]);

/** Measure the element the game is scaled into, falling back to the window. */
export function measureHost() {
  const el = document.getElementById('game');
  let w = 0;
  let h = 0;
  if (el) {
    const r = el.getBoundingClientRect();
    w = r.width;
    h = r.height;
  }
  // visualViewport is the most accurate description of what the user can see
  // on mobile; fall back through the layout viewport.
  if (!w || !h) {
    const vv = window.visualViewport;
    w = vv ? vv.width : window.innerWidth;
    h = vv ? vv.height : window.innerHeight;
  }
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}

/** The design width that best fills the current host box. */
export function designWidthFor(host = measureHost()) {
  const ratio = host.width / host.height;
  // In portrait the rotate gate is showing; lay out for the landscape the
  // player is about to turn into rather than for a surface nobody will see.
  const landscape = ratio >= 1 ? ratio : host.height / host.width;
  const clamped = Math.min(MAX_RATIO, Math.max(MIN_RATIO, landscape));
  return Math.round((VIEW.HEIGHT * clamped) / 2) * 2;
}

/* ------------------------------------------------------------- fullscreen */

const doc = () => document;

export const fullscreenSupported = () => {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen ||
    el.mozRequestFullScreen || el.msRequestFullscreen);
};

export const isFullscreen = () => !!(
  doc().fullscreenElement || doc().webkitFullscreenElement ||
  doc().mozFullScreenElement || doc().msFullscreenElement
);

/**
 * Enter fullscreen on the page root. Must be called from inside a user
 * gesture; browsers reject it otherwise, and iPhone Safari rejects it always.
 * @returns {Promise<boolean>} whether we ended up fullscreen
 */
export async function enterFullscreen() {
  if (isFullscreen()) return true;
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen ||
    el.mozRequestFullScreen || el.msRequestFullscreen;
  if (!fn) return false;
  try {
    await fn.call(el, { navigationUI: 'hide' });
  } catch {
    // Older signatures take no options, and some browsers reject the promise
    // outright (iPhone Safari). Try the bare call once, then give up quietly.
    try { await fn.call(el); } catch { return false; }
  }
  // Landscape lock is a bonus where supported; failure is not an error.
  try {
    if (screen.orientation?.lock) await screen.orientation.lock('landscape');
  } catch { /* unsupported or denied */ }
  return isFullscreen();
}

export async function exitFullscreen() {
  if (!isFullscreen()) return;
  const fn = doc().exitFullscreen || doc().webkitExitFullscreen ||
    doc().mozCancelFullScreen || doc().msExitFullscreen;
  try { if (fn) await fn.call(doc()); } catch { /* already exited */ }
  try { screen.orientation?.unlock?.(); } catch { /* unsupported */ }
}

export async function toggleFullscreen() {
  if (isFullscreen()) { await exitFullscreen(); return false; }
  return enterFullscreen();
}

/* ------------------------------------------------------------- management */

/**
 * Keep the game's design surface matched to the host box for the life of the
 * page. Call once, after the Phaser game is constructed.
 *
 * @param {Phaser.Game} game
 */
export function manageViewport(game) {
  let applying = false;

  const apply = (reason) => {
    if (applying || !game.scale) return;
    applying = true;
    try {
      const host = measureHost();
      const nextWidth = designWidthFor(host);
      const prevWidth = VIEW.WIDTH;
      const changed = Math.abs(nextWidth - prevWidth) / prevWidth > RELAYOUT_THRESHOLD;

      if (changed) {
        VIEW.WIDTH = nextWidth;
        game.scale.setGameSize(nextWidth, VIEW.HEIGHT);
        relayout(game, reason);
      }
      // Always refresh: this recomputes the canvas bounds Phaser uses to turn
      // a touch into a game coordinate. Stale bounds are the difference
      // between a button that responds and one that ignores you.
      game.scale.refresh();
    } catch (err) {
      console.warn('[viewport] resize failed', err);
    } finally {
      applying = false;
    }
  };

  /** Rebuild UI scenes so anchored layouts follow the new width. */
  const relayout = (g, reason) => {
    for (const scene of g.scene.getScenes(true)) {
      const key = scene.scene.key;
      if (RELAYOUTABLE.has(key)) {
        // Preserve where the scene came from so its back button still works.
        const data = scene.scene.settings.data || {};
        scene.scene.restart(data);
      } else if (key === 'HudScene') {
        // The HUD is anchored to screen edges; the world itself is camera
        // driven and needs nothing. Rebuild only the overlay.
        scene.scene.restart(scene.scene.settings.data || {});
      }
    }
    if (reason) console.info(`[viewport] re-laid out for ${VIEW.WIDTH}x${VIEW.HEIGHT} (${reason})`);
  };

  // A resize can arrive before the browser has settled on a size, so measure
  // again shortly after. Two passes covers URL bars and rotation animations.
  let timer = null;
  const schedule = (reason) => {
    apply(reason);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; apply(`${reason} (settled)`); }, 320);
  };

  window.addEventListener('resize', () => schedule('resize'));
  window.addEventListener('orientationchange', () => schedule('orientation'));
  document.addEventListener('fullscreenchange', () => schedule('fullscreen'));
  document.addEventListener('webkitfullscreenchange', () => schedule('fullscreen'));

  if (window.visualViewport) {
    // The visual viewport is what actually moves when a URL bar slides; the
    // window resize event does not always follow it.
    window.visualViewport.addEventListener('resize', () => schedule('visualViewport'));
    window.visualViewport.addEventListener('scroll', () => game.scale.refresh());
  }

  // Belt and braces: refresh bounds on the first touch of each interaction, so
  // a tap can never be mapped through bounds the browser has since moved.
  window.addEventListener('touchstart', () => game.scale.refresh(), { passive: true });

  apply('initial');
  return { apply, relayout: () => relayout(game, 'manual') };
}

/**
 * Wire "go fullscreen on the first real tap" for touch devices.
 * Browsers only allow the request from inside a gesture, so it has to ride
 * along with a tap the player was making anyway.
 *
 * @param {Phaser.Game} game
 * @param {() => boolean} wanted returns whether the player wants this
 */
export function armAutoFullscreen(game, wanted) {
  if (!game.device.input.touch || !fullscreenSupported()) return;

  const once = async () => {
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('touchend', once);
    if (!wanted()) return;
    if (isFullscreen()) return;
    await enterFullscreen();
  };

  window.addEventListener('pointerdown', once, { passive: true });
  window.addEventListener('touchend', once, { passive: true });
}
