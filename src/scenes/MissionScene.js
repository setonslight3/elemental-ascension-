/**
 * MissionScene — pick a stage.
 *
 * The list is the honest one: it shows what each stage *is* (objective,
 * modifiers, enemy roster) before you commit, plus your record on it and how
 * much its rewards have decayed from repeat clears. Nothing hidden behind a
 * "start" button.
 */

import { ctx } from '../core/Context.js';
import { VIEW } from '../data/Balance.js';
import { PALETTE, textStyle, button, panel, scrollList, fmt, fmtTime, hex, backLabel } from '../ui/UI.js';
import { STAGES, ACTS, BIOMES, MODIFIERS, getStage } from '../data/Stages.js';
import { ARCHETYPES, BOSSES } from '../data/Enemies.js';
import { REWARDS, STYLE } from '../data/Balance.js';

const OBJECTIVE_TEXT = {
  waves: () => 'Clear every wave of robots.',
  survive: (o) => `Survive for ${o.duration} seconds.`,
  core: (o) => `Destroy ${o.cores} reactor cores while under attack.`,
  hunt: (o) => `Hunt down ${o.targets} marked elite units.`,
  boss: () => 'Defeat the boss.'
};

export default class MissionScene extends Phaser.Scene {
  constructor() { super('MissionScene'); }

  init(data) { this.from = data?.from || 'HubScene'; }

  create() {
    this.profile = ctx.profile;
    this.audio = ctx.audio;
    const W = VIEW.WIDTH;
    const H = VIEW.HEIGHT;

    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.cameras.main.fadeIn(240, 8, 4, 12);

    const bgGfx = this.add.graphics().setDepth(-10);
    bgGfx.fillGradientStyle(0x0f0a16, 0x0f0a16, 0x1c1020, 0x160c1a, 1);
    bgGfx.fillRect(0, 0, W, H);

    /* ------------------------------------------------------------- header */

    this.add.existing(button(this, 84, 44, 120, 44, backLabel(this.from),
      () => this._back(), { style: 'subtle', fontSize: 16 }));

    this.add.text(W / 2, 44, 'SELECT MISSION', textStyle(28, '#ffd166')).setOrigin(0.5);
    this.add.text(W - 32, 34, `EMBER  ${fmt(this.profile.data.ember)}`,
      textStyle(15, PALETTE.textDim)).setOrigin(1, 0);
    this.add.text(W - 32, 56, `SHARDS  ${fmt(this.profile.data.shards)}`,
      textStyle(15, PALETTE.textDim)).setOrigin(1, 0);

    /* --------------------------------------------------------------- list */

    const listX = 26;
    const listY = 92;
    const listW = 500;
    const listH = H - listY - 30;

    panel(this, listX - 8, listY - 8, listW + 16, listH + 16, { depth: 0 });

    // Flatten acts into rows: act headers and stage rows in one list.
    const rows = [];
    for (const act of ACTS) {
      rows.push({ type: 'act', act });
      for (const idx of act.stages) rows.push({ type: 'stage', stage: getStage(idx) });
    }

    this.selected = getStage(Math.min(this.profile.data.highestUnlocked, STAGES.length));

    this.list = scrollList(this, listX, listY, listW, listH, rows,
      (row, i, w) => this._renderRow(row, w), {
        depth: 3,
        rowHeight: 72,
        gap: 6,
        onSelect: (row) => {
          if (row.type !== 'stage') return;
          if (!this.profile.isStageUnlocked(row.stage.index)) {
            this.audio.play('error');
            return;
          }
          this.audio.play('ui');
          this.selected = row.stage;
          this._renderDetail();
        }
      });

    /* ------------------------------------------------------------- detail */

    this.detailX = listX + listW + 26;
    this.detailW = W - this.detailX - 26;
    this.detailY = listY;
    this.detailH = listH;
    this.detailPanel = panel(this, this.detailX, this.detailY, this.detailW, this.detailH,
      { depth: 0, accent: PALETTE.ember });
    this.detailGroup = this.add.container(0, 0).setDepth(4);

    this._renderDetail();

    this.input.keyboard.on('keydown-ESC', () => this._back());
  }

  /* ------------------------------------------------------------------ rows */

