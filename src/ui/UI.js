/**
 * UI.js — the shared widget kit.
 *
 * Built around two constraints:
 *  - **Thumbs.** Every interactive element has a minimum 46px touch target and
 *    a press state that is visible under a finger, not just under a cursor.
 *  - **One look.** Panels, buttons and bars all draw from the same palette and
 *    corner radius so nine screens feel like one game.
 */

export const PALETTE = {
  bg: 0x0d0813,
  bgSoft: 0x150e1e,
  panel: 0x1b1426,
  panelHi: 0x271a35,
  border: 0x3d2b4f,
  borderHot: 0xff7a2f,
  ember: 0xff7a2f,
  emberHot: 0xffd166,
  cool: 0x59f2ff,
  good: 0x6bff9c,
  bad: 0xff4d6d,
  text: '#f2e9f7',
  textDim: '#a18fb4',
  textFaint: '#6d5c7d'
};

export const FONT = 'Trebuchet MS, Segoe UI, system-ui, sans-serif';

export const textStyle = (size, colour = PALETTE.text, extra = {}) => ({
  fontFamily: FONT,
  fontSize: `${size}px`,
  color: colour,
  ...extra
});

/* ------------------------------------------------------------------ panels */

/**
 * Rounded panel with a border and an optional accent edge.
 * @returns {Phaser.GameObjects.Graphics}
 */
export function panel(scene, x, y, w, h, opts = {}) {
  const {
    fill = PALETTE.panel,
    alpha = 0.94,
    border = PALETTE.border,
    radius = 14,
    accent = null,
    depth = 0
  } = opts;

  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x, y, w, h, radius);
  g.lineStyle(2, border, 0.9);
  g.strokeRoundedRect(x, y, w, h, radius);
  if (accent) {
    g.fillStyle(accent, 0.9);
    g.fillRoundedRect(x, y, 5, h, { tl: radius, bl: radius, tr: 0, br: 0 });
  }
  return g;
}

/** Full-screen dimmer behind a modal. */
export function scrim(scene, alpha = 0.72, depth = 100) {
  const cam = scene.cameras.main;
  return scene.add.rectangle(0, 0, cam.width, cam.height, 0x05030a, alpha)
    .setOrigin(0).setScrollFactor(0).setDepth(depth).setInteractive();
}

/* ----------------------------------------------------------------- buttons */

/**
 * A text button.
 * @returns {Phaser.GameObjects.Container} with `.setEnabled(bool)` and `.label`
 */
