/**
 * ShopScene — the Forge.
 *
 * Three sinks for currency: potions (immediate survivability), the Crucible
 * (turn Ember into gear when drops are not cooperating), and the Reforge
 * (spend Shards for a guaranteed high-rarity roll). Prices scale with what you
 * already own so nothing here trivialises the loot table.
 */

import { ctx } from '../core/Context.js';
import { VIEW, SHOP, RARITY } from '../data/Balance.js';
import { PALETTE, textStyle, button, panel, fmt, hex, Toaster } from '../ui/UI.js';
import { generateItem } from '../systems/Loot.js';
import { SLOTS, BASES, AFFIX_BY_ID } from '../data/Items.js';
import { itemScore, formatStat } from '../systems/Stats.js';

export default class ShopScene extends Phaser.Scene {
  constructor() { super('ShopScene'); }

  init(data) { this.from = data?.from || 'HubScene'; }

  create() {
    this.profile = ctx.profile;
    this.audio = ctx.audio;
    const W = VIEW.WIDTH;
    const H = VIEW.HEIGHT;

    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.cameras.main.fadeIn(220, 8, 4, 12);
    const bg = this.add.graphics().setDepth(-10);
    bg.fillGradientStyle(0x140a10, 0x140a10, 0x2c1410, 0x1e0e12, 1);
    bg.fillRect(0, 0, W, H);

    // Forge glow.
    this.add.image(W / 2, H, 'soft').setDisplaySize(W, 460)
      .setTint(0xff5a1a).setAlpha(0.16).setBlendMode(Phaser.BlendModes.ADD).setDepth(-9);

    this.toaster = new Toaster(this, { y: 92 });
    this.crucibleSlot = 'weapon';

    /* ------------------------------------------------------------- header */

    this.add.existing(button(this, 84, 42, 120, 44, '< HUB', () => this._back(),
      { style: 'subtle', fontSize: 16 }));
    this.add.text(W / 2, 26, 'THE FORGE', textStyle(28, '#ffd166')).setOrigin(0.5, 0);
    this.currencyText = this.add.text(W - 30, 32, '', textStyle(16, PALETTE.textDim)).setOrigin(1, 0);

    /* ------------------------------------------------------------ potions */

    panel(this, 40, 108, 380, 500, { depth: 0, accent: 0x6bff9c });
    this.add.text(60, 128, 'APOTHECARY', textStyle(13, PALETTE.textFaint));
    this.add.text(60, 148, 'Ember Draught', textStyle(24, '#a8ffbf'));
    this.add.image(360, 168, 'gl_potion').setDisplaySize(48, 48).setTint(0x6bff9c);
    this.add.text(60, 186,
      'Restores 42% of your health instantly.\nThe only healing you get outside the Hub.',
      textStyle(13, PALETTE.textDim, { lineSpacing: 4 }));

    this.potionCountText = this.add.text(60, 244, '', textStyle(18, '#f2e9f7'));
    this.potionPriceText = this.add.text(60, 270, '', textStyle(14, PALETTE.textFaint));

    this.buyPotionBtn = button(this, 230, 330, 340, 50, 'BUY POTION',
      () => this._buyPotion(), { style: 'primary', depth: 2 });
    this.add.existing(this.buyPotionBtn);

    this.add.text(60, 380, 'STAYING ALIVE', textStyle(13, PALETTE.textFaint));
    this.add.text(60, 402,
      [
        'Health carries from stage to stage. Returning to',
        'the Hub is the only thing that fills it back up.',
        '',
        'Out in the field you regenerate slowly once you',
        'are out of combat — but only up to 35%. Below',
        'that it is potions or nothing.',
        '',
        'Field Chemistry in the Control tree raises both',
        'how much a draught heals and how many you',
        'can carry.'
      ].join('\n'),
      textStyle(12, PALETTE.textDim, { lineSpacing: 3 }));

    /* ----------------------------------------------------------- crucible */

    panel(this, 450, 108, 380, 500, { depth: 0, accent: PALETTE.ember });
    this.add.text(470, 128, 'EMBER CRUCIBLE', textStyle(13, PALETTE.textFaint));
    this.add.text(470, 148, 'Forge Equipment', textStyle(24, '#ffd166'));
    this.add.text(470, 186,
      'Pour Ember into the crucible and pull out a\nrandom piece of gear scaled to your progress.',
      textStyle(13, PALETTE.textDim, { lineSpacing: 4 }));

    this.slotButtons = [];
    SLOTS.forEach((slot, i) => {
      const b = button(this, 530 + i * 110, 250, 100, 42, slot.name.toUpperCase(),
        () => { this.crucibleSlot = slot.id; this._refresh(); },
        { style: 'subtle', fontSize: 12, depth: 2 });
      this.add.existing(b);
      this.slotButtons.push({ id: slot.id, btn: b });
    });

    this.cruciblePriceText = this.add.text(640, 296, '', textStyle(15, '#ffb43d')).setOrigin(0.5, 0);
    this.forgeBtn = button(this, 640, 344, 340, 50, 'FORGE  (EMBER)',
      () => this._forge(false), { style: 'primary', depth: 2 });
    this.add.existing(this.forgeBtn);

    this.add.text(470, 396, 'SHARD REFORGE', textStyle(13, PALETTE.textFaint));
    this.add.text(470, 416,
      'Cinder Shards force a rare or better roll.\nBosses and elites are the only source.',
      textStyle(12, PALETTE.textDim, { lineSpacing: 4 }));
    this.reforgePriceText = this.add.text(640, 468, '', textStyle(15, '#c074ff')).setOrigin(0.5, 0);
    this.reforgeBtn = button(this, 640, 516, 340, 50, 'REFORGE  (SHARDS)',
      () => this._forge(true), { style: 'ghost', depth: 2 });
    this.add.existing(this.reforgeBtn);

    /* --------------------------------------------------------------- last */

    panel(this, 860, 108, W - 890, 500, { depth: 0 });
    this.add.text(880, 128, 'LAST FORGED', textStyle(13, PALETTE.textFaint));
    this.resultGroup = this.add.container(0, 0).setDepth(2);
    this._renderResult(null);

    this._refresh();
    this.input.keyboard.on('keydown-ESC', () => this._back());
  }

