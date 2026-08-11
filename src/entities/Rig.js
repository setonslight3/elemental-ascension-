/**
 * Rig.js — characters built from tintable primitives and animated in code.
 *
 * Rather than sprite sheets, every character is a small skeleton of capsules
 * posed each frame by maths. It costs a few lines per pose but buys smooth
 * blending between states, per-biome recolouring, free "squash on landing"
 * style flourishes, and a download with no art in it.
 *
 * All rigs are authored facing right; flipping sets `container.scaleX = -1`,
 * so pose code never has to think about direction.
 */

const P = Phaser.Math;

/**
 * @param {Phaser.Scene} scene
 * @param {object} spec
 *   height, colour, accent, visor, kind: humanoid|drone|turret|blob|boss
 */
export function createRig(scene, spec) {
  const {
    height = 56,
    colour = 0x8a93a6,
    accent = 0xff7a2f,
    visorColour = null,
    kind = 'humanoid',
    heavy = false
  } = spec;

  const c = scene.add.container(0, 0);
  const parts = {};
  const H = height;

  const shade = (hex, amount) => {
    const col = Phaser.Display.Color.IntegerToColor(hex);
    return Phaser.Display.Color.GetColor(
      P.Clamp(col.red + amount, 0, 255),
      P.Clamp(col.green + amount, 0, 255),
      P.Clamp(col.blue + amount, 0, 255)
    );
  };

  const dark = shade(colour, -34);
  const light = shade(colour, 26);

  const limb = (len, w, tint) => {
    const s = scene.add.image(0, 0, 'limb');
    s.setDisplaySize(w, len);
    s.setOrigin(0.5, 0.08);   // pivot at the joint
    s.setTint(tint);
    return s;
  };

  if (kind === 'drone') {
    const bodyW = H * 1.05;
    parts.rotorL = scene.add.image(-bodyW * 0.42, -H * 0.42, 'rotor')
      .setDisplaySize(bodyW * 0.62, H * 0.2).setTint(light).setAlpha(0.85);
    parts.rotorR = scene.add.image(bodyW * 0.42, -H * 0.42, 'rotor')
      .setDisplaySize(bodyW * 0.62, H * 0.2).setTint(light).setAlpha(0.85);
    parts.torso = scene.add.image(0, -H * 0.5, 'head')
      .setDisplaySize(bodyW * 0.72, H * 0.72).setTint(colour);
    parts.visor = scene.add.image(0, -H * 0.5, 'visor')
      .setDisplaySize(bodyW * 0.44, H * 0.24).setTint(visorColour || accent);
    parts.legFront = limb(H * 0.34, H * 0.13, dark);
    parts.legFront.setPosition(bodyW * 0.16, -H * 0.22);
    parts.legBack = limb(H * 0.34, H * 0.13, dark);
    parts.legBack.setPosition(-bodyW * 0.16, -H * 0.22);
    c.add([parts.rotorL, parts.rotorR, parts.legBack, parts.legFront, parts.torso, parts.visor]);
    parts.baseY = { torso: -H * 0.5, visor: -H * 0.5 };
    c.rigKind = 'drone';
    c.parts = parts;
    return c;
  }

  if (kind === 'turret') {
    parts.base = scene.add.image(0, -H * 0.16, 'platform')
      .setDisplaySize(H * 1.0, H * 0.3).setTint(dark);
    parts.torso = scene.add.image(0, -H * 0.52, 'plate')
      .setDisplaySize(H * 0.9, H * 0.8).setTint(colour);
    parts.barrel = scene.add.image(H * 0.2, -H * 0.55, 'limb')
      .setDisplaySize(H * 0.22, H * 0.72).setOrigin(0.5, 0.1).setTint(light)
      .setRotation(Math.PI / 2);
    parts.visor = scene.add.image(0, -H * 0.58, 'visor')
      .setDisplaySize(H * 0.42, H * 0.2).setTint(visorColour || accent);
    c.add([parts.base, parts.barrel, parts.torso, parts.visor]);
    parts.baseY = { torso: -H * 0.52, visor: -H * 0.58 };
    c.rigKind = 'turret';
    c.parts = parts;
    return c;
  }

  if (kind === 'blob') {
    // Bomber: a round chassis on stubby legs, with a warning light.
    parts.legFront = limb(H * 0.3, H * 0.15, dark);
    parts.legFront.setPosition(H * 0.16, -H * 0.28);
    parts.legBack = limb(H * 0.3, H * 0.15, dark);
    parts.legBack.setPosition(-H * 0.16, -H * 0.28);
    parts.torso = scene.add.image(0, -H * 0.56, 'head')
      .setDisplaySize(H * 0.86, H * 0.78).setTint(colour);
    parts.visor = scene.add.image(0, -H * 0.72, 'spark')
      .setDisplaySize(H * 0.3, H * 0.3).setTint(accent).setBlendMode(Phaser.BlendModes.ADD);
    c.add([parts.legBack, parts.legFront, parts.torso, parts.visor]);
    parts.baseY = { torso: -H * 0.56, visor: -H * 0.72 };
    c.rigKind = 'blob';
    c.parts = parts;
    return c;
  }

  /* ------------------------------------------------------------- humanoid */

  const legLen = H * (heavy ? 0.36 : 0.42);
  const torsoH = H * (heavy ? 0.42 : 0.38);
  const torsoW = H * (heavy ? 0.46 : 0.34);
  const headR = H * (heavy ? 0.22 : 0.19);
  const armLen = H * (heavy ? 0.4 : 0.36);
  const hipY = -legLen;
  const shoulderY = hipY - torsoH * 0.78;
  const headY = hipY - torsoH - headR * 0.55;

  parts.armBack = limb(armLen, H * 0.12, dark);
  parts.armBack.setPosition(-H * 0.04, shoulderY);

  parts.legBack = limb(legLen, H * 0.15, dark);
  parts.legBack.setPosition(-H * 0.05, hipY);

  parts.legFront = limb(legLen, H * 0.15, colour);
  parts.legFront.setPosition(H * 0.05, hipY);

  parts.torso = scene.add.image(0, hipY - torsoH * 0.5, 'torso')
    .setDisplaySize(torsoW, torsoH).setTint(colour);

  parts.head = scene.add.image(H * 0.03, headY, 'head')
    .setDisplaySize(headR * 2, headR * 2).setTint(light);

  parts.visor = scene.add.image(H * 0.11, headY - headR * 0.05, 'visor')
    .setDisplaySize(headR * 1.15, headR * 0.62).setTint(visorColour || accent)
    .setBlendMode(Phaser.BlendModes.ADD);

  parts.armFront = limb(armLen, H * 0.13, light);
  parts.armFront.setPosition(H * 0.06, shoulderY);

  c.add([
    parts.armBack, parts.legBack, parts.legFront,
    parts.torso, parts.head, parts.visor, parts.armFront
  ]);

  parts.baseY = {
    torso: hipY - torsoH * 0.5,
    head: headY,
    visor: headY - headR * 0.05,
    shoulder: shoulderY,
    hip: hipY
  };
  parts.metrics = { legLen, torsoH, torsoW, headR, armLen, hipY, shoulderY, headY, H };

  c.rigKind = 'humanoid';
  c.parts = parts;
  return c;
}

