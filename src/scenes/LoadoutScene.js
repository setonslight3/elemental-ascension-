/**
 * LoadoutScene — equipment and inventory.
 *
 * The comparison is the point: selecting an item shows it against whatever is
 * currently in that slot, stat by stat, with the deltas coloured. Bulk salvage
 * exists so a 60-slot bag never becomes a chore.
 */

import { ctx } from '../core/Context.js';
import { VIEW, RARITY } from '../data/Balance.js';
import { PALETTE, textStyle, button, panel, scrollList, fmt, hex, Toaster, onTap, setTapArea } from '../ui/UI.js';
import { SLOTS, BASES, AFFIX_BY_ID, STAT_LABEL, LOWER_IS_BETTER, UNIQUES } from '../data/Items.js';
import { itemStats, itemScore, formatStat } from '../systems/Stats.js';

const UNIQUE_BY_ID = Object.fromEntries(UNIQUES.map((u) => [u.id, u]));

export default class LoadoutScene extends Phaser.Scene {
  constructor() { super('LoadoutScene'); }

  init(data) { this.from = data?.from || 'HubScene'; }

  create() {
    this.profile = ctx.profile;
    this.audio = ctx.audio;
    const W = VIEW.WIDTH;
    const H = VIEW.HEIGHT;

    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.cameras.main.fadeIn(220, 8, 4, 12);
    const bg = this.add.graphics().setDepth(-10);
    bg.fillGradientStyle(0x0e0913, 0x0e0913, 0x171024, 0x120c1a, 1);
    bg.fillRect(0, 0, W, H);

    this.toaster = new Toaster(this, { y: 90 });
    this.filter = 'all';
    this.selected = null;

    /* ------------------------------------------------------------- header */

    this.add.existing(button(this, 84, 42, 120, 44, '< HUB', () => this._back(),
      { style: 'subtle', fontSize: 16 }));
    this.add.text(W / 2, 26, 'LOADOUT', textStyle(28, '#ffd166')).setOrigin(0.5, 0);
    this.currencyText = this.add.text(W - 30, 32, '', textStyle(15, PALETTE.textDim)).setOrigin(1, 0);

    /* ---------------------------------------------------------- equipment */

    this.slotViews = [];
    let sy = 96;
    for (const slot of SLOTS) {
      this.slotViews.push(this._slotCard(30, sy, 380, 104, slot));
      sy += 114;
    }

    // Derived stat summary.
    panel(this, 30, sy, 380, H - sy - 24, { depth: 0 });
    this.statsTitle = this.add.text(48, sy + 12, 'ASCENDANT', textStyle(12, PALETTE.textFaint)).setDepth(1);
    this.statsText = this.add.text(48, sy + 32, '', textStyle(12, PALETTE.textDim, { lineSpacing: 2 })).setDepth(1);
    this.statsSummaryY = sy;

    /* ---------------------------------------------------------- inventory */

    const ix = 430;
    const iw = 400;
    panel(this, ix, 96, iw, H - 120, { depth: 0 });

    const tabs = [['all', 'ALL'], ['weapon', 'GAUNTLET'], ['armour', 'CORE'], ['relic', 'SIGIL']];
    this.tabButtons = [];
    tabs.forEach(([key, label], i) => {
      const b = button(this, ix + 52 + i * 96, 120, 92, 38, label,
        () => { this.filter = key; this._refreshList(); this._drawTabs(); },
        { style: 'subtle', fontSize: 12, depth: 2 });
      this.add.existing(b);
      this.tabButtons.push({ key, btn: b });
    });

    this.countText = this.add.text(ix + 18, 146, '', textStyle(12, PALETTE.textFaint)).setDepth(2);

    this.list = scrollList(this, ix + 12, 168, iw - 24, H - 250, [],
      (item, i, w) => this._itemRow(item, w), {
        rowHeight: 66, gap: 6, depth: 3,
        onSelect: (item) => { this.selected = item; this.audio.play('ui'); this._refreshDetail(); }
      });

    this.salvageBtn = button(this, ix + iw / 2, H - 48, iw - 40, 46,
      'SALVAGE ALL COMMON & UNCOMMON', () => this._bulkSalvage(),
      { style: 'ghost', fontSize: 13, depth: 2 });
    this.add.existing(this.salvageBtn);

    /* ------------------------------------------------------------- detail */

    this.detailX = 850;
    this.detailW = W - this.detailX - 30;
    panel(this, this.detailX, 96, this.detailW, H - 120, { depth: 0, accent: PALETTE.ember });
    this.detailGroup = this.add.container(0, 0).setDepth(2);

    this._drawTabs();
    this._refreshAll();
    this.input.keyboard.on('keydown-ESC', () => this._back());
  }

