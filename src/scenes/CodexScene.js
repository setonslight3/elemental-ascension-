/**
 * CodexScene — how to play, and a bestiary.
 *
 * Written to answer the questions a new player actually has in the first two
 * minutes: what do the coloured flashes mean, why did my guard break, and why
 * is my style rank stuck at B.
 */

import { ctx } from '../core/Context.js';
import { VIEW } from '../data/Balance.js';
import { PALETTE, textStyle, button, panel, scrollList, hex } from '../ui/UI.js';
import { ARCHETYPES, BOSSES } from '../data/Enemies.js';
import { ABILITIES, STYLE, PLAYER } from '../data/Balance.js';

const TABS = ['CONTROLS', 'COMBAT', 'BESTIARY', 'PROGRESSION'];

export default class CodexScene extends Phaser.Scene {
  constructor() { super('CodexScene'); }

  init(data) { this.from = data?.from || 'HubScene'; }

  create() {
    this.profile = ctx.profile;
    this.audio = ctx.audio;
    const W = VIEW.WIDTH;
    const H = VIEW.HEIGHT;

    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.cameras.main.fadeIn(220, 8, 4, 12);
    const bg = this.add.graphics().setDepth(-10);
    bg.fillGradientStyle(0x0e0913, 0x0e0913, 0x1a1020, 0x140c1a, 1);
    bg.fillRect(0, 0, W, H);

    this.add.existing(button(this, 84, 42, 120, 44, '< BACK', () => this._back(),
      { style: 'subtle', fontSize: 16 }));
    this.add.text(W / 2, 26, 'CODEX', textStyle(28, '#ffd166')).setOrigin(0.5, 0);

    this.tab = 'CONTROLS';
    this.tabButtons = [];
    const tabStart = W / 2 - (TABS.length * 180) / 2 + 90;
    TABS.forEach((t, i) => {
      const b = button(this, tabStart + i * 180, 78, 170, 42, t,
        () => { this.tab = t; this._render(); this._drawTabs(); },
        { style: 'subtle', fontSize: 14 });
      this.add.existing(b);
      this.tabButtons.push({ key: t, btn: b });
    });

    this.panelG = panel(this, 40, 116, W - 80, H - 156, { depth: 0 });
    this.content = this.add.container(0, 0).setDepth(2);

    this._drawTabs();
    this._render();
    this.input.keyboard.on('keydown-ESC', () => this._back());
  }

  _drawTabs() {
    for (const t of this.tabButtons) {
      t.btn.label.setColor(t.key === this.tab ? '#ffd166' : PALETTE.textDim);
    }
  }

  _render() {
    this.list?.destroy();
    this.list = null;
    this.content.removeAll(true);
    switch (this.tab) {
      case 'CONTROLS': return this._renderControls();
      case 'COMBAT': return this._renderCombat();
      case 'BESTIARY': return this._renderBestiary();
      default: return this._renderProgression();
    }
  }

  /* -------------------------------------------------------------- controls */

  _renderControls() {
    const add = (o) => { this.content.add(o); return o; };
    const W = VIEW.WIDTH;
    const colW = (W - 140) / 2;

    const columns = [
      {
        title: 'TOUCH  (landscape)',
        rows: [
          ['Left thumb', 'Move. The stick appears where you touch.'],
          ['Push to the edge', 'Sprint.'],
          ['Pull down while sprinting', 'Slide — goes under beams.'],
          ['Right cluster', 'Attack, jump, roll, guard.'],
          ['Bottom row', 'Fire abilities, ultimate, potion.'],
          ['Pause', 'Top-right corner.']
        ]
      },
      {
        title: 'KEYBOARD  /  GAMEPAD',
        rows: [
          ['A D  ·  stick', 'Move'],
          ['SHIFT  ·  push stick', 'Sprint'],
          ['SPACE  ·  A', 'Jump  (hold higher, tap lower)'],
          ['S + sprint  ·  down', 'Slide'],
          ['J  ·  X', 'Attack — three-hit chain'],
          ['K  ·  LB', 'Guard  (tap on impact to parry)'],
          ['L  ·  B', 'Roll  (invulnerable frames)'],
          ['1-4  ·  RB / triggers', 'Fire abilities'],
          ['Q  ·  L3', 'Ultimate'],
          ['R  ·  Y', 'Potion'],
          ['ESC  ·  START', 'Pause']
        ]
      }
    ];

    let cx = 70;
    for (const col of columns) {
      let y = 146;
      add(this.add.text(cx, y, col.title, textStyle(15, '#ffd166')));
      y += 34;
      for (const [key, desc] of col.rows) {
        add(this.add.text(cx, y, key, textStyle(14, PALETTE.text)));
        add(this.add.text(cx + 230, y, desc, textStyle(14, PALETTE.textDim,
          { wordWrap: { width: colW - 240 } })));
        y += 30;
      }
      cx += colW + 20;
    }

    add(this.add.text(70, VIEW.HEIGHT - 96,
      'Everything is remappable by muscle memory, not menus: the same actions sit in the same place on every input.',
      textStyle(13, PALETTE.textFaint)));
  }

