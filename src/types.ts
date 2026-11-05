export type Mood = 'meditation' | 'focus';
export type Part = 'melody' | 'harmony' | 'bass' | 'percussion';

export type Instrument =
  | 'soft keys' | 'kalimba' | 'singing bowl' | 'glass' | 'breath'
  | 'warm pad' | 'drone' | 'choir' | 'strings'
  | 'sub' | 'warm bass'
  | 'none' | 'soft tick' | 'rain' | 'chime';

export type Scale = 'major' | 'minor' | 'pentatonic' | 'minorpent' | 'dorian' | 'lydian' | 'chromatic' | 'wholetone';

/** What the artwork suggests, before a mood reshapes it. */
export interface ArtworkReading {
  tempo: number;      // bpm
  scale: Scale;
  density: number;    // 0–1, how busy
  darkness: number;   // 0–1
}

export interface AudioParams {
  tempo: number;
  scale: Scale;
  density: number;
  reverb: number;
  instrument: Instrument;
  mood: Mood;
}

export interface GridCell { r: number; g: number; b: number; brightness: number; row: number }

/** The artwork turned into something playable: columns are time, rows are pitch. */
export interface Score {
  grid: GridCell[][];
  /** average brightness per column — drawn as the panel's curve */
  profile: number[];
  /** columns inside long silences, which playback glides through */
  skip: boolean[];
}

export interface NoteEvent { startColumn: number; durationInColumns: number; pitch: number; part: Part }

export type Instruments = Record<Part, Instrument>;
export type Volumes = Record<Part, number>;