  /* --------------------------------------------------------------- slots */

  _slotCard(x, y, w, h, slot) {
    const c = this.add.container(x, y).setDepth(1);
    const g = this.add.graphics();
    c.add(g);
    const label = this.add.text(14, 10, slot.name.toUpperCase(), textStyle(11, PALETTE.textFaint));
    const name = this.add.text(14, 28, '', textStyle(17, PALETTE.text));
    const sub = this.add.text(14, 52, '', textStyle(12, PALETTE.textFaint));
    const power = this.add.text(w - 14, 16, '', textStyle(14, '#ffd166')).setOrigin(1, 0);
    c.add([label, name, sub, power]);
    setTapArea(c, 0, 0, w, h);
    c.input.cursor = 'pointer';
    onTap(c, () => {
      const item = this.profile.equippedItem(slot.id);
      if (item) { this.selected = item; this._refreshDetail(); this.audio.play('ui'); }
      else { this.filter = slot.id; this._refreshList(); this._drawTabs(); }
    });
    return { c, g, label, name, sub, power, slot, w, h };
  }

  _drawSlot(view) {
    const item = this.profile.equippedItem(view.slot.id);
    const g = view.g;
    g.clear();
    const colour = item ? RARITY.colour[item.rarity] : PALETTE.border;
    g.fillStyle(PALETTE.panel, 0.94);
    g.fillRoundedRect(0, 0, view.w, view.h, 12);
    g.lineStyle(2, colour, item ? 0.95 : 0.4);
    g.strokeRoundedRect(0, 0, view.w, view.h, 12);
    if (item) {
      g.fillStyle(colour, 0.12);
      g.fillRoundedRect(0, 0, view.w, view.h, 12);
    }

    if (!item) {
      view.name.setText('— empty —').setColor(PALETTE.textFaint);
      view.sub.setText('tap to browse this slot');
      view.power.setText('');
      return;
    }
    const base = (BASES[item.slot] || []).find((b) => b.id === item.base);
    view.name.setText(`${item.name}${item.upgrade ? ` +${item.upgrade}` : ''}`)
      .setColor(hex(RARITY.colour[item.rarity]));
    view.sub.setText(`${base ? base.name : item.slot} · i${item.ilvl} · ${item.affixes.length} affixes`);
    view.power.setText(`PWR ${fmt(itemScore(item))}`);
  }

  /* ----------------------------------------------------------- inventory */

  _filteredItems() {
    const items = this.profile.inventory.filter((i) => this.filter === 'all' || i.slot === this.filter);
    const equipped = new Set(Object.values(this.profile.data.equipped));
    return items.sort((a, b) => {
      const ae = equipped.has(a.uid) ? 1 : 0;
      const be = equipped.has(b.uid) ? 1 : 0;
      if (ae !== be) return be - ae;
      return itemScore(b) - itemScore(a);
    });
  }

  _itemRow(item, w) {
    const c = this.add.container(0, 0);
    c.rowHeight = 66;
    const colour = RARITY.colour[item.rarity];
    const equipped = Object.values(this.profile.data.equipped).includes(item.uid);
    const isSelected = this.selected?.uid === item.uid;

    const g = this.add.graphics();
    g.fillStyle(isSelected ? PALETTE.panelHi : PALETTE.panel, 0.94);
    g.fillRoundedRect(0, 0, w, 66, 8);
    g.fillStyle(colour, 0.85);
    g.fillRoundedRect(0, 0, 5, 66, { tl: 8, bl: 8, tr: 0, br: 0 });
    g.lineStyle(2, isSelected ? PALETTE.emberHot : equipped ? 0x6bff9c : PALETTE.border, 0.8);
    g.strokeRoundedRect(0, 0, w, 66, 8);
    c.add(g);

    const base = (BASES[item.slot] || []).find((b) => b.id === item.base);
    // Long generated names ("Scorched Forge Hammer of Dawnbreak") would run
    // under the power score, so the row clips them.
    const label = `${item.name}${item.upgrade ? ` +${item.upgrade}` : ''}`;
    c.add(this.add.text(16, 8, label.length > 34 ? `${label.slice(0, 33)}…` : label,
      textStyle(15, hex(colour))));
    c.add(this.add.text(16, 30, `${base ? base.name : item.slot} · i${item.ilvl}`,
      textStyle(12, PALETTE.textFaint)));
    c.add(this.add.text(16, 46, item.affixes.map((a) => AFFIX_BY_ID[a.id]?.name).filter(Boolean).slice(0, 3).join(' · '),
      textStyle(10, PALETTE.textDim)));

    c.add(this.add.text(w - 14, 10, `PWR ${fmt(itemScore(item))}`,
      textStyle(13, '#ffd166')).setOrigin(1, 0));

    if (equipped) {
      c.add(this.add.text(w - 14, 42, 'EQUIPPED', textStyle(11, '#6bff9c')).setOrigin(1, 0));
    } else {
      const cur = this.profile.equippedItem(item.slot);
      const diff = itemScore(item) - itemScore(cur);
      if (diff > 0) c.add(this.add.text(w - 14, 42, `▲ +${fmt(diff)}`, textStyle(11, '#6bff9c')).setOrigin(1, 0));
      else if (diff < 0) c.add(this.add.text(w - 14, 42, `▼ ${fmt(diff)}`, textStyle(11, '#ff8a9b')).setOrigin(1, 0));
    }
    return c;
  }

