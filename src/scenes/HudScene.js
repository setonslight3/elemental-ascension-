/**
 * HudScene — the in-game overlay, running in parallel with PlayScene.
 *
 * Split into its own scene so it lives in screen space (no camera shake, no
 * scroll) and so pausing the world pauses the HUD with it.
 *
 * The on-screen touch controls live here too: they render in screen space and
 * write into PlayScene's InputManager, which is why the same Player code runs
 * from a keyboard, a pad or a thumb without knowing the difference.
 */

import { ctx } from '../core/Context.js';
import { VIEW, STYLE, ULTIMATE, ABILITIES } from '../data/Balance.js';
import { PALETTE, textStyle, bar, iconButton, hex } from '../ui/UI.js';
import { TouchControls } from '../systems/TouchControls.js';

const GLYPH = {
  fireball: 'gl_fireball',
  flamedash: 'gl_flamedash',
  eruption: 'gl_eruption',
  infernoWave: 'gl_infernoWave'
};

const KEY_HINTS = ['1', '2', '3', '4'];

export default class HudScene extends Phaser.Scene {
  constructor() { super('HudScene'); }

  init(data) {
    this.play = data.play;
    this.profile = ctx.profile;
    this.audio = ctx.audio;
  }

  create() {
    const W = VIEW.WIDTH;
    const H = VIEW.HEIGHT;
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.cameras.main.transparent = true;

    /* ------------------------------------------------------------ vitals */

    this.vitalsBg = this.add.graphics().setDepth(0).setScrollFactor(0);
    this.vitalsBg.fillStyle(0x0a0610, 0.55);
    this.vitalsBg.fillRoundedRect(18, 16, 380, 92, 12);
    this.vitalsBg.lineStyle(2, 0x2c1f38, 0.8);
    this.vitalsBg.strokeRoundedRect(18, 16, 380, 92, 12);

    this.hpBar = bar(this, 32, 28, 352, 22, { fill: 0xe23a4e, ghost: true, depth: 1 });
    this.hpText = this.add.text(38, 32, '', textStyle(15, '#ffe6ea')).setDepth(2).setScrollFactor(0);

    this.manaBar = bar(this, 32, 56, 280, 12, { fill: 0x4a8cff, depth: 1 });
    this.staminaBar = bar(this, 32, 74, 232, 8, { fill: 0x6bff9c, depth: 1 });

    this.add.text(320, 54, 'MANA', textStyle(11, PALETTE.textFaint)).setDepth(2).setScrollFactor(0);
    this.add.text(272, 72, 'STAM', textStyle(11, PALETTE.textFaint)).setDepth(2).setScrollFactor(0);

    this.statusText = this.add.text(32, 90, '', textStyle(13, '#7ce8ff')).setDepth(2).setScrollFactor(0);

    /* ------------------------------------------------------------- style */

    this.styleLetter = this.add.text(W - 34, 34, 'C',
      textStyle(58, '#8fa3b8', { stroke: '#120a14', strokeThickness: 6 }))
      .setOrigin(1, 0).setDepth(2).setScrollFactor(0);
    this.styleBar = bar(this, W - 214, 96, 190, 8, { fill: 0x8fa3b8, depth: 1 });
    this.comboText = this.add.text(W - 34, 108, '', textStyle(18, '#ffd166'))
      .setOrigin(1, 0).setDepth(2).setScrollFactor(0);

    /* --------------------------------------------------------- objective */

    this.objectivePanel = this.add.graphics().setDepth(0).setScrollFactor(0);
    this.objectiveText = this.add.text(W / 2, 30, '', textStyle(17, '#ffd166'))
      .setOrigin(0.5, 0).setDepth(2).setScrollFactor(0);
    this.objectiveSub = this.add.text(W / 2, 52, '', textStyle(13, PALETTE.textDim))
      .setOrigin(0.5, 0).setDepth(2).setScrollFactor(0);
    this.objectiveBar = bar(this, W / 2 - 120, 74, 240, 6, { fill: 0xffd166, depth: 1 });

    /* ---------------------------------------------------------- boss bar */

    this.bossGroup = this.add.container(0, 0).setDepth(2).setScrollFactor(0).setVisible(false);
    const bossBg = this.add.graphics();
    bossBg.fillStyle(0x0a0610, 0.6);
    bossBg.fillRoundedRect(W / 2 - 340, H - 96, 680, 58, 10);
    bossBg.lineStyle(2, 0x5a2030, 0.9);
    bossBg.strokeRoundedRect(W / 2 - 340, H - 96, 680, 58, 10);
    this.bossGroup.add(bossBg);
    this.bossName = this.add.text(W / 2, H - 88, '', textStyle(15, '#ff8a9b')).setOrigin(0.5, 0);
    this.bossGroup.add(this.bossName);
    this.bossBar = bar(this, W / 2 - 326, H - 66, 652, 16, { fill: 0xe2344e, ghost: true, depth: 3 });
    this.bossStagger = bar(this, W / 2 - 326, H - 48, 652, 5, { fill: 0xffd451, depth: 3 });
    this.bossPhaseMarks = this.add.graphics().setDepth(4).setScrollFactor(0);
    this.bossBar.g.setVisible(false);
    this.bossStagger.g.setVisible(false);

    /* --------------------------------------------------------- abilities */

    this.abilityIcons = [];
    const baseX = 30;
    const baseY = H - 92;
    for (let i = 0; i < 4; i++) {
      const x = baseX + i * 66;
      const g = this.add.graphics().setDepth(1).setScrollFactor(0);
      const icon = this.add.image(x + 26, baseY + 26, 'gl_fireball')
        .setDisplaySize(28, 28).setDepth(2).setScrollFactor(0);
      const key = this.add.text(x + 46, baseY + 40, KEY_HINTS[i],
        textStyle(12, PALETTE.textFaint)).setDepth(3).setScrollFactor(0);
      const cost = this.add.text(x + 26, baseY + 58, '', textStyle(11, '#7ca7ff'))
        .setOrigin(0.5, 0).setDepth(3).setScrollFactor(0);
      this.abilityIcons.push({ g, icon, key, cost, x, y: baseY });
    }

    // Ultimate.
    this.ultGfx = this.add.graphics().setDepth(1).setScrollFactor(0);
    this.ultIcon = this.add.image(baseX + 4 * 66 + 34, baseY + 26, 'gl_ultimate')
      .setDisplaySize(32, 32).setDepth(2).setScrollFactor(0);
    this.ultLabel = this.add.text(baseX + 4 * 66 + 34, baseY + 62, 'Q',
      textStyle(12, PALETTE.textFaint)).setOrigin(0.5, 0).setDepth(3).setScrollFactor(0);

    // Potions.
    this.potionIcon = this.add.image(baseX + 4 * 66 + 110, baseY + 26, 'gl_potion')
      .setDisplaySize(26, 26).setTint(0x6bff9c).setDepth(2).setScrollFactor(0);
    this.potionText = this.add.text(baseX + 4 * 66 + 130, baseY + 16, '',
      textStyle(18, '#c8ffd8')).setDepth(2).setScrollFactor(0);
    this.potionKey = this.add.text(baseX + 4 * 66 + 110, baseY + 62, 'R',
      textStyle(12, PALETTE.textFaint)).setOrigin(0.5, 0).setDepth(3).setScrollFactor(0);

    /* -------------------------------------------------------------- misc */

    this.pauseBtn = iconButton(this, W - 42, 150, 46, 'gl_pause',
      () => this.play.requestPause('button'), { depth: 5 });

    // Low-health warning vignette.
    this.lowHp = this.add.image(0, 0, 'vignette').setOrigin(0)
      .setDisplaySize(W, H).setTint(0xff2f4f).setAlpha(0)
      .setDepth(6).setScrollFactor(0).setBlendMode(Phaser.BlendModes.ADD);

    // Doused overlay (Nullflame mechanic).
    this.doused = this.add.image(0, 0, 'vignette').setOrigin(0)
      .setDisplaySize(W, H).setTint(0x3a8fff).setAlpha(0)
      .setDepth(6).setScrollFactor(0).setBlendMode(Phaser.BlendModes.ADD);

    this.fpsText = this.add.text(W - 30, H - 22, '', textStyle(12, PALETTE.textFaint))
      .setOrigin(1, 0.5).setDepth(6).setScrollFactor(0)
      .setVisible(!!this.profile.settings.showFps);

    /* ----------------------------------------------------- touch controls */

    this.touch = new TouchControls(this, this.play.inputManager, this.profile);

    // First-run hint, once per install.
    if (!this.profile.data.seenTutorial) {
      this.profile.data.seenTutorial = true;
      this.profile.touch();
      this._showControlsHint();
    }
  }