  _renderRow(row, w) {
    const c = this.add.container(0, 0);

    if (row.type === 'act') {
      c.rowHeight = 40;
      const biome = BIOMES[row.act.biome];
      const g = this.add.graphics();
      g.fillStyle(biome.fog, 0.14);
      g.fillRoundedRect(0, 6, w, 30, 8);
      c.add(g);
      c.add(this.add.text(14, 21, row.act.name.toUpperCase(),
        textStyle(15, hex(biome.fog))).setOrigin(0, 0.5));
      return c;
    }

    const stage = row.stage;
    const unlocked = this.profile.isStageUnlocked(stage.index);
    const rec = this.profile.stageRecord(stage.index);
    const isBoss = !!stage.boss;
    const h = 72;
    c.rowHeight = h;

    const g = this.add.graphics();
    g.fillStyle(unlocked ? (isBoss ? 0x2a1620 : PALETTE.panelHi) : 0x120d18, 0.9);
    g.fillRoundedRect(0, 0, w, h, 10);
    g.lineStyle(2, isBoss && unlocked ? PALETTE.bad : PALETTE.border, unlocked ? 0.9 : 0.35);
    g.strokeRoundedRect(0, 0, w, h, 10);
    c.add(g);

    // Stage number chip.
    const chip = this.add.graphics();
    chip.fillStyle(unlocked ? (isBoss ? PALETTE.bad : PALETTE.ember) : 0x2a2030, unlocked ? 0.9 : 0.5);
    chip.fillRoundedRect(10, 12, 48, 48, 8);
    c.add(chip);
    c.add(this.add.text(34, 36, String(stage.index),
      textStyle(24, unlocked ? '#1a0d05' : '#5a4a66')).setOrigin(0.5));

    c.add(this.add.text(72, 18, unlocked ? stage.name : '— LOCKED —',
      textStyle(19, unlocked ? PALETTE.text : PALETTE.textFaint)));

    const objText = isBoss ? 'BOSS' : (stage.objective.type.toUpperCase());
    c.add(this.add.text(72, 42, objText, textStyle(12, PALETTE.textFaint)));

    if (unlocked && stage.modifiers?.length) {
      c.add(this.add.text(140, 42,
        stage.modifiers.map((m) => MODIFIERS[m]?.name ?? m).join(' · '),
        textStyle(12, '#ffb43d')));
    }

    // Record: best grade and clear count.
    if (rec.cleared > 0) {
      const rank = STYLE.RANKS.find((r) => r.key === rec.bestGrade) || STYLE.RANKS[0];
      c.add(this.add.text(w - 20, 22, rec.bestGrade,
        textStyle(26, hex(rank.colour))).setOrigin(1, 0.5));
      c.add(this.add.text(w - 20, 48,
        `x${rec.cleared}${rec.bestTimeMs ? `  ${fmtTime(rec.bestTimeMs)}` : ''}`,
        textStyle(12, PALETTE.textFaint)).setOrigin(1, 0.5));
      if (rec.flawless) {
        c.add(this.add.image(w - 96, 22, 'star')
          .setDisplaySize(16, 16).setTint(0xffd451).setBlendMode(Phaser.BlendModes.ADD));
      }
    } else if (unlocked) {
      c.add(this.add.text(w - 20, 36, 'NEW', textStyle(14, '#6bff9c')).setOrigin(1, 0.5));
    }

    if (!unlocked) c.setAlpha(0.55);
    return c;
  }

  /* ---------------------------------------------------------------- detail */

