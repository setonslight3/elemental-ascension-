/**
 * SettingsScene — audio, visuals, touch layout, and save management.
 *
 * The touch section is the important one on a phone: control size, opacity and
 * handedness are the difference between a game you can play with your thumbs
 * and one you cannot. Changes preview live against a mock control cluster.
 */

import { ctx } from '../core/Context.js';
import { VIEW } from '../data/Balance.js';
import { PALETTE, textStyle, button, panel, fmt, Toaster, onTap } from '../ui/UI.js';
import { exportProfile, importProfile, persistenceAvailable } from '../systems/Save.js';
import { fullscreenSupported, isFullscreen, toggleFullscreen } from '../systems/Viewport.js';

export default class SettingsScene extends Phaser.Scene {
  constructor() { super('SettingsScene'); }

  init(data) {
    this.from = data?.from || 'HubScene';
    this.overlay = !!data?.overlay;
  }

  create() {
    this.profile = ctx.profile;
    this.audio = ctx.audio;
    const W = VIEW.WIDTH;
    const H = VIEW.HEIGHT;

    if (this.overlay) {
      this.add.rectangle(0, 0, W, H, 0x05030a, 0.9).setOrigin(0).setDepth(-11).setInteractive();
    } else {
      this.cameras.main.setBackgroundColor(PALETTE.bg);
      this.cameras.main.fadeIn(200, 8, 4, 12);
      const bg = this.add.graphics().setDepth(-10);
      bg.fillGradientStyle(0x0e0913, 0x0e0913, 0x171024, 0x120c1a, 1);
      bg.fillRect(0, 0, W, H);
    }

    this.toaster = new Toaster(this, { y: 88 });

    this.add.existing(button(this, 84, 42, 120, 44, '< BACK', () => this._back(),
      { style: 'subtle', fontSize: 16 }));
    this.add.text(W / 2, 26, 'SETTINGS', textStyle(28, '#ffd166')).setOrigin(0.5, 0);

    /* ------------------------------------------------------ column 1: a/v */

    let x = 40;
    panel(this, x, 96, 380, 480, { depth: 0 });
    let y = 116;
    this.add.text(x + 20, y, 'AUDIO', textStyle(13, PALETTE.textFaint));
    y += 26;
    y = this._slider(x + 20, y, 340, 'Sound effects', 'sfxVolume', 0, 1, (v) => {
      this.audio.applyVolumes();
      this.audio.play('ui');
    });
    y = this._slider(x + 20, y, 340, 'Music', 'musicVolume', 0, 1, () => this.audio.applyVolumes());

    y += 14;
    this.add.text(x + 20, y, 'VISUALS', textStyle(13, PALETTE.textFaint));
    y += 26;
    y = this._cycle(x + 20, y, 340, 'Effects quality', 'quality',
      [['auto', 'Auto'], ['high', 'High'], ['low', 'Low (faster)']]);
    y = this._slider(x + 20, y, 340, 'Screen shake', 'screenShake', 0, 1.5);
    y = this._toggle(x + 20, y, 340, 'Impact freeze frames', 'hitstop');
    y = this._toggle(x + 20, y, 340, 'Damage numbers', 'damageNumbers');
    y = this._toggle(x + 20, y, 340, 'Show FPS counter', 'showFps');

    /* ---------------------------------------------------- column 2: touch */

    x = 450;
    panel(this, x, 96, 380, 480, { depth: 0, accent: PALETTE.cool });
    y = 116;
    this.add.text(x + 20, y, 'TOUCH CONTROLS', textStyle(13, PALETTE.textFaint));
    y += 26;
    y = this._slider(x + 20, y, 340, 'Control size', 'touchScale', 0.7, 1.35, () => this._preview());
    y = this._slider(x + 20, y, 340, 'Control opacity', 'touchOpacity', 0.2, 1, () => this._preview());
    y = this._toggle(x + 20, y, 340, 'Left-handed layout', 'leftHanded', () => this._preview());
    y = this._toggle(x + 20, y, 340, 'Vibration', 'haptics');
    y = this._toggle(x + 20, y, 340, 'Auto-sprint', 'autoSprint');

    if (fullscreenSupported()) {
      y = this._toggle(x + 20, y, 340, 'Fullscreen on first tap', 'autoFullscreen');
      this.fsBtn = button(this, x + 190, y + 24, 340, 44, '',
        () => this._toggleFullscreen(), { style: 'ghost', fontSize: 14, depth: 2 });
      this.add.existing(this.fsBtn);
      this._syncFullscreenLabel();
      y += 56;
    }

    this.add.text(x + 20, y + 6,
      'Push the stick to its edge to sprint.\nThe stick appears wherever your thumb lands.',
      textStyle(12, PALETTE.textFaint, { lineSpacing: 4 }));

    this.previewGroup = this.add.container(0, 0).setDepth(2);
    this._preview();

    /* ----------------------------------------------------- column 3: save */

    x = 860;
    const w = W - x - 40;
    panel(this, x, 96, w, 480, { depth: 0, accent: PALETTE.bad });
    y = 116;
    this.add.text(x + 20, y, 'PROGRESS', textStyle(13, PALETTE.textFaint));
    y += 26;

    const d = this.profile.data;
    const info = [
      `Level ${d.level}`,
      `${Object.values(d.stages).filter((s) => s.cleared > 0).length} stages cleared`,
      `${fmt(d.ember)} Ember · ${fmt(d.shards)} Shards`,
      `${d.inventory.length} items carried`,
      `${fmt(d.metrics.kills)} robots destroyed`,
      `${fmt(d.metrics.deaths)} deaths`,
      `${fmt(d.metrics.parries)} parries`
    ];
    this.add.text(x + 20, y, info.join('\n'), textStyle(14, PALETTE.textDim, { lineSpacing: 6 }));
    y += info.length * 26 + 14;

    if (!persistenceAvailable()) {
      this.add.text(x + 20, y,
        'Storage is blocked in this browser mode.\nProgress lives only in this tab.',
        textStyle(12, '#ffb43d', { lineSpacing: 4 }));
      y += 50;
    }

    this.add.existing(button(this, x + w / 2, y + 24, w - 40, 46, 'COPY SAVE CODE',
      () => this._exportSave(), { style: 'ghost', fontSize: 14, depth: 2 }));
    this.add.existing(button(this, x + w / 2, y + 78, w - 40, 46, 'PASTE SAVE CODE',
      () => this._importSave(), { style: 'ghost', fontSize: 14, depth: 2 }));
    this.add.existing(button(this, x + w / 2, y + 146, w - 40, 46, 'ERASE ALL PROGRESS',
      () => this._erase(), { style: 'danger', fontSize: 14, depth: 2 }));

    this.input.keyboard.on('keydown-ESC', () => this._back());
  }

