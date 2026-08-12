/**
 * MenuScene — the title screen.
 */

import { ctx } from '../core/Context.js';
import { VIEW } from '../data/Balance.js';
import { PALETTE, textStyle, button, panel, fmt, fmtTime } from '../ui/UI.js';
import { STAGES } from '../data/Stages.js';
import { fullscreenSupported, isFullscreen, toggleFullscreen, orientationLockSupported } from '../systems/Viewport.js';

export default class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    this.profile = ctx.profile;
    this.audio = ctx.audio;
    const W = VIEW.WIDTH;
    const H = VIEW.HEIGHT;

    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.cameras.main.fadeIn(320, 8, 4, 12);

    /* ---------------------------------------------------------- backdrop */

    const sky = this.add.graphics();
    sky.fillGradientStyle(0x1a0d14, 0x1a0d14, 0x3a1a18, 0x2a1220, 1);
    sky.fillRect(0, 0, W, H);

    // Layered skyline silhouettes.
    for (const [i, spec] of [
      { colour: 0x2a1620, y: 620, h: [140, 320], n: 16, alpha: 1 },
      { colour: 0x1c0f18, y: 660, h: [90, 240], n: 20, alpha: 1 }
    ].entries()) {
      for (let k = 0; k < spec.n; k++) {
        const bw = Phaser.Math.Between(60, 150);
        const bh = Phaser.Math.Between(spec.h[0], spec.h[1]);
        this.add.image(Phaser.Math.Between(-40, W + 40), spec.y, 'block')
          .setOrigin(0.5, 1).setDisplaySize(bw, bh)
          .setTint(spec.colour).setAlpha(spec.alpha).setDepth(-20 + i);
      }
    }

    // A molten horizon line.
    this.add.rectangle(0, 620, W, 8, 0xff5a1a, 0.55).setOrigin(0, 0.5).setDepth(-18)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.add.image(W / 2, 620, 'soft').setDisplaySize(W * 1.2, 220)
      .setTint(0xff5a1a).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD).setDepth(-19);

    // Drifting embers.
    this.embers = [];
    for (let i = 0; i < 44; i++) {
      const e = this.add.image(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), 'spark')
        .setTint(Phaser.Math.RND.pick([0xffd166, 0xff8a3d, 0xff5a2a]))
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(Phaser.Math.FloatBetween(0.2, 0.7))
        .setDepth(-10);
      const size = Phaser.Math.FloatBetween(3, 10);
      e.setDisplaySize(size, size);
      this.embers.push({ s: e, vy: Phaser.Math.FloatBetween(-46, -14), vx: Phaser.Math.FloatBetween(-16, 24), p: Math.random() * 6 });
    }

    /* ------------------------------------------------------------- title */

    const titleY = 168;
    const mark = this.add.image(W / 2, titleY - 78, 'flame')
      .setDisplaySize(64, 84).setTint(0xffb43d).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: mark, scaleY: mark.scaleY * 1.14, duration: 900,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    const title = this.add.text(W / 2, titleY, 'ELEMENTAL ASCENSION',
      textStyle(52, '#ffe0a8', { stroke: '#3a1408', strokeThickness: 8 })).setOrigin(0.5);
    title.setShadow(0, 6, '#ff5a1a', 22, false, true);

    this.add.text(W / 2, titleY + 44, 'F I R E   ·   V E R S I O N   O N E',
      textStyle(16, '#c08a6a')).setOrigin(0.5);

    /* ----------------------------------------------------------- buttons */

    const hasProgress = this.profile.data.highestUnlocked > 1 ||
      this.profile.level > 1 ||
      Object.keys(this.profile.data.stages).length > 0;

    const bx = W / 2;
    let by = 300;
    const gap = 66;
    const bw = 320;
    const bh = 54;

    this.add.existing(button(this, bx, by, bw, bh,
      hasProgress ? 'CONTINUE' : 'BEGIN', () => this._start(), { style: 'primary', fontSize: 22 }));
    by += gap;

    if (hasProgress) {
      this.add.existing(button(this, bx, by, bw, bh, 'NEW GAME', () => this._confirmNew(), { style: 'ghost' }));
      by += gap;
    }

    this.add.existing(button(this, bx, by, bw, bh, 'HOW TO PLAY',
      () => this.scene.start('CodexScene', { from: 'MenuScene' }), { style: 'ghost' }));
    by += gap;

    this.add.existing(button(this, bx, by, bw, bh, 'SETTINGS',
      () => this.scene.start('SettingsScene', { from: 'MenuScene' }), { style: 'ghost' }));

    /* ------------------------------------------------------- save summary */

    if (hasProgress) {
      const p = this.profile.data;
      const cleared = Object.values(p.stages).filter((s) => s.cleared > 0).length;
      panel(this, W - 300, 40, 260, 148, { depth: 1, accent: PALETTE.ember });
      this.add.text(W - 280, 58, 'ASCENDANT', textStyle(13, PALETTE.textFaint)).setDepth(2);
      this.add.text(W - 280, 76, `Level ${p.level}`, textStyle(22, '#ffd166')).setDepth(2);
      this.add.text(W - 280, 108, `Stages cleared   ${cleared}/${STAGES.length}`, textStyle(14, PALETTE.textDim)).setDepth(2);
      this.add.text(W - 280, 128, `Ember   ${fmt(p.ember)}`, textStyle(14, PALETTE.textDim)).setDepth(2);
      this.add.text(W - 280, 148, `Playtime   ${fmtTime(p.playtimeMs)}`, textStyle(14, PALETTE.textDim)).setDepth(2);
    }

    this.add.text(W / 2, H - 26,
      'Keyboard  ·  Gamepad  ·  Touch (landscape)',
      textStyle(13, PALETTE.textFaint)).setOrigin(0.5);

    /* --------------------------------------------------------- fullscreen */

    // On a phone browser the URL bar can eat a third of the screen, so this is
    // the most valuable button on the menu — placed where a thumb already is.
    if (fullscreenSupported()) {
      this.fsBtn = button(this, 128, H - 52, 216, 46, '', () => this._toggleFullscreen(),
        { style: 'ghost', fontSize: 14, depth: 5 });
      this.add.existing(this.fsBtn);
      this._syncFullscreenLabel();
      this._onFsChange = () => this._syncFullscreenLabel();
      document.addEventListener('fullscreenchange', this._onFsChange);
      document.addEventListener('webkitfullscreenchange', this._onFsChange);
      this.events.once('shutdown', () => {
        document.removeEventListener('fullscreenchange', this._onFsChange);
        document.removeEventListener('webkitfullscreenchange', this._onFsChange);
      });
    }

    this.audio.playMusic('menu');

    // Any key or tap on the backdrop also starts, for controller users.
    this.input.keyboard.once('keydown-ENTER', () => this._start());
    this.input.keyboard.once('keydown-SPACE', () => this._start());
  }

  _syncFullscreenLabel() {
    if (!this.fsBtn || !this.fsBtn.active) return;
    // Where the browser can hold the orientation, going fullscreen also pins
    // landscape — worth naming, because that is the part that saves the player
    // from leaving auto-rotate switched on across their whole phone.
    const enter = orientationLockSupported() ? 'FULLSCREEN + LOCK' : 'FULLSCREEN';
    this.fsBtn.setLabel(isFullscreen() ? 'EXIT FULLSCREEN' : enter);
  }

  async _toggleFullscreen() {
    const ok = await toggleFullscreen();
    this._syncFullscreenLabel();
    if (!ok && !isFullscreen()) {
      // iPhone Safari refuses element fullscreen outright. Say so rather than
      // leaving a button that appears to do nothing.
      this.add.text(VIEW.WIDTH / 2, VIEW.HEIGHT - 74,
        'This browser will not allow fullscreen. Try adding the page to your home screen.',
        textStyle(13, '#ffb43d')).setOrigin(0.5).setDepth(6);
    }
  }

  _start() {
    this.audio.unlock();
    this.cameras.main.fadeOut(280, 8, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('HubScene'));
  }

  _confirmNew() {
    if (this._confirming) return;
    this._confirming = true;
    const W = VIEW.WIDTH;
    const H = VIEW.HEIGHT;

    const dim = this.add.rectangle(0, 0, W, H, 0x05030a, 0.8).setOrigin(0).setDepth(200).setInteractive();
    const g = panel(this, W / 2 - 260, H / 2 - 120, 520, 240, { depth: 201, accent: PALETTE.bad });
    const t1 = this.add.text(W / 2, H / 2 - 74, 'ERASE EVERYTHING?', textStyle(28, '#ff8a9b')).setOrigin(0.5).setDepth(202);
    const t2 = this.add.text(W / 2, H / 2 - 24,
      'Your level, skills, gear and stage records will be deleted.\nThis cannot be undone.',
      textStyle(16, PALETTE.textDim, { align: 'center' })).setOrigin(0.5).setDepth(202);

    const cleanup = () => {
      [dim, g, t1, t2, yes, no].forEach((o) => o.destroy());
      this._confirming = false;
    };

    const yes = button(this, W / 2 - 110, H / 2 + 62, 200, 52, 'ERASE', () => {
      this.profile.reset();
      cleanup();
      this.scene.restart();
    }, { style: 'danger', depth: 202 });

    const no = button(this, W / 2 + 110, H / 2 + 62, 200, 52, 'KEEP', () => {
      this.audio.play('uiBack');
      cleanup();
    }, { style: 'ghost', depth: 202 });
  }

  update(time, delta) {
    const dt = delta / 1000;
    for (const e of this.embers) {
      e.s.y += e.vy * dt;
      e.p += dt * 2;
      e.s.x += (e.vx + Math.sin(e.p) * 14) * dt;
      if (e.s.y < -20) {
        e.s.y = VIEW.HEIGHT + 20;
        e.s.x = Phaser.Math.Between(0, VIEW.WIDTH);
      }
    }
  }
}
