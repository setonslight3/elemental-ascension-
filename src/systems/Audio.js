/**
 * Audio.js — fully synthesised sound. No audio files, no loading, no 404s.
 *
 * Everything is built from oscillators and a shared noise buffer through a
 * WebAudio graph. Mobile browsers refuse to start an AudioContext without a
 * user gesture, so the context is created lazily and `unlock()` is wired to
 * the first pointer/key event.
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class AudioManager {
  constructor(profile) {
    this.profile = profile;
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.noiseBuffer = null;
    this.unlocked = false;
    this.musicNodes = [];
    this.currentTrack = null;
    this._lastPlayed = new Map();   // crude voice limiter
    this._failed = false;
  }

  /* ------------------------------------------------------------- lifecycle */

  init() {
    if (this.ctx || this._failed) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { this._failed = true; return; }
      this.ctx = new Ctx();

      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      // A limiter keeps a screen full of explosions from clipping into mush.
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -10;
      this.limiter.knee.value = 12;
      this.limiter.ratio.value = 8;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.18;
      this.master.connect(this.limiter);
      this.limiter.connect(this.ctx.destination);

      this.sfxBus = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.applyVolumes();

      // Shared white-noise buffer for impacts, fire and explosions.
      const len = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (err) {
      console.warn('[audio] unavailable', err);
      this._failed = true;
    }
  }

  unlock() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.unlocked = true;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.profile?.settings ?? {};
    this.sfxBus.gain.value = clamp01(s.sfxVolume ?? 0.75);
    this.musicBus.gain.value = clamp01(s.musicVolume ?? 0.45) * 0.5;
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  /* ------------------------------------------------------------- primitives */

  _env(node, { attack = 0.005, decay = 0.15, peak = 1, sustain = 0, hold = 0 }, t0) {
    const g = node.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
    if (hold > 0) g.setValueAtTime(Math.max(0.0001, peak), t0 + attack + hold);
    g.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t0 + attack + hold + decay);
  }

  _tone({ freq = 440, type = 'sine', dur = 0.2, gain = 0.3, glide = null, bus = null, detune = 0, delay = 0 }) {
    if (!this.ctx) return null;
    const t0 = this.now + delay;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (detune) osc.detune.setValueAtTime(detune, t0);
    if (glide != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glide), t0 + dur);
    this._env(amp, { attack: Math.min(0.02, dur * 0.15), decay: dur, peak: gain }, t0);
    osc.connect(amp);
    amp.connect(bus || this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    return { osc, amp };
  }

  _noise({ dur = 0.2, gain = 0.3, filter = 'lowpass', freq = 1200, q = 1, sweep = null, delay = 0, bus = null }) {
    if (!this.ctx || !this.noiseBuffer) return null;
    const t0 = this.now + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const biquad = this.ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(freq, t0);
    biquad.Q.value = q;
    if (sweep != null) biquad.frequency.exponentialRampToValueAtTime(Math.max(40, sweep), t0 + dur);
    const amp = this.ctx.createGain();
    this._env(amp, { attack: 0.004, decay: dur, peak: gain }, t0);
    src.connect(biquad);
    biquad.connect(amp);
    amp.connect(bus || this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    return { src, amp };
  }

  /* ------------------------------------------------------------------- sfx */

  /**
   * @param {string} name
   * @param {object} [opts] { rate, gain } — rate shifts pitch for variety
   */
  play(name, opts = {}) {
    if (this._failed) return;
    if (!this.ctx) this.init();
    if (!this.ctx || this.ctx.state !== 'running') return;

    // Voice limiter: at most one of each sound every 30ms. A wave of ten
    // explosions should sound like one big one, not ten clipped ones.
    const now = performance.now();
    const last = this._lastPlayed.get(name) || 0;
    if (now - last < 28) return;
    this._lastPlayed.set(name, now);

    const r = opts.rate ?? 1;
    const g = opts.gain ?? 1;
    const fn = SFX[name];
    if (fn) fn(this, r, g);
  }

  /* ----------------------------------------------------------------- music */

  /**
   * Procedural music: a slow arpeggio over a drone, with a filtered noise
   * pulse for rhythm. Different tracks change scale, tempo and timbre.
   */
  playMusic(track) {
    if (this._failed) return;
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    if (this.currentTrack === track) return;
    this.stopMusic();
    this.currentTrack = track;

    const def = MUSIC[track] || MUSIC.hub;
    const t = this.ctx.currentTime;

    // Drone pad — two detuned saws through a gentle lowpass.
    const pad = this.ctx.createGain();
    pad.gain.value = 0;
    pad.gain.linearRampToValueAtTime(def.padGain, t + 2.5);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = def.padCutoff;
    lp.Q.value = 0.7;
    pad.connect(lp);
    lp.connect(this.musicBus);

    for (const [i, cents] of [-7, 5].entries()) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = def.root * (i === 0 ? 1 : 1.5);
      o.detune.value = cents;
      o.connect(pad);
      o.start(t);
      this.musicNodes.push(o);
    }
    this.musicNodes.push(pad, lp);

    // Arpeggio, scheduled in bars on a JS interval (cheap and good enough for
    // ambient loops; a dropped frame just shifts a note, never desyncs).
    let step = 0;
    const stepMs = (60 / def.bpm) * 1000 / 2;
    this._musicTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const note = def.scale[step % def.scale.length];
      const freq = def.root * 2 * Math.pow(2, note / 12);
      const oct = step % 8 < 4 ? 1 : 2;
      this._tone({
        freq: freq * oct, type: def.leadType, dur: def.noteDur,
        gain: def.leadGain, bus: this.musicBus
      });
      if (def.pulse && step % 4 === 0) {
        this._noise({ dur: 0.16, gain: def.pulseGain, filter: 'lowpass', freq: 260, sweep: 60, bus: this.musicBus });
      }
      if (def.pulse && step % 8 === 4) {
        this._noise({ dur: 0.09, gain: def.pulseGain * 0.6, filter: 'highpass', freq: 3400, bus: this.musicBus });
      }
      step++;
    }, stepMs);
  }

  stopMusic() {
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    const t = this.ctx ? this.ctx.currentTime : 0;
    for (const node of this.musicNodes) {
      try {
        if (node.gain) node.gain.linearRampToValueAtTime(0.0001, t + 0.5);
        if (node.stop) node.stop(t + 0.6);
      } catch { /* already stopped */ }
    }
    this.musicNodes = [];
    this.currentTrack = null;
  }

  /** Duck the music briefly — used on boss intros and big hits. */
  duck(amount = 0.35, time = 0.6) {
    if (!this.ctx) return;
    const g = this.musicBus.gain;
    const t = this.ctx.currentTime;
    const target = g.value;
    g.cancelScheduledValues(t);
    g.setValueAtTime(target, t);
    g.linearRampToValueAtTime(target * amount, t + 0.05);
    g.linearRampToValueAtTime(target, t + time);
  }
}