export function button(scene, x, y, w, h, label, onClick, opts = {}) {
  const {
    style = 'primary',       // primary | ghost | danger | subtle
    fontSize = Math.min(22, Math.max(15, h * 0.4)),
    icon = null,
    depth = 1,
    tooltip = null
  } = opts;

  const palettes = {
    primary: { fill: PALETTE.ember, text: '#1a0d05', border: PALETTE.emberHot },
    ghost:   { fill: PALETTE.panelHi, text: PALETTE.text, border: PALETTE.border },
    danger:  { fill: 0x8a1f38, text: '#ffe9ef', border: PALETTE.bad },
    subtle:  { fill: 0x150e1e, text: PALETTE.textDim, border: 0x2a1d36 }
  };
  const pal = palettes[style] || palettes.ghost;

  const c = scene.add.container(x, y).setDepth(depth);
  c.setSize(w, h);

  const bg = scene.add.graphics();
  const draw = (state) => {
    bg.clear();
    const isDown = state === 'down';
    const isOver = state === 'over';
    const fill = isDown ? PALETTE.emberHot : pal.fill;
    bg.fillStyle(fill, c.enabled === false ? 0.35 : isOver ? 1 : 0.92);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    bg.lineStyle(2, isOver || isDown ? PALETTE.emberHot : pal.border, c.enabled === false ? 0.3 : 0.95);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
  };
  c.add(bg);

  let textX = 0;
  if (icon) {
    const iconImg = scene.add.image(-w / 2 + h * 0.55, 0, icon)
      .setDisplaySize(h * 0.5, h * 0.5).setTint(0xffffff);
    c.add(iconImg);
    c.iconImg = iconImg;
    textX = h * 0.3;
  }

  const text = scene.add.text(textX, 0, label, textStyle(fontSize, pal.text)).setOrigin(0.5);
  c.add(text);
  c.label = text;
  c.enabled = true;

  draw('out');

  // Drawn centred on the container's position, so that is the region to make
  // tappable. setTapArea handles Phaser's displayOrigin shift.
  setTapArea(c, -w / 2, -h / 2, w, h);
  c.input.cursor = 'pointer';

  /**
   * Activation is split by input type, because "press and release over the
   * target" is a mouse idiom that touch keeps breaking:
   *
   *  - A finger almost always moves a few pixels between down and up. If that
   *    drift leaves the button, Phaser delivers `pointerupoutside` instead of
   *    `pointerup` and a mouse-style handler silently does nothing.
   *  - On touch the press *is* the decision, so firing on down also makes the
   *    UI feel immediate rather than laggy.
   *
   * So: touch fires on down, mouse fires on up, and `fired` guarantees exactly
   * one activation per press either way.
   */
  let fired = false;

  const activate = () => {
    if (!c.enabled || fired) return;
    fired = true;
    draw('out');
    onClick?.();
  };

  c.on('pointerover', () => { if (c.enabled) draw('over'); });
  c.on('pointerout', () => draw('out'));

  c.on('pointerdown', (pointer) => {
    if (!c.enabled) return;
    fired = false;
    draw('down');
    scene.tweens.add({ targets: c, scaleX: 0.96, scaleY: 0.96, duration: 70, yoyo: true });
    scene.audio?.play('ui');
    if (pointer && pointer.wasTouch) activate();
  });

  c.on('pointerup', (pointer) => {
    if (!c.enabled) return;
    if (pointer && pointer.wasTouch) { draw('out'); return; }
    draw('over');
    activate();
  });

  // A touch that drifts off the button still counts — the press already fired.
  c.on('pointerupoutside', () => draw('out'));

  c.setEnabled = (on) => {
    c.enabled = on;
    text.setAlpha(on ? 1 : 0.4);
    if (c.iconImg) c.iconImg.setAlpha(on ? 1 : 0.4);
    draw('out');
    return c;
  };
  c.setLabel = (s) => { text.setText(s); return c; };
  c.redraw = () => draw('out');
  if (tooltip) c.tooltip = tooltip;

  return c;
}

/** Small square icon button (close, back, settings). */
export function iconButton(scene, x, y, size, iconKey, onClick, opts = {}) {
  const c = scene.add.container(x, y).setDepth(opts.depth ?? 1);
  const bg = scene.add.graphics();
  const draw = (over) => {
    bg.clear();
    bg.fillStyle(over ? PALETTE.panelHi : PALETTE.panel, 0.92);
    bg.fillRoundedRect(-size / 2, -size / 2, size, size, 10);
    bg.lineStyle(2, over ? PALETTE.emberHot : PALETTE.border, 0.9);
    bg.strokeRoundedRect(-size / 2, -size / 2, size, size, 10);
  };
  draw(false);
  const icon = scene.add.image(0, 0, iconKey)
    .setDisplaySize(size * 0.52, size * 0.52)
    .setTint(opts.tint ?? 0xffd9b8);
  c.add([bg, icon]);
  c.setSize(size, size);
  // Touch targets are padded well beyond the drawn square: the icon is the
  // affordance, not the hit area.
  const pad = size * 0.28;
  setTapArea(c, -size / 2 - pad, -size / 2 - pad, size + pad * 2, size + pad * 2);
  c.input.cursor = 'pointer';

  // Same touch-fires-on-press rule as `button()`; see the note there.
  let fired = false;
  const activate = () => { if (!fired) { fired = true; onClick?.(); } };

  c.on('pointerover', () => draw(true));
  c.on('pointerout', () => draw(false));
  c.on('pointerdown', (pointer) => {
    fired = false;
    scene.tweens.add({ targets: c, scaleX: 0.9, scaleY: 0.9, duration: 70, yoyo: true });
    scene.audio?.play('ui');
    if (pointer && pointer.wasTouch) activate();
  });
  c.on('pointerup', (pointer) => {
    if (pointer && pointer.wasTouch) return;
    activate();
  });
  return c;
}