  /* -------------------------------------------------------------- widgets */

  _slider(x, y, w, label, key, min, max, onChange) {
    const value = this.profile.settings[key] ?? min;
    this.add.text(x, y, label, textStyle(14, PALETTE.text));
    const valueText = this.add.text(x + w, y, this._fmtValue(key, value),
      textStyle(14, '#ffd166')).setOrigin(1, 0);

    const trackY = y + 26;
    const g = this.add.graphics().setDepth(1);
    const draw = (v) => {
      const t = (v - min) / (max - min);
      g.clear();
      g.fillStyle(0x2a1d33, 0.9);
      g.fillRoundedRect(x, trackY, w, 10, 5);
      g.fillStyle(PALETTE.ember, 1);
      g.fillRoundedRect(x, trackY, Math.max(10, w * t), 10, 5);
      g.fillStyle(0xffe0b0, 1);
      g.fillCircle(x + w * t, trackY + 5, 11);
    };
    draw(value);

    // A tall, finger-sized hit strip rather than the 10px track.
    const hit = this.add.rectangle(x + w / 2, trackY + 5, w + 30, 46, 0x000000, 0)
      .setInteractive().setDepth(2);
    const apply = (pointer) => {
      const t = Phaser.Math.Clamp((pointer.x - x) / w, 0, 1);
      const v = Math.round((min + t * (max - min)) * 100) / 100;
      this.profile.setSetting(key, v);
      draw(v);
      valueText.setText(this._fmtValue(key, v));
      onChange?.(v);
    };
    hit.on('pointerdown', apply);
    hit.on('pointermove', (p) => { if (p.isDown) apply(p); });

    return trackY + 40;
  }

  _fmtValue(key, v) {
    if (key === 'touchScale') return `${Math.round(v * 100)}%`;
    if (key === 'screenShake') return v === 0 ? 'off' : `${Math.round(v * 100)}%`;
    return `${Math.round(v * 100)}%`;
  }

  _toggle(x, y, w, label, key, onChange) {
    const draw = (on) => {
      g.clear();
      g.fillStyle(on ? PALETTE.ember : 0x2a1d33, 1);
      g.fillRoundedRect(x + w - 62, y - 2, 56, 28, 14);
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(x + w - 62 + (on ? 42 : 14), y + 12, 11);
    };
    this.add.text(x, y, label, textStyle(14, PALETTE.text));
    const g = this.add.graphics().setDepth(1);
    draw(this.profile.settings[key] !== false && !!this.profile.settings[key]);

    const hit = this.add.rectangle(x + w / 2, y + 12, w, 40, 0x000000, 0)
      .setInteractive().setDepth(2);
    onTap(hit, () => {
      const next = !this.profile.settings[key];
      this.profile.setSetting(key, next);
      draw(next);
      this.audio.play('ui');
      onChange?.(next);
    });
    return y + 44;
  }