  _showControlsHint() {
    const W = VIEW.WIDTH;
    const isTouch = this.sys.game.device.input.touch;
    const lines = isTouch
      ? ['Left thumb — move.  Push to the edge to sprint.',
         'Right thumb — attack, jump, roll, guard.',
         'Guard the instant an amber flash lands to PARRY.',
         'Red flash means unblockable — roll instead.']
      : ['A / D — move   ·   SHIFT — sprint   ·   SPACE — jump',
         'J — attack   ·   K — guard   ·   L — roll   ·   1-4 — fire',
         'Guard the instant an amber flash lands to PARRY.',
         'Red flash means unblockable — roll instead.'];

    const g = this.add.graphics().setDepth(20).setScrollFactor(0);
    g.fillStyle(0x0a0610, 0.86);
    g.fillRoundedRect(W / 2 - 300, 160, 600, 150, 12);
    g.lineStyle(2, PALETTE.ember, 0.8);
    g.strokeRoundedRect(W / 2 - 300, 160, 600, 150, 12);

    const texts = [this.add.text(W / 2, 178, 'CONTROLS', textStyle(16, '#ffd166'))
      .setOrigin(0.5, 0).setDepth(21).setScrollFactor(0)];
    lines.forEach((line, i) => {
      texts.push(this.add.text(W / 2, 208 + i * 24, line, textStyle(15, PALETTE.text))
        .setOrigin(0.5, 0).setDepth(21).setScrollFactor(0));
    });

    this.time.delayedCall(7000, () => {
      this.tweens.add({
        targets: [g, ...texts], alpha: 0, duration: 500,
        onComplete: () => { g.destroy(); texts.forEach((t) => t.destroy()); }
      });
    });
  }