  /* ---------------------------------------------------------------- combat */

  _renderCombat() {
    const add = (o) => { this.content.add(o); return o; };
    const W = VIEW.WIDTH;
    const colW = (W - 160) / 3;

    const sections = [
      {
        title: 'READING AN ATTACK',
        colour: '#ffc247',
        body: [
          ['AMBER outline', 'Blockable. Guard it, or tap guard the instant it lands for a PARRY — free damage window, mana back, huge style.'],
          ['CRIMSON outline', 'Unblockable. Guard does nothing. Roll through it or leave.'],
          ['The outline is the hitbox', 'What is drawn is exactly what will hit you.']
        ]
      },
      {
        title: 'DEFENCE',
        colour: '#59f2ff',
        body: [
          ['Guard', `Blocks ${Math.round((1 - PLAYER.BLOCK_DAMAGE_MULT) * 100)}% of damage but drains stamina. At zero stamina your guard breaks and you are stunned.`],
          ['Parry window', `${PLAYER.PARRY_WINDOW.toFixed(2)}s from raising your guard. Mashing does not work — there is a cooldown.`],
          ['Roll', `${PLAYER.ROLL_IFRAMES.toFixed(2)}s invulnerable. Costs stamina. Can cancel out of an attack's recovery.`],
          ['Slide', 'Low profile. Beams and shots pass over you.']
        ]
      },
      {
        title: 'OFFENCE',
        colour: '#ff6b3d',
        body: [
          ['Three-hit chain', 'Jab, slash, launcher. The third hit throws enemies into the air.'],
          ['Cancel windows', 'An ability or roll can cancel the recovery of any swing. This is where combos come from.'],
          ['Mana', 'Regenerates slowly on its own, faster when your hits connect. Swinging at air gives you nothing.'],
          ['Burn', 'Every fire hit stacks Burn. It ticks even while you reposition.']
        ]
      }
    ];

    let cx = 70;
    for (const sec of sections) {
      let y = 146;
      add(this.add.text(cx, y, sec.title, textStyle(15, sec.colour)));
      y += 30;
      for (const [key, desc] of sec.body) {
        add(this.add.text(cx, y, key, textStyle(14, PALETTE.text)));
        y += 20;
        const t = add(this.add.text(cx, y, desc, textStyle(13, PALETTE.textDim,
          { wordWrap: { width: colW - 20 }, lineSpacing: 3 })));
        y += t.height + 14;
      }
      cx += colW + 20;
    }
  }

  /* -------------------------------------------------------------- bestiary */

  _renderBestiary() {
    const W = VIEW.WIDTH;
    const rows = [
      ...Object.values(ARCHETYPES).map((a) => ({ kind: 'unit', def: a })),
      ...Object.values(BOSSES).map((b) => ({ kind: 'boss', def: b }))
    ];

    this.list = scrollList(this, 70, 146, W - 140, VIEW.HEIGHT - 210, rows,
      (row, i, w) => this._bestiaryRow(row, w), { rowHeight: 84, gap: 8, depth: 3 });
  }

  _bestiaryRow(row, w) {
    const def = row.def;
    const c = this.add.container(0, 0);
    c.rowHeight = 84;
    const isBoss = row.kind === 'boss';

    const g = this.add.graphics();
    g.fillStyle(isBoss ? 0x2a1620 : PALETTE.panelHi, 0.9);
    g.fillRoundedRect(0, 0, w, 84, 10);
    g.fillStyle(def.colour, 0.9);
    g.fillRoundedRect(0, 0, 6, 84, { tl: 10, bl: 10, tr: 0, br: 0 });
    g.lineStyle(1.5, isBoss ? PALETTE.bad : PALETTE.border, 0.7);
    g.strokeRoundedRect(0, 0, w, 84, 10);
    c.add(g);

    c.add(this.add.circle(44, 42, 20, def.colour));
    c.add(this.add.circle(44, 42, 7, def.accent));

    c.add(this.add.text(84, 14, def.name, textStyle(18, isBoss ? '#ff8a9b' : PALETTE.text)));
    c.add(this.add.text(84, 38, isBoss ? def.title : this._unitBlurb(def),
      textStyle(13, PALETTE.textDim, { wordWrap: { width: w - 400 } })));

    const attacks = isBoss
      ? Object.entries(def.attacks).map(([, a]) => a)
      : def.attacks;
    const unblockable = attacks.filter((a) => a.telegraph === 'unblockable').length;
    const blockable = attacks.length - unblockable;

    c.add(this.add.text(w - 20, 16,
      `${blockable} parryable · ${unblockable} unblockable`,
      textStyle(12, PALETTE.textFaint)).setOrigin(1, 0));
    c.add(this.add.text(w - 20, 38,
      isBoss ? `${def.phases.length} phases · ${def.hp} HP` : `${def.hp} HP · ${def.damage} dmg`,
      textStyle(12, PALETTE.textDim)).setOrigin(1, 0));

    const tips = {
      scrapper: 'Parry the swing. It is the safest parry practice in the game.',
      drone: 'Its dive is parryable. An air attack spikes it into the floor.',
      lancer: 'The shield only faces forward. Flank it, launch it, or parry the thrust to break the guard.',
      sniper: 'The charge beam is unblockable — slide under it, then close the gap.',
      bomber: 'Never let it reach you. Kill it at range or roll away from the fuse.',
      brute: 'Sweep is parryable, slam is not. Watch the colour, not the animation.',
      sentinel: 'Stationary. Its spread is parryable and the shots reflect.',
      warden: 'Blinks and rushes. Blades are parryable; the rush is not.'
    };
    if (tips[def.id]) {
      c.add(this.add.text(84, 60, tips[def.id], textStyle(12, '#ffc247')));
    } else if (isBoss) {
      c.add(this.add.text(84, 60,
        'Fills a stagger meter. Break it for a long punish window.',
        textStyle(12, '#ffc247')));
    }
    return c;
  }

