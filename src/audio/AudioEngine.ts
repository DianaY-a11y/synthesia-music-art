import type { AudioParams, Instrument } from '../types';

/**
 * Calm audio engine: every sound is synthesised live with Web Audio.
 * Melodic voices (bowls, glass, soft keys, kalimba, breath), sustained beds
 * (pad, choir, strings, drone), bass (sub, warm bass) and soft percussion
 * (tick, rain, chime) — through a dark reverb, gentle low-pass and compressor.
 */
const mtof = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
export const SCALES: Record<string, number[]> = {
  major:      [0, 2, 4, 5, 7, 9, 11],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  minorpent:  [0, 3, 5, 7, 10],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  lydian:     [0, 2, 4, 6, 7, 9, 11],
  chromatic:  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  wholetone:  [0, 2, 4, 6, 8, 10],
};
const MELODIC: Instrument[] = ['soft keys', 'kalimba', 'singing bowl', 'glass', 'breath'];
const clampN = (n: number, lo: number, hi: number) => { while (n < lo) n += 12; while (n > hi) n -= 12; return n; };

export class AudioEngine {
  ctx: AudioContext | null = null;
  params: AudioParams | null = null;
  /** per-layer volume applied to the next triggered note (0–1) */
  gainScale = 1;
  /** last melodic note, used to keep melodies from leaping */
  lastMelody: number | null = null;
  private scaleNotes: number[] = [];
  private bus!: GainNode;
  private tone!: BiquadFilterNode;
  private dry!: GainNode;
  private wet!: GainNode;
  private verb!: ConvolverNode;
  private comp!: DynamicsCompressorNode;
  master!: GainNode;
  private noiseBuf!: AudioBuffer;

