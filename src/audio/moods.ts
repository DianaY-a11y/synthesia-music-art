import type { Instrument, Instruments, Mood, Part, Scale } from '../types';

export interface MoodSettings {
  /** [min bpm, max bpm, multiplier applied to the artwork's tempo] */
  tempo: [number, number, number];
  density: number;
  /** columns between harmony notes */
  harmonyEvery: number;
  /** a steady, quiet beat on every beat */
  pulse: boolean;
  reverb: number;
  instruments: Instruments;
  /** map the artwork's scale onto a calm one */
  scale: (s: Scale) => Scale;
}

export const MOODS: Record<Mood, MoodSettings> = {
  meditation: {
    tempo: [50, 64, .6], density: .5, harmonyEvery: 32, pulse: false, reverb: .92,
    instruments: { melody: 'singing bowl', harmony: 'drone', bass: 'sub', percussion: 'none' },
    scale: s => (s === 'minor' ? 'minorpent' : 'pentatonic'),
  },
  focus: {
    tempo: [70, 88, .8], density: .8, harmonyEvery: 16, pulse: true, reverb: .55,
    instruments: { melody: 'soft keys', harmony: 'warm pad', bass: 'warm bass', percussion: 'soft tick' },
    scale: s => ({ minor: 'dorian', major: 'major', pentatonic: 'pentatonic', chromatic: 'minorpent', wholetone: 'lydian' } as Record<string, Scale>)[s] || 'pentatonic',
  },
};

/** The sounds each layer can cycle through. */
export const INSTRUMENT_OPTIONS: Record<Part, Instrument[]> = {
  melody: ['soft keys', 'kalimba', 'singing bowl', 'glass', 'breath'],
  harmony: ['warm pad', 'drone', 'choir', 'strings'],
  bass: ['sub', 'warm bass', 'drone'],
  percussion: ['none', 'soft tick', 'rain', 'chime'],
};
