// Web Audio — everything synthesized: SFX + procedural chiptune loops (menu / game / boss).
// Unlocked on the first user gesture. Music and SFX toggles are independent.
import { CONFIG } from './config.js';
import { Rng } from './rng.js';

const A = CONFIG.audio;
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

// ── procedural tracks ────────────────────────────────────────────────────────
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};
const TRACKS = {
  menu: { bpm: 104, root: 60, scale: 'major', prog: [0, 5, 3, 4], seed: 11, leadDensity: 0.38, bass: [0, 6, 8, 14], hats: 2, kick: [0, 8], snare: [] , leadWave: 'triangle', bassWave: 'triangle' },
  game: { bpm: 138, root: 57, scale: 'minor', prog: [0, 5, 2, 6], seed: 23, leadDensity: 0.5, bass: [0, 2, 4, 6, 8, 10, 12, 14], hats: 2, kick: [0, 6, 8], snare: [4, 12], leadWave: 'square', bassWave: 'square' },
  boss: { bpm: 156, root: 55, scale: 'harmonic', prog: [0, 0, 5, 4], seed: 37, leadDensity: 0.55, bass: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], hats: 1, kick: [0, 4, 8, 12], snare: [4, 12], leadWave: 'sawtooth', bassWave: 'square' },
};
const BARS = 8;