  /* ---------------------------------------------------------------- frame */

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    const play = this.play;
    if (!play || !play.player) return;
    const p = play.player;

    /* ------------------------------------------------------------ vitals */

    this.hpBar.setValue(p.hp / p.maxHp).update(dt);
    this.hpText.setText(`${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`);
    this.manaBar.setValue(p.mana / p.maxMana).update(dt);
    this.staminaBar.setValue(p.stamina / p.maxStamina).update(dt);
    this.staminaBar.setFill(p.guardBroken > 0 ? 0xff4d6d : 0x6bff9c);

    const hpFrac = p.hp / p.maxHp;
    this.lowHp.setAlpha(hpFrac < 0.3 && p.alive
      ? (0.3 - hpFrac) * 1.6 * (0.6 + Math.sin(time / 220) * 0.4)
      : 0);
    this.doused.setAlpha(p.doused > 0 ? 0.25 + Math.sin(time / 300) * 0.08 : 0);

    let status = '';
    if (p.ascended > 0) status = `ASCENDED  ${p.ascended.toFixed(1)}s`;
    else if (p.doused > 0) status = `DOUSED — land ${p.dousedHitsNeeded} hits to relight`;
    else if (p.guardBroken > 0) status = 'GUARD BROKEN';
    this.statusText.setText(status);
    this.statusText.setColor(p.ascended > 0 ? '#ffd451' : p.guardBroken > 0 ? '#ff6b6b' : '#7ce8ff');

    /* ------------------------------------------------------------- style */