  init() {
    if (!this.ctx) {
      const ctx = this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.bus = ctx.createGain(); this.bus.gain.value = 0.9;
      this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 7000; this.tone.Q.value = 0.3;
      this.dry = ctx.createGain(); this.wet = ctx.createGain(); this.wet.gain.value = 0.6;
      this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(5.5, 2.6);
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -20; this.comp.ratio.value = 3; this.comp.attack.value = 0.03; this.comp.release.value = 0.4;
      this.master = ctx.createGain(); this.master.gain.value = 0.8;
      this.bus.connect(this.tone);
      this.tone.connect(this.dry); this.tone.connect(this.verb); this.verb.connect(this.wet);
      this.dry.connect(this.comp); this.wet.connect(this.comp); this.comp.connect(this.master); this.master.connect(ctx.destination);
      // shared white-noise buffer
      const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = nb;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // long, dark, smooth tail
  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!, rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) {
        const n = i / len;
        lp += ((Math.random() * 2 - 1) - lp) * (0.35 - 0.3 * n); // darkens as it decays
        data[i] = lp * Math.pow(1 - n, decay) * (i < rate * 0.012 ? i / (rate * 0.012) : 1);
      }
    }
    return buf;
  }

  setParams(params: AudioParams) {
    this.params = params;
    const base = SCALES[params.scale] || SCALES.pentatonic, root = 48;
    this.scaleNotes = [];
    for (let o = 0; o < 4; o++) base.forEach(iv => this.scaleNotes.push(root + o * 12 + iv));
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.wet.gain.setTargetAtTime(0.25 + params.reverb * 0.75, t, 0.3);
      this.tone.frequency.setTargetAtTime(params.mood === 'focus' ? 6500 : 4200, t, 0.3);
    }
  }

  // -- building blocks ------------------------------------------------------
  private voice(pan = (Math.random() - 0.5) * 0.6) {
    const g = this.ctx!.createGain(), p = this.ctx!.createStereoPanner();
    p.pan.value = pan; g.connect(p); p.connect(this.bus); return g;
  }
  private env(g: GainNode, t: number, a: number, d: number, peak: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    return t + a + d + 0.05;
  }
  private osc(type: OscillatorType, f: number, t: number, end: number, dest: AudioNode, detune = 0) {
    const o = this.ctx!.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    o.connect(dest); o.start(t); o.stop(end); return o;
  }
  // partial stack: each partial its own decay (bells, bowls, kalimba)
  private partials(f: number, t: number, ratios: number[], gains: number[], decays: number[], peak: number, attack = 0.005, beat = 0) {
    const out = this.voice();
    ratios.forEach((r, i) => {
      const g = this.ctx!.createGain(); g.connect(out);
      const end = this.env(g, t, attack, decays[i], peak * gains[i]);
      this.osc('sine', f * r, t, end, g, beat ? -beat : 0);
      if (beat) this.osc('sine', f * r, t, end, g, beat); // slow beating, like a real bowl
    });
  }
  private noise(t: number, dur: number, dest: AudioNode) {
    const s = this.ctx!.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    s.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur);
  }

  /** Play one note for a scan position (0 = low, 1 = high). Returns the MIDI note, or null. */
  triggerGrain(yPosition: number, intensity: number): number | null {
    if (!this.ctx || !this.params || this.scaleNotes.length === 0) return null;
    const gs = this.gainScale;
    if (gs <= 0.001) return null;
    const ctx = this.ctx, t = ctx.currentTime + 0.01, v = Math.min(Math.max(intensity, 0.15), 1) * gs;
    let note = this.scaleNotes[Math.floor(yPosition * (this.scaleNotes.length - 1))];
    const inst = this.params.instrument;

    // melodic instruments avoid big leaps: fold the note toward the previous one
    if (MELODIC.includes(inst)) {
      if (this.lastMelody != null) while (Math.abs(note - this.lastMelody) > 7) note += note > this.lastMelody ? -12 : 12;
    }

    switch (inst) {
      case 'soft keys': { // electric-piano: FM sine with a bright, fast-fading tine
        note = clampN(note, 55, 82); const f = mtof(note);
        const out = this.voice(), end = this.env(out, t, 0.006, 2.8, 0.26 * v);
        const car = this.osc('sine', f, t, end, out);
        const mod = ctx.createOscillator(), mg = ctx.createGain(); mod.frequency.value = f; mod.connect(mg); mg.connect(car.frequency);
        mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(f * 0.08, t + 1.2); mod.start(t); mod.stop(end);
        const tg = ctx.createGain(); tg.connect(out); this.env(tg, t, 0.002, 0.25, 0.12); this.osc('sine', f * 4, t, t + 0.4, tg);
        break;
      }
      case 'kalimba':
        note = clampN(note + 12, 62, 88);
        this.partials(mtof(note), t, [1, 5.4, 8.9], [1, 0.16, 0.05], [1.5, 0.25, 0.12], 0.3 * v, 0.002);
        break;
      case 'singing bowl':
        note = clampN(note, 52, 76);
        this.partials(mtof(note), t, [1, 2.76, 5.4, 8.93], [1, 0.45, 0.22, 0.1], [8, 5.5, 3.5, 2], 0.15 * v, 0.04, 1.4);
        break;
      case 'glass':
        note = clampN(note + 12, 64, 90);
        this.partials(mtof(note), t, [1, 2, 3.01], [1, 0.28, 0.12], [3.4, 1.8, 0.9], 0.14 * v, 0.012);
        break;
      case 'breath': { // airy flute: soft sine + band-passed breath
        note = clampN(note + 12, 62, 86); const f = mtof(note);
        const out = this.voice(), end = this.env(out, t, 0.35, 1.9, 0.22 * v);
        const o = this.osc('sine', f, t, end, out); this.osc('triangle', f * 2, t, end, (() => { const g2 = ctx.createGain(); g2.gain.value = 0.08; g2.connect(out); return g2; })());
        const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 4.6; vg.gain.value = 4; vib.connect(vg); vg.connect(o.detune); vib.start(t); vib.stop(end);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 7;
        const ng = ctx.createGain(); ng.gain.value = 0.35; bp.connect(ng); ng.connect(out); this.noise(t, end - t, bp);
        break;
      }
      case 'warm pad': { // three detuned saws through a slowly opening low-pass
        note = clampN(note, 48, 69); const f = mtof(note);
        const out = this.voice(), end = this.env(out, t, 1.8, 4.6, 0.06 * v);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6; lp.connect(out);
        lp.frequency.setValueAtTime(380, t); lp.frequency.linearRampToValueAtTime(1100, t + 2); lp.frequency.linearRampToValueAtTime(500, end);
        [-9, 0, 9].forEach(dt => this.osc('sawtooth', f, t, end, lp, dt));
        this.osc('sine', f / 2, t, end, lp);
        break;
      }
      case 'choir': { // saws through two vowel formants ("ah")
        note = clampN(note, 50, 70); const f = mtof(note);
        const out = this.voice(), end = this.env(out, t, 1.5, 4, 0.2 * v);
        const src = ctx.createGain(); src.gain.value = 0.5;
        [[700, 6, 1], [1150, 8, 0.6], [2600, 10, 0.2]].forEach(([fq, q, gn]) => {
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = q;
          const gg = ctx.createGain(); gg.gain.value = gn; src.connect(bp); bp.connect(gg); gg.connect(out);
        });
        [-7, 6].forEach(dt => this.osc('sawtooth', f, t, end, src, dt));
        break;
      }
      case 'strings': {
        note = clampN(note, 52, 74); const f = mtof(note);
        const out = this.voice(), end = this.env(out, t, 1.3, 3.6, 0.05 * v);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; lp.connect(out);
        const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5; vg.gain.value = 6; vib.connect(vg); vib.start(t); vib.stop(end);
        [-8, 0, 7].forEach(dt => { const o = this.osc('sawtooth', f, t, end, lp, dt); vg.connect(o.detune); });
        break;
      }
      case 'drone': { // root + fifth + octave, very slow swell
        note = clampN(note - 12, 36, 52); const f = mtof(note);
        const out = this.voice(0), end = this.env(out, t, 3, 7, 0.13 * v);
        this.osc('sine', f, t, end, out);
        const g5 = ctx.createGain(); g5.gain.value = 0.4; g5.connect(out); this.osc('sine', f * 1.5, t, end, g5, 2);
        const g8 = ctx.createGain(); g8.gain.value = 0.22; g8.connect(out); this.osc('triangle', f * 2, t, end, g8, -3);
        break;
      }
      case 'sub':
        note = clampN(note - 12, 33, 48);
        { const out = this.voice(0), end = this.env(out, t, 0.08, 1.8, 0.34 * v); this.osc('sine', mtof(note), t, end, out); }
        break;
      case 'warm bass': {
        note = clampN(note - 12, 33, 50);
        const out = this.voice(0), end = this.env(out, t, 0.02, 1.0, 0.36 * v);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 360; lp.connect(out);
        this.osc('triangle', mtof(note), t, end, lp); this.osc('sine', mtof(note), t, end, lp);
        break;
      }
      case 'rain': { // a few soft, randomly pitched droplets of filtered noise
        const n = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) {
          const tt = t + Math.random() * 0.3, bp = ctx.createBiquadFilter();
          bp.type = 'bandpass'; bp.frequency.value = 2200 + Math.random() * 5000; bp.Q.value = 4;
          const out = this.voice(), end = this.env(out, tt, 0.002, 0.05, 0.05 * v);
          bp.connect(out); this.noise(tt, end - tt, bp);
        }
        return note;
      }
      case 'soft tick': {
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200;
        const out = this.voice((Math.random() - 0.5) * 0.3), end = this.env(out, t, 0.001, 0.035 + Math.random() * 0.02, 0.07 * v);
        hp.connect(out); this.noise(t, end - t, hp);
        return note;
      }
      case 'chime':
        note = clampN(note + 24, 76, 100);
        this.partials(mtof(note), t, [1, 2.4, 4.1], [1, 0.3, 0.1], [2.6, 0.9, 0.4], 0.07 * v, 0.003);
        break;
      case 'none':
        return null;
      default:
        note = clampN(note, 55, 82);
        this.partials(mtof(note), t, [1, 2], [1, 0.2], [2, 0.8], 0.2 * v);
    }
    if (MELODIC.includes(inst)) this.lastMelody = note;
    return note;
  }

  stop() { if (this.ctx) this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
}
