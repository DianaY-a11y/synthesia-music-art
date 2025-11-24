import React from 'react';
import { MAX_PITCH, MIN_PITCH } from '../constants';

export interface NoteEvent {
  startColumn: number;
  durationInColumns: number;
  pitch: number; // MIDI note number
  instrument: 'melody' | 'bass' | 'harmony' | 'percussion';
}

interface MusicScoreProps {
  melodyNotes: NoteEvent[];
  bassNotes: NoteEvent[];
  harmonyNotes: NoteEvent[];
  percussionNotes: NoteEvent[];
  selectedParts: string[];
  onPartChange: (parts: string[]) => void;
  currentColumn: number;
}

// --- FIX: Define bright colors for each instrument type ---
const NOTE_COLORS: Record<NoteEvent['instrument'], string> = {
  melody: '#34d399',     // Emerald
  bass: '#fb923c',       // Orange
  harmony: '#60a5fa',     // Blue
  percussion: '#f87171', // Red
};

const MusicScore: React.FC<MusicScoreProps> = ({
  melodyNotes,
  bassNotes,
  harmonyNotes,
  percussionNotes,
  selectedParts,
  onPartChange,
  currentColumn,
}) => {
  const allNotes = [
    ...melodyNotes,
    ...bassNotes,
    ...harmonyNotes,
    ...percussionNotes,
  ].filter(note => selectedParts.includes(note.instrument));

  const totalColumns = 200; // A fixed width for the score view
  const pitchRange = MAX_PITCH - MIN_PITCH;

  const renderNote = (note: NoteEvent, index: number) => {
    const x = (note.startColumn / totalColumns) * 100;
    const width = (note.durationInColumns / totalColumns) * 100;
    
    // Normalize pitch to a 0-1 range
    const yPercentage = 1 - ((note.pitch - MIN_PITCH) / pitchRange);
    const y = yPercentage * 100;

    // --- FIX: Use the color from our NOTE_COLORS map ---
    const color = NOTE_COLORS[note.instrument];

    return (
      <rect
        key={`${note.instrument}-${index}-${note.startColumn}`}
        x={`${x}%`}
        y={`${y - 1}%`} // Center the note a bit
        width={`${width}%`}
        height="2%"
        fill={color}
        rx="1"
        ry="1"
        className="transition-opacity duration-300"
        opacity={note.startColumn > currentColumn ? 0.5 : 1}
      />
    );
  };

  return (
    <div className="w-full h-full bg-black/30 rounded-lg p-2 relative overflow-hidden">
      <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        {/* Staff Lines */}
        {[...Array(5)].map((_, i) => (
          <line
            key={`staff-${i}`}
            x1="0"
            y1={`${20 + i * 15}%`}
            x2="100%"
            y2={`${20 + i * 15}%`}
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth="0.5"
          />
        ))}

        {/* Notes */}
        {allNotes.map(renderNote)}

        {/* Playhead */}
        <line
          x1={`${(currentColumn / totalColumns) * 100}%`}
          y1="0"
          x2={`${(currentColumn / totalColumns) * 100}%`}
          y2="100%"
          stroke="#06b6d4" // Cyan-500
          strokeWidth="0.8"
          shapeRendering="crispEdges"
        />
      </svg>
    </div>
  );
};

export default MusicScore;