  /* -------------------------------------------------------------- detail */

  _refreshDetail() {
    this.detailGroup.removeAll(true);
    const x = this.detailX + 22;
    const w = this.detailW - 44;
    const add = (o) => { this.detailGroup.add(o); return o; };
    const item = this.selected;

    if (!item) {
      add(this.add.text(this.detailX + this.detailW / 2, 300,
        'Select an item to compare it\nwith what you are wearing.',
        textStyle(15, PALETTE.textFaint, { align: 'center' })).setOrigin(0.5));
      return;
    }

    const colour = RARITY.colour[item.rarity];
    const base = (BASES[item.slot] || []).find((b) => b.id === item.base);
    let y = 118;

    add(this.add.text(x, y, item.rarity.toUpperCase(), textStyle(12, hex(colour))));
    y += 20;
    add(this.add.text(x, y, `${item.name}${item.upgrade ? ` +${item.upgrade}` : ''}`,
      textStyle(24, hex(colour), { wordWrap: { width: w } })));
    y += 36;
    add(this.add.text(x, y, `${base ? base.name : item.slot} · item level ${item.ilvl}`,
      textStyle(13, PALETTE.textDim)));
    y += 28;

    if (item.uniqueId && UNIQUE_BY_ID[item.uniqueId]) {
      const u = UNIQUE_BY_ID[item.uniqueId];
      const g = this.add.graphics();
      g.fillStyle(0xffa726, 0.12);
      g.fillRoundedRect(x, y, w, 52, 8);
      g.lineStyle(1.5, 0xffa726, 0.6);
      g.strokeRoundedRect(x, y, w, 52, 8);
      add(g);
      add(this.add.text(x + 12, y + 8, u.unique,
        textStyle(12, '#ffd9a8', { wordWrap: { width: w - 24 } })));
      y += 62;
    }

    // Stat comparison against the equipped item.
    const equipped = this.profile.equippedItem(item.slot);
    const mine = itemStats(item);
    const theirs = equipped && equipped.uid !== item.uid ? itemStats(equipped) : {};
    const keys = new Set([...Object.keys(mine), ...Object.keys(theirs)]);

    add(this.add.text(x, y, equipped && equipped.uid !== item.uid ? 'VS EQUIPPED' : 'STATS',
      textStyle(12, PALETTE.textFaint)));
    y += 20;

    for (const key of keys) {
      const a = mine[key] || 0;
      const b = theirs[key] || 0;
      const delta = a - b;
      add(this.add.text(x, y, STAT_LABEL[key] || key, textStyle(13, PALETTE.textDim)));
      add(this.add.text(x + w - 90, y, formatStat(key, a), textStyle(13, PALETTE.text)).setOrigin(1, 0));
      if (equipped && equipped.uid !== item.uid && Math.abs(delta) > 1e-6) {
        const better = LOWER_IS_BETTER.has(key) ? delta < 0 : delta > 0;
        add(this.add.text(x + w, y, formatStat(key, delta),
          textStyle(13, better ? '#6bff9c' : '#ff8a9b')).setOrigin(1, 0));
      }
      y += 20;
    }

    y += 10;
    if (item.flavour) {
      add(this.add.text(x, y, `"${item.flavour}"`,
        textStyle(12, PALETTE.textFaint, { wordWrap: { width: w }, fontStyle: 'italic' })));
    }

    /* ------------------------------------------------------------ actions */

    const isEquipped = Object.values(this.profile.data.equipped).includes(item.uid);
    const by = VIEW.HEIGHT - 150;
    const cost = this.profile.upgradeCost(item);

    const equipBtn = button(this, this.detailX + this.detailW / 2, by, w, 48,
      isEquipped ? 'EQUIPPED' : 'EQUIP', () => {
        this.profile.equip(item.uid);
        this.audio.play('unlock');
        this.toaster.show(`Equipped ${item.name}`, { colour: '#6bff9c' });
        this._refreshAll();
      }, { style: isEquipped ? 'subtle' : 'primary', depth: 3 });
    equipBtn.setEnabled(!isEquipped);
    add(equipBtn);

    const upgradeLabel = cost.maxed
      ? 'FULLY UPGRADED'
      : `UPGRADE +${(item.upgrade || 0) + 1}  —  ${fmt(cost.ember)}E${cost.shards ? ` ${cost.shards}S` : ''}`;
    const canUpgrade = !cost.maxed &&
      this.profile.data.ember >= cost.ember && this.profile.data.shards >= cost.shards;
    const upBtn = button(this, this.detailX + this.detailW / 2, by + 56, w, 44,
      upgradeLabel, () => {
        const res = this.profile.upgradeItem(item.uid);
        if (!res.ok) { this.audio.play('error'); this.toaster.show(res.reason, { colour: '#ff8a9b' }); return; }
        this.audio.play('levelup');
        this.toaster.show(`${item.name} is now +${res.level}`, { colour: '#ffd166' });
        this._refreshAll();
      }, { style: 'ghost', fontSize: 13, depth: 3 });
    upBtn.setEnabled(canUpgrade);
    add(upBtn);

    const salvageBtn = button(this, this.detailX + this.detailW / 2, by + 108, w, 44,
      isEquipped ? 'UNEQUIP TO SALVAGE' : `SALVAGE  —  +${fmt(this.profile.salvageValue(item))} EMBER`,
      () => {
        const res = this.profile.salvage(item.uid);
        if (!res.ok) { this.audio.play('error'); return; }
        this.audio.play('coin');
        this.toaster.show(`Salvaged for ${res.ember} Ember`, { colour: '#ffb43d' });
        this.selected = null;
        this._refreshAll();
      }, { style: 'danger', fontSize: 13, depth: 3 });
    salvageBtn.setEnabled(!isEquipped);
    add(salvageBtn);
  }