    const rank = play.style.rank;
    this.styleLetter.setText(rank.key).setColor(hex(rank.colour));
    const scalePulse = 1 + Math.max(0, 0.25 - play.style.sinceGain) * 0.8;
    this.styleLetter.setScale(Phaser.Math.Linear(this.styleLetter.scaleX, scalePulse, 0.25));
    this.styleBar.setValue(play.style.progress).update(dt);
    this.styleBar.setFill(rank.colour);
    this.comboText.setText(p.comboCount > 1 ? `${p.comboCount} HIT` : '');
    this.comboText.setAlpha(p.comboTimer > 0 ? Math.min(1, p.comboTimer) : 0);

    /* --------------------------------------------------------- objective */

    this._updateObjective(dt);

    /* -------------------------------------------------------------- boss */

    // The two boss bars own their own Graphics objects rather than living in
    // the container, so their visibility has to be driven explicitly.
    const boss = play.boss;
    const showBoss = !!(boss && boss.alive && !play.bossIntro);
    if (showBoss !== this.bossGroup.visible) {
      this.bossGroup.setVisible(showBoss);
      this.bossBar.g.setVisible(showBoss);
      this.bossStagger.g.setVisible(showBoss);
      if (showBoss) this._drawPhaseMarks(boss);
      else this.bossPhaseMarks.clear();
    }
    if (showBoss) {
      this.bossName.setText(`${boss.displayName}   —   ${boss.phase.name}`);
      this.bossBar.setValue(boss.healthFraction).update(dt);
      this.bossStagger.setValue(boss.staggerFraction).update(dt);
    }

    /* --------------------------------------------------------- abilities */

    const status2 = p.abilityStatus();
    const usingTouch = this.play.inputManager.lastSource === 'touch';
    for (let i = 0; i < 4; i++) {
      const s = status2[i];
      const ui = this.abilityIcons[i];
      const show = !s.locked && !usingTouch;
      ui.g.setVisible(show); ui.icon.setVisible(show); ui.key.setVisible(show); ui.cost.setVisible(show);
      if (!show) continue;

      const def = ABILITIES[s.id];
      ui.icon.setTexture(GLYPH[s.id] || 'gl_fireball');
      ui.icon.setTint(s.ready ? 0xffffff : 0x6a5c78);
      ui.cost.setText(s.charges != null ? `x${s.charges}` : `${def.manaCost}`);
      ui.cost.setColor(p.mana >= def.manaCost || p.ascended > 0 ? '#7ca7ff' : '#ff6b6b');

      const g = ui.g;
      g.clear();
      g.fillStyle(0x0a0610, 0.6);
      g.fillRoundedRect(ui.x, ui.y, 52, 52, 10);
      g.lineStyle(2, s.ready ? def.colour : 0x3a2c48, s.ready ? 0.95 : 0.6);
      g.strokeRoundedRect(ui.x, ui.y, 52, 52, 10);
      if (s.ratio < 1) {
        g.fillStyle(0x000000, 0.55);
        g.fillRect(ui.x + 2, ui.y + 2, 48, 48 * (1 - s.ratio));
      }
    }

    // Ultimate meter.
    const ultRatio = p.ascended > 0 ? 1 : p.ultimate / ULTIMATE.max;
    const ux = this.ultIcon.x - 26;
    const uy = this.ultIcon.y - 26;
    this.ultGfx.clear();
    this.ultGfx.setVisible(!usingTouch);
    this.ultIcon.setVisible(!usingTouch);
    this.ultLabel.setVisible(!usingTouch);
    if (!usingTouch) {
      this.ultGfx.fillStyle(0x0a0610, 0.6);
      this.ultGfx.fillRoundedRect(ux, uy, 52, 52, 10);
      this.ultGfx.fillStyle(0xffd451, 0.28);
      this.ultGfx.fillRect(ux + 2, uy + 50 - 48 * ultRatio, 48, 48 * ultRatio);
      const ready = ultRatio >= 1;
      this.ultGfx.lineStyle(2, ready ? 0xffd451 : 0x3a2c48, ready ? 1 : 0.6);
      this.ultGfx.strokeRoundedRect(ux, uy, 52, 52, 10);
      this.ultIcon.setTint(ready ? 0xffd451 : 0x6a5c78);
      this.ultIcon.setScale(ready ? 0.5 + Math.sin(time / 200) * 0.03 : 0.5);
      this.ultIcon.setDisplaySize(32 * (ready ? 1 + Math.sin(time / 220) * 0.06 : 1),
        32 * (ready ? 1 + Math.sin(time / 220) * 0.06 : 1));
    }

