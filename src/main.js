/**
 * main.js — game bootstrap.
 *
 * Responsibilities: build the Phaser config (scaling, physics, render), wire
 * the page-level lifecycle (visibility, orientation, save-on-hide, audio
 * unlock), and hand off to BootScene.
 */

import { VIEW, PHYSICS } from './data/Balance.js';
import { flushSave } from './systems/Save.js';
import { ctx } from './core/Context.js';
import { designWidthFor, manageViewport, armAutoFullscreen } from './systems/Viewport.js';
import { diagnosticsRequested, installDiagnostics } from './systems/Diagnostics.js';

import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import HubScene from './scenes/HubScene.js';
import MissionScene from './scenes/MissionScene.js';
import PlayScene from './scenes/PlayScene.js';
import HudScene from './scenes/HudScene.js';
import PauseScene from './scenes/PauseScene.js';
import ResultsScene from './scenes/ResultsScene.js';
import SkillTreeScene from './scenes/SkillTreeScene.js';
import LoadoutScene from './scenes/LoadoutScene.js';
import ShopScene from './scenes/ShopScene.js';
import SettingsScene from './scenes/SettingsScene.js';
import CodexScene from './scenes/CodexScene.js';

if (!window.Phaser) {
  document.getElementById('boot-splash').innerHTML =
    '<div style="text-align:center;padding:2rem;color:#ff8a3d">' +
    'Could not load the game engine.<br><small>vendor/phaser.min.js is missing.</small></div>';
  throw new Error('Phaser failed to load');
}

/**
 * Device pixel ratio is clamped: rendering a 1280x720 canvas at DPR 3 on a
 * phone costs 8x the fill rate of DPR 1 for a difference nobody can see while
 * dodging a Brute. 2 is the sweet spot.
 */
const dpr = Math.min(window.devicePixelRatio || 1, 2);

// Size the design surface to the real host element before Phaser boots, then
// let manageViewport() keep it matched as the visible area changes.
VIEW.WIDTH = designWidthFor();

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b0710',
  width: VIEW.WIDTH,
  height: VIEW.HEIGHT,

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIEW.WIDTH,
    height: VIEW.HEIGHT,
    expandParent: true,
    // Let the canvas fill notched screens; CSS keeps the page itself locked.
    fullscreenTarget: 'game'
  },

  render: {
    antialias: true,
    roundPixels: true,
    powerPreference: 'high-performance',
    // Transparent canvas would force the compositor to blend every frame
    // against the page; an opaque one is measurably cheaper on mobile.
    transparent: false,
    clearBeforeRender: true
  },

  resolution: dpr,

  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: PHYSICS.GRAVITY },
      debug: new URLSearchParams(location.search).has('debug'),
      fps: 60,
      // A fixed step keeps combat timings identical on 60Hz and 120Hz screens.
      fixedStep: true,
      tileBias: 24
    }
  },

  fps: {
    target: 60,
    min: 30,
    // Never let a single long frame teleport everything through a wall.
    panicMax: 3,
    smoothStep: true
  },

  input: {
    activePointers: 5,
    touch: { capture: true },
    gamepad: true,
    windowEvents: true
  },

  dom: { createContainer: false },
  disableContextMenu: true,
  autoFocus: true,

  scene: [
    BootScene, MenuScene, HubScene, MissionScene,
    PlayScene, HudScene, PauseScene, ResultsScene,
    SkillTreeScene, LoadoutScene, ShopScene, SettingsScene, CodexScene
  ]
};

const game = new Phaser.Game(config);
window.__EA_GAME__ = game;

/**
 * Keep the design surface matched to the visible area, and offer to take over
 * the whole screen on the first tap. Both are what stop a phone browser's URL
 * bar from stealing a third of the display.
 */
manageViewport(game);
armAutoFullscreen(game, () => ctx.profile?.settings?.autoFullscreen !== false);

// `?diag` puts a live readout of viewport, canvas and pointer mapping on screen.
if (diagnosticsRequested()) installDiagnostics(game);

/* --------------------------------------------------------- page lifecycle */

/** Audio contexts must be started by a user gesture on iOS and Android. */
const unlockAudio = () => {
  ctx.audio?.unlock();
};
['pointerdown', 'touchstart', 'keydown'].forEach((evt) => {
  window.addEventListener(evt, unlockAudio, { passive: true });
});

/**
 * Save and silence when the tab is hidden. `pagehide` is the only event iOS
 * reliably fires when the app is swiped away, so it does the important work.
 */
const onHide = () => {
  flushSave();
  ctx.audio?.suspend();
  game.scene.getScenes(true).forEach((s) => {
    if (s.scene.key === 'PlayScene' && !s.scene.isPaused()) s.requestPause?.('focus');
  });
};

const onShow = () => {
  ctx.audio?.resume();
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden) onHide(); else onShow();
});
window.addEventListener('pagehide', onHide);
window.addEventListener('blur', onHide);
window.addEventListener('focus', onShow);

// Resize, orientation and fullscreen handling all live in manageViewport().

// Stop iOS Safari from treating a two-finger tap on the canvas as a zoom.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

// Keep the last frame of progress even on a hard close.
window.addEventListener('beforeunload', () => flushSave());

export default game;
