/**
 * SkillTreeScene — Aggression / Speed / Control.
 *
 * Three columns, eight nodes each, gated by points already spent in the same
 * branch. Tapping a node opens a detail card with the exact numbers at the
 * current and next rank — no "+improves damage" vagueness.
 */

import { ctx } from '../core/Context.js';
import { VIEW } from '../data/Balance.js';
import { PALETTE, textStyle, button, panel, fmt, hex } from '../ui/UI.js';
import { BRANCHES, SKILLS_BY_BRANCH, tierRequirement, SKILL_BY_ID } from '../data/Skills.js';
import { formatStat } from '../systems/Stats.js';
import { STAT_LABEL } from '../data/Items.js';

export default class SkillTreeScene extends Phaser.Scene {
  constructor() { super('SkillTreeScene'); }

  init(data) { this.from = data?.from || 'HubScene'; }

  create() {
    this.profile = ctx.profile;
    this.audio = ctx.audio;
    const W = VIEW.WIDTH;
    const H = VIEW.HEIGHT;

    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.cameras.main.fadeIn(220, 8, 4, 12);
    const bg = this.add.graphics().setDepth(-10);
    bg.fillGradientStyle(0x0e0913, 0x0e0913, 0x1a1024, 0x140d1c, 1);
    bg.fillRect(0, 0, W, H);

    /* ------------------------------------------------------------- header */

    this.add.existing(button(this, 84, 42, 120, 44, '< HUB', () => this._back(),
      { style: 'subtle', fontSize: 16 }));
    this.add.text(W / 2, 26, 'SKILL TREE', textStyle(28, '#ffd166')).setOrigin(0.5, 0);

    this.pointsText = this.add.text(W / 2, 60, '', textStyle(17, '#6bff9c')).setOrigin(0.5, 0);

    this.respecBtn = button(this, W - 130, 42, 200, 44, '', () => this._respec(),
      { style: 'ghost', fontSize: 14 });
    this.add.existing(this.respecBtn);

    /* ------------------------------------------------------------ columns */

    this.nodeViews = [];
    const colW = 400;
    const gap = 22;
    const totalW = colW * 3 + gap * 2;
    const startX = (W - totalW) / 2;

    Object.values(BRANCHES).forEach((branch, ci) => {
      const x = startX + ci * (colW + gap);
      panel(this, x, 100, colW, H - 128, { depth: 0, accent: branch.colour });

      this.add.text(x + colW / 2, 110, branch.name.toUpperCase(),
        textStyle(20, hex(branch.colour))).setOrigin(0.5, 0);
      const spentText = this.add.text(x + colW / 2, 134, '',
        textStyle(12, PALETTE.textFaint)).setOrigin(0.5, 0);
      this.add.text(x + colW / 2, 151, branch.blurb,
        textStyle(11, PALETTE.textFaint, { wordWrap: { width: colW - 30 }, align: 'center' }))
        .setOrigin(0.5, 0);

      // Eight nodes plus three tier headers have to fit between the blurb and
      // the panel's bottom edge: 8x56 + 3x16 = 496px, starting at 176.
      let y = 176;
      let lastTier = 0;
      for (const node of SKILLS_BY_BRANCH(branch.id)) {
        if (node.tier !== lastTier) {
          lastTier = node.tier;
          const need = tierRequirement(node.tier);
          if (need > 0) {
            this.add.text(x + 14, y - 1, `TIER ${node.tier} — needs ${need} pts`,
              textStyle(10, PALETTE.textFaint));
            y += 16;
          }
        }
        this.nodeViews.push(this._nodeCard(x + 12, y, colW - 24, 50, node, branch));
        y += 56;
      }
      this.branchSpentTexts = this.branchSpentTexts || {};
      this.branchSpentTexts[branch.id] = spentText;
    });

    this._refresh();
    this.input.keyboard.on('keydown-ESC', () => this._back());
  }

  /* ------------------------------------------------------------------ node */

  _nodeCard(x, y, w, h, node, branch) {
    const c = this.add.container(x, y).setDepth(2);
    const g = this.add.graphics();
    c.add(g);

    // Two wrapped lines of description have to fit inside a 50px card, so the
    // body text is deliberately small and tight.
    const title = this.add.text(14, 5, node.name, textStyle(14, PALETTE.text));
    const desc = this.add.text(14, 23, '', textStyle(10, PALETTE.textFaint,
      { wordWrap: { width: w - 78 }, lineSpacing: -1 }));
    const rank = this.add.text(w - 14, h / 2, '', textStyle(16, PALETTE.textDim)).setOrigin(1, 0.5);
    c.add([title, desc, rank]);

    c.setSize(w, h);
    c.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    c.input.cursor = 'pointer';
    c.on('pointerup', () => this._openDetail(node, branch));
    c.on('pointerover', () => { c.hovered = true; this._drawNode(view); });
    c.on('pointerout', () => { c.hovered = false; this._drawNode(view); });

    const view = { c, g, title, desc, rank, node, branch, w, h };
    return view;
  }