/** Attach a shield plate to the front arm (Lancers). */
export function addShield(scene, rig, tint) {
  const m = rig.parts.metrics;
  const shield = scene.add.image(m.H * 0.26, m.shoulderY + m.armLen * 0.35, 'plate')
    .setDisplaySize(m.H * 0.4, m.H * 0.62)
    .setTint(tint);
  rig.parts.shield = shield;
  rig.add(shield);
  return shield;
}

/** Attach a long weapon to the front arm (Lancers, Marksmen, bosses). */
export function addWeapon(scene, rig, { length = 1, tint = 0xffffff, thickness = 0.1 } = {}) {
  const m = rig.parts.metrics;
  const w = scene.add.image(m.H * 0.16, m.shoulderY + m.armLen * 0.5, 'limb')
    .setDisplaySize(m.H * thickness, m.H * length)
    .setOrigin(0.5, 0.5)
    .setRotation(Math.PI / 2)
    .setTint(tint);
  rig.parts.weapon = w;
  rig.add(w);
  return w;
}

/* --------------------------------------------------------------- posing */

const lerpTo = (obj, key, target, t) => { obj[key] = P.Linear(obj[key], target, t); };

/**
 * Pose a humanoid rig.
 * @param {Phaser.GameObjects.Container} rig
 * @param {object} s state:
 *   pose, time, speedRatio, blend (0..1 smoothing), phase (0..1 within action),
 *   airborne, vy
 */
