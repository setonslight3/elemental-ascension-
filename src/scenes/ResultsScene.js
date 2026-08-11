/**
 * ResultsScene — the post-run debrief.
 *
 * Rewards are shown *itemised* — base, style multiplier, repeat-clear decay —
 * because a number that appears from nowhere teaches the player nothing. When
 * the payout is small, this screen says exactly why.
 */

import { ctx } from '../core/Context.js';
import { VIEW, STYLE } from '../data/Balance.js';
import { PALETTE, textStyle, button, panel, bar, fmt, fmtTime, hex, scrollList } from '../ui/UI.js';
import { getStage, STAGES } from '../data/Stages.js';
import { RARITY } from '../data/Balance.js';
import { BASES } from '../data/Items.js';
import { AFFIX_BY_ID } from '../data/Items.js';

export default class ResultsScene extends Phaser.Scene {
  constructor() { super('ResultsScene'); }

  create() {
    this.profile = ctx.profile;
    this.audio = ctx.audio;
    this.result = ctx.lastResult;
    const W = VIEW.WIDTH;
    const H = VIEW.HEIGHT;

    if (!this.result) { this.scene.start('HubScene'); return; }
    const r = this.result;

    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.cameras.main.fadeIn(340, 8, 4, 12);

    const bg = this.add.graphics().setDepth(-10);
    bg.fillGradientStyle(0x0e0913, 0x0e0913, r.victory ? 0x241326 : 0x2a0f14, r.victory ? 0x1a1020 : 0x200b10, 1);
    bg.fillRect(0, 0, W, H);

    this.audio.playMusic(r.victory ? 'hub' : 'menu');

    /* ------------------------------------------------------------- banner */

    const title = this.add.text(W / 2, 54, r.victory ? 'STAGE CLEAR' : 'YOU FELL',
      textStyle(46, r.victory ? '#6bff9c' : '#ff6b7f', { stroke: '#0d0810', strokeThickness: 6 }))
      .setOrigin(0.5, 0).setScale(0.7).setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 420, ease: 'Back.easeOut' });

    this.add.text(W / 2, 108, `${r.stageIndex}. ${r.stageName}`,
      textStyle(18, PALETTE.textDim)).setOrigin(0.5, 0);

    /* -------------------------------------------------------------- grade */

    const gradePanelX = 40;
    panel(this, gradePanelX, 150, 300, 300, { depth: 0, accent: r.grade.colour });
    this.add.text(gradePanelX + 150, 172, 'STYLE RANK', textStyle(13, PALETTE.textFaint)).setOrigin(0.5, 0);

    const gradeText = this.add.text(gradePanelX + 150, 236, r.grade.key,
      textStyle(96, hex(r.grade.colour), { stroke: '#0d0810', strokeThickness: 8 }))
      .setOrigin(0.5).setScale(0.1);
    this.time.delayedCall(500, () => {
      this.tweens.add({ targets: gradeText, scale: 1, duration: 520, ease: 'Back.easeOut' });
      this.audio.play('rank', { rate: 0.9 + STYLE.RANKS.indexOf(r.grade) * 0.1 });
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = this.add.image(gradePanelX + 150, 236, 'spark')
          .setTint(r.grade.colour).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(12, 12);
        this.tweens.add({
          targets: s,
          x: gradePanelX + 150 + Math.cos(a) * Phaser.Math.Between(60, 160),
          y: 236 + Math.sin(a) * Phaser.Math.Between(60, 140),
          alpha: 0, duration: 700, onComplete: () => s.destroy()
        });
      }
    });

    this.add.text(gradePanelX + 150, 306, `reward ×${r.grade.mult.toFixed(2)}`,
      textStyle(16, hex(r.grade.colour))).setOrigin(0.5, 0);

    if (r.flawless) {
      this.add.text(gradePanelX + 150, 330, 'FLAWLESS — never took a hit',
        textStyle(13, '#ffd451')).setOrigin(0.5, 0);
    }

    const runStats = [
      ['Time', fmtTime(r.timeMs)],
      ['Robots destroyed', fmt(r.kills)],
      ['Damage dealt', fmt(r.damageDealt)],
      ['Damage taken', fmt(r.damageTaken)],
      ['Parries', fmt(r.parries)]
    ];
    // Five rows at 18px starting at 352 land the last baseline at 442, inside
    // the panel's 450 bottom edge.
    let sy = 352;
    for (const [label, value] of runStats) {
      this.add.text(gradePanelX + 22, sy, label, textStyle(12, PALETTE.textFaint));
      this.add.text(gradePanelX + 278, sy, value, textStyle(12, PALETTE.text)).setOrigin(1, 0);
      sy += 18;
    }

    /* ------------------------------------------------------------ rewards */

    const rx = 368;
    const rw = 380;
    panel(this, rx, 150, rw, 300, { depth: 0 });
    this.add.text(rx + rw / 2, 172, 'REWARDS', textStyle(13, PALETTE.textFaint)).setOrigin(0.5, 0);

    const rows = [
      { label: 'Experience', value: fmt(r.xp), colour: '#9ad3ff' },
      { label: 'Ember', value: fmt(r.ember), colour: '#ffb43d' }
    ];
    if (r.shards > 0) rows.push({ label: 'Cinder Shards', value: fmt(r.shards), colour: '#c074ff' });
    if (!r.victory) rows.push({ label: 'Lost on defeat', value: 'partial payout', colour: '#ff8a9b' });
    if (r.replayMult < 1) rows.push({ label: 'Repeat clear', value: `×${r.replayMult.toFixed(2)}`, colour: '#ff9b6b' });

    let ry = 206;
    for (const row of rows) {
      this.add.text(rx + 22, ry, row.label, textStyle(16, PALETTE.textDim));
      this.add.text(rx + rw - 22, ry, row.value, textStyle(20, row.colour)).setOrigin(1, 0);
      ry += 34;
    }

    // XP bar toward the next level.
    const xpNeeded = this.profile.xpForNextLevel();
    const xpInto = this.profile.xpIntoLevel();
    this.add.text(rx + 22, 352, `LEVEL ${this.profile.level}`, textStyle(15, '#ffd166'));
    this.xpBar = bar(this, rx + 22, 376, rw - 44, 12, { fill: PALETTE.emberHot, depth: 1 });
    this.xpBar.setInstant(xpNeeded > 0 ? xpInto / xpNeeded : 1);
    this.add.text(rx + 22, 394,
      xpNeeded > 0 ? `${fmt(xpInto)} / ${fmt(xpNeeded)} to level ${this.profile.level + 1}` : 'MAX LEVEL',
      textStyle(12, PALETTE.textFaint));

    if (r.levels > 0) {
      const lvl = this.add.text(rx + rw / 2, 424, `LEVEL UP  ×${r.levels}`,
        textStyle(22, '#6bff9c')).setOrigin(0.5, 0);
      this.tweens.add({ targets: lvl, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
      this.time.delayedCall(900, () => this.audio.play('levelup'));
    }
    if (r.skillPoints > 0) {
      this.add.text(rx + rw / 2, r.levels > 0 ? 452 : 428,
        `+${r.skillPoints} skill point${r.skillPoints > 1 ? 's' : ''}`,
        textStyle(15, '#ffd166')).setOrigin(0.5, 0);
    }

    /* --------------------------------------------------------------- loot */

    const lx = 776;
    const lw = W - lx - 40;
    panel(this, lx, 150, lw, 300, { depth: 0 });
    this.add.text(lx + lw / 2, 172, `LOOT  (${r.loot.length})`,
      textStyle(13, PALETTE.textFaint)).setOrigin(0.5, 0);

    if (r.loot.length === 0) {
      this.add.text(lx + lw / 2, 280, 'Nothing worth carrying home.',
        textStyle(15, PALETTE.textFaint)).setOrigin(0.5);
    } else {
      this.lootList = scrollList(this, lx + 14, 196, lw - 28, 240, r.loot,
        (entry, i, w) => this._lootRow(entry, w), { rowHeight: 56, gap: 6, depth: 3 });
    }

    /* ------------------------------------------------------------ unlocks */

    let uy = 470;
    if (r.unlockedAbility) {
      this._unlockBanner(W / 2, uy, `NEW ABILITY — ${r.unlockedAbility.name}`,
        r.unlockedAbility.desc, 0xff8a3d);
      uy += 62;
      this.time.delayedCall(1200, () => this.audio.play('unlock'));
    }
    if (r.newStage) {
      this._unlockBanner(W / 2, uy, `STAGE UNLOCKED — ${r.newStage.index}. ${r.newStage.name}`,
        r.newStage.brief, 0x6bff9c);
      uy += 62;
    }

    /* ------------------------------------------------------------ buttons */

    const by = H - 52;
    const nextStage = r.victory ? getStage(r.stageIndex + 1) : null;
    const canNext = nextStage && this.profile.isStageUnlocked(nextStage.index);

    this.add.existing(button(this, W / 2 - 340, by, 300, 56, 'RETURN TO HUB',
      () => this._go('HubScene'), { style: 'ghost', depth: 4 }));

    this.add.existing(button(this, W / 2, by, 300, 56, r.victory ? 'REPLAY STAGE' : 'TRY AGAIN',
      () => this._retry(), { style: r.victory ? 'ghost' : 'primary', depth: 4 }));

    const nextBtn = button(this, W / 2 + 340, by, 300, 56,
      canNext ? `NEXT — ${nextStage.name.toUpperCase()}` : 'MISSION SELECT',
      () => {
        if (canNext) this._play(nextStage.index);
        else this._go('MissionScene');
      }, { style: r.victory ? 'primary' : 'ghost', depth: 4 });
    this.add.existing(nextBtn);

    // A wounded Ascendant is told where to fix that.
    const hpLeft = this.profile.data.currentHp;
    const maxHp = this.profile.stats.maxHp;
    if (hpLeft != null && hpLeft < maxHp * 0.55) {
      this.add.text(W / 2, H - 96,
        `You are carrying ${Math.round((hpLeft / maxHp) * 100)}% health into the next stage. The Hub restores it.`,
        textStyle(14, '#ffb43d')).setOrigin(0.5);
    }

    this.input.keyboard.on('keydown-ESC', () => this._go('HubScene'));
  }

  _lootRow(entry, w) {
    const item = entry.item;
    const c = this.add.container(0, 0);
    c.rowHeight = 56;
    const colour = RARITY.colour[item.rarity];

    const g = this.add.graphics();
    g.fillStyle(PALETTE.panelHi, 0.85);
    g.fillRoundedRect(0, 0, w, 56, 8);
    g.fillStyle(colour, 0.9);
    g.fillRoundedRect(0, 0, 5, 56, { tl: 8, bl: 8, tr: 0, br: 0 });
    c.add(g);

    const base = (BASES[item.slot] || []).find((b) => b.id === item.base);
    c.add(this.add.text(16, 8, item.name, textStyle(15, hex(colour))));
    c.add(this.add.text(16, 30, `${base ? base.name : item.slot} · i${item.ilvl} · ${item.rarity}`,
      textStyle(12, PALETTE.textFaint)));

    if (entry.salvaged) {
      c.add(this.add.text(w - 12, 28,
        `bag full — auto-salvaged for ${entry.ember} Ember`,
        textStyle(11, '#ff9b6b')).setOrigin(1, 0.5));
    } else if (item.affixes?.length) {
      const names = item.affixes.slice(0, 2)
        .map((a) => AFFIX_BY_ID[a.id]?.name).filter(Boolean).join(' · ');
      c.add(this.add.text(w - 12, 28, names, textStyle(11, PALETTE.textDim)).setOrigin(1, 0.5));
    }
    return c;
  }

  _unlockBanner(x, y, title, subtitle, colour) {
    const w = 720;
    const g = this.add.graphics().setDepth(2);
    g.fillStyle(colour, 0.14);
    g.fillRoundedRect(x - w / 2, y, w, 52, 10);
    g.lineStyle(2, colour, 0.8);
    g.strokeRoundedRect(x - w / 2, y, w, 52, 10);
    this.add.text(x - w / 2 + 20, y + 8, title, textStyle(17, hex(colour))).setDepth(3);
    this.add.text(x - w / 2 + 20, y + 30, subtitle,
      textStyle(12, PALETTE.textDim, { wordWrap: { width: w - 40 } })).setDepth(3);
    this.tweens.add({ targets: g, alpha: { from: 0.4, to: 1 }, duration: 700, yoyo: true, repeat: 2 });
  }

  _retry() { this._play(this.result.stageIndex); }

  _play(index) {
    this.cameras.main.fadeOut(260, 8, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () =>
      this.scene.start('PlayScene', { stageIndex: index }));
  }

  _go(key) {
    this.cameras.main.fadeOut(220, 8, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(key));
  }

  update(time, delta) {
    this.lootList?.update(delta / 1000);
    this.xpBar?.update(delta / 1000);
  }

  shutdown() {
    this.lootList?.destroy();
  }
}