  _drawNode(view) {
    const { g, w, h, node, branch, c } = view;
    const r = this.profile.skillRank(node.id);
    const maxed = r >= node.maxRank;
    const blocked = this.profile.skillBlockedReason(node.id);
    const affordable = !blocked;

    g.clear();
    const fill = maxed ? 0x1e2a1c : affordable ? PALETTE.panelHi : 0x140e1c;
    g.fillStyle(c.hovered ? PALETTE.panelHi : fill, 0.95);
    g.fillRoundedRect(0, 0, w, h, 8);
    g.lineStyle(2, maxed ? 0x6bff9c : affordable ? branch.colour : PALETTE.border,
      maxed || affordable ? 0.95 : 0.4);
    g.strokeRoundedRect(0, 0, w, h, 8);

    if (r > 0) {
      g.fillStyle(branch.colour, 0.16);
      g.fillRoundedRect(0, 0, w * (r / node.maxRank), h, 8);
    }

    view.title.setColor(maxed ? '#a8ffbf' : affordable ? PALETTE.text : '#6a5c78');
    view.desc.setText(node.desc(Math.max(1, r)));
    view.rank.setText(`${r}/${node.maxRank}`);
    view.rank.setColor(maxed ? '#6bff9c' : affordable ? hex(branch.colour) : PALETTE.textFaint);
  }

  /* ---------------------------------------------------------------- detail */

  _openDetail(node, branch) {
    if (this.detail) this.detail.destroy(true);
    const W = VIEW.WIDTH;
    const H = VIEW.HEIGHT;
    const w = 560;
    const h = 340;

    const c = this.add.container(0, 0).setDepth(50);
    const dim = this.add.rectangle(0, 0, W, H, 0x05030a, 0.78).setOrigin(0).setInteractive();
    dim.on('pointerup', () => { c.destroy(true); this.detail = null; });
    c.add(dim);

    const px = W / 2 - w / 2;
    const py = H / 2 - h / 2;
    const g = this.add.graphics();
    g.fillStyle(PALETTE.panel, 0.98);
    g.fillRoundedRect(px, py, w, h, 14);
    g.lineStyle(2, branch.colour, 0.95);
    g.strokeRoundedRect(px, py, w, h, 14);
    c.add(g);

    const rank = this.profile.skillRank(node.id);
    c.add(this.add.text(px + 26, py + 22, branch.name.toUpperCase(),
      textStyle(12, hex(branch.colour))));
    c.add(this.add.text(px + 26, py + 42, node.name, textStyle(26, PALETTE.text)));
    c.add(this.add.text(px + w - 26, py + 48, `RANK ${rank} / ${node.maxRank}`,
      textStyle(16, PALETTE.textDim)).setOrigin(1, 0));

    c.add(this.add.text(px + 26, py + 88, 'CURRENT', textStyle(12, PALETTE.textFaint)));
    c.add(this.add.text(px + 26, py + 106,
      rank > 0 ? node.desc(rank) : 'Not learned.',
      textStyle(15, rank > 0 ? '#f2e9f7' : PALETTE.textFaint, { wordWrap: { width: w - 52 } })));

    if (rank < node.maxRank) {
      c.add(this.add.text(px + 26, py + 156, 'NEXT RANK', textStyle(12, PALETTE.textFaint)));
      c.add(this.add.text(px + 26, py + 174, node.desc(rank + 1),
        textStyle(15, hex(branch.colour), { wordWrap: { width: w - 52 } })));

      // Show the raw stat deltas so the maths is never hidden.
      const deltas = node.effects
        .filter((e) => e.stat)
        .map((e) => `${STAT_LABEL[e.stat] || e.stat} ${formatStat(e.stat, e.per)}`)
        .join('    ');
      if (deltas) {
        c.add(this.add.text(px + 26, py + 208, deltas, textStyle(12, PALETTE.textDim)));
      }
    }

    const blocked = this.profile.skillBlockedReason(node.id);
    const learnBtn = button(this, W / 2 - 90, py + h - 44, 220, 52,
      blocked ? 'UNAVAILABLE' : `LEARN  (${node.cost} pt${node.cost > 1 ? 's' : ''})`,
      () => {
        if (this.profile.learnSkill(node.id)) {
          this.audio.play('unlock');
          this._refresh();
          c.destroy(true);
          this.detail = null;
        }
      }, { style: blocked ? 'subtle' : 'primary', depth: 51 });
    learnBtn.setEnabled(!blocked);
    c.add(learnBtn);

    if (blocked) {
      c.add(this.add.text(W / 2, py + h - 78, blocked,
        textStyle(13, '#ff9b6b')).setOrigin(0.5));
    }

    const closeBtn = button(this, W / 2 + 150, py + h - 44, 160, 52, 'CLOSE',
      () => { c.destroy(true); this.detail = null; }, { style: 'ghost', depth: 51 });
    c.add(closeBtn);

    this.detail = c;
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 160 });
  }

  /* --------------------------------------------------------------- refresh */

  _refresh() {
    const p = this.profile;
    this.pointsText.setText(p.data.skillPoints > 0
      ? `${p.data.skillPoints} skill point${p.data.skillPoints > 1 ? 's' : ''} available`
      : 'no points available — clear stages and level up');
    this.pointsText.setColor(p.data.skillPoints > 0 ? '#6bff9c' : PALETTE.textFaint);

    const spent = p.totalPointsSpent();
    const cost = p.respecCost();
    this.respecBtn.setLabel(spent > 0 ? `RESPEC — ${fmt(cost)} EMBER` : 'NOTHING TO RESPEC');
    this.respecBtn.setEnabled(spent > 0 && p.data.ember >= cost);

    for (const view of this.nodeViews) this._drawNode(view);
    for (const [id, text] of Object.entries(this.branchSpentTexts || {})) {
      text.setText(`${p.pointsSpentIn(id)} points invested`);
    }
  }

  _respec() {
    const res = this.profile.respec();
    if (!res.ok) {
      this.audio.play('error');
      return;
    }
    this.audio.play('unlock');
    this._refresh();
  }

  _back() {
    this.cameras.main.fadeOut(200, 8, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(this.from));
  }
}
