import { Type } from "@google/genai";

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  PLAYING = 'PLAYING',
  ERROR = 'ERROR'
}

export interface ArtMetadata {
  title: string;
  artistStyle: string;
  mood: string;
  description: string;
  colorPalette: string[];
}

export interface AudioParams {
  tempo: number; // BPM 60-140
  scale: 'major' | 'minor' | 'pentatonic' | 'chromatic' | 'wholetone';
  roughness: number; // 0-1 (clean to distorted)
  density: number; // 0-1 (sparse to dense notes)
  reverb: number; // 0-1 (dry to wet)
  instrument: 'synth' | 'pad' | 'pluck' | 'drone' | 'chime' | 'bass' | '8-bit' | 'violin' | 'flute' | 'organ';
}

export interface AnalysisResult {
  metadata: ArtMetadata;
  audioParams: AudioParams;
}

// Schema for Gemini Response
export const AnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    metadata: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        artistStyle: { type: Type.STRING },
        mood: { type: Type.STRING },
        description: { type: Type.STRING },
        colorPalette: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      },
      required: ['title', 'artistStyle', 'mood', 'description', 'colorPalette']
    },
    audioParams: {
      type: Type.OBJECT,
      properties: {
        tempo: { type: Type.NUMBER, description: "BPM between 60 and 140" },
        scale: { type: Type.STRING, enum: ['major', 'minor', 'pentatonic', 'chromatic', 'wholetone'] },
        roughness: { type: Type.NUMBER, description: "0.0 to 1.0, where 1 is gritty/distorted" },
        density: { type: Type.NUMBER, description: "0.0 to 1.0, activity level" },
        reverb: { type: Type.NUMBER, description: "0.0 to 1.0, space size" },
        instrument: { type: Type.STRING, enum: ['synth', 'pad', 'pluck', 'drone', 'chime', 'bass', '8-bit', 'violin'] }
      },
      required: ['tempo', 'scale', 'roughness', 'density', 'reverb', 'instrument']
    }
  },
  required: ['metadata', 'audioParams']
};