export function poseHumanoid(rig, s) {
  const p = rig.parts;
  if (!p || !p.metrics) return;
  const m = p.metrics;
  const t = s.time;
  const k = s.blend ?? 0.35;

  // Targets, resolved per pose then eased toward for smooth transitions.
  let torsoRot = 0, torsoDY = 0, headRot = 0;
  let armF = 0.2, armB = -0.25;
  let legF = 0, legB = 0;
  let scaleY = 1, scaleX = 1;

  switch (s.pose) {
    case 'run': {
      const sp = Math.max(0.35, s.speedRatio ?? 1);
      const phase = t * 11 * sp;
      legF = Math.sin(phase) * 0.95;
      legB = Math.sin(phase + Math.PI) * 0.95;
      armF = Math.sin(phase + Math.PI) * 0.8 - 0.1;
      armB = Math.sin(phase) * 0.8 - 0.1;
      torsoRot = -0.14 - sp * 0.06;
      torsoDY = -Math.abs(Math.sin(phase)) * m.H * 0.035;
      headRot = 0.06;
      break;
    }
    case 'walk': {
      const phase = t * 6;
      legF = Math.sin(phase) * 0.55;
      legB = Math.sin(phase + Math.PI) * 0.55;
      armF = Math.sin(phase + Math.PI) * 0.4;
      armB = Math.sin(phase) * 0.4;
      torsoRot = -0.05;
      torsoDY = -Math.abs(Math.sin(phase)) * m.H * 0.018;
      break;
    }
    case 'air': {
      const rising = (s.vy ?? 0) < 0;
      legF = rising ? -0.55 : 0.3;
      legB = rising ? 0.5 : -0.25;
      armF = rising ? -1.5 : -0.7;
      armB = rising ? 1.0 : 0.9;
      torsoRot = rising ? -0.18 : 0.12;
      break;
    }
    case 'attack': {
      // ph 0..1 across windup+active+recover; sold with a big torso rotation.
      const ph = s.phase ?? 0;
      const swing = ph < 0.35
        ? P.Easing.Cubic.Out(ph / 0.35) * -1        // wind back
        : 1 - P.Easing.Cubic.Out(Math.min(1, (ph - 0.35) / 0.4)) * 0.2;
      const index = s.attackIndex ?? 0;
      if (index === 2) {
        // uppercut: arm swings from low to high
        armF = P.Linear(1.5, -2.4, P.Easing.Cubic.Out(ph));
        armB = P.Linear(0.4, -0.9, ph);
        torsoRot = P.Linear(0.24, -0.34, ph);
        legF = -0.3 * ph;
        scaleY = 1 + Math.sin(ph * Math.PI) * 0.07;
      } else {
        armF = ph < 0.35 ? P.Linear(0.3, 1.9, ph / 0.35) : P.Linear(1.9, -1.5, (ph - 0.35) / 0.65);
        armB = ph < 0.35 ? P.Linear(-0.2, -0.9, ph / 0.35) : P.Linear(-0.9, 0.5, (ph - 0.35) / 0.65);
        torsoRot = swing * 0.28 * (index === 1 ? -1 : 1) * -1;
        legF = 0.25 - ph * 0.4;
        legB = -0.2 + ph * 0.3;
      }
      headRot = -torsoRot * 0.4;
      break;
    }
    case 'cast': {
      const ph = s.phase ?? 0;
      armF = P.Linear(0.6, -1.35, P.Easing.Cubic.Out(Math.min(1, ph * 2)));
      armB = 0.55;
      torsoRot = P.Linear(0.1, -0.14, ph);
      legF = 0.2; legB = -0.3;
      break;
    }
    case 'block': {
      armF = -1.15; armB = -0.75;
      torsoRot = 0.12;
      legF = 0.35; legB = -0.42;
      torsoDY = m.H * 0.03;
      scaleY = 0.95;
      headRot = 0.1;
      break;
    }
    case 'slide': {
      legF = 1.35; legB = 0.7;
      armF = 1.0; armB = -1.4;
      torsoRot = 0.9;
      torsoDY = m.H * 0.18;
      break;
    }
    case 'hurt': {
      armF = -1.9; armB = 1.6;
      legF = -0.4; legB = 0.5;
      torsoRot = 0.42;
      headRot = 0.4;
      break;
    }
    case 'dead': {
      armF = -2.2; armB = 2.0;
      legF = -0.9; legB = 0.9;
      torsoRot = 1.4;
      torsoDY = m.H * 0.28;
      break;
    }
    case 'idle':
    default: {
      const breath = Math.sin(t * 2.1);
      armF = 0.16 + breath * 0.05;
      armB = -0.2 - breath * 0.05;
      torsoDY = breath * m.H * 0.014;
      headRot = breath * 0.03;
      legF = 0.02; legB = -0.02;
      break;
    }
  }

  if (s.airborne && s.pose !== 'attack' && s.pose !== 'cast' && s.pose !== 'slide') {
    // Blend a touch of the air pose into whatever else is happening.
    const rising = (s.vy ?? 0) < 0;
    legF = P.Linear(legF, rising ? -0.5 : 0.3, 0.6);
    legB = P.Linear(legB, rising ? 0.45 : -0.2, 0.6);
  }

  lerpTo(p.armFront, 'rotation', armF, k);
  lerpTo(p.armBack, 'rotation', armB, k);
  lerpTo(p.legFront, 'rotation', legF, k);
  lerpTo(p.legBack, 'rotation', legB, k);
  lerpTo(p.torso, 'rotation', torsoRot, k);
  lerpTo(p.head, 'rotation', headRot + torsoRot * 0.5, k);
  lerpTo(p.visor, 'rotation', headRot + torsoRot * 0.5, k);

  const torsoY = p.baseY.torso + torsoDY;
  lerpTo(p.torso, 'y', torsoY, k);
  lerpTo(p.head, 'y', p.baseY.head + torsoDY * 1.15, k);
  lerpTo(p.visor, 'y', p.baseY.visor + torsoDY * 1.15, k);
  lerpTo(p.armFront, 'y', p.baseY.shoulder + torsoDY, k);
  lerpTo(p.armBack, 'y', p.baseY.shoulder + torsoDY, k);

  // Squash and stretch, applied to the whole rig.
  const targetSY = s.squash != null ? s.squash : scaleY;
  const targetSX = s.stretch != null ? s.stretch : scaleX;
  rig.scaleY = P.Linear(rig.scaleY, targetSY, k);
  const dir = s.dir ?? 1;
  rig.scaleX = P.Linear(Math.abs(rig.scaleX), targetSX, k) * dir;

  if (p.shield) {
    p.shield.rotation = p.armFront.rotation * 0.5;
    p.shield.x = m.H * 0.26 + Math.cos(p.armFront.rotation) * m.H * 0.04;
    p.shield.y = p.baseY.shoulder + m.armLen * 0.35 + torsoDY;
  }
  if (p.weapon) {
    p.weapon.rotation = Math.PI / 2 + p.armFront.rotation;
    p.weapon.x = m.H * 0.16 + Math.sin(p.armFront.rotation) * m.armLen * 0.5;
    p.weapon.y = p.baseY.shoulder + Math.cos(p.armFront.rotation) * m.armLen * 0.5 + torsoDY;
  }
}