  /* --------------------------------------------------------------- prices */

  get cruciblePrice() {
    const level = this.profile.level;
    const owned = this.profile.inventory.length;
    return Math.round(220 + level * 46 + owned * 4);
  }

  get reforgePrice() { return { shards: 4, ember: Math.round(this.cruciblePrice * 0.6) }; }

  _refresh() {
    const p = this.profile;
    this.currencyText.setText(`EMBER ${fmt(p.data.ember)}    SHARDS ${fmt(p.data.shards)}`);

    const price = SHOP.potionPrice(p.data.potions);
    this.potionCountText.setText(`Carrying ${p.data.potions} / ${p.potionCap}`);
    this.potionPriceText.setText(p.data.potions >= p.potionCap
      ? 'Belt is full — the Control tree raises the cap.'
      : `Next potion costs ${fmt(price)} Ember`);
    this.buyPotionBtn.setLabel(p.data.potions >= p.potionCap ? 'BELT FULL' : `BUY  —  ${fmt(price)} EMBER`);
    this.buyPotionBtn.setEnabled(p.data.potions < p.potionCap && p.data.ember >= price);

    for (const s of this.slotButtons) {
      s.btn.label.setColor(s.id === this.crucibleSlot ? '#ffd166' : PALETTE.textDim);
    }

    const cp = this.cruciblePrice;
    this.cruciblePriceText.setText(`${fmt(cp)} Ember  ·  ${SLOTS.find((s) => s.id === this.crucibleSlot).name}`);
    this.forgeBtn.setEnabled(p.data.ember >= cp);

    const rp = this.reforgePrice;
    this.reforgePriceText.setText(`${rp.shards} Shards + ${fmt(rp.ember)} Ember`);
    this.reforgeBtn.setEnabled(p.data.shards >= rp.shards && p.data.ember >= rp.ember);
  }

  /* --------------------------------------------------------------- actions */

  _buyPotion() {
    const res = this.profile.buyPotion();
    if (!res.ok) {
      this.audio.play('error');
      this.toaster.show(res.reason, { colour: '#ff8a9b' });
      return;
    }
    this.audio.play('pickup');
    this.toaster.show(`Bought a potion for ${fmt(res.price)} Ember`, { colour: '#6bff9c' });
    this._refresh();
  }