/* -------------------------------------------------------------------- bars */

/**
 * A labelled progress bar with smooth interpolation and an optional
 * "recent damage" ghost trail behind the fill.
 */
export function bar(scene, x, y, w, h, opts = {}) {
  const {
    fill = PALETTE.ember,
    back = 0x2a1d33,
    border = 0x000000,
    radius = Math.min(6, h / 2),
    ghost = false,
    depth = 0
  } = opts;

  const g = scene.add.graphics().setDepth(depth).setScrollFactor(0);
  const api = {
    g, value: 1, display: 1, ghostValue: 1,
    setValue(v) { api.value = Phaser.Math.Clamp(v, 0, 1); return api; },
    setInstant(v) { api.value = api.display = api.ghostValue = Phaser.Math.Clamp(v, 0, 1); return api; },
    setPosition(nx, ny) { x = nx; y = ny; return api; },
    setFill(colour) { opts.fill = colour; return api; },
    update(dt) {
      api.display = Phaser.Math.Linear(api.display, api.value, Math.min(1, dt * 14));
      if (ghost) {
        api.ghostValue = api.ghostValue > api.value
          ? Math.max(api.value, api.ghostValue - dt * 0.45)
          : api.value;
      }
      api.draw();
    },
    draw() {
      g.clear();
      g.fillStyle(back, 0.85);
      g.fillRoundedRect(x, y, w, h, radius);
      if (ghost && api.ghostValue > api.display) {
        g.fillStyle(0xff9b6b, 0.55);
        g.fillRoundedRect(x, y, Math.max(2, w * api.ghostValue), h, radius);
      }
      const fw = w * api.display;
      if (fw > 1) {
        g.fillStyle(opts.fill ?? fill, 1);
        g.fillRoundedRect(x, y, Math.max(2, fw), h, radius);
        // A lighter top edge gives the fill a bit of body.
        g.fillStyle(0xffffff, 0.18);
        g.fillRoundedRect(x, y, Math.max(2, fw), Math.max(2, h * 0.35), radius);
      }
      g.lineStyle(1.5, border, 0.5);
      g.strokeRoundedRect(x, y, w, h, radius);
    },
    destroy() { g.destroy(); }
  };
  api.draw();
  return api;
}

/* ------------------------------------------------------------- scroll list */

/**
 * A vertically scrolling, touch-draggable list with momentum and a masked
 * viewport. `renderItem(item, index, width)` must return a Container.
 */