  /* -------------------------------------------------------------- refresh */

  _drawTabs() {
    for (const t of this.tabButtons) {
      t.btn.label.setColor(t.key === this.filter ? '#ffd166' : PALETTE.textDim);
    }
  }

  _refreshList() {
    const items = this._filteredItems();
    this.list.rebuild(items);
    this.countText.setText(`${this.profile.inventory.length} / 60 items carried`);
  }

  _refreshStats() {
    const s = this.profile.stats;
    const lines = [
      `Health           ${s.maxHp}`,
      `Mana             ${s.maxMana}`,
      `Stamina          ${s.maxStamina}`,
      `Melee power      ${s.attackPower.toFixed(1)}`,
      `Ability power    ${s.abilityPower.toFixed(1)}`,
      `Crit             ${(s.critChance * 100).toFixed(1)}%  ×${s.critMult.toFixed(2)}`,
      `Cooldowns        ×${s.cooldownMult.toFixed(2)}`,
      `Move speed       ×${s.moveSpeedMult.toFixed(2)}`,
      `Block efficiency ${(s.blockReduction * 100).toFixed(0)}%`,
      `Parry window     ${s.parryWindow.toFixed(2)}s`,
      `Life steal       ${(s.lifesteal * 100).toFixed(1)}%`,
      `Dash charges     ${s.dashCharges}`
    ];
    this.statsText.setText(lines.join('\n'));
  }

  _refreshAll() {
    for (const v of this.slotViews) this._drawSlot(v);
    this._refreshList();
    this._refreshStats();
    this._refreshDetail();
    this.currencyText.setText(
      `EMBER ${fmt(this.profile.data.ember)}    SHARDS ${fmt(this.profile.data.shards)}`);
  }

  _bulkSalvage() {
    const res = this.profile.salvageBulk('uncommon');
    if (res.count === 0) {
      this.audio.play('error');
      this.toaster.show('Nothing to salvage.', { colour: PALETTE.textDim });
      return;
    }
    this.audio.play('coin');
    this.toaster.show(`Salvaged ${res.count} items for ${fmt(res.ember)} Ember`, { colour: '#ffb43d' });
    if (this.selected && !this.profile.itemById(this.selected.uid)) this.selected = null;
    this._refreshAll();
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
    this.toaster?.destroy();
  }
}
