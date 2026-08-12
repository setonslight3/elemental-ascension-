/**
 * AccountScene — sign in, sign up, and cross-device sync.
 *
 * Text entry is the awkward part of a canvas game on a phone, so the email and
 * password fields are real DOM inputs positioned over the canvas: the player
 * gets their own keyboard, autofill and password manager instead of a
 * hand-rolled on-screen keyboard that would be worse in every way.
 */

import { ctx } from '../core/Context.js';
import { VIEW } from '../data/Balance.js';
import { PALETTE, textStyle, button, panel, Toaster, fmtTime } from '../ui/UI.js';
import { cloudConfigured } from '../config.js';
import { describeSave, progressScore } from '../systems/Cloud.js';
import { exportProfile, importProfile } from '../systems/Save.js';

export default class AccountScene extends Phaser.Scene {
  constructor() { super('AccountScene'); }

  init(data) { this.from = data?.from || 'HubScene'; }

  create() {
    this.profile = ctx.profile;
    this.audio = ctx.audio;
    this.cloud = ctx.cloud;
    const W = VIEW.WIDTH;
    const H = VIEW.HEIGHT;

    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.cameras.main.fadeIn(220, 8, 4, 12);
    const bg = this.add.graphics().setDepth(-10);
    bg.fillGradientStyle(0x0b0d18, 0x0b0d18, 0x141a2e, 0x100f20, 1);
    bg.fillRect(0, 0, W, H);

    this.toaster = new Toaster(this, { y: 90 });
    this.mode = 'signin';
    this.domNodes = [];

    this.add.existing(button(this, 84, 42, 120, 44, '< BACK', () => this._back(),
      { style: 'subtle', fontSize: 16 }));
    this.add.text(W / 2, 26, 'ACCOUNT', textStyle(28, '#ffd166')).setOrigin(0.5, 0);
    this.add.text(W / 2, 60, 'Save your progress and continue on any device',
      textStyle(14, PALETTE.textDim)).setOrigin(0.5, 0);

    if (!cloudConfigured()) { this._renderUnconfigured(); return; }

    this._unsub = this.cloud.onChange(() => this._renderStatus());
    this.events.once('shutdown', () => {
      this._unsub?.();
      this._clearDom();
      this.toaster?.destroy();
    });

    if (this.cloud.signedIn) this._renderSignedIn();
    else this._renderSignedOut();

    this.input.keyboard.on('keydown-ESC', () => this._back());
  }

  /* --------------------------------------------------------- not set up */

  _renderUnconfigured() {
    const W = VIEW.WIDTH;
    panel(this, W / 2 - 340, 130, 680, 330, { depth: 0, accent: PALETTE.border });
    this.add.text(W / 2, 160, 'CLOUD SAVES ARE NOT SET UP', textStyle(22, '#ffb43d')).setOrigin(0.5, 0);
    this.add.text(W / 2, 200,
      [
        'This build has no cloud project attached, so progress is saved on this',
        'device only. Everything else works normally.',
        '',
        'To turn accounts on, add a Supabase project URL and anon key to',
        'src/config.js and run the SQL in docs/CLOUD-SAVE.md.',
        '',
        'In the meantime you can move progress between devices by hand with a',
        'save code.'
      ].join('\n'),
      textStyle(14, PALETTE.textDim, { align: 'center', lineSpacing: 5 })).setOrigin(0.5, 0);

    this.add.existing(button(this, W / 2 - 120, 420, 220, 48, 'COPY SAVE CODE',
      () => this._copyCode(), { style: 'ghost', fontSize: 14, depth: 2 }));
    this.add.existing(button(this, W / 2 + 120, 420, 220, 48, 'PASTE SAVE CODE',
      () => this._pasteCode(), { style: 'ghost', fontSize: 14, depth: 2 }));
  }

  /* ------------------------------------------------------------ signed out */