  _unitBlurb(def) {
    if (def.flying) return 'Airborne harasser.';
    if (def.stationary) return 'Fixed emplacement.';
    if (def.explodeOnDeath) return 'Suicide charger.';
    if (def.kiter) return 'Keeps its distance.';
    if (def.frontalGuard) return 'Shielded from the front.';
    if (def.armour) return 'Heavily armoured.';
    return 'Standard infantry unit.';
  }

  /* ----------------------------------------------------------- progression */

  _renderProgression() {
    const add = (o) => { this.content.add(o); return o; };
    const W = VIEW.WIDTH;
    const colW = (W - 160) / 3;

    let cx = 70;
    let y = 146;
    add(this.add.text(cx, y, 'STYLE RANK', textStyle(15, '#ffd166')));
    y += 30;
    add(this.add.text(cx, y,
      'Rank multiplies everything you earn from a stage. It climbs on varied,\naggressive play and falls the moment you get careless.',
      textStyle(13, PALETTE.textDim, { lineSpacing: 4 })));
    y += 56;
    for (const rank of STYLE.RANKS) {
      add(this.add.text(cx, y, rank.key, textStyle(20, hex(rank.colour))));
      add(this.add.text(cx + 60, y + 4, `reward ×${rank.mult.toFixed(2)}`, textStyle(13, PALETTE.textDim)));
      y += 26;
    }
    y += 10;
    add(this.add.text(cx, y,
      `Repeating one move pays less each time (×${STYLE.REPEAT_FALLOFF} per repeat).\nTaking a hit costs you ${Math.round((1 - STYLE.HIT_TAKEN_PENALTY) * 100)}% of the meter.`,
      textStyle(12, '#ffc247', { lineSpacing: 4, wordWrap: { width: colW } })));

    cx += colW + 20;
    y = 146;
    add(this.add.text(cx, y, 'HEALTH & THE HUB', textStyle(15, '#6bff9c')));
    y += 30;
    add(this.add.text(cx, y,
      [
        'Health carries between stages. Only the Hub restores it fully.',
        '',
        'Out of combat you slowly regenerate — but only up to ' +
        `${Math.round(PLAYER.REGEN_SAFETY_FLOOR * 100)}% of maximum. It is a safety net, not a rest.`,
        '',
        'Potions are the field option. Buy them at the Forge; the Control tree raises how many you can carry.',
        '',
        'Dying costs the run, never the account: you keep a share of the XP and loot and can walk straight back in.'
      ].join('\n'),
      textStyle(13, PALETTE.textDim, { lineSpacing: 5, wordWrap: { width: colW } })));

    cx += colW + 20;
    y = 146;
    add(this.add.text(cx, y, 'FIRE ABILITIES', textStyle(15, '#ff6b3d')));
    y += 30;
    for (const ab of Object.values(ABILITIES)) {
      const owned = this.profile.data.abilities.includes(ab.id);
      add(this.add.text(cx, y, ab.name, textStyle(15, owned ? '#ffd166' : PALETTE.textFaint)));
      add(this.add.text(cx + colW, y + 2, owned ? `${ab.manaCost} mana` : `stage ${ab.unlockStage}`,
        textStyle(12, PALETTE.textFaint)).setOrigin(1, 0));
      y += 20;
      const t = add(this.add.text(cx, y, ab.desc,
        textStyle(12, PALETTE.textDim, { wordWrap: { width: colW }, lineSpacing: 3 })));
      y += t.height + 16;
    }
  }

  _back() {
    this.cameras.main.fadeOut(180, 8, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(this.from));
  }

  update(time, delta) { this.list?.update(delta / 1000); }

  shutdown() { this.list?.destroy(); }
}
