/**
 * Art.js — every texture in the game, generated at boot.
 *
 * The game ships no image files. Characters are built from tintable primitives
 * (limb, torso, head, plate) assembled into rigs and animated in code, while
 * effects use soft gradient sprites. That keeps the download tiny, makes the
 * whole palette re-tintable per biome, and means nothing can 404 on a phone.
 *
 * Everything here runs once, in BootScene, before any gameplay.
 */

const TEX = {};

/** Create a canvas texture and hand its 2D context to `draw`. */
function canvasTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  draw(ctx, w, h);
  tex.refresh();
  TEX[key] = true;
  return key;
}

/** Rounded-rectangle path helper (Safari-safe: no ctx.roundRect dependency). */
function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

export function generateAll(scene) {
  /* ------------------------------------------------------------- primitives */

  // 1x1 white pixel — bars, flashes, letterboxes, anything solid.
  canvasTex(scene, 'px', 4, 4, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 4, 4);
  });

  // Soft radial blob — the workhorse for glow, smoke and light.
  canvasTex(scene, 'soft', 64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

  // Hard-edged dot with a soft rim — sparks and embers.
  canvasTex(scene, 'spark', 16, 16, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    ctx.fill();
  });

  // Four-point sparkle for crits and pickups.
  canvasTex(scene, 'star', 32, 32, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    const c = w / 2;
    const draw = (len, wide) => {
      ctx.beginPath();
      ctx.moveTo(c, c - len);
      ctx.quadraticCurveTo(c + wide, c, c, c + len);
      ctx.quadraticCurveTo(c - wide, c, c, c - len);
      ctx.fill();
    };
    draw(c, 3);
    ctx.save();
    ctx.translate(c, c); ctx.rotate(Math.PI / 2); ctx.translate(-c, -c);
    draw(c, 3);
    ctx.restore();
  });

  // Expanding shockwave ring.
  canvasTex(scene, 'ring', 128, 128, (ctx, w, h) => {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 18;
    ctx.stroke();
  });

  // Crescent slash arc used by every melee swing.
  canvasTex(scene, 'slash', 128, 96, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = g;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      ctx.lineWidth = 16 - i * 5;
      ctx.globalAlpha = 0.4 + i * 0.25;
      ctx.beginPath();
      ctx.arc(w * 0.15, h / 2, w * 0.7, -0.72, 0.72);
      ctx.stroke();
    }
  });

  // Teardrop flame — projectiles and the ability icons.
  canvasTex(scene, 'flame', 48, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0.15)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w / 2, 2);
    ctx.bezierCurveTo(w * 0.98, h * 0.42, w * 0.9, h * 0.98, w / 2, h - 2);
    ctx.bezierCurveTo(w * 0.1, h * 0.98, w * 0.02, h * 0.42, w / 2, 2);
    ctx.fill();
  });

  // Elongated bolt for ranged shots.
  canvasTex(scene, 'bolt', 48, 20, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0.2)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Triangular shard for debris and the "blade" projectiles.
  canvasTex(scene, 'shard', 24, 24, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h * 0.68);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(0, h * 0.68);
    ctx.closePath();
    ctx.fill();
  });

  /* -------------------------------------------------------- character parts */

  // Limb: a tintable capsule. Rigs scale it to length.
  canvasTex(scene, 'limb', 24, 64, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 2, 2, w - 4, h - 4, (w - 4) / 2);
    ctx.fill();
    // subtle inner shading so a flat tint still reads as a volume
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.28)');
    g.addColorStop(0.45, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = g;
    roundRect(ctx, 2, 2, w - 4, h - 4, (w - 4) / 2);
    ctx.fill();
  });

  // Torso: chunkier capsule with a chest vent.
  canvasTex(scene, 'torso', 56, 72, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 3, 3, w - 6, h - 6, 12);
    ctx.fill();
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(0.4, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = g;
    roundRect(ctx, 3, 3, w - 6, h - 6, 12);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    for (let i = 0; i < 3; i++) roundRect(ctx, w * 0.28, h * 0.34 + i * 9, w * 0.44, 4, 2), ctx.fill();
  });

  // Head: visor-fronted helmet shape.
  canvasTex(scene, 'head', 40, 40, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 3, 4, w - 6, h - 8, 11);
    ctx.fill();
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = g;
    roundRect(ctx, 3, 4, w - 6, h - 8, 11);
    ctx.fill();
  });

  // Visor: drawn separately so it can glow independently of the helmet tint.
  canvasTex(scene, 'visor', 32, 16, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0.35)');
    ctx.fillStyle = g;
    roundRect(ctx, 1, 1, w - 2, h - 2, 5);
    ctx.fill();
  });

  // Hex plate — armour detail, shields, sentinel bodies.
  canvasTex(scene, 'plate', 48, 56, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(w / 2, 1);
    ctx.lineTo(w - 1, h * 0.27);
    ctx.lineTo(w - 1, h * 0.73);
    ctx.lineTo(w / 2, h - 1);
    ctx.lineTo(1, h * 0.73);
    ctx.lineTo(1, h * 0.27);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
  });

  // Wing/rotor blur for flying drones.
  canvasTex(scene, 'rotor', 64, 16, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  /* -------------------------------------------------------------- environment */

  // Ground slab with a lit top edge and panel seams.
  canvasTex(scene, 'ground', 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(0, 10, w, h - 10);
    const g = ctx.createLinearGradient(0, 10, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 10, w, h - 10);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w - 1, 10); ctx.lineTo(w - 1, h);
    ctx.moveTo(0, 34); ctx.lineTo(w, 34);
    ctx.stroke();
  });

  // Thin floating platform.
  canvasTex(scene, 'platform', 64, 24, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 0, 0, w, h, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fillRect(0, 7, w, h - 7);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(0, 0, w, 3);
  });

  // Background structure block (gantries, silhouettes).
  canvasTex(scene, 'block', 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 6; y < h; y += 14) for (let x = 6; x < w; x += 16) ctx.fillRect(x, y, 8, 6);
  });

  // Lava / coolant surface strip.
  canvasTex(scene, 'liquid', 64, 32, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 5; i++) {
      const x = i * 13 + 4;
      ctx.beginPath();
      ctx.ellipse(x, 6 + (i % 2) * 4, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Spinning saw hazard.
  canvasTex(scene, 'saw', 64, 64, (ctx, w, h) => {
    const c = w / 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2;
      const a1 = ((i + 0.5) / 12) * Math.PI * 2;
      ctx.lineTo(c + Math.cos(a0) * c, c + Math.sin(a0) * c);
      ctx.lineTo(c + Math.cos(a1) * c * 0.72, c + Math.sin(a1) * c * 0.72);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(c, c, c * 0.28, 0, Math.PI * 2);
    ctx.fill();
  });

  // Reactor core objective.
  canvasTex(scene, 'core', 72, 96, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    roundRect(ctx, 6, 4, w - 12, h - 8, 10);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, 14, 16, w - 28, h - 32, 8);
    ctx.fill();
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(8, 10, w - 16, h - 20);
  });

  // Potion / pickup capsule.
  canvasTex(scene, 'capsule', 32, 40, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, 6, 4, w - 12, h - 8, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    roundRect(ctx, 10, 8, 5, h - 20, 3);
    ctx.fill();
  });

  /* ------------------------------------------------------------------- ui */

  // Soft vignette laid over the play field.
  canvasTex(scene, 'vignette', 256, 144, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.28, w / 2, h / 2, h * 0.82);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

  // Subtle film grain, tiled and slowly scrolled.
  canvasTex(scene, 'grain', 128, 128, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 120 + Math.random() * 135;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 16;
    }
    ctx.putImageData(img, 0, 0);
  });

  // Touch control ring + nub.
  canvasTex(scene, 'stickBase', 160, 160, (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 26, 0, Math.PI * 2);
    ctx.stroke();
  });

  canvasTex(scene, 'stickNub', 88, 88, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h * 0.38, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0.45)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
  });

  canvasTex(scene, 'btn', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 12, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Radial cooldown wedge source (drawn as a masked arc at runtime instead,
  // but this gives the "ready" pulse a body to glow with).
  canvasTex(scene, 'btnFill', 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    ctx.fill();
  });

  /* ------------------------------------------------------- ability glyphs */

  const glyph = (key, draw) => canvasTex(scene, key, 64, 64, (ctx, w, h) => {
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    draw(ctx, w, h);
  });

  glyph('gl_fireball', (ctx, w, h) => {
    ctx.beginPath(); ctx.arc(w * 0.58, h * 0.55, 15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h * 0.3); ctx.lineTo(w * 0.34, h * 0.42);
    ctx.moveTo(w * 0.06, h * 0.55); ctx.lineTo(w * 0.3, h * 0.57);
    ctx.moveTo(w * 0.12, h * 0.8); ctx.lineTo(w * 0.34, h * 0.7);
    ctx.stroke();
  });

  glyph('gl_flamedash', (ctx, w, h) => {
    ctx.beginPath();
    ctx.moveTo(w * 0.18, h * 0.5); ctx.lineTo(w * 0.62, h * 0.5);
    ctx.moveTo(w * 0.46, h * 0.28); ctx.lineTo(w * 0.7, h * 0.5); ctx.lineTo(w * 0.46, h * 0.72);
    ctx.stroke();
    ctx.lineWidth = 3; ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h * 0.32); ctx.lineTo(w * 0.34, h * 0.32);
    ctx.moveTo(w * 0.1, h * 0.68); ctx.lineTo(w * 0.34, h * 0.68);
    ctx.stroke();
  });

  glyph('gl_eruption', (ctx, w, h) => {
    ctx.beginPath();
    ctx.moveTo(w * 0.12, h * 0.8); ctx.lineTo(w * 0.88, h * 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.14);
    ctx.lineTo(w * 0.7, h * 0.62);
    ctx.lineTo(w * 0.3, h * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w * 0.2, h * 0.62); ctx.lineTo(w * 0.14, h * 0.4);
    ctx.moveTo(w * 0.8, h * 0.62); ctx.lineTo(w * 0.86, h * 0.4);
    ctx.stroke();
  });

  glyph('gl_infernoWave', (ctx, w, h) => {
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 1 - i * 0.25;
      ctx.beginPath();
      ctx.arc(w * 0.16, h * 0.5, 12 + i * 13, -0.9, 0.9);
      ctx.stroke();
    }
  });

  glyph('gl_ultimate', (ctx, w, h) => {
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.08);
    ctx.lineTo(w * 0.62, h * 0.4);
    ctx.lineTo(w * 0.94, h * 0.44);
    ctx.lineTo(w * 0.68, h * 0.64);
    ctx.lineTo(w * 0.78, h * 0.94);
    ctx.lineTo(w * 0.5, h * 0.76);
    ctx.lineTo(w * 0.22, h * 0.94);
    ctx.lineTo(w * 0.32, h * 0.64);
    ctx.lineTo(w * 0.06, h * 0.44);
    ctx.lineTo(w * 0.38, h * 0.4);
    ctx.closePath();
    ctx.fill();
  });

  glyph('gl_attack', (ctx, w, h) => {
    ctx.beginPath();
    ctx.moveTo(w * 0.14, h * 0.82);
    ctx.lineTo(w * 0.78, h * 0.18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.62, h * 0.14); ctx.lineTo(w * 0.9, h * 0.1); ctx.lineTo(w * 0.86, h * 0.38);
    ctx.closePath(); ctx.fill();
  });

  glyph('gl_jump', (ctx, w, h) => {
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.14); ctx.lineTo(w * 0.5, h * 0.66);
    ctx.moveTo(w * 0.26, h * 0.38); ctx.lineTo(w * 0.5, h * 0.12); ctx.lineTo(w * 0.74, h * 0.38);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(w * 0.22, h * 0.85); ctx.lineTo(w * 0.78, h * 0.85);
    ctx.stroke();
  });

  glyph('gl_roll', (ctx, w, h) => {
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.5, 20, 0.5, Math.PI * 1.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.72, h * 0.22); ctx.lineTo(w * 0.84, h * 0.44); ctx.lineTo(w * 0.6, h * 0.46);
    ctx.closePath(); ctx.fill();
  });

  glyph('gl_block', (ctx, w, h) => {
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.1);
    ctx.lineTo(w * 0.86, h * 0.26);
    ctx.lineTo(w * 0.86, h * 0.56);
    ctx.quadraticCurveTo(w * 0.86, h * 0.84, w * 0.5, h * 0.92);
    ctx.quadraticCurveTo(w * 0.14, h * 0.84, w * 0.14, h * 0.56);
    ctx.lineTo(w * 0.14, h * 0.26);
    ctx.closePath();
    ctx.stroke();
  });

  glyph('gl_potion', (ctx, w, h) => {
    ctx.beginPath();
    ctx.moveTo(w * 0.4, h * 0.12); ctx.lineTo(w * 0.6, h * 0.12);
    ctx.moveTo(w * 0.44, h * 0.12); ctx.lineTo(w * 0.44, h * 0.36);
    ctx.quadraticCurveTo(w * 0.18, h * 0.5, w * 0.28, h * 0.8);
    ctx.quadraticCurveTo(w * 0.5, h * 0.98, w * 0.72, h * 0.8);
    ctx.quadraticCurveTo(w * 0.82, h * 0.5, w * 0.56, h * 0.36);
    ctx.lineTo(w * 0.56, h * 0.12);
    ctx.stroke();
  });

  glyph('gl_pause', (ctx, w, h) => {
    ctx.fillRect(w * 0.3, h * 0.24, w * 0.12, h * 0.52);
    ctx.fillRect(w * 0.58, h * 0.24, w * 0.12, h * 0.52);
  });

  glyph('gl_sprint', (ctx, w, h) => {
    ctx.lineWidth = 5;
    for (let i = 0; i < 3; i++) {
      const y = h * (0.3 + i * 0.2);
      ctx.globalAlpha = 1 - i * 0.22;
      ctx.beginPath();
      ctx.moveTo(w * (0.16 + i * 0.06), y);
      ctx.lineTo(w * (0.62 + i * 0.06), y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.66, h * 0.24); ctx.lineTo(w * 0.92, h * 0.5); ctx.lineTo(w * 0.66, h * 0.76);
    ctx.closePath(); ctx.fill();
  });

  return TEX;
}

/** Convenience: a colour ramp used for fire particles. */
export const FIRE_RAMP = [0xfff3c4, 0xffd166, 0xff9b3d, 0xff6b2b, 0xd93a1f];
export const COOL_RAMP = [0xd9fbff, 0x8fe8ff, 0x59c3ff, 0x3a7fd9, 0x2f4fb0];