  _cycle(x, y, w, label, key, options) {
    this.add.text(x, y, label, textStyle(14, PALETTE.text));
    const valueText = this.add.text(x + w, y, '', textStyle(14, '#ffd166')).setOrigin(1, 0);
    const render = () => {
      const cur = this.profile.settings[key];
      const found = options.find(([v]) => v === cur) || options[0];
      valueText.setText(found[1]);
    };
    render();
    const hit = this.add.rectangle(x + w / 2, y + 10, w, 40, 0x000000, 0)
      .setInteractive().setDepth(2);
    onTap(hit, () => {
      const cur = this.profile.settings[key];
      const idx = Math.max(0, options.findIndex(([v]) => v === cur));
      const next = options[(idx + 1) % options.length][0];
      this.profile.setSetting(key, next);
      render();
      this.audio.play('ui');
    });
    return y + 44;
  }

  _syncFullscreenLabel() {
    if (!this.fsBtn || !this.fsBtn.active) return;
    this.fsBtn.setLabel(isFullscreen() ? 'LEAVE FULLSCREEN NOW' : 'GO FULLSCREEN NOW');
  }

  async _toggleFullscreen() {
    await toggleFullscreen();
    this._syncFullscreenLabel();
  }

  /* -------------------------------------------------------------- preview */

  _preview() {
    this.previewGroup.removeAll(true);
    const s = this.profile.settings;
    const scale = s.touchScale ?? 1;
    const alpha = s.touchOpacity ?? 0.55;
    const left = !!s.leftHanded;

    const boxX = 470;
    const boxY = 470;
    const boxW = 340;
    const boxH = 96;

    const g = this.add.graphics();
    g.fillStyle(0x0a0610, 0.7);
    g.fillRoundedRect(boxX, boxY, boxW, boxH, 10);
    g.lineStyle(1.5, PALETTE.border, 0.8);
    g.strokeRoundedRect(boxX, boxY, boxW, boxH, 10);
    this.previewGroup.add(g);

    const stickX = left ? boxX + boxW - 52 : boxX + 52;
    this.previewGroup.add(this.add.image(stickX, boxY + boxH / 2, 'stickBase')
      .setDisplaySize(52 * scale, 52 * scale).setAlpha(alpha));
    this.previewGroup.add(this.add.image(stickX, boxY + boxH / 2, 'stickNub')
      .setDisplaySize(24 * scale, 24 * scale).setAlpha(alpha));

    const cluster = left ? boxX + 70 : boxX + boxW - 70;
    const layout = [[0, 14, 20], [-34, -4, 17], [-4, -34, 16], [-40, -40, 14]];
    for (const [dx, dy, r] of layout) {
      const sx = left ? cluster - dx : cluster + dx;
      this.previewGroup.add(this.add.image(sx, boxY + boxH / 2 + dy, 'btn')
        .setDisplaySize(r * 2 * scale, r * 2 * scale)
        .setTint(0xff8a3d).setAlpha(alpha));
    }
    this.previewGroup.add(this.add.text(boxX + boxW / 2, boxY + boxH + 6, 'live preview',
      textStyle(11, PALETTE.textFaint)).setOrigin(0.5, 0));
  }

  /* ----------------------------------------------------------------- save */

  async _exportSave() {
    const code = exportProfile(this.profile.data);
    let copied = false;
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
    } catch {
      copied = false;
    }
    if (copied) {
      this.toaster.show('Save code copied to clipboard', { colour: '#6bff9c' });
    } else {
      // Clipboard is blocked in a lot of embedded webviews — show it instead.
      window.prompt('Copy your save code:', code);
    }
  }

  _importSave() {
    const code = window.prompt('Paste a save code:');
    if (!code) return;
    try {
      const data = importProfile(code);
      this.profile.replaceWith(data);
      this.audio.play('unlock');
      this.toaster.show('Save loaded', { colour: '#6bff9c' });
      this.time.delayedCall(700, () => this.scene.start('MenuScene'));
    } catch (err) {
      this.audio.play('error');
      this.toaster.show(err.message || 'Could not read that code', { colour: '#ff8a9b' });
    }
  }

  _erase() {
    if (!this._armed) {
      this._armed = true;
      this.toaster.show('Tap again within 4 seconds to erase everything', { colour: '#ff8a9b', duration: 4000 });
      this.time.delayedCall(4000, () => { this._armed = false; });
      return;
    }
    this.profile.reset();
    this.scene.start('MenuScene');
  }

  _back() {
    if (this.overlay) {
      this.scene.stop();
      this.scene.resume('PauseScene');
      this.scene.setVisible(true, 'PauseScene');
      return;
    }
    this.cameras.main.fadeOut(180, 8, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(this.from));
  }

  shutdown() { this.toaster?.destroy(); }
}
