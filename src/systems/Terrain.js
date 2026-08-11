/**
 * Terrain.js — builds a stage's world from its layout parameters.
 *
 * Layouts are generated, not hand-placed, but they are *seeded from the stage
 * id*: stage 7 is the same stage 7 on every device and every replay. That
 * gives handcrafted-feeling consistency (players can learn a stage) with
 * data-file authoring cost.
 *
 * Returns a world object with the physics group, spawn points, a `groundYAt`
 * probe used by every hazard and pickup, and the parallax/decor layers.
 */

import { makeRng, hashSeed, rnd } from '../utils/Rand.js';
import { BIOMES } from '../data/Stages.js';
import { VIEW } from '../data/Balance.js';

const GROUND_BASE = 588;
const WORLD_HEIGHT = 760;
const CEILING_Y = 96;

export function buildWorld(scene, stage) {
  const biome = BIOMES[stage.biome] || BIOMES.foundry;
  const layout = stage.layout;
  const rng = makeRng(hashSeed(`${stage.id}:${stage.biome}:${layout.width}`));

  const width = layout.width;
  const world = {
    biome,
    width,
    height: WORLD_HEIGHT,
    bounds: new Phaser.Geom.Rectangle(0, 0, width, WORLD_HEIGHT),
    segments: [],
    platforms: [],
    spawnPoints: [],
    hazards: [],
    solids: scene.physics.add.staticGroup(),
    decor: [],
    saws: []
  };

  /* ------------------------------------------------------------------ sky */

  const sky = scene.add.graphics().setScrollFactor(0).setDepth(-100);
  sky.fillGradientStyle(biome.sky[0], biome.sky[0], biome.sky[1], biome.sky[1], 1);
  sky.fillRect(0, 0, VIEW.WIDTH, VIEW.HEIGHT);
  world.sky = sky;

  // A wash of biome colour over everything, sold as heat haze / coolant mist.
  const fog = scene.add.rectangle(0, 0, VIEW.WIDTH, VIEW.HEIGHT, biome.fog, biome.fogAlpha)
    .setOrigin(0).setScrollFactor(0).setDepth(59).setBlendMode(Phaser.BlendModes.ADD);
  world.fog = fog;

  /* ------------------------------------------------- parallax backgrounds */

  const layerSpecs = [
    { factor: 0.12, colour: biome.far, count: Math.ceil(width / 340), minH: 200, maxH: 460, depth: -90, alpha: 1 },
    { factor: 0.28, colour: biome.mid, count: Math.ceil(width / 260), minH: 140, maxH: 340, depth: -80, alpha: 1 },
    { factor: 0.5,  colour: biome.near, count: Math.ceil(width / 220), minH: 90,  maxH: 220, depth: -70, alpha: 0.95 }
  ];

  for (const spec of layerSpecs) {
    const layer = scene.add.container(0, 0).setScrollFactor(spec.factor).setDepth(spec.depth);
    for (let i = 0; i < spec.count; i++) {
      const bw = rng.range(70, 190);
      const bh = rng.range(spec.minH, spec.maxH);
      const bx = rng.range(-200, width + 200);
      const block = scene.add.image(bx, GROUND_BASE + 40, 'block')
        .setOrigin(0.5, 1)
        .setDisplaySize(bw, bh)
        .setTint(spec.colour)
        .setAlpha(spec.alpha);
      layer.add(block);
      // A few silhouettes get a glowing window strip for depth.
      if (rng.chance(0.28)) {
        const glow = scene.add.image(bx, GROUND_BASE + 40 - bh * rng.range(0.3, 0.8), 'px')
          .setDisplaySize(bw * 0.5, 4)
          .setTint(biome.fog)
          .setAlpha(rng.range(0.25, 0.7))
          .setBlendMode(Phaser.BlendModes.ADD);
        layer.add(glow);
      }
    }
    world.decor.push(layer);
  }

  /* --------------------------------------------------------- ground shape */

  const addSolid = (x, y, w, h, tint, top = true) => {
    const body = scene.add.tileSprite(x + w / 2, y + h / 2, w, h, 'ground')
      .setTint(tint)
      .setDepth(10);
    scene.physics.add.existing(body, true);
    body.body.setSize(w, h);
    body.body.updateFromGameObject();
    world.solids.add(body);
    if (top) {
      const lip = scene.add.rectangle(x + w / 2, y + 3, w, 6, biome.groundTop)
        .setDepth(11).setAlpha(0.9);
      world.decor.push(lip);
    }
    return body;
  };

  const arena = !!layout.arena;
  let x = 0;
  let y = GROUND_BASE;

  while (x < width) {
    const segLen = arena ? width : rng.range(300, 660);
    const segEnd = Math.min(width, x + segLen);
    world.segments.push({ x1: x, x2: segEnd, y });
    addSolid(x, y, segEnd - x, WORLD_HEIGHT - y, biome.ground);

    // Spawn points along each segment, kept away from the very edges.
    const points = Math.max(1, Math.floor((segEnd - x) / 220));
    for (let i = 0; i < points; i++) {
      const px = x + ((i + 0.5) / points) * (segEnd - x);
      if (px > 260) world.spawnPoints.push({ x: px, y: y - 40, kind: 'ground' });
    }

    x = segEnd;
    if (x >= width) break;

    // Gap?
    if (!arena && rng.chance(layout.gaps)) {
      const gapLen = rng.range(110, 210);
      const gapEnd = Math.min(width, x + gapLen);
      if (biome.hazard === 'lava' && layout.hazardDensity > 0) {
        world.hazards.push({ type: 'lava', x1: x, x2: gapEnd, y: y + 60 });
      } else if (biome.hazard === 'void') {
        world.hazards.push({ type: 'void', x1: x, x2: gapEnd, y: WORLD_HEIGHT });
      }
      x = gapEnd;
    }

    // Step the ground for silhouette variety. Upward steps are capped below
    // the player's jump height (~137px) so terrain is never a wall you have to
    // find a way around; downward steps can be bigger, since falling is free.
    y = Phaser.Math.Clamp(y + rng.range(-84, 130), 430, 640);
  }

  /* ------------------------------------------------------------ platforms */

  const platformCount = Math.round((width / 320) * (layout.platforms ?? 0.5) * 2.2);
  for (let i = 0; i < platformCount; i++) {
    const px = rng.range(240, width - 160);
    const groundY = groundYAtRaw(world, px);
    const py = groundY - rng.range(110, 300);
    if (py < CEILING_Y + 60) continue;
    const pw = rng.range(110, 250);

    const plat = scene.add.tileSprite(px, py, pw, 22, 'platform')
      .setTint(biome.near)
      .setDepth(12);
    scene.physics.add.existing(plat, true);
    plat.body.setSize(pw, 22);
    plat.body.updateFromGameObject();
    // One-way platforms: you can jump up through them but not fall through.
    plat.body.checkCollision.down = false;
    plat.body.checkCollision.left = false;
    plat.body.checkCollision.right = false;
    world.solids.add(plat);
    world.platforms.push({ x: px, y: py, w: pw });
    world.spawnPoints.push({ x: px, y: py - 40, kind: 'platform' });

    const lip = scene.add.rectangle(px, py - 10, pw, 4, biome.groundTop).setDepth(13).setAlpha(0.85);
    world.decor.push(lip);
  }

  /* ---------------------------------------------------------------- walls */

  // Solid book-ends so the player cannot walk out of the level.
  addSolid(-60, 0, 60, WORLD_HEIGHT, biome.ground, false);
  addSolid(width, 0, 60, WORLD_HEIGHT, biome.ground, false);

  if (layout.ceiling) {
    addSolid(0, 0, width, CEILING_Y, biome.ground, false);
    const lip = scene.add.rectangle(width / 2, CEILING_Y - 3, width, 6, biome.groundTop)
      .setDepth(11).setAlpha(0.8);
    world.decor.push(lip);
  }

  /* -------------------------------------------------------------- hazards */

  // Lava pools sitting in gaps and, at higher density, on flat ground too.
  for (const hz of world.hazards) {
    if (hz.type !== 'lava') continue;
    const w = hz.x2 - hz.x1;
    const surface = scene.add.tileSprite(hz.x1 + w / 2, hz.y, w, 44, 'liquid')
      .setTint(0xff5a1a).setDepth(9).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.9);
    hz.sprite = surface;
    hz.damageTop = hz.y - 10;
  }

  if (layout.hazardDensity > 0 && biome.hazard === 'saw') {
    const sawCount = Math.round((width / 700) * layout.hazardDensity * 3);
    for (let i = 0; i < sawCount; i++) {
      const sx = rng.range(320, width - 200);
      const gy = groundYAtRaw(world, sx);
      const travel = rng.range(120, 320);
      const saw = scene.add.image(sx, gy - 22, 'saw')
        .setDisplaySize(58, 58).setTint(0xbfd4e6).setDepth(14);
      world.saws.push({ sprite: saw, x0: sx - travel / 2, x1: sx + travel / 2, t: rng.range(0, Math.PI * 2), y: gy - 22, speed: rng.range(0.6, 1.3) });
    }
  }

  /* ----------------------------------------------------------- atmosphere */

  world.ambient = spawnAmbient(scene, world, biome, rng);

  /* ------------------------------------------------------------ blackout */

  if (stage.modifiers?.includes('blackout')) {
    world.darkness = createDarkness(scene);
  }

  /* -------------------------------------------------------------- helpers */

  world.groundYAt = (px) => groundYAtRaw(world, px);

  world.update = (dt, time, player) => {
    for (const saw of world.saws) {
      saw.t += dt * saw.speed;
      const k = (Math.sin(saw.t) + 1) / 2;
      saw.sprite.x = saw.x0 + (saw.x1 - saw.x0) * k;
      saw.sprite.rotation += dt * 9;
      if (player && player.alive &&
          Phaser.Math.Distance.Between(saw.sprite.x, saw.sprite.y, player.centre.x, player.centre.y) < 42) {
        player.takeDamage(12 + stage.index * 1.6, {
          unblockable: true, dir: Math.sign(player.centre.x - saw.sprite.x) || 1,
          knockback: 320, launch: -300
        });
      }
    }

    for (const hz of world.hazards) {
      if (hz.type !== 'lava' || !hz.sprite) continue;
      hz.sprite.tilePositionX += dt * 30;
      hz.sprite.setAlpha(0.8 + Math.sin(time * 2 + hz.x1) * 0.12);
      if (player && player.alive &&
          player.centre.x > hz.x1 && player.centre.x < hz.x2 &&
          player.feetY > hz.damageTop) {
        player.takeDamage(10 + stage.index * 1.4, {
          unblockable: true, dir: 0, knockback: 0, launch: -520
        });
        player.sprite.body.setVelocityY(-620);
      }
    }

    if (world.darkness && player) world.darkness.update(player, scene);
    if (world.ambient) world.ambient.update(dt, scene);
  };

  // Scene shutdown destroys the display list first, so every teardown step is
  // individually guarded: a double-destroy must never take the scene with it.
  world.destroy = () => {
    const safe = (fn) => { try { fn(); } catch { /* already gone */ } };
    safe(() => world.solids?.clear(true, true));
    for (const d of world.decor) safe(() => d.destroy());
    for (const hz of world.hazards) safe(() => hz.sprite?.destroy());
    for (const saw of world.saws) safe(() => saw.sprite.destroy());
    safe(() => world.sky.destroy());
    safe(() => world.fog.destroy());
    safe(() => world.darkness?.destroy());
    safe(() => world.ambient?.destroy());
  };

  return world;
}