/** Pose a drone: hover bob, tilt with velocity, spinning rotors. */
export function poseDrone(rig, s) {
  const p = rig.parts;
  if (!p) return;
  const t = s.time;
  const bob = Math.sin(t * 7) * 2.2;
  p.torso.y = p.baseY.torso + bob;
  p.visor.y = p.baseY.visor + bob;
  const tilt = P.Clamp((s.vx ?? 0) / 400, -0.5, 0.5);
  rig.rotation = P.Linear(rig.rotation, tilt * 0.5, 0.2);
  const spin = t * 40;
  p.rotorL.scaleX = Math.cos(spin) * 0.9 + 0.1;
  p.rotorR.scaleX = Math.cos(spin + 1.2) * 0.9 + 0.1;
  p.rotorL.y = p.torso.y - rig.parts.torso.displayHeight * 0.05 - 6;
  p.rotorR.y = p.rotorL.y;
  p.legFront.rotation = 0.2 + Math.sin(t * 3) * 0.08;
  p.legBack.rotation = -0.2 + Math.sin(t * 3 + 1) * 0.08;
  rig.scaleX = Math.abs(rig.scaleX) * (s.dir ?? 1);
}

/** Pose a turret: barrel tracks the target, chassis breathes. */
export function poseTurret(rig, s) {
  const p = rig.parts;
  if (!p) return;
  const t = s.time;
  p.torso.y = p.baseY.torso + Math.sin(t * 2) * 1.1;
  p.visor.y = p.baseY.visor + Math.sin(t * 2) * 1.1;
  if (p.barrel && s.aimAngle != null) {
    p.barrel.rotation = P.Linear(p.barrel.rotation, Math.PI / 2 + s.aimAngle, 0.15);
  }
  rig.scaleX = Math.abs(rig.scaleX) * (s.dir ?? 1);
}

/** Pose a bomber: waddle, and the light flashes faster as it primes. */
export function poseBlob(rig, s) {
  const p = rig.parts;
  if (!p) return;
  const t = s.time;
  const phase = t * (s.moving ? 14 : 3);
  p.legFront.rotation = Math.sin(phase) * 0.7;
  p.legBack.rotation = Math.sin(phase + Math.PI) * 0.7;
  p.torso.y = p.baseY.torso - Math.abs(Math.sin(phase)) * 2;
  const blink = s.priming ? Math.sin(t * 28) : Math.sin(t * 5);
  p.visor.setAlpha(0.5 + blink * 0.5);
  p.visor.setScale((0.9 + blink * 0.25) * (s.priming ? 1.6 : 1));
  p.visor.y = p.torso.y - rig.parts.torso.displayHeight * 0.28;
  rig.scaleX = Math.abs(rig.scaleX) * (s.dir ?? 1);
}

/** Route to the right poser for a rig kind. */
export function poseRig(rig, state) {
  switch (rig.rigKind) {
    case 'drone': return poseDrone(rig, state);
    case 'turret': return poseTurret(rig, state);
    case 'blob': return poseBlob(rig, state);
    default: return poseHumanoid(rig, state);
  }
}