    this.potionText.setText(String(this.profile.data.potions));
    this.potionIcon.setAlpha(this.profile.data.potions > 0 ? 1 : 0.35);
    this.potionText.setVisible(!usingTouch);
    this.potionIcon.setVisible(!usingTouch);
    this.potionKey.setVisible(!usingTouch);

    /* ----------------------------------------------------- touch controls */

    this.touch.update(dt, {
      abilities: status2,
      ultimate: { ready: ultRatio >= 1, ratio: ultRatio },
      potions: this.profile.data.potions
    });

    if (this.fpsText.visible) {
      this.fpsText.setText(`${Math.round(this.game.loop.actualFps)} fps · ${play.enemies.length} units`);
    }
  }

  _updateObjective(dt) {
    const play = this.play;
    const o = play.objective;
    let title = '';
    let sub = '';
    let ratio = 0;

    switch (o.type) {
      case 'waves': {
        const total = (play.stage.waves || []).length;
        const current = Math.min(total, Math.max(1, play.waveIndex + 1));
        title = `WAVE ${current} / ${total}`;
        const alive = play.enemies.filter((e) => e.alive && !e.isCore).length;
        sub = alive > 0 ? `${alive} hostile${alive > 1 ? 's' : ''} remaining` : 'incoming…';
        ratio = (current - 1 + (alive === 0 ? 1 : 0)) / total;
        break;
      }
      case 'survive': {
        const left = Math.max(0, play.survivalLeft);
        title = `HOLD OUT — ${Math.ceil(left)}s`;
        sub = 'reinforcements keep coming';
        ratio = 1 - left / o.target;
        break;
      }
      case 'core': {
        title = `CORES ${o.progress} / ${o.target}`;
        sub = 'destroy every reactor core';
        ratio = o.progress / o.target;
        break;
      }
      case 'hunt': {
        title = `MARKED ${o.progress} / ${o.target}`;
        sub = 'elites are marked with a star';
        ratio = o.progress / o.target;
        break;
      }
      case 'boss': {
        title = play.bossIntro ? '' : 'DESTROY THE BOSS';
        sub = '';
        ratio = 0;
        break;
      }
      default: break;
    }

    this.objectiveText.setText(title);
    this.objectiveSub.setText(sub);
    const show = !!title && o.type !== 'boss';
    this.objectiveBar.g.setVisible(show);
    if (show) this.objectiveBar.setValue(Phaser.Math.Clamp(ratio, 0, 1)).update(dt);

    this.objectivePanel.clear();
    if (title) {
      const w = 300;
      this.objectivePanel.fillStyle(0x0a0610, 0.5);
      this.objectivePanel.fillRoundedRect(VIEW.WIDTH / 2 - w / 2, 20, w, show ? 68 : 44, 10);
    }
  }

  _drawPhaseMarks(boss) {
    const W = VIEW.WIDTH;
    const H = VIEW.HEIGHT;
    const g = this.bossPhaseMarks;
    g.clear();
    g.lineStyle(2, 0x0a0610, 0.9);
    for (const phase of boss.phases.slice(1)) {
      const x = W / 2 - 326 + 652 * phase.at;
      g.beginPath();
      g.moveTo(x, H - 66);
      g.lineTo(x, H - 50);
      g.strokePath();
    }
  }

  shutdown() {
    this.touch?.destroy();
    this.hpBar?.destroy();
    this.manaBar?.destroy();
    this.staminaBar?.destroy();
    this.styleBar?.destroy();
    this.objectiveBar?.destroy();
    this.bossBar?.destroy();
    this.bossStagger?.destroy();
  }
}