/* ---------------------------------------------------------------- sfx bank */

const SFX = {
  swing: (a, r, g) => {
    a._noise({ dur: 0.13, gain: 0.16 * g, filter: 'bandpass', freq: 1800 * r, q: 1.2, sweep: 600 * r });
  },
  hit: (a, r, g) => {
    a._tone({ freq: 190 * r, type: 'square', dur: 0.09, gain: 0.2 * g, glide: 70 * r });
    a._noise({ dur: 0.1, gain: 0.28 * g, filter: 'lowpass', freq: 2600 * r, sweep: 400 });
  },
  crit: (a, r, g) => {
    a._tone({ freq: 620 * r, type: 'square', dur: 0.14, gain: 0.22 * g, glide: 180 * r });
    a._noise({ dur: 0.16, gain: 0.3 * g, filter: 'bandpass', freq: 3200, q: 2, sweep: 700 });
  },
  hurt: (a, r, g) => {
    a._tone({ freq: 260 * r, type: 'sawtooth', dur: 0.22, gain: 0.24 * g, glide: 80 });
    a._noise({ dur: 0.2, gain: 0.2 * g, filter: 'lowpass', freq: 900, sweep: 200 });
  },
  block: (a, r, g) => {
    a._tone({ freq: 420 * r, type: 'triangle', dur: 0.1, gain: 0.18 * g, glide: 300 });
    a._noise({ dur: 0.12, gain: 0.2 * g, filter: 'bandpass', freq: 2400, q: 3 });
  },
  parry: (a, r, g) => {
    a._tone({ freq: 1180, type: 'square', dur: 0.09, gain: 0.26 * g });
    a._tone({ freq: 1760, type: 'sine', dur: 0.35, gain: 0.24 * g, delay: 0.04 });
    a._tone({ freq: 2640, type: 'sine', dur: 0.5, gain: 0.14 * g, delay: 0.08 });
    a._noise({ dur: 0.3, gain: 0.16 * g, filter: 'highpass', freq: 4200 });
  },
  jump: (a, r, g) => {
    a._tone({ freq: 300 * r, type: 'sine', dur: 0.14, gain: 0.16 * g, glide: 620 * r });
  },
  land: (a, r, g) => {
    a._noise({ dur: 0.12, gain: 0.16 * g, filter: 'lowpass', freq: 700, sweep: 140 });
  },
  roll: (a, r, g) => {
    a._noise({ dur: 0.26, gain: 0.14 * g, filter: 'bandpass', freq: 900, q: 0.8, sweep: 2200 });
  },
  fireball: (a, r, g) => {
    a._noise({ dur: 0.3, gain: 0.2 * g, filter: 'bandpass', freq: 700 * r, q: 0.9, sweep: 2400 });
    a._tone({ freq: 140 * r, type: 'sawtooth', dur: 0.24, gain: 0.14 * g, glide: 420 });
  },
  dash: (a, r, g) => {
    a._noise({ dur: 0.3, gain: 0.22 * g, filter: 'bandpass', freq: 2600, q: 1.4, sweep: 400 });
    a._tone({ freq: 700, type: 'sine', dur: 0.18, gain: 0.12 * g, glide: 180 });
  },
  eruption: (a, r, g) => {
    a._noise({ dur: 0.55, gain: 0.32 * g, filter: 'lowpass', freq: 1800, sweep: 120 });
    a._tone({ freq: 90, type: 'sawtooth', dur: 0.5, gain: 0.24 * g, glide: 40 });
  },
  wave: (a, r, g) => {
    a._noise({ dur: 0.5, gain: 0.24 * g, filter: 'bandpass', freq: 500, q: 0.6, sweep: 2600 });
    a._tone({ freq: 200, type: 'triangle', dur: 0.45, gain: 0.16 * g, glide: 520 });
  },
  explode: (a, r, g) => {
    a._noise({ dur: 0.65, gain: 0.36 * g, filter: 'lowpass', freq: 2400, sweep: 90 });
    a._tone({ freq: 120, type: 'sawtooth', dur: 0.6, gain: 0.26 * g, glide: 32 });
  },
  die: (a, r, g) => {
    a._tone({ freq: 420 * r, type: 'square', dur: 0.4, gain: 0.16 * g, glide: 60 });
    a._noise({ dur: 0.45, gain: 0.22 * g, filter: 'lowpass', freq: 1600, sweep: 100 });
  },
  telegraph: (a, r, g) => {
    a._tone({ freq: 660 * r, type: 'triangle', dur: 0.12, gain: 0.1 * g });
  },
  danger: (a, r, g) => {
    a._tone({ freq: 220, type: 'square', dur: 0.16, gain: 0.14 * g });
    a._tone({ freq: 220, type: 'square', dur: 0.16, gain: 0.14 * g, delay: 0.19 });
  },
  ultimate: (a, r, g) => {
    a._tone({ freq: 110, type: 'sawtooth', dur: 1.4, gain: 0.3 * g, glide: 880 });
    a._tone({ freq: 220, type: 'square', dur: 1.2, gain: 0.16 * g, glide: 1760, delay: 0.1 });
    a._noise({ dur: 1.3, gain: 0.28 * g, filter: 'bandpass', freq: 400, q: 0.5, sweep: 6000 });
  },
  levelup: (a, r, g) => {
    [523, 659, 784, 1047].forEach((f, i) =>
      a._tone({ freq: f, type: 'triangle', dur: 0.35, gain: 0.2 * g, delay: i * 0.09 }));
  },
  pickup: (a, r, g) => {
    a._tone({ freq: 880 * r, type: 'triangle', dur: 0.1, gain: 0.14 * g, glide: 1320 * r });
  },
  coin: (a, r, g) => {
    a._tone({ freq: 1180, type: 'square', dur: 0.06, gain: 0.1 * g });
    a._tone({ freq: 1560, type: 'square', dur: 0.1, gain: 0.09 * g, delay: 0.05 });
  },
  ui: (a, r, g) => {
    a._tone({ freq: 520 * r, type: 'triangle', dur: 0.06, gain: 0.12 * g });
  },
  uiBack: (a, r, g) => {
    a._tone({ freq: 320, type: 'triangle', dur: 0.08, gain: 0.12 * g, glide: 220 });
  },
  error: (a, r, g) => {
    a._tone({ freq: 180, type: 'square', dur: 0.14, gain: 0.14 * g, glide: 120 });
  },
  unlock: (a, r, g) => {
    [392, 523, 659, 880, 1047].forEach((f, i) =>
      a._tone({ freq: f, type: 'sine', dur: 0.5, gain: 0.16 * g, delay: i * 0.07 }));
  },
  bossIntro: (a, r, g) => {
    a._tone({ freq: 55, type: 'sawtooth', dur: 2.2, gain: 0.3 * g, glide: 40 });
    a._noise({ dur: 2.0, gain: 0.18 * g, filter: 'lowpass', freq: 300, sweep: 80 });
    a._tone({ freq: 110, type: 'square', dur: 1.4, gain: 0.14 * g, delay: 0.5 });
  },
  victory: (a, r, g) => {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      a._tone({ freq: f, type: 'triangle', dur: 0.7, gain: 0.18 * g, delay: i * 0.12 }));
  },
  defeat: (a, r, g) => {
    [440, 392, 330, 262].forEach((f, i) =>
      a._tone({ freq: f, type: 'sawtooth', dur: 0.8, gain: 0.16 * g, delay: i * 0.22 }));
  },
  rank: (a, r, g) => {
    a._tone({ freq: 660 * r, type: 'square', dur: 0.12, gain: 0.14 * g });
    a._tone({ freq: 990 * r, type: 'square', dur: 0.2, gain: 0.12 * g, delay: 0.07 });
  }
};

/* -------------------------------------------------------------- music bank */

const MUSIC = {
  hub: {
    root: 98, bpm: 74, padGain: 0.24, padCutoff: 700, leadType: 'triangle',
    leadGain: 0.05, noteDur: 0.9, scale: [0, 3, 7, 10, 7, 3], pulse: false
  },
  combat: {
    root: 110, bpm: 128, padGain: 0.18, padCutoff: 1100, leadType: 'square',
    leadGain: 0.035, noteDur: 0.32, scale: [0, 3, 5, 7, 10, 7, 5, 3], pulse: true, pulseGain: 0.1
  },
  boss: {
    root: 82, bpm: 148, padGain: 0.22, padCutoff: 1500, leadType: 'sawtooth',
    leadGain: 0.03, noteDur: 0.24, scale: [0, 1, 5, 7, 8, 7, 5, 1], pulse: true, pulseGain: 0.13
  },
  menu: {
    root: 87, bpm: 62, padGain: 0.26, padCutoff: 600, leadType: 'sine',
    leadGain: 0.05, noteDur: 1.4, scale: [0, 7, 12, 10, 7, 5], pulse: false
  }
};