export function scrollList(scene, x, y, w, h, items, renderItem, opts = {}) {
  const { rowHeight = 74, gap = 8, depth = 2, onSelect = null } = opts;

  const container = scene.add.container(x, y).setDepth(depth);
  const content = scene.add.container(0, 0);
  container.add(content);

  // Mask the viewport so rows clip at the panel edge.
  const maskShape = scene.make.graphics({ x: 0, y: 0, add: false });
  maskShape.fillStyle(0xffffff);
  maskShape.fillRect(x, y, w, h);
  const mask = maskShape.createGeometryMask();
  content.setMask(mask);

  const rows = [];
  let contentHeight = 0;

  const build = (list) => {
    for (const r of rows) r.destroy(true);
    rows.length = 0;
    content.removeAll(false);
    contentHeight = 0;
    list.forEach((item, i) => {
      const row = renderItem(item, i, w);
      if (!row) return;
      row.setPosition(0, contentHeight);
      content.add(row);
      rows.push(row);
      contentHeight += (row.rowHeight || rowHeight) + gap;
      if (onSelect) {
        // Rows draw from their own top-left corner.
        setTapArea(row, 0, 0, w, row.rowHeight || rowHeight);
        row.on('pointerup', () => { if (!api.dragged) onSelect(item, i); });
      }
    });
    contentHeight = Math.max(0, contentHeight - gap);
  };

  const api = {
    container, content, scroll: 0, velocity: 0, dragging: false, dragged: false,
    get maxScroll() { return Math.max(0, contentHeight - h); },
    rebuild(list) { build(list); api.scroll = Math.min(api.scroll, api.maxScroll); },
    update(dt) {
      if (!api.dragging) {
        api.scroll += api.velocity * dt;
        api.velocity *= Math.max(0, 1 - 4.5 * dt);
        // Rubber-band back into range.
        if (api.scroll < 0) { api.scroll = Phaser.Math.Linear(api.scroll, 0, Math.min(1, dt * 14)); api.velocity = 0; }
        if (api.scroll > api.maxScroll) {
          api.scroll = Phaser.Math.Linear(api.scroll, api.maxScroll, Math.min(1, dt * 14));
          api.velocity = 0;
        }
      }
      content.y = -api.scroll;
      // Fade rows near the clip edges so the list reads as continuing.
      for (const row of rows) {
        const top = row.y - api.scroll;
        const bottom = top + (row.rowHeight || rowHeight);
        const fadeTop = Phaser.Math.Clamp(bottom / 40, 0, 1);
        const fadeBottom = Phaser.Math.Clamp((h - top) / 40, 0, 1);
        row.setAlpha(Math.min(fadeTop, fadeBottom));
      }
    },
    destroy() {
      container.destroy(true);
      maskShape.destroy();
    }
  };

  build(items);

  // Drag handling on a transparent hit rect covering the viewport.
  const hit = scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0)
    .setDepth(depth - 1).setInteractive();
  let startY = 0;
  let startScroll = 0;
  let lastY = 0;
  let lastT = 0;

  hit.on('pointerdown', (p) => {
    api.dragging = true;
    api.dragged = false;
    startY = p.y;
    lastY = p.y;
    lastT = performance.now();
    startScroll = api.scroll;
    api.velocity = 0;
  });
  scene.input.on('pointermove', (p) => {
    if (!api.dragging) return;
    const dy = p.y - startY;
    if (Math.abs(dy) > 6) api.dragged = true;
    api.scroll = startScroll - dy;
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    api.velocity = -((p.y - lastY) / dt) * 1000;
    lastY = p.y;
    lastT = now;
  });
  const endDrag = () => {
    if (!api.dragging) return;
    api.dragging = false;
    setTimeout(() => { api.dragged = false; }, 30);
  };
  scene.input.on('pointerup', endDrag);
  scene.input.on('pointerupoutside', endDrag);

  // Mouse wheel for desktop.
  scene.input.on('wheel', (p, over, dx, dy) => {
    if (p.x < x || p.x > x + w || p.y < y || p.y > y + h) return;
    api.scroll = Phaser.Math.Clamp(api.scroll + dy * 0.6, -40, api.maxScroll + 40);
  });

  api.hit = hit;
  const baseDestroy = api.destroy;
  api.destroy = () => { hit.destroy(); baseDestroy(); };

  return api;
}

/* ------------------------------------------------------------------ toasts */