/** Ground height under a world x; over a gap, the nearest segment's height. */
function groundYAtRaw(world, x) {
  for (const seg of world.segments) {
    if (x >= seg.x1 && x <= seg.x2) return seg.y;
  }
  let nearest = null;
  let nd = Infinity;
  for (const seg of world.segments) {
    const d = Math.min(Math.abs(seg.x1 - x), Math.abs(seg.x2 - x));
    if (d < nd) { nd = d; nearest = seg; }
  }
  return nearest ? nearest.y : GROUND_BASE;
}

/* ------------------------------------------------------------- atmosphere */

function spawnAmbient(scene, world, biome, rng) {
  const kind = biome.ambient;
  const count = kind === 'ash' ? 46 : 34;
  const motes = [];

  for (let i = 0; i < count; i++) {
    const tex = kind === 'spark' ? 'star' : 'spark';
    const m = scene.add.image(rng.range(0, VIEW.WIDTH), rng.range(0, VIEW.HEIGHT), tex)
      .setScrollFactor(rng.range(0.35, 0.85))
      .setDepth(-40)
      .setBlendMode(kind === 'ash' ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
      .setAlpha(rng.range(0.15, 0.55));
    const size = kind === 'ash' ? rng.range(2, 5) : rng.range(3, 9);
    m.setDisplaySize(size, size);
    m.setTint(kind === 'ash' ? 0xbdb0b8 : kind === 'drip' ? 0x8fe8ff : biome.fog);
    motes.push({
      s: m,
      vx: kind === 'ember' ? rng.range(-14, 30) : rng.range(-26, 12),
      vy: kind === 'ember' ? rng.range(-46, -14) : rng.range(14, 52),
      phase: rng.range(0, Math.PI * 2)
    });
  }

  return {
    update(dt, sc) {
      const cam = sc.cameras.main;
      for (const m of motes) {
        m.s.x += m.vx * dt;
        m.s.y += m.vy * dt;
        m.phase += dt * 2;
        m.s.x += Math.sin(m.phase) * 8 * dt;
        // Wrap within the camera's view so motes are always where you look.
        const left = cam.scrollX * m.s.scrollFactorX;
        if (m.s.y < -20) m.s.y = VIEW.HEIGHT + 20;
        if (m.s.y > VIEW.HEIGHT + 20) m.s.y = -20;
        if (m.s.x < left - 40) m.s.x = left + VIEW.WIDTH + 20;
        if (m.s.x > left + VIEW.WIDTH + 40) m.s.x = left - 20;
      }
    },
    destroy() { for (const m of motes) m.s.destroy(); }
  };
}

/**
 * Blackout: a full-screen dark layer with a hole punched out around the
 * player's flame. Uses a RenderTexture erase; if that is unavailable on a
 * given driver we fall back to a flat dim so the stage is still playable.
 */
function createDarkness(scene) {
  let rt = null;
  let fallback = null;
  let lamp = null;
  try {
    rt = scene.add.renderTexture(0, 0, VIEW.WIDTH, VIEW.HEIGHT)
      .setOrigin(0).setScrollFactor(0).setDepth(58);
    // An off-list image is the eraser brush; its scale controls the hole size.
    lamp = scene.make.image({ key: 'soft', add: false }).setOrigin(0.5);
  } catch (err) {
    console.warn('[terrain] render texture unavailable, using flat dim', err);
    rt = null;
    fallback = scene.add.rectangle(0, 0, VIEW.WIDTH, VIEW.HEIGHT, 0x05030a, 0.55)
      .setOrigin(0).setScrollFactor(0).setDepth(58);
  }

  return {
    update(player, sc) {
      if (!rt || !lamp) return;
      const cam = sc.cameras.main;
      // The overlay has scrollFactor 0, so it lives in camera space and the
      // camera's zoom pivots it about the centre. Placing the light hole means
      // mapping the player's world position into that same space.
      const view = cam.worldView;
      const sx = cam.centerX + (player.centre.x - (view.x + view.width / 2));
      const sy = cam.centerY + (player.centre.y - (view.y + view.height / 2));
      const flare = player.ascended > 0 ? 2.3 : 1;
      rt.clear();
      rt.fill(0x05030a, 0.9);
      // Two passes: a wide soft falloff, then a bright core.
      lamp.setDisplaySize(460 * flare, 460 * flare);
      rt.erase(lamp, sx, sy);
      lamp.setDisplaySize(220 * flare, 220 * flare);
      rt.erase(lamp, sx, sy);
    },
    destroy() { rt?.destroy(); fallback?.destroy(); lamp?.destroy(); }
  };
}

export { GROUND_BASE, WORLD_HEIGHT };
