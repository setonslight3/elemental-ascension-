/**
 * BootScene — generate every texture, load the save, then get out of the way.
 *
 * There are no asset files to download, so "loading" here is texture
 * generation plus a save read. It still shows a beat of progress: an instant
 * cut from splash to menu reads as a glitch, and this is also where we catch
 * an unusable environment (no canvas, corrupt save) and say so plainly.
 */

import { generateAll } from '../systems/Art.js';
import { Profile } from '../systems/Profile.js';
import { AudioManager } from '../systems/Audio.js';
import { ctx } from '../core/Context.js';
import { persistenceAvailable, freshProfile } from '../systems/Save.js';
import { VIEW } from '../data/Balance.js';
import { PALETTE, textStyle } from '../ui/UI.js';

export default class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  create() {
    const cx = VIEW.WIDTH / 2;
    const cy = VIEW.HEIGHT / 2;

    this.cameras.main.setBackgroundColor(PALETTE.bg);

    const status = this.add.text(cx, cy + 60, 'igniting…', textStyle(16, PALETTE.textFaint))
      .setOrigin(0.5);

    let failed = false;
    try {
      generateAll(this);
    } catch (err) {
      failed = true;
      console.error('[boot] texture generation failed', err);
      status.setText('Could not prepare graphics on this device.').setColor('#ff6b6b');
    }
    if (failed) return;

    // The splash needs the first generated texture to draw the flame mark.
    const mark = this.add.image(cx, cy - 40, 'flame')
      .setDisplaySize(56, 74).setTint(0xff8a3d)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: mark, scaleX: mark.scaleX * 1.12, scaleY: mark.scaleY * 1.12,
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    const title = this.add.text(cx, cy + 24, 'ELEMENTAL ASCENSION',
      textStyle(26, '#ffd166', { letterSpacing: 6 })).setOrigin(0.5);
    title.setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, duration: 500 });

    // --- state ------------------------------------------------------------
    try {
      ctx.profile = new Profile();
    } catch (err) {
      console.error('[boot] profile load failed, starting fresh', err);
      ctx.profile = new Profile(freshProfile());
    }
    ctx.audio = new AudioManager(ctx.profile);
    ctx.ready = true;

    this.profile = ctx.profile;
    this.audio = ctx.audio;

    if (!persistenceAvailable()) {
      this.add.text(cx, VIEW.HEIGHT - 40,
        'Private browsing detected — progress will not be saved between visits.',
        textStyle(14, '#ffb43d')).setOrigin(0.5);
    }

    // Fade out the DOM splash now that the canvas has something to show.
    const splash = document.getElementById('boot-splash');
    if (splash) {
      splash.classList.add('done');
      setTimeout(() => splash.remove(), 600);
    }

    status.setText('ready');
    this.time.delayedCall(420, () => {
      this.cameras.main.fadeOut(260, 8, 4, 12);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MenuScene'));
    });
  }
}