/** Transient message stack in the top-centre. */
export class Toaster {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.items = [];
    this.x = opts.x ?? scene.cameras.main.width / 2;
    this.y = opts.y ?? 96;
    this.depth = opts.depth ?? 300;
  }

  show(message, { colour = PALETTE.text, icon = null, duration = 2400 } = {}) {
    const scene = this.scene;
    const c = scene.add.container(this.x, this.y).setDepth(this.depth).setScrollFactor(0);
    const text = scene.add.text(icon ? 16 : 0, 0, message, textStyle(19, colour)).setOrigin(icon ? 0 : 0.5, 0.5);
    const w = text.width + (icon ? 64 : 44);
    const g = scene.add.graphics();
    g.fillStyle(PALETTE.panel, 0.94);
    g.fillRoundedRect(-w / 2, -20, w, 40, 10);
    g.lineStyle(2, PALETTE.border, 0.9);
    g.strokeRoundedRect(-w / 2, -20, w, 40, 10);
    c.add(g);
    if (icon) {
      const img = scene.add.image(-w / 2 + 24, 0, icon).setDisplaySize(22, 22);
      c.add(img);
      text.setX(-w / 2 + 44);
    }
    c.add(text);

    c.setAlpha(0).setScale(0.9);
    scene.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 180, ease: 'Back.easeOut' });

    this.items.push(c);
    this._reflow();

    scene.time.delayedCall(duration, () => {
      scene.tweens.add({
        targets: c, alpha: 0, y: c.y - 18, duration: 240,
        onComplete: () => {
          c.destroy(true);
          this.items = this.items.filter((i) => i !== c);
          this._reflow();
        }
      });
    });
    return c;
  }

  _reflow() {
    this.items.forEach((c, i) => {
      this.scene.tweens.add({ targets: c, y: this.y + i * 48, duration: 180, ease: 'Quad.easeOut' });
    });
  }

  destroy() {
    for (const c of this.items) c.destroy(true);
    this.items = [];
  }
}

/**
 * Make a Container tappable over an exact region of its own local space.
 *
 * This exists because Phaser's hit testing for Containers is easy to get
 * silently wrong. `InputManager.pointWithinHitArea` adds the object's
 * `displayOrigin` to the local point *before* testing it against the hit area:
 *
 *     local = pointer - container.position
 *     local += displayOrigin          // (width/2, height/2) after setSize()
 *     hitArea.contains(local)
 *
 * So a "natural" hit area of `(-w/2, -h/2, w, h)` on a centred button actually
 * tests the region `[x - w, x]` — the whole target is displaced by half its
 * width, and only the left half of the button responds. Clicking the dead
 * centre still works (it lands exactly on the inclusive edge), which is why
 * mouse testing and any automated click aimed at a centre passes while a real
 * thumb misses roughly half the time.
 *
 * Pass the region as it is *drawn* and this compensates.
 *
 * @param {Phaser.GameObjects.Container} container
 * @param {number} x left edge of the drawn region, in container-local space
 * @param {number} y top edge of the drawn region
 * @param {number} w @param {number} h
 */
export function setTapArea(container, x, y, w, h) {
  container.setSize(w, h);
  // displayOrigin is (w/2, h/2) once the size is set; cancel it out.
  const rect = new Phaser.Geom.Rectangle(x + w / 2, y + h / 2, w, h);
  container.setInteractive(rect, Phaser.Geom.Rectangle.Contains);
  return container;
}

/**
 * Attach a tap handler that behaves on both touch and mouse.
 *
 * Touch fires on press (a finger drifting a few pixels must not swallow the
 * tap), mouse fires on release (so you can still slide off to cancel), and it
 * can only fire once per press. Use this for anything clickable that is not a
 * `button()` — cards, rows, toggles.
 *
 * @param {Phaser.GameObjects.GameObject} obj must already be interactive
 * @param {() => void} handler
 */
export function onTap(obj, handler) {
  let fired = false;
  obj.on('pointerdown', (pointer) => {
    fired = false;
    if (pointer && pointer.wasTouch) { fired = true; handler(); }
  });
  obj.on('pointerup', (pointer) => {
    if (pointer && pointer.wasTouch) return;
    if (!fired) { fired = true; handler(); }
  });
  return obj;
}

/* ------------------------------------------------------------------ helpers */

/** Format a number with thousands separators. */
export const fmt = (n) => Math.round(n).toLocaleString('en-US');

/** mm:ss from milliseconds. */
export const fmtTime = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/** Convert a 0xRRGGBB int to a CSS string. */
export const hex = (colour) => `#${colour.toString(16).padStart(6, '0')}`;