  _renderDetail() {
    this.detailGroup.removeAll(true);
    const stage = this.selected;
    if (!stage) return;

    const x = this.detailX + 26;
    const w = this.detailW - 52;
    let y = this.detailY + 24;
    const biome = BIOMES[stage.biome];
    const add = (obj) => { this.detailGroup.add(obj); return obj; };

    add(this.add.text(x, y, biome.name.toUpperCase(), textStyle(13, hex(biome.fog))));
    y += 22;
    add(this.add.text(x, y, `${stage.index}. ${stage.name}`,
      textStyle(34, stage.boss ? '#ff8a9b' : '#ffd166')));
    y += 46;

    add(this.add.text(x, y, stage.brief,
      textStyle(16, PALETTE.textDim, { wordWrap: { width: w }, lineSpacing: 4 })));
    y += 54;

    // Objective.
    const objFn = OBJECTIVE_TEXT[stage.objective.type];
    add(this.add.text(x, y, 'OBJECTIVE', textStyle(12, PALETTE.textFaint)));
    y += 18;
    add(this.add.text(x, y, objFn ? objFn(stage.objective) : 'Survive.',
      textStyle(17, '#f2e9f7')));
    y += 34;

    // Modifiers.
    if (stage.modifiers?.length) {
      add(this.add.text(x, y, 'STAGE RULES', textStyle(12, PALETTE.textFaint)));
      y += 20;
      for (const key of stage.modifiers) {
        const mod = MODIFIERS[key];
        if (!mod) continue;
        const g = this.add.graphics();
        g.fillStyle(0xffb43d, 0.12);
        g.fillRoundedRect(x, y - 4, w, 34, 8);
        g.lineStyle(1.5, 0xffb43d, 0.5);
        g.strokeRoundedRect(x, y - 4, w, 34, 8);
        add(g);
        add(this.add.text(x + 12, y + 2, mod.name, textStyle(15, '#ffd166')));
        add(this.add.text(x + 140, y + 4, mod.desc, textStyle(13, PALETTE.textDim)));
        y += 42;
      }
      y += 4;
    }

    // Roster.
    add(this.add.text(x, y, stage.boss ? 'BOSS' : 'EXPECTED RESISTANCE',
      textStyle(12, PALETTE.textFaint)));
    y += 22;

    if (stage.boss) {
      const boss = BOSSES[stage.boss];
      add(this.add.text(x, y, boss.name, textStyle(22, '#ff8a9b')));
      add(this.add.text(x, y + 26, `${boss.title} · ${boss.phases.length} phases`,
        textStyle(14, PALETTE.textDim)));
      y += 60;
    } else {
      const pool = new Set();
      for (const wave of stage.waves || []) for (const id of wave.pool) pool.add(id);
      let rx = x;
      for (const id of pool) {
        const def = ARCHETYPES[id];
        if (!def) continue;
        const chipW = def.name.length * 8 + 34;
        if (rx + chipW > x + w) { rx = x; y += 34; }
        const g = this.add.graphics();
        g.fillStyle(def.colour, 0.28);
        g.fillRoundedRect(rx, y, chipW, 28, 14);
        add(g);
        add(this.add.circle(rx + 14, y + 14, 6, def.accent));
        add(this.add.text(rx + 26, y + 14, def.name, textStyle(13, PALETTE.text)).setOrigin(0, 0.5));
        rx += chipW + 8;
      }
      y += 44;
    }

    // Rewards, honest about repeat decay.
    const mult = this.profile.replayMultiplier(stage.index);
    const isBoss = !!stage.boss;
    const xp = Math.round(REWARDS.baseXp(stage.index) * (isBoss ? REWARDS.bossXpMult : 1) * mult);
    const ember = Math.round(REWARDS.baseEmber(stage.index) * (isBoss ? REWARDS.bossEmberMult : 1) * mult);

    const ry = this.detailY + this.detailH - 132;
    const rg = this.add.graphics();
    rg.fillStyle(PALETTE.bgSoft, 0.8);
    rg.fillRoundedRect(x, ry, w, 60, 10);
    add(rg);
    add(this.add.text(x + 16, ry + 10, 'BASE REWARD', textStyle(11, PALETTE.textFaint)));
    add(this.add.text(x + 16, ry + 28, `${fmt(xp)} XP`, textStyle(19, '#9ad3ff')));
    add(this.add.text(x + 150, ry + 28, `${fmt(ember)} Ember`, textStyle(19, '#ffb43d')));
    if (isBoss) add(this.add.text(x + 320, ry + 28, `${REWARDS.shardsPerBoss} Shards`, textStyle(19, '#c074ff')));
    add(this.add.text(x + w - 16, ry + 28,
      mult < 1 ? `repeat clear ×${mult.toFixed(2)}` : 'first clear — full value',
      textStyle(13, mult < 1 ? '#ff9b6b' : '#6bff9c')).setOrigin(1, 0.5));
    add(this.add.text(x + w - 16, ry + 46, 'style rank multiplies this',
      textStyle(11, PALETTE.textFaint)).setOrigin(1, 0.5));

    // Launch.
    const canPlay = this.profile.isStageUnlocked(stage.index);
    const launch = button(this, this.detailX + this.detailW / 2, this.detailY + this.detailH - 44,
      this.detailW - 52, 56, canPlay ? 'DEPLOY' : 'LOCKED',
      () => this._launch(stage), { style: canPlay ? 'primary' : 'subtle', fontSize: 24, depth: 5 });
    launch.setEnabled(canPlay);
    add(launch);
  }

  _launch(stage) {
    if (!this.profile.isStageUnlocked(stage.index)) return;
    this.audio.play('ui');
    this.cameras.main.fadeOut(300, 8, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('PlayScene', { stageIndex: stage.index });
    });
  }

  _back() {
    this.cameras.main.fadeOut(200, 8, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(this.from));
  }

  update(time, delta) {
    this.list?.update(delta / 1000);
  }

  shutdown() {
    this.list?.destroy();
  }
}
