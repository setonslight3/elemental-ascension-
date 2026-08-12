/**
 * HubScene — the Ember Court, between runs.
 *
 * The blueprint's rule is that health is only restored in the Hub, which means
 * HP has to *persist between stages* for that rule to mean anything. It does:
 * `profile.data.currentHp` carries a wounded Ascendant from stage to stage,
 * and walking in here is what makes them whole again. That single decision is
 * what gives potions, the regen floor and the Hub itself a job.
 */

import { ctx } from '../core/Context.js';
import { VIEW } from '../data/Balance.js';
import { PALETTE, textStyle, button, panel, bar, fmt, Toaster, onTap, setTapArea } from '../ui/UI.js';
import { createRig, poseHumanoid } from '../entities/Rig.js';
import { STAGES } from '../data/Stages.js';
import { itemScore } from '../systems/Stats.js';
import { cloudConfigured } from '../config.js';

const FLAVOUR = [
  'The forge is quiet. It will not stay that way.',
  'Twenty floors of machinery between you and the Core.',
  'Every robot down there was built to put a fire out.',
  'Rest here. Nothing else in the Sky Forge will let you.',
  'Burn brighter than the thing that made you.',
  'The Ember Court remembers everyone who came back.'
];

export default class HubScene extends Phaser.Scene {
  constructor() { super('HubScene'); }