  _renderSignedOut() {
    this._clearDom();
    this._clearPanel();
    const W = VIEW.WIDTH;
    const px = W / 2 - 260;

    this.panelG = panel(this, px, 120, 520, 400, { depth: 0, accent: PALETTE.ember });
    this.group = this.add.container(0, 0).setDepth(2);

    const title = this.add.text(W / 2, 144,
      this.mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT',
      textStyle(24, '#ffd166')).setOrigin(0.5, 0);
    this.group.add(title);

    this.emailInput = this._input('email', 'you@example.com', W / 2, 214, 440);
    this.passInput = this._input('password', 'password (6+ characters)', W / 2, 286, 440);

    this.group.add(this.add.text(px + 40, 186, 'EMAIL', textStyle(12, PALETTE.textFaint)));
    this.group.add(this.add.text(px + 40, 258, 'PASSWORD', textStyle(12, PALETTE.textFaint)));

    this.submitBtn = button(this, W / 2, 360, 440, 52,
      this.mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT',
      () => this._submit(), { style: 'primary', depth: 3 });
    this.group.add(this.submitBtn);

    this.switchBtn = button(this, W / 2, 424, 440, 44,
      this.mode === 'signin' ? 'No account yet? Create one' : 'Already have an account? Sign in',
      () => {
        this.mode = this.mode === 'signin' ? 'signup' : 'signin';
        this.audio.play('ui');
        this._renderSignedOut();
      }, { style: 'subtle', fontSize: 14, depth: 3 });
    this.group.add(this.switchBtn);

    this.msg = this.add.text(W / 2, 478, '', textStyle(14, '#ff8a9b')).setOrigin(0.5, 0);
    this.group.add(this.msg);

    this.add.text(W / 2, VIEW.HEIGHT - 54,
      'Progress stays on this device too — an account just keeps a copy you can pick up elsewhere.',
      textStyle(13, PALETTE.textFaint)).setOrigin(0.5, 0);
  }

  /* ------------------------------------------------------------- signed in */

  _renderSignedIn() {
    this._clearDom();
    this._clearPanel();
    const W = VIEW.WIDTH;
    const px = W / 2 - 300;

    this.panelG = panel(this, px, 120, 600, 400, { depth: 0, accent: 0x6bff9c });
    this.group = this.add.container(0, 0).setDepth(2);

    this.group.add(this.add.text(W / 2, 146, 'SIGNED IN', textStyle(22, '#6bff9c')).setOrigin(0.5, 0));
    this.group.add(this.add.text(W / 2, 176, this.cloud.email || 'account',
      textStyle(16, PALETTE.text)).setOrigin(0.5, 0));

    this.statusText = this.add.text(W / 2, 212, '', textStyle(14, PALETTE.textDim)).setOrigin(0.5, 0);
    this.group.add(this.statusText);

    const d = this.profile.data;
    const cleared = Object.values(d.stages).filter((s) => s.cleared > 0).length;
    this.group.add(this.add.text(W / 2, 248,
      `This device: Level ${d.level} · ${cleared} stages cleared · ${fmtTime(d.playtimeMs)} played`,
      textStyle(14, PALETTE.textDim)).setOrigin(0.5, 0));

    this.group.add(button(this, W / 2, 312, 520, 50, 'SAVE TO CLOUD NOW',
      () => this._push(), { style: 'primary', depth: 3 }));
    this.group.add(button(this, W / 2 - 132, 374, 256, 46, 'LOAD FROM CLOUD',
      () => this._pull(), { style: 'ghost', fontSize: 14, depth: 3 }));
    this.group.add(button(this, W / 2 + 132, 374, 256, 46, 'SIGN OUT',
      () => { this.cloud.signOut(); this.audio.play('uiBack'); this._renderSignedOut(); },
      { style: 'subtle', fontSize: 14, depth: 3 }));

    this.msg = this.add.text(W / 2, 432, '', textStyle(14, PALETTE.textDim)).setOrigin(0.5, 0);
    this.group.add(this.msg);

    this.add.text(W / 2, VIEW.HEIGHT - 54,
      'Your progress uploads automatically after every stage.',
      textStyle(13, PALETTE.textFaint)).setOrigin(0.5, 0);

    this._renderStatus();
  }

  _renderStatus() {
    if (!this.statusText || !this.statusText.active) return;
    const c = this.cloud;
    const when = c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleTimeString() : 'not yet this session';
    this.statusText.setText(c.status === 'syncing' ? 'Syncing…' : `Last sync: ${when}`);
    if (this.msg && this.msg.active && c.lastError) this.msg.setText(c.lastError).setColor('#ff8a9b');
  }

