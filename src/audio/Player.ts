import { AudioEngine } from './AudioEngine';
import { MOODS } from './moods';
import { clamp } from '../lib/math';
import {
  BASS_EVERY, BASS_REGION, BRIGHTNESS_THRESHOLD, COLUMNS_PER_BEAT, HARMONY_BRIGHTNESS, MELODY_EVERY,
  MELODY_REGION, PERCUSSION_SPIKE, PITCH_CHANGE, SCAN_ROWS, SKIP_SPEED,
} from '../constants';
import type { ArtworkReading, AudioParams, Instrument, Instruments, Mood, NoteEvent, Part, Score, Volumes } from '../types';

/**
 * Plays a Score: a scan line moves across the artwork's columns and each
 * column can trigger bass, harmony, melody and percussion notes.
 * Lives outside React so the per-frame clock never causes re-renders.
 */
export class Player {
  readonly engine = new AudioEngine();
  score: Score | null = null;
  reading: ArtworkReading | null = null;
  mood: Mood = 'meditation';
  instruments: Instruments = { ...MOODS.meditation.instruments };
  volumes: Volumes = { melody: .8, harmony: .7, bass: .8, percussion: .6 };
  tempo = 56;
  playing = false;
  /** 0–1 across the artwork */
  scanPos = 0;
  column = 0;
  /** recent notes, for the panel's curve view */
  notes: NoteEvent[] = [];

  private params: AudioParams | null = null;
  private held: { melody: number | null; bass: number | null } = { melody: null, bass: null };
  private open: { melody: NoteEvent | null; bass: NoteEvent | null } = { melody: null, bass: null };
  private lastBrightness = 0;

  get width() { return this.score?.grid.length ?? 0; }

  /** Must run inside a click or drop, so the browser lets audio start. */
  unlock() { try { this.engine.init(); } catch { /* audio unavailable */ } }

  load(score: Score, reading: ArtworkReading) {
    this.score = score;
    this.reading = reading;
    this.rewind();
    this.engine.init();
    this.applyMood(this.mood);
  }

  /** Reshape the artwork's reading into calm music: slower, consonant, softer, sparser. */
  applyMood(mood: Mood) {
    const M = MOODS[mood];
    this.mood = mood;
    this.instruments = { ...M.instruments };
    const r = this.reading;
    if (!r) return;
    if (mood === 'meditation' && r.darkness === 0 && r.density > .6) this.instruments.melody = 'glass';
    if (mood === 'focus' && r.density > .65) this.instruments.melody = 'kalimba';
    this.tempo = Math.round(clamp(r.tempo * M.tempo[2], M.tempo[0], M.tempo[1]));
    this.params = {
      tempo: this.tempo, mood, scale: M.scale(r.scale), reverb: M.reverb,
      density: clamp(r.density * M.density, .2, .9), instrument: this.instruments.melody,
    };
    this.engine.lastMelody = null;
    this.engine.setParams(this.params);
  }

  setInstrument(part: Part, instrument: Instrument) {
    this.instruments = { ...this.instruments, [part]: instrument };
    if (part === 'melody' && this.params) {
      this.params = { ...this.params, instrument };
      this.engine.lastMelody = null;
      this.engine.setParams(this.params);
    }
  }

  setVolume(part: Part, v: number) { this.volumes = { ...this.volumes, [part]: clamp(v, 0, 1) }; }
  setTempo(bpm: number) { this.tempo = Math.round(clamp(bpm, 30, 140)); }
  get scale() { return this.params?.scale ?? 'pentatonic'; }

  play() {
    this.engine.init();
    this.engine.resume();
    this.rewind();
    this.playing = true;
  }

  pause() { this.engine.stop(); this.playing = false; }

  stop() { this.pause(); this.score = null; this.reading = null; this.params = null; this.rewind(); }

  private rewind() {
    this.scanPos = 0; this.column = -1; this.notes = [];
    this.held = { melody: null, bass: null }; this.open = { melody: null, bass: null };
    this.lastBrightness = 0;
  }

  /** Advance the scan line by dt seconds; glide through long silences. */
  tick(dt: number) {
    if (!this.playing || !this.score) return;
    const width = this.width;
    const total = (60 / this.tempo) * (width / COLUMNS_PER_BEAT);
    const speed = this.score.skip[Math.floor(this.scanPos * width)] ? SKIP_SPEED : 1;
    let next = this.scanPos + dt * speed / total;
    if (next > 1) { next = 0; this.notes = []; this.column = -1; }
    this.scanPos = next;
    // play every column passed since the last frame, so a slow frame never drops notes
    const col = Math.floor(next * width) % width;
    for (let c = this.column + 1, n = 0; c <= col && n < 64; c++, n++) this.playColumn(c);
    this.column = col;
  }

