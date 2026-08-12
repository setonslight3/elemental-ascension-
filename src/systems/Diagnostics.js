/**
 * Diagnostics.js — an on-screen readout for debugging a device I cannot hold.
 *
 * Enabled with `?diag` on the URL. It reports the numbers that actually decide
 * whether a tap lands: the host box, the design surface, the canvas rect, and
 * — most importantly — where the last touch went in page coordinates versus
 * where Phaser decided that was in game coordinates. If those two disagree,
 * input is broken and this says so in as many words.
 *
 * Deliberately built from DOM, not from Phaser: if the game loop has stalled
 * or the canvas is mispositioned, a Phaser-drawn overlay would be just as
 * broken as the thing it is meant to diagnose.
 */

export function diagnosticsRequested() {
  try {
    return new URLSearchParams(location.search).has('diag');
  } catch {
    return false;
  }
}

export function installDiagnostics(game) {
  const el = document.createElement('div');
  el.id = 'ea-diag';
  el.style.cssText = [
    'position:fixed', 'left:0', 'top:0', 'z-index:9999',
    'font:11px/1.35 ui-monospace,Menlo,Consolas,monospace',
    'color:#b6ffb6', 'background:rgba(0,0,0,.82)', 'padding:6px 8px',
    'white-space:pre', 'pointer-events:none', 'max-width:60vw',
    'border-bottom-right-radius:8px'
  ].join(';');
  document.body.appendChild(el);

  const state = {
    taps: 0,
    lastPage: null,
    lastPhaser: null,
    lastHit: null,
    frames: 0,
    lastFrameAt: performance.now()
  };

  // Count real frames independently of Phaser, so a stalled loop is visible.
  game.events.on('poststep', () => {
    state.frames++;
    state.lastFrameAt = performance.now();
  });

  // Record raw touch coordinates straight from the DOM, before Phaser sees them.
  const record = (ev) => {
    const t = ev.touches?.[0] || ev.changedTouches?.[0] || ev;
    if (!t) return;
    state.taps++;
    state.lastPage = { x: Math.round(t.pageX), y: Math.round(t.pageY), cx: Math.round(t.clientX), cy: Math.round(t.clientY) };
    // What Phaser makes of the same event.
    const p = game.input.activePointer;
    state.lastPhaser = { x: Math.round(p.x), y: Math.round(p.y) };
    // Did it land on anything interactive in any active scene?
    let hit = 'none';
    for (const scene of game.scene.getScenes(true)) {
      const objs = scene.input?.hitTestPointer?.(p) || [];
      if (objs.length) { hit = `${scene.scene.key}:${objs.length}`; break; }
    }
    state.lastHit = hit;
  };
  window.addEventListener('touchstart', record, { passive: true, capture: true });
  window.addEventListener('pointerdown', record, { passive: true, capture: true });

  const fmt = (o) => (o ? `${o.x},${o.y}` : '—');

  setInterval(() => {
    const canvas = game.canvas;
    const rect = canvas ? canvas.getBoundingClientRect() : { width: 0, height: 0, left: 0, top: 0 };
    const host = document.getElementById('game')?.getBoundingClientRect() ?? { width: 0, height: 0 };
    const vv = window.visualViewport;
    const stalledFor = Math.round(performance.now() - state.lastFrameAt);
    const bounds = game.scale?.canvasBounds;

    el.textContent = [
      `fps ${Math.round(game.loop.actualFps)}  frames ${state.frames}` +
        (stalledFor > 500 ? `  ⚠ STALLED ${stalledFor}ms` : ''),
      `scenes ${game.scene.getScenes(true).map((s) => s.scene.key).join(',') || '—'}`,
      `window ${window.innerWidth}x${window.innerHeight}  dpr ${window.devicePixelRatio}`,
      `visualVP ${vv ? `${Math.round(vv.width)}x${Math.round(vv.height)}@${Math.round(vv.offsetLeft)},${Math.round(vv.offsetTop)}` : 'n/a'}`,
      `host ${Math.round(host.width)}x${Math.round(host.height)}`,
      `design ${game.scale.width}x${game.scale.height}`,
      `canvas ${Math.round(rect.width)}x${Math.round(rect.height)} @${Math.round(rect.left)},${Math.round(rect.top)}`,
      `phaserBounds ${bounds ? `${Math.round(bounds.width)}x${Math.round(bounds.height)}@${Math.round(bounds.x)},${Math.round(bounds.y)}` : '—'}`,
      `fullscreen ${!!(document.fullscreenElement || document.webkitFullscreenElement)}`,
      `taps ${state.taps}  page ${fmt(state.lastPage)}  phaser ${fmt(state.lastPhaser)}`,
      `hitTest ${state.lastHit ?? '—'}`
    ].join('\n');
  }, 250);

  console.info('[diag] overlay enabled — add ?diag to the URL to see it');
}