function buildTrack(def) {
  const rng = new Rng(def.seed);
  const sc = SCALES[def.scale];
  const note = deg => def.root + sc[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
  const bars = [];
  // the melody is a 2-bar motif repeated with variation → catchy, loops every 8 bars
  const motif = [];
  for (let s = 0; s < 32; s++) motif.push(rng.chance(def.leadDensity) ? rng.pick([0, 2, 4, 2, 4, 7, 1, 3, 5]) : null);
  for (let b = 0; b < BARS; b++) {
    const chord = def.prog[b % def.prog.length];
    const lead = [], bass = [];
    for (let s = 0; s < 16; s++) {
      const m = motif[(b % 2) * 16 + s];
      const vary = b >= 4 && rng.chance(0.25);
      lead.push(m === null ? null : note(chord + m + (vary ? 2 : 0) + 7));
      bass.push(def.bass.includes(s) ? note(chord) - 24 + (s % 8 === 4 && def.bass.length > 8 ? 12 : 0) : null);
    }
    bars.push({ lead, bass });
  }
  return { ...def, bars };
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.sfxOn = true;
    this.want = null;        // track requested (plays once unlocked)
    this.track = null;
    this.tracks = {};
    for (const k in TRACKS) this.tracks[k] = buildTrack(TRACKS[k]);
    this.last = Object.create(null);
    this.timer = null;
    this.ducked = false;
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        const c = this.ctx;
        this.master = c.createGain(); this.master.gain.value = A.master; this.master.connect(c.destination);
        this.music = c.createGain(); this.music.gain.value = this.musicOn ? A.music : 0; this.music.connect(this.master);
        this.sfx = c.createGain(); this.sfx.gain.value = this.sfxOn ? A.sfx : 0; this.sfx.connect(this.master);
        const len = c.sampleRate;
        this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        const r = new Rng(99);
        for (let i = 0; i < len; i++) d[i] = r.next() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (this.want && this.track !== this.want) this.playMusic(this.want);
    } catch { /* audio unavailable: silent game */ }
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  setMusic(on) {
    this.musicOn = on;
    if (this.music) this.music.gain.setTargetAtTime(on ? A.music * (this.ducked ? 0.35 : 1) : 0, this.ctx.currentTime, 0.05);
  }
  setSfx(on) {
    this.sfxOn = on;
    if (this.sfx) this.sfx.gain.setTargetAtTime(on ? A.sfx : 0, this.ctx.currentTime, 0.02);
  }
  duck(on) {
    this.ducked = on;
    if (this.music && this.musicOn) this.music.gain.setTargetAtTime(A.music * (on ? 0.35 : 1), this.ctx.currentTime, 0.1);
  }
  suspend() { try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch { /* */ } }
  resume() { try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch { /* */ } }

  // ── primitives ─────────────────────────────────────────────────────────────
  limit(key, min) {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (this.last[key] !== undefined && now - this.last[key] < min) return false;
    this.last[key] = now;
    return true;
  }
  tone(freq, dur, type, vol, slideTo, when, dest) {
    const c = this.ctx, t = when ?? c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, filter, freq, when, dest, q) {
    const c = this.ctx, t = when ?? c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = filter; f.frequency.value = freq; f.Q.value = q || 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  can() { return this.ctx && this.sfxOn && this.ctx.state === 'running'; }

  // ── SFX ────────────────────────────────────────────────────────────────────
  // weapons: 0 rifle · 1 smg · 2 shotgun · 3 minigun · 4 rockets · 5 laser
  shot(weapon) {
    if (!this.can() || !this.limit('shot', A.shotMinInterval * (weapon === 4 ? 3 : weapon === 5 ? 2 : 1))) return;
    if (weapon === 4) { this.noise(0.22, 0.28, 'lowpass', 900); this.tone(180, 0.2, 'sawtooth', 0.08, 60); return; }
    if (weapon === 5) { this.tone(1800, 0.12, 'sawtooth', 0.05, 500); this.tone(2400, 0.08, 'square', 0.03, 900); return; }
    if (weapon === 2) { this.noise(0.12, 0.25, 'lowpass', 2400); return; }
    if (weapon === 3) { this.noise(0.04, 0.12, 'highpass', 2600); this.tone(500, 0.03, 'square', 0.025, 260); return; }
    this.noise(0.05, weapon === 1 ? 0.12 : 0.16, 'highpass', 1800);
    this.tone(weapon === 1 ? 900 : 700, 0.04, 'square', 0.03, 300);
  }
  explosion(big) {
    if (!this.can() || !this.limit('boomx', big ? 0.12 : 0.07)) return;
    this.noise(big ? 0.7 : 0.4, big ? 0.42 : 0.3, 'lowpass', big ? 500 : 800);
    this.tone(big ? 90 : 130, big ? 0.5 : 0.3, 'sine', 0.3, 35);
  }
  horn() {
    if (!this.can() || !this.limit('horn', 0.6)) return;
    const t = this.ctx.currentTime;
    this.tone(330, 0.35, 'sawtooth', 0.09, null, t); this.tone(415, 0.35, 'sawtooth', 0.07, null, t);
    this.tone(330, 0.35, 'sawtooth', 0.09, null, t + 0.42); this.tone(415, 0.35, 'sawtooth', 0.07, null, t + 0.42);
  }
  jets() {
    if (!this.can()) return;
    this.noise(1.6, 0.25, 'bandpass', 1400, undefined, undefined, 0.6);
    this.tone(900, 1.4, 'sawtooth', 0.04, 250);
  }
  heli() {
    if (!this.can()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 10; i++) this.noise(0.07, 0.14, 'lowpass', 500, t + i * 0.09);
  }
  cannon() {
    if (!this.can() || !this.limit('cannon', 0.2)) return;
    this.noise(0.3, 0.3, 'lowpass', 600); this.tone(110, 0.25, 'square', 0.12, 50);
  }
  pickup() {
    if (!this.can()) return;
    const t = this.ctx.currentTime;
    [67, 72, 76, 79, 84].forEach((m, i) => this.tone(midiHz(m), 0.1, 'square', 0.08, null, t + i * 0.05));
  }
  acid() {
    if (!this.can() || !this.limit('acid', 0.1)) return;
    this.noise(0.18, 0.18, 'bandpass', 900, undefined, undefined, 3); this.tone(400, 0.15, 'sine', 0.06, 900);
  }
  splat() {
    if (!this.can() || !this.limit('splat', 0.08)) return;
    this.noise(0.2, 0.2, 'lowpass', 1200); this.tone(220, 0.15, 'triangle', 0.08, 90);
  }
  warn() {
    if (!this.can() || !this.limit('warn', 0.5)) return;
    const t = this.ctx.currentTime;
    this.tone(880, 0.12, 'square', 0.07, null, t); this.tone(660, 0.16, 'square', 0.07, null, t + 0.14);
  }
  clang() {
    if (!this.can()) return;
    this.tone(1200, 0.4, 'triangle', 0.1, 900); this.tone(1700, 0.3, 'square', 0.04, 1200);
  }
  whoosh() {
    if (!this.can() || !this.limit('whoosh', 0.3)) return;
    this.noise(0.5, 0.18, 'bandpass', 700, undefined, undefined, 1.2);
  }
  hit() {
    if (!this.can() || !this.limit('hit', A.hitMinInterval)) return;
    this.noise(0.04, 0.08, 'bandpass', 1200);
  }
  zdie(big) {
    if (!this.can() || !this.limit('zdie', 0.05)) return;
    this.noise(big ? 0.25 : 0.14, big ? 0.32 : 0.2, 'lowpass', big ? 500 : 900);
    this.tone(big ? 160 : 260, big ? 0.25 : 0.14, 'square', 0.06, big ? 50 : 90);
  }
  contact() {
    if (!this.can() || !this.limit('contact', 0.08)) return;
    this.tone(220, 0.16, 'sawtooth', 0.12, 80);
    this.noise(0.12, 0.18, 'lowpass', 700);
  }
  gateGood() {
    if (!this.can()) return;
    const t = this.ctx.currentTime;
    [72, 76, 79, 84].forEach((m, i) => this.tone(midiHz(m), 0.12, 'square', 0.09, null, t + i * 0.05));
  }
  gateBad() {
    if (!this.can()) return;
    const t = this.ctx.currentTime;
    [64, 60, 55].forEach((m, i) => this.tone(midiHz(m), 0.14, 'sawtooth', 0.08, null, t + i * 0.07));
  }
  gateStep() {
    if (!this.can() || !this.limit('gstep', 0.06)) return;
    this.tone(1250, 0.05, 'square', 0.04, 1600);
  }
  coin() {
    if (!this.can() || !this.limit('coin', A.coinMinInterval)) return;
    const t = this.ctx.currentTime;
    this.tone(midiHz(88), 0.06, 'square', 0.05, null, t);
    this.tone(midiHz(93), 0.1, 'square', 0.05, null, t + 0.05);
  }
  weapon() {
    if (!this.can()) return;
    const t = this.ctx.currentTime;
    [67, 71, 74, 79, 83].forEach((m, i) => this.tone(midiHz(m), 0.1, 'triangle', 0.12, null, t + i * 0.04));
  }
  bossRoar() {
    if (!this.can()) return;
    this.tone(110, 0.9, 'sawtooth', 0.16, 45);
    this.noise(0.8, 0.2, 'lowpass', 400);
  }
  stomp() {
    if (!this.can() || !this.limit('stomp', 0.3)) return;
    this.tone(70, 0.22, 'sine', 0.3, 35);
  }
  bossDie() {
    if (!this.can()) return;
    const t = this.ctx.currentTime;
    this.noise(1.0, 0.35, 'lowpass', 600);
    [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => this.tone(midiHz(m), 0.16, 'square', 0.08, null, t + 0.2 + i * 0.07));
  }
  gameOver() {
    if (!this.can()) return;
    const t = this.ctx.currentTime;
    [67, 63, 60, 55].forEach((m, i) => this.tone(midiHz(m), 0.3, 'triangle', 0.14, null, t + i * 0.22));
  }
  levelUp() {
    if (!this.can()) return;
    const t = this.ctx.currentTime;
    [72, 76, 79, 76, 79, 84].forEach((m, i) => this.tone(midiHz(m), 0.14, 'square', 0.08, null, t + i * 0.09));
  }
  click() {
    if (!this.can() || !this.limit('click', 0.04)) return;
    this.tone(660, 0.05, 'square', 0.05, 990);
  }
  buy() {
    if (!this.can()) return;
    const t = this.ctx.currentTime;
    this.tone(midiHz(81), 0.07, 'square', 0.06, null, t);
    this.tone(midiHz(88), 0.12, 'square', 0.06, null, t + 0.06);
  }
  deny() {
    if (!this.can()) return;
    this.tone(180, 0.12, 'square', 0.06, 140);
  }

  // ── music sequencer (lookahead scheduling) ─────────────────────────────────
  playMusic(name) {
    this.want = name;
    if (!this.ctx) return;
    if (this.track === name) return;
    this.track = name;
    clearInterval(this.timer); this.timer = null;
    if (!name) return;
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running' || !this.track) return;
    const tr = this.tracks[this.track];
    const stepDur = 60 / tr.bpm / 4;
    if (this.nextT < c.currentTime - 0.2) this.nextT = c.currentTime + 0.02; // resumed after a pause
    while (this.nextT < c.currentTime + 0.12) {
      const bar = tr.bars[Math.floor(this.step / 16) % BARS], s = this.step % 16, t = this.nextT;
      if (this.musicOn) {
        const L = bar.lead[s], B = bar.bass[s];
        if (L !== null) this.tone(midiHz(L), stepDur * 1.6, tr.leadWave, tr.leadWave === 'sawtooth' ? 0.045 : 0.06, null, t, this.music);
        if (B !== null) this.tone(midiHz(B), stepDur * 0.9, tr.bassWave, 0.08, null, t, this.music);
        if (tr.kick.includes(s)) this.tone(150, 0.16, 'sine', 0.5, 40, t, this.music);
        if (tr.snare.includes(s)) this.noise(0.12, 0.22, 'bandpass', 1800, t, this.music);
        if (s % tr.hats === 0) this.noise(0.03, 0.08, 'highpass', 7000, t, this.music);
      }
      this.nextT += stepDur;
      this.step = (this.step + 1) % (16 * BARS);
    }
  }
}