  /** Seconds from the start to a column at the current tempo (silences glide). */
  timeAt(col: number) {
    const per = (60 / this.tempo) / COLUMNS_PER_BEAT, skip = this.score?.skip ?? [];
    let s = 0;
    for (let i = 0; i < col && i < skip.length; i++) s += skip[i] ? per / SKIP_SPEED : per;
    return s;
  }

  /** notes still sounding, so the curve can show them as they happen */
  get sounding() { return [this.open.melody, this.open.bass].filter(Boolean) as NoteEvent[]; }

  private trigger(part: Part, y: number, intensity: number): number | null {
    if (!this.params) return null;
    this.engine.setParams({ ...this.params, instrument: this.instruments[part] });
    this.engine.gainScale = this.volumes[part];
    const midi = this.engine.triggerGrain(y, intensity);
    this.engine.setParams({ ...this.params, instrument: this.instruments.melody });
    return midi;
  }

  private remember(note: NoteEvent) {
    this.notes.push(note);
    if (this.notes.length > 1200) this.notes.splice(0, this.notes.length - 1200);
  }

  private closeNote(part: 'melody' | 'bass', col: number) {
    const n = this.open[part];
    if (n) { n.durationInColumns = col - n.startColumn; this.remember(n); this.open[part] = null; }
  }

  private playColumn(col: number) {
    const column = this.score?.grid[col];
    if (!column || !this.params) return;
    const active = column.filter(c => c.brightness > BRIGHTNESS_THRESHOLD);
    if (!active.length) { this.lastBrightness = 0; return; }
    const M = MOODS[this.mood];
    const total = column.reduce((s, c) => s + c.brightness, 0) / column.length;

    // 1. bass — the weighted centre of the bottom quarter, every beat
    if (col % BASS_EVERY === 0) {
      const region = active.filter(c => c.row < SCAN_ROWS * BASS_REGION);
      if (region.length) {
        const w = region.reduce((s, c) => s + c.brightness, 0);
        const y = region.reduce((s, c) => s + (c.row / SCAN_ROWS) * c.brightness, 0) / w;
        this.closeNote('bass', col);
        const midi = this.trigger('bass', y, .8);
        this.held.bass = y;
        if (midi) this.open.bass = { startColumn: col, durationInColumns: 1, pitch: midi, part: 'bass' };
      } else this.held.bass = null;
    }

    // 2. harmony — the brightest point, every couple of bars
    if (col % M.harmonyEvery === 0 && total > HARMONY_BRIGHTNESS) {
      const root = [...active].sort((a, b) => b.brightness - a.brightness)[0];
      const midi = this.trigger('harmony', root.row / SCAN_ROWS, total * 1.5);
      if (midi) this.remember({ startColumn: col, durationInColumns: 16, pitch: midi, part: 'harmony' });
    }

    // 3. melody — the weighted centre of everything above the bass, when it moves
    if (col % MELODY_EVERY === 0) {
      const region = active.filter(c => c.row >= SCAN_ROWS * MELODY_REGION);
      if (region.length) {
        const w = region.reduce((s, c) => s + c.brightness, 0);
        const y = region.reduce((s, c) => s + (c.row / SCAN_ROWS) * c.brightness, 0) / w;
        const moved = this.held.melody === null || Math.abs(this.held.melody - y) > PITCH_CHANGE;
        if (moved) {
          this.closeNote('melody', col);
          if (Math.random() < Math.max(this.params.density, .5)) {
            const midi = this.trigger('melody', y, w / region.length);
            this.held.melody = y;
            if (midi) this.open.melody = { startColumn: col, durationInColumns: 1, pitch: midi, part: 'melody' };
          }
        }
      } else this.held.melody = null;
    }

    // 4. percussion — on sudden brightness, and (in focus) a quiet steady pulse
    const spike = total - this.lastBrightness;
    const pulse = M.pulse && col % COLUMNS_PER_BEAT === 0;
    if (this.instruments.percussion !== 'none' && (spike > PERCUSSION_SPIKE || pulse)) {
      const accent = pulse ? (col % 32 === 0 ? .8 : .45) : 0;
      const midi = this.trigger('percussion', .5 + total * .2, Math.max(spike * 2, accent));
      if (midi) this.remember({ startColumn: col, durationInColumns: 2, pitch: midi, part: 'percussion' });
    }
    this.lastBrightness = total;
  }
}