  _forge(useShards) {
    const p = this.profile;
    const stage = Math.max(1, p.data.highestUnlocked - 1);

    if (useShards) {
      const cost = this.reforgePrice;
      if (!p.spend(cost.ember, cost.shards)) {
        this.audio.play('error');
        this.toaster.show('Not enough materials.', { colour: '#ff8a9b' });
        return;
      }
      const rarity = Math.random() < 0.12 ? 'legendary' : Math.random() < 0.4 ? 'epic' : 'rare';
      const item = generateItem({ stage, slot: this.crucibleSlot, rarity, bias: 0.8 });
      this._deliver(item);
    } else {
      const cost = this.cruciblePrice;
      if (!p.spend(cost, 0)) {
        this.audio.play('error');
        this.toaster.show('Not enough Ember.', { colour: '#ff8a9b' });
        return;
      }
      const item = generateItem({ stage, slot: this.crucibleSlot, bias: 0.25 });
      this._deliver(item);
    }
  }

  _deliver(item) {
    const entry = this.profile.addItem(item);
    this.audio.play(item.rarity === 'legendary' ? 'unlock' : 'levelup');
    this._renderResult(entry);
    this._refresh();

    // A little forge flourish.
    const colour = RARITY.colour[item.rarity];
    for (let i = 0; i < 26; i++) {
      const s = this.add.image(1050, 300, 'spark')
        .setTint(colour).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(12, 12).setDepth(20);
      const a = Math.random() * Math.PI * 2;
      this.tweens.add({
        targets: s,
        x: 1050 + Math.cos(a) * Phaser.Math.Between(50, 180),
        y: 300 + Math.sin(a) * Phaser.Math.Between(50, 180),
        alpha: 0, duration: 700, onComplete: () => s.destroy()
      });
    }
    if (entry.salvaged) {
      this.toaster.show(`Bag full — auto-salvaged ${entry.salvaged.name} for ${entry.ember} Ember`,
        { colour: '#ff9b6b' });
    }
  }

  _renderResult(entry) {
    this.resultGroup.removeAll(true);
    const x = 880;
    const w = VIEW.WIDTH - 910;
    const add = (o) => { this.resultGroup.add(o); return o; };

    if (!entry) {
      add(this.add.text(x + w / 2, 320, 'Nothing forged yet.',
        textStyle(15, PALETTE.textFaint)).setOrigin(0.5));
      return;
    }

    const item = entry.item;
    const colour = RARITY.colour[item.rarity];
    const base = (BASES[item.slot] || []).find((b) => b.id === item.base);
    let y = 168;

    add(this.add.image(x + w / 2, 240, item.slot === 'weapon' ? 'gl_attack'
      : item.slot === 'armour' ? 'gl_block' : 'gl_ultimate')
      .setDisplaySize(72, 72).setTint(colour));

    y = 300;
    add(this.add.text(x + w / 2, y, item.rarity.toUpperCase(), textStyle(12, hex(colour))).setOrigin(0.5, 0));
    y += 20;
    add(this.add.text(x + w / 2, y, item.name,
      textStyle(21, hex(colour), { wordWrap: { width: w }, align: 'center' })).setOrigin(0.5, 0));
    y += 44;
    add(this.add.text(x + w / 2, y, `${base ? base.name : item.slot} · i${item.ilvl} · PWR ${fmt(itemScore(item))}`,
      textStyle(13, PALETTE.textDim)).setOrigin(0.5, 0));
    y += 34;

    for (const aff of item.affixes) {
      const def = AFFIX_BY_ID[aff.id];
      if (!def) continue;
      add(this.add.text(x + w / 2, y, `${def.name}  ${formatStat(def.stat, aff.value)}`,
        textStyle(13, '#d9c8ea')).setOrigin(0.5, 0));
      y += 22;
    }
    if (item.uniqueText) {
      add(this.add.text(x + w / 2, y + 8, item.uniqueText,
        textStyle(12, '#ffd9a8', { wordWrap: { width: w }, align: 'center' })).setOrigin(0.5, 0));
      y += 44;
    }

    const equipBtn = button(this, x + w / 2, 578, w, 46, 'EQUIP NOW', () => {
      this.profile.equip(item.uid);
      this.audio.play('unlock');
      this.toaster.show(`Equipped ${item.name}`, { colour: '#6bff9c' });
    }, { style: 'ghost', fontSize: 14, depth: 3 });
    add(equipBtn);
  }

  _back() {
    this.cameras.main.fadeOut(200, 8, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(this.from));
  }

  shutdown() { this.toaster?.destroy(); }
}