  create() {
    this.profile = ctx.profile;
    this.audio = ctx.audio;
    const W = VIEW.WIDTH;
    const H = VIEW.HEIGHT;

    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.cameras.main.fadeIn(300, 8, 4, 12);
    this.audio.playMusic('hub');
    this.toaster = new Toaster(this, { y: 92 });

    /* --------------------------------------------------- restore the fire */

    const data = this.profile.data;
    const maxHp = this.profile.stats.maxHp;
    const wasHurt = data.currentHp != null && data.currentHp < maxHp;
    data.currentHp = maxHp;
    this.profile.touch();

    /* ------------------------------------------------------------ scenery */

    const sky = this.add.graphics().setDepth(-40);
    sky.fillGradientStyle(0x160d18, 0x160d18, 0x2e1620, 0x2a1218, 1);
    sky.fillRect(0, 0, W, H);

    // Back wall of the forge: arches and a furnace glow.
    for (let i = 0; i < 7; i++) {
      const x = 90 + i * 180;
      this.add.image(x, 470, 'block').setOrigin(0.5, 1)
        .setDisplaySize(120, Phaser.Math.Between(180, 300))
        .setTint(0x2a1a26).setDepth(-32);
    }
    this.add.image(W / 2, 470, 'soft').setDisplaySize(900, 420)
      .setTint(0xff5a1a).setAlpha(0.16).setBlendMode(Phaser.BlendModes.ADD).setDepth(-31);

    // Floor.
    this.add.tileSprite(W / 2, 520, W, 220, 'ground').setTint(0x3a2530).setDepth(-30);
    this.add.rectangle(0, 412, W, 6, 0x8a5a48).setOrigin(0, 0).setDepth(-29).setAlpha(0.85);

    // Braziers.
    for (const bx of [190, W - 190]) {
      this.add.image(bx, 412, 'platform').setDisplaySize(64, 18).setTint(0x5a3a30).setDepth(-28);
      const flame = this.add.image(bx, 380, 'flame').setDisplaySize(34, 46)
        .setTint(0xff8a3d).setBlendMode(Phaser.BlendModes.ADD).setDepth(-27);
      this.tweens.add({
        targets: flame, scaleY: flame.scaleY * 1.25, scaleX: flame.scaleX * 0.9,
        duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
      this.add.image(bx, 380, 'soft').setDisplaySize(220, 220)
        .setTint(0xff7a2f).setAlpha(0.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(-28);
    }

    // Ambient embers rising.
    this.embers = [];
    for (let i = 0; i < 26; i++) {
      const e = this.add.image(Phaser.Math.Between(0, W), Phaser.Math.Between(200, 520), 'spark')
        .setTint(0xffb43d).setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(Phaser.Math.FloatBetween(0.15, 0.5)).setDepth(-26);
      const s = Phaser.Math.FloatBetween(3, 8);
      e.setDisplaySize(s, s);
      this.embers.push({ s: e, vy: Phaser.Math.FloatBetween(-32, -10), p: Math.random() * 6 });
    }

    /* ----------------------------------------------------------- the hero */

    this.hero = createRig(this, {
      height: 76, colour: 0x3f3550, accent: 0xff8a3d, visorColour: 0xffd166
    });
    this.hero.setPosition(W / 2, 412).setDepth(-25);
    this.heroTime = 0;
    this.add.image(W / 2, 380, 'soft').setDisplaySize(160, 160)
      .setTint(0xff7a2f).setAlpha(0.18).setBlendMode(Phaser.BlendModes.ADD).setDepth(-26);

    this._announceAuthRedirect();

    if (wasHurt) {
      this.time.delayedCall(400, () => {
        this.toaster.show('Wounds mended — health restored to full', { colour: '#6bff9c' });
        this.audio.play('unlock');
        for (let i = 0; i < 20; i++) {
          this.time.delayedCall(i * 40, () => {
            const a = Math.random() * Math.PI * 2;
            const img = this.add.image(W / 2 + Math.cos(a) * 60, 370 + Math.sin(a) * 60, 'spark')
              .setTint(0x6bff9c).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(10, 10).setDepth(-24);
            this.tweens.add({
              targets: img, x: W / 2, y: 370, alpha: 0, duration: 500,
              onComplete: () => img.destroy()
            });
          });
        }
      });
    }

    /* ------------------------------------------------------------- header */

    this._buildHeader();

    /* ------------------------------------------------------------ stations */

    const stations = [
      { key: 'missions', label: 'MISSIONS', desc: 'Choose a stage', icon: 'gl_attack', style: 'primary',
        action: () => this._go('MissionScene') },
      { key: 'skills', label: 'SKILLS', desc: 'Spend points', icon: 'gl_ultimate', style: 'ghost',
        action: () => this._go('SkillTreeScene'),
        badge: () => this.profile.data.skillPoints },
      { key: 'loadout', label: 'LOADOUT', desc: 'Gear & inventory', icon: 'gl_block', style: 'ghost',
        action: () => this._go('LoadoutScene'),
        badge: () => this._upgradeCount() },
      { key: 'forge', label: 'FORGE', desc: 'Potions & upgrades', icon: 'gl_potion', style: 'ghost',
        action: () => this._go('ShopScene') },
      { key: 'codex', label: 'CODEX', desc: 'How to play', icon: 'gl_fireball', style: 'ghost',
        action: () => this._go('CodexScene') },
      { key: 'account', label: 'ACCOUNT', desc: this._accountDesc(), icon: 'gl_ultimate', style: 'ghost',
        action: () => this._go('AccountScene') }
    ];

    const gapX = 14;
    const cardH = 116;
    // Fit however many stations there are inside the available width.
    const cardW = Math.min(206, Math.floor((VIEW.WIDTH - 60 - (stations.length - 1) * gapX) / stations.length));
    const totalW = stations.length * cardW + (stations.length - 1) * gapX;
    let sx = (W - totalW) / 2 + cardW / 2;

    this.badges = [];
    for (const st of stations) {
      const c = this._station(sx, H - 96, cardW, cardH, st);
      this.add.existing(c);
      sx += cardW + gapX;
    }

    /* ------------------------------------------------------------- footer */

    this.add.text(28, H - 30, Phaser.Math.RND.pick(FLAVOUR),
      textStyle(15, PALETTE.textFaint)).setOrigin(0, 0.5);

    const settings = button(this, W - 92, 40, 132, 44, 'SETTINGS',
      () => this._go('SettingsScene'), { style: 'subtle', fontSize: 15 });
    this.add.existing(settings);

    // Progress readout.
    const cleared = Object.values(this.profile.data.stages).filter((s) => s.cleared > 0).length;
    this.add.text(W - 92, 74, `${cleared} / ${STAGES.length} stages cleared`,
      textStyle(13, PALETTE.textFaint)).setOrigin(0.5, 0);

    this.input.keyboard.on('keydown-ESC', () => this._go('MenuScene'));
    this.input.keyboard.on('keydown-ENTER', () => this._go('MissionScene'));
  }

  /* ---------------------------------------------------------------- header */

  _buildHeader() {
    const W = VIEW.WIDTH;
    const p = this.profile;
    const d = p.data;

    panel(this, 24, 24, 420, 96, { depth: 1, accent: PALETTE.ember });

    this.add.text(44, 40, 'ASCENDANT', textStyle(12, PALETTE.textFaint)).setDepth(2);
    this.levelText = this.add.text(44, 56, `LEVEL ${d.level}`, textStyle(26, '#ffd166')).setDepth(2);

    const xpNeeded = p.xpForNextLevel();
    const xpInto = p.xpIntoLevel();
    this.xpBar = bar(this, 44, 94, 380, 10, { fill: PALETTE.emberHot, depth: 2 });
    this.xpBar.setInstant(xpNeeded > 0 ? xpInto / xpNeeded : 1);

    this.add.text(44, 108, xpNeeded > 0 ? `${fmt(xpInto)} / ${fmt(xpNeeded)} XP` : 'MAX LEVEL',
      textStyle(12, PALETTE.textDim)).setDepth(2);

    // Currency strip.
    const cur = [
      { icon: 'spark', tint: 0xffb43d, value: () => fmt(d.ember), label: 'EMBER' },
      { icon: 'star', tint: 0xc074ff, value: () => fmt(d.shards), label: 'SHARDS' },
      { icon: 'gl_potion', tint: 0x6bff9c, value: () => `${d.potions}/${p.potionCap}`, label: 'POTIONS' }
    ];
    let x = 470;
    panel(this, 460, 24, 420, 96, { depth: 1 });
    for (const c of cur) {
      this.add.image(x + 22, 60, c.icon).setDisplaySize(24, 24).setTint(c.tint).setDepth(2);
      this.add.text(x + 44, 46, c.value(), textStyle(22, '#f2e9f7')).setDepth(2);
      this.add.text(x + 44, 74, c.label, textStyle(11, PALETTE.textFaint)).setDepth(2);
      x += 138;
    }
  }

  /**
   * Report the result of an email-confirmation link, once. Landing back in the
   * game with no acknowledgement leaves the player unsure whether it worked.
   */
  _announceAuthRedirect() {
    const notice = ctx.cloud?.redirectNotice;
    if (!notice) return;
    ctx.cloud.redirectNotice = null;

    this.time.delayedCall(600, () => {
      if (notice.error) {
        this.toaster.show(`Email link problem: ${notice.error}`, { colour: '#ff8a9b', duration: 6000 });
      } else {
        this.toaster.show('Email confirmed — you are signed in.', { colour: '#6bff9c', duration: 5000 });
        this.audio.play('unlock');
        // Now that there is an account, get this device's progress into it.
        ctx.cloud.reconcile().catch((err) => {
          this.toaster.show(err.message, { colour: '#ffb43d', duration: 5000 });
        });
      }
    });
  }

  /** Sub-label for the account card: signed in, available, or local-only. */
  _accountDesc() {
    if (!cloudConfigured()) return 'Local save only';
    return ctx.cloud?.signedIn ? 'Synced' : 'Save to cloud';
  }

  _upgradeCount() {
    // How many equipped slots have a strictly better item sitting in the bag.
    let count = 0;
    for (const slot of ['weapon', 'armour', 'relic']) {
      const equipped = this.profile.equippedItem(slot);
      const best = this.profile.inventory
        .filter((i) => i.slot === slot)
        .reduce((a, b) => (itemScore(b) > itemScore(a) ? b : a), equipped);
      if (best && best !== equipped && itemScore(best) > itemScore(equipped)) count++;
    }
    return count;
  }

  /* -------------------------------------------------------------- stations */

  _station(x, y, w, h, spec) {
    const c = this.add.container(x, y).setDepth(3);
    const bg = this.add.graphics();
    const primary = spec.style === 'primary';

    const draw = (over) => {
      bg.clear();
      bg.fillStyle(over ? PALETTE.panelHi : PALETTE.panel, 0.95);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
      bg.lineStyle(2, over || primary ? PALETTE.ember : PALETTE.border, over ? 1 : 0.85);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
      if (primary) {
        bg.fillStyle(PALETTE.ember, over ? 0.2 : 0.12);
        bg.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
      }
    };
    draw(false);
    c.add(bg);

    c.add(this.add.image(0, -h / 2 + 34, spec.icon)
      .setDisplaySize(30, 30).setTint(primary ? 0xffd166 : 0xd9c2e8));
    c.add(this.add.text(0, 6, spec.label, textStyle(20, primary ? '#ffd166' : PALETTE.text)).setOrigin(0.5));
    c.add(this.add.text(0, 32, spec.desc, textStyle(13, PALETTE.textFaint)).setOrigin(0.5));

    const badgeCount = spec.badge ? spec.badge() : 0;
    if (badgeCount > 0) {
      const bg2 = this.add.circle(w / 2 - 20, -h / 2 + 20, 15, PALETTE.bad);
      const txt = this.add.text(w / 2 - 20, -h / 2 + 20, String(badgeCount),
        textStyle(15, '#ffffff')).setOrigin(0.5);
      c.add([bg2, txt]);
      this.tweens.add({
        targets: [bg2, txt], scaleX: 1.14, scaleY: 1.14,
        duration: 640, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
    }

    setTapArea(c, -w / 2, -h / 2, w, h);
    c.input.cursor = 'pointer';
    c.on('pointerover', () => draw(true));
    c.on('pointerout', () => draw(false));
    c.on('pointerdown', () => {
      this.audio.play('ui');
      this.tweens.add({ targets: c, scaleX: 0.96, scaleY: 0.96, duration: 80, yoyo: true });
    });
    onTap(c, () => spec.action());
    return c;
  }

  _go(key) {
    this.cameras.main.fadeOut(200, 8, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(key, { from: 'HubScene' }));
  }

  update(time, delta) {
    const dt = delta / 1000;
    this.heroTime += dt;
    poseHumanoid(this.hero, { pose: 'idle', time: this.heroTime, dir: 1, blend: 0.2 });
    this.xpBar?.update(dt);
    for (const e of this.embers) {
      e.s.y += e.vy * dt;
      e.p += dt * 2;
      e.s.x += Math.sin(e.p) * 10 * dt;
      if (e.s.y < 140) { e.s.y = 540; e.s.x = Phaser.Math.Between(0, VIEW.WIDTH); }
    }
  }

  shutdown() {
    this.toaster?.destroy();
  }
}
