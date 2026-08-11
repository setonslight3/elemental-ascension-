/**
 * PauseScene — modal over a paused run.
 *
 * Abandoning is deliberately a two-tap action with the cost spelled out:
 * quitting mid-stage should never be something a thumb does by accident.
 */

import { ctx } from '../core/Context.js';
import { VIEW, PROGRESSION } from '../data/Balance.js';
import { PALETTE, textStyle, button, panel, fmt, fmtTime } from '../ui/UI.js';

export default class PauseScene extends Phaser.Scene {
  constructor() { super('PauseScene'); }

  init(data) {
    this.play = data.play;
    this.reason = data.reason || 'user';
    this.profile = ctx.profile;
    this.audio = ctx.audio;
  }

  create() {
    const W = VIEW.WIDTH;
    const H = VIEW.HEIGHT;

    this.add.rectangle(0, 0, W, H, 0x05030a, 0.82).setOrigin(0).setDepth(0).setInteractive();

    panel(this, W / 2 - 250, 96, 500, 528, { depth: 1, accent: PALETTE.ember });

    this.add.text(W / 2, 128, 'PAUSED', textStyle(38, '#ffd166')).setOrigin(0.5).setDepth(2);
    this.add.text(W / 2, 168, this.play.stage.name.toUpperCase(),
      textStyle(16, PALETTE.textDim)).setOrigin(0.5).setDepth(2);

    /* -------------------------------------------------------- run summary */

    const p = this.play.player;
    const stats = [
      ['Time', fmtTime(this.play.elapsed * 1000)],
      ['Robots destroyed', fmt(this.play.killCount)],
      ['Style rank', this.play.style.rank.key],
      ['Parries', fmt(p.parries)],
      ['Damage dealt', fmt(p.damageDealt)],
      ['Health', `${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`]
    ];
    let y = 208;
    for (const [label, value] of stats) {
      this.add.text(W / 2 - 210, y, label, textStyle(15, PALETTE.textFaint)).setDepth(2);
      this.add.text(W / 2 + 210, y, value, textStyle(15, PALETTE.text)).setOrigin(1, 0).setDepth(2);
      y += 26;
    }

    /* ------------------------------------------------------------ buttons */

    const bx = W / 2;
    let by = 396;
    const gap = 60;

    this.add.existing(button(this, bx, by, 420, 52, 'RESUME', () => this._resume(),
      { style: 'primary', depth: 2 }));
    by += gap;

    this.add.existing(button(this, bx, by, 420, 48, 'RESTART STAGE', () => this._restart(),
      { style: 'ghost', depth: 2 }));
    by += gap;

    this.add.existing(button(this, bx, by, 420, 48, 'SETTINGS',
      () => {
        this.scene.launch('SettingsScene', { from: 'PauseScene', overlay: true });
        this.scene.setVisible(false);
        this.scene.pause();
      }, { style: 'ghost', depth: 2 }));
    by += gap;

    this.abandonBtn = button(this, bx, by, 420, 48, 'ABANDON RUN', () => this._abandon(),
      { style: 'danger', depth: 2 });
    this.add.existing(this.abandonBtn);

    this.abandonHint = this.add.text(W / 2, by + 34,
      `Abandoning keeps ${Math.round(PROGRESSION.DEATH_KEEP_XP * 100)}% of this run's XP and half its loot.`,
      textStyle(12, PALETTE.textFaint)).setOrigin(0.5).setDepth(2);

    this.input.keyboard.on('keydown-ESC', () => this._resume());
    this.input.keyboard.on('keydown-P', () => this._resume());

    // Returning from the settings overlay.
    this.events.on('wake', () => this.scene.setVisible(true));
    this.events.on('resume', () => this.scene.setVisible(true));
  }

  _resume() {
    this.scene.stop();
    this.play.resumeFromPause();
  }

  _restart() {
    this.audio.resume();
    const index = this.play.stageIndex;
    this.scene.stop('HudScene');
    this.scene.stop();
    // Restart via the play scene itself: starting a running scene shuts it
    // down synchronously first, whereas stop-then-start would defer the
    // shutdown until after the new run had already been built.
    this.play.scene.start('PlayScene', { stageIndex: index });
  }

  _abandon() {
    if (!this._armed) {
      this._armed = true;
      this.abandonBtn.setLabel('TAP AGAIN TO CONFIRM');
      this.abandonHint.setText('Your progress on this stage will be lost.').setColor('#ff8a9b');
      this.time.delayedCall(3000, () => {
        if (!this.scene.isActive()) return;
        this._armed = false;
        this.abandonBtn.setLabel('ABANDON RUN');
        this.abandonHint.setColor(PALETTE.textFaint);
      });
      return;
    }
    this.audio.resume();
    this.audio.stopMusic();
    // Settle the run as a defeat so partial rewards still land.
    const play = this.play;
    this.scene.stop();
    play.scene.resume();
    play.finished = false;
    play._finish(false);
  }
}