  /* ------------------------------------------------------------ DOM inputs */

  /**
   * A real <input> over the canvas. Positioned in page pixels by mapping the
   * design-space rectangle through the canvas' current on-screen box, so it
   * stays aligned at any scale or aspect ratio.
   */
  _input(type, placeholder, cx, cy, w) {
    const el = document.createElement('input');
    el.type = type === 'password' ? 'password' : 'email';
    el.placeholder = placeholder;
    el.autocomplete = type === 'password' ? 'current-password' : 'email';
    el.autocapitalize = 'off';
    el.autocorrect = 'off';
    el.spellcheck = false;
    el.style.cssText = [
      'position:fixed', 'z-index:50', 'box-sizing:border-box',
      'background:rgba(20,14,30,.96)', 'color:#f2e9f7',
      'border:2px solid #3d2b4f', 'border-radius:10px',
      'outline:none', 'padding:0 14px',
      'font-family:Trebuchet MS,Segoe UI,sans-serif'
    ].join(';');
    el.addEventListener('focus', () => { el.style.borderColor = '#ff7a2f'; });
    el.addEventListener('blur', () => { el.style.borderColor = '#3d2b4f'; });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._submit(); });
    document.body.appendChild(el);

    const node = { el, cx, cy, w, h: 52 };
    this.domNodes.push(node);
    this._placeDom();
    return node;
  }

  _placeDom() {
    const canvas = this.game.canvas;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const sx = r.width / this.game.scale.width;
    const sy = r.height / this.game.scale.height;
    for (const n of this.domNodes) {
      n.el.style.left = `${r.left + (n.cx - n.w / 2) * sx}px`;
      n.el.style.top = `${r.top + (n.cy - n.h / 2) * sy}px`;
      n.el.style.width = `${n.w * sx}px`;
      n.el.style.height = `${n.h * sy}px`;
      n.el.style.fontSize = `${Math.max(12, Math.round(17 * sy))}px`;
    }
  }

  _clearDom() {
    for (const n of this.domNodes) n.el.remove();
    this.domNodes = [];
  }

  _clearPanel() {
    this.panelG?.destroy();
    this.group?.destroy(true);
    this.panelG = null;
    this.group = null;
    this.statusText = null;
    this.msg = null;
  }

  /* --------------------------------------------------------------- actions */

  async _submit() {
    const email = (this.emailInput?.el.value || '').trim();
    const password = this.passInput?.el.value || '';
    if (!email || !password) {
      this._say('Enter an email and a password.', '#ff8a9b');
      return;
    }
    if (password.length < 6) {
      this._say('Password must be at least 6 characters.', '#ff8a9b');
      return;
    }

    this.submitBtn?.setEnabled(false);
    this._say(this.mode === 'signin' ? 'Signing in…' : 'Creating account…', PALETTE.textDim);
    try {
      if (this.mode === 'signin') await this.cloud.signIn(email, password);
      else await this.cloud.signUp(email, password);

      this.audio.play('unlock');
      const result = await this.cloud.reconcile();
      if (result.action === 'conflict') {
        this._renderConflict(result.local, result.remote);
        return;
      }
      const note = {
        pushed: 'Signed in. This device\'s progress is now saved to your account.',
        pulled: 'Signed in. Your account\'s progress has been loaded.',
        'in-sync': 'Signed in. Everything was already up to date.'
      }[result.action];
      this.toaster.show(note, { colour: '#6bff9c', duration: 4000 });
      this._renderSignedIn();
    } catch (err) {
      this.audio.play('error');
      this._say(err.message, err.kind === 'confirm' ? '#ffd166' : '#ff8a9b');
      this.submitBtn?.setEnabled(true);
    }
  }

  /**
   * Both sides have real progress and they disagree. Show what each contains
   * and let the player decide — never merge or silently pick.
   */
  _renderConflict(local, remote) {
    this._clearDom();
    this._clearPanel();
    const W = VIEW.WIDTH;

    this.panelG = panel(this, W / 2 - 340, 120, 680, 420, { depth: 0, accent: 0xffb43d });
    this.group = this.add.container(0, 0).setDepth(2);

    this.group.add(this.add.text(W / 2, 146, 'TWO DIFFERENT SAVES', textStyle(24, '#ffb43d')).setOrigin(0.5, 0));
    this.group.add(this.add.text(W / 2, 182,
      'This device and your account both have progress. Choose which to keep —\nthe other will be replaced.',
      textStyle(14, PALETTE.textDim, { align: 'center', lineSpacing: 4 })).setOrigin(0.5, 0));

    const localBetter = progressScore(local) >= progressScore(remote);
    this.group.add(this.add.text(W / 2, 240, 'THIS DEVICE', textStyle(13, PALETTE.textFaint)).setOrigin(0.5, 0));
    this.group.add(this.add.text(W / 2, 260, describeSave(local),
      textStyle(15, localBetter ? '#6bff9c' : PALETTE.text)).setOrigin(0.5, 0));
    this.group.add(this.add.text(W / 2, 306, 'YOUR ACCOUNT', textStyle(13, PALETTE.textFaint)).setOrigin(0.5, 0));
    this.group.add(this.add.text(W / 2, 326, describeSave(remote),
      textStyle(15, localBetter ? PALETTE.text : '#6bff9c')).setOrigin(0.5, 0));

    this.group.add(button(this, W / 2 - 170, 400, 300, 50, 'KEEP THIS DEVICE',
      async () => {
        try {
          await this.cloud.push();
          this.toaster.show('Account updated from this device.', { colour: '#6bff9c' });
          this._renderSignedIn();
        } catch (err) { this._say(err.message, '#ff8a9b'); }
      }, { style: localBetter ? 'primary' : 'ghost', fontSize: 15, depth: 3 }));

    this.group.add(button(this, W / 2 + 170, 400, 300, 50, 'KEEP THE ACCOUNT',
      async () => {
        try {
          await this.cloud.pull();
          this.toaster.show('Loaded your account\'s progress.', { colour: '#6bff9c' });
          this._renderSignedIn();
        } catch (err) { this._say(err.message, '#ff8a9b'); }
      }, { style: localBetter ? 'ghost' : 'primary', fontSize: 15, depth: 3 }));

    this.group.add(this.add.text(W / 2, 470,
      'Tip: copy a save code from Settings first if you want to keep both.',
      textStyle(12, PALETTE.textFaint)).setOrigin(0.5, 0));

    this.msg = this.add.text(W / 2, 500, '', textStyle(14, '#ff8a9b')).setOrigin(0.5, 0);
    this.group.add(this.msg);
  }

  async _push() {
    try {
      await this.cloud.push();
      this.audio.play('unlock');
      this.toaster.show('Saved to your account.', { colour: '#6bff9c' });
      this._renderStatus();
    } catch (err) {
      this.audio.play('error');
      this._say(err.message, '#ff8a9b');
    }
  }

  async _pull() {
    try {
      const remote = await this.cloud.pull();
      if (!remote) { this._say('Your account has no save yet.', '#ffb43d'); return; }
      this.audio.play('unlock');
      this.toaster.show('Loaded your account\'s progress.', { colour: '#6bff9c' });
      this._renderSignedIn();
    } catch (err) {
      this.audio.play('error');
      this._say(err.message, '#ff8a9b');
    }
  }

  _say(text, colour) {
    if (this.msg && this.msg.active) this.msg.setText(text).setColor(colour);
  }

  async _copyCode() {
    const code = exportProfile(this.profile.data);
    try {
      await navigator.clipboard.writeText(code);
      this.toaster.show('Save code copied.', { colour: '#6bff9c' });
    } catch {
      window.prompt('Copy your save code:', code);
    }
  }

  _pasteCode() {
    const code = window.prompt('Paste a save code:');
    if (!code) return;
    try {
      this.profile.replaceWith(importProfile(code));
      this.toaster.show('Save loaded.', { colour: '#6bff9c' });
      this.time.delayedCall(700, () => this.scene.start('MenuScene'));
    } catch (err) {
      this.toaster.show(err.message, { colour: '#ff8a9b' });
    }
  }

  update() { if (this.domNodes.length) this._placeDom(); }

  _back() {
    this._clearDom();
    this.cameras.main.fadeOut(180, 8, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(this.from));
  }
}
