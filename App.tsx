import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AnalysisResult, AudioParams } from './types';
import { analyzeArtwork } from './services/geminiService';
import { audioEngine } from './services/audioService';
import ArtVisualizer from './components/ArtVisualizer';
import MusicScore, { NoteEvent } from './components/MusicScore';
import { Button, FileUpload, Card, Slider, Select } from './components/ui.tsx';

// Icons
const PlayIcon = () => <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>;
const StopIcon = () => <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" /></svg>;
const RefreshIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
const CubeIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>;
const ChevronDownIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
const ChevronUpIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>;

import { 
  SCAN_COLUMNS, 
  SCAN_ROWS, 
  MIN_SCAN_WIDTH, 
  MAX_SCAN_WIDTH,
  BRIGHTNESS_THRESHOLD,
  BASS_REGION_MULTIPLIER,
  BASS_TRIGGER_INTERVAL,
  HARMONY_TRIGGER_INTERVAL,
  HARMONY_BRIGHTNESS_THRESHOLD,
  MELODY_REGION_MULTIPLIER,
  MELODY_TRIGGER_INTERVAL,
  PITCH_DIFFERENCE_THRESHOLD,
  PERCUSSION_BRIGHTNESS_SPIKE_THRESHOLD,
  COLUMNS_PER_BEAT,
  SCORE_RENDER_THROTTLE
} from './constants';

interface GridData {
  r: number;
  g: number;
  b: number;
  brightness: number; // 0-1
  originalRowIndex: number; // Keep track of pitch after sorting
}


type Instrument = AudioParams['instrument'];

function App() {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loadingMsg, setLoadingMsg] = useState("Analyzing...");
  const [scanPos, setScanPos] = useState(0); // 0.0 to 1.0
  const [userTempo, setUserTempo] = useState(120);
  const [selectedInstruments, setSelectedInstruments] = useState<{
    melody: Instrument;
    bass: Instrument;
    harmony: Instrument;
    percussion: Instrument;
  }>({
    melody: 'synth',
    bass: 'bass',
    harmony: 'pad',
    percussion: '8-bit',
  });
  const [visualIntensity, setVisualIntensity] = useState(1.5); // Multiplier for 3D jump height
  const [isControlsVisible, setIsControlsVisible] = useState(true);

  // State for the musical score
  const melodyScoreRef = useRef<NoteEvent[]>([]);
  const bassScoreRef = useRef<NoteEvent[]>([]);
  const harmonyScoreRef = useRef<NoteEvent[]>([]);
  const percussionScoreRef = useRef<NoteEvent[]>([]);
  const activeNoteRef = useRef<{ melody: NoteEvent | null, bass: NoteEvent | null }>({ melody: null, bass: null });
  const [selectedParts, setSelectedParts] = useState<string[]>(['melody', 'bass', 'harmony', 'percussion']);
  const [scoreVersion, setScoreVersion] = useState(0); // Used to trigger score re-renders
  const lastRenderTimeRef = useRef(0);

    const scanPosRef = useRef(0);

  

    // Refs for animation loop

    const requestRef = useRef<number>(0);

    const lastTimeRef = useRef<number>(0);

    const gridDataRef = useRef<GridData[][]>([]);

    const currentColumnRef = useRef<number>(0);

    const scanWidthRef = useRef<number>(SCAN_COLUMNS); 

    const lastColumnBrightnessRef = useRef<number>(0); // For percussion

  

    // Refs for holding notes to create rhythmic variation ("Tied Notes")

    const heldMelodyNoteRef = useRef<{ yPos: number } | null>(null);

    const heldBassNoteRef = useRef<{ yPos: number } | null>(null);

    const canvasRef = useRef<HTMLCanvasElement>(null);

  // Analyze the pixel data of the image to create a "Music Score"
  const extractImageGrid = (src: string) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Dynamic Width Calculation based on Aspect Ratio
      // If wide image: longer song. If tall image: shorter song.
      const aspect = img.width / img.height;
      let dynamicWidth = Math.floor(SCAN_COLUMNS * aspect);
      
      // Clamp width to reasonable limits (Min 512 for ~30s, Max 2048 for ~2mins)
      dynamicWidth = Math.max(MIN_SCAN_WIDTH, Math.min(MAX_SCAN_WIDTH, dynamicWidth));
      
      scanWidthRef.current = dynamicWidth;

      canvas.width = dynamicWidth;
      canvas.height = SCAN_ROWS;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      
      // Draw image scaled to our grid size
      ctx.drawImage(img, 0, 0, dynamicWidth, SCAN_ROWS);
      const imgData = ctx.getImageData(0, 0, dynamicWidth, SCAN_ROWS);
      const data = imgData.data;

      const grid: GridData[][] = [];
      
      // x = time (column), y = pitch (row)
      for (let x = 0; x < dynamicWidth; x++) {
        const column: GridData[] = [];
        for (let y = 0; y < SCAN_ROWS; y++) {
          // Pixel index
          const i = (y * dynamicWidth + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Luminance formula
          const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          
          column.push({ r, g, b, brightness, originalRowIndex: 0 }); 
        }
        // Reverse column so index 0 is bottom of image (Low Pitch)
        const reversedCol = column.reverse();
        // Update originalRowIndex after reversing so we know the true pitch
        reversedCol.forEach((cell, idx) => cell.originalRowIndex = idx);
        
        grid.push(reversedCol);
      }
      gridDataRef.current = grid;
    };
  };

  const handleFileSelect = useCallback(async (file: File): Promise<void> => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const src = e.target?.result as string;
      setImageSrc(src);
      extractImageGrid(src); // Process image for audio
      
      setState(AppState.ANALYZING);
      
      try {
        setLoadingMsg("Analyzing artwork...");
        const result = await analyzeArtwork(src);
        setAnalysis(result);
        setUserTempo(result.audioParams.tempo); // Initialize with Gemini suggestion
        // Use Gemini's suggestion for the melody instrument, keep defaults for others
        setSelectedInstruments(prev => ({
          ...prev,
          melody: result.audioParams.instrument,
        }));

        // Initialize Audio Engine with Gemini's params
        audioEngine.init();
        audioEngine.setParams(result.audioParams);
        
        setState(AppState.IDLE);
      } catch (error) {
        console.error(error);
        setState(AppState.ERROR);
      }
    };
    reader.readAsDataURL(file);
  }, []); // No dependencies, this function is self-contained

  // Sync instrument changes
  useEffect(() => {
    if (analysis) {
      // Create a new, correctly typed params object to ensure type safety.
      const newParams: AudioParams = {
        ...analysis.audioParams,
        instrument: selectedInstruments.melody,
      };
      // Update both the analysis state and the audio engine with the new params.
      setAnalysis(prev => prev ? { ...prev, audioParams: newParams } : null);
      audioEngine.setParams(newParams);
    }
  }, [selectedInstruments.melody]); // Only re-sync if the main melody instrument changes

  const playColumn = useCallback((colIndex: number) => {
    const columnData = gridDataRef.current[colIndex];
    if (!columnData || !analysis) return;

    const activeCells = columnData.filter(c => c.brightness > BRIGHTNESS_THRESHOLD);
    if (activeCells.length === 0) {
      lastColumnBrightnessRef.current = 0; // Reset percussion tracker
      return;
    }

    const density = analysis.audioParams.density;
    const totalBrightness = columnData.reduce((sum, cell) => sum + cell.brightness, 0) / columnData.length;

    // --- 1. BASS ---
    if (selectedParts.includes('bass') && colIndex % BASS_TRIGGER_INTERVAL === 0) {
      const bassRegion = activeCells.filter(c => c.originalRowIndex < SCAN_ROWS * BASS_REGION_MULTIPLIER);
      if (bassRegion.length > 0) {
        const ySum = bassRegion.reduce((sum, cell) => sum + (cell.originalRowIndex / SCAN_ROWS) * cell.brightness, 0);
        const brightSum = bassRegion.reduce((sum, cell) => sum + cell.brightness, 0);
        const avgY = ySum / brightSum;
        if (activeNoteRef.current.bass) {
          activeNoteRef.current.bass.durationInColumns = colIndex - activeNoteRef.current.bass.startColumn;
          bassScoreRef.current = [...bassScoreRef.current.slice(-20), activeNoteRef.current.bass!];
        }
        const originalInstrument = analysis.audioParams.instrument;
        audioEngine.setParams({ ...analysis.audioParams, instrument: selectedInstruments.bass });
        const midiNote = audioEngine.triggerGrain(avgY, 0.8, 100, 100, 255);
        audioEngine.setParams({ ...analysis.audioParams, instrument: originalInstrument });
        heldBassNoteRef.current = { yPos: avgY };
        if (midiNote) {
          activeNoteRef.current.bass = { startColumn: colIndex, durationInColumns: 1, pitch: midiNote, instrument: 'bass' };
        }
      } else {
        heldBassNoteRef.current = null;
      }
    }

    // --- 2. HARMONY ---
    if (selectedParts.includes('harmony') && colIndex % HARMONY_TRIGGER_INTERVAL === 0 && totalBrightness > HARMONY_BRIGHTNESS_THRESHOLD) {
      activeCells.sort((a, b) => b.brightness - a.brightness);
      const rootCell = activeCells[0];
      const yPos = rootCell.originalRowIndex / SCAN_ROWS;
      const originalInstrument = analysis.audioParams.instrument;
      audioEngine.setParams({ ...analysis.audioParams, instrument: selectedInstruments.harmony });
      const midiNote = audioEngine.triggerGrain(yPos, totalBrightness * 1.5, rootCell.r, rootCell.g, rootCell.b);
      audioEngine.setParams({ ...analysis.audioParams, instrument: originalInstrument });
      if (midiNote) {
        harmonyScoreRef.current = [...harmonyScoreRef.current.slice(-10), { startColumn: colIndex, durationInColumns: 16, pitch: midiNote, instrument: 'harmony' }];
      }
    }

    // --- 3. MELODY ---
    if (selectedParts.includes('melody') && colIndex % MELODY_TRIGGER_INTERVAL === 0) {
      const melodyRegion = activeCells.filter(c => c.originalRowIndex >= SCAN_ROWS * MELODY_REGION_MULTIPLIER);
      if (melodyRegion.length > 0) {
        let weightedYSum = 0, totalMelodyBrightness = 0, rSum = 0, gSum = 0, bSum = 0;
        melodyRegion.forEach(cell => {
          const y = cell.originalRowIndex / SCAN_ROWS; 
          weightedYSum += y * cell.brightness;
          totalMelodyBrightness += cell.brightness;
          rSum += cell.r * cell.brightness;
          gSum += cell.g * cell.brightness;
          bSum += cell.b * cell.brightness;
        });
        const avgY = weightedYSum / totalMelodyBrightness;
        const avgBrightness = totalMelodyBrightness / melodyRegion.length;
        const avgR = rSum / totalMelodyBrightness;
        const avgG = gSum / totalMelodyBrightness;
        const avgB = bSum / totalMelodyBrightness;
        const pitchDifference = heldMelodyNoteRef.current ? Math.abs(heldMelodyNoteRef.current.yPos - avgY) : 1;
        if (!heldMelodyNoteRef.current || pitchDifference > PITCH_DIFFERENCE_THRESHOLD) {
          if (activeNoteRef.current.melody) {
            activeNoteRef.current.melody.durationInColumns = colIndex - activeNoteRef.current.melody.startColumn;
            melodyScoreRef.current = [...melodyScoreRef.current.slice(-20), activeNoteRef.current.melody!];
          }
          if (Math.random() < Math.max(density, 0.5)) {
            const midiNote = audioEngine.triggerGrain(avgY, avgBrightness, avgR, avgG, avgB);
            heldMelodyNoteRef.current = { yPos: avgY };
            if (midiNote) {
              activeNoteRef.current.melody = { startColumn: colIndex, durationInColumns: 1, pitch: midiNote, instrument: 'melody' };
            }
          }
        }
      } else {
        heldMelodyNoteRef.current = null;
      }
    }

    // --- 4. PERCUSSION ---
    const brightnessSpike = selectedParts.includes('percussion') ? totalBrightness - lastColumnBrightnessRef.current : 0;
    if (brightnessSpike > PERCUSSION_BRIGHTNESS_SPIKE_THRESHOLD) {
      const originalInstrument = analysis.audioParams.instrument;
      audioEngine.setParams({ ...analysis.audioParams, instrument: selectedInstruments.percussion });
      const yPos = 0.5 + (totalBrightness * 0.2);
      const midiNote = audioEngine.triggerGrain(yPos, brightnessSpike * 2.0, 255, 255, 255);
      audioEngine.setParams({ ...analysis.audioParams, instrument: originalInstrument });
      if (midiNote) {
        percussionScoreRef.current = [...percussionScoreRef.current.slice(-20), { startColumn: colIndex, durationInColumns: 2, pitch: midiNote, instrument: 'percussion' }];
      }
    }
    lastColumnBrightnessRef.current = totalBrightness;
  }, [analysis, selectedParts, selectedInstruments]);

  const animate = useCallback((time: number) => {
    if (lastTimeRef.current === 0) {
      lastTimeRef.current = time;
    }
    
    // Delta time in seconds
    const delta = (time - lastTimeRef.current) / 1000;
    lastTimeRef.current = time;

    if (state === AppState.PLAYING && analysis) {
      const bpm = userTempo;
      const beatDuration = 60 / bpm; // Seconds per beat
      const currentScanWidth = scanWidthRef.current;
      
      // Calculate total duration. 
      // Assumption: 8 columns = 1 beat (1/8th note resolution)
      const totalDuration = beatDuration * (currentScanWidth / COLUMNS_PER_BEAT); 
      
      // Advance scan position based on time
      let nextScanPos = scanPosRef.current + (delta / totalDuration);
      if (nextScanPos > 1) {
        nextScanPos = 0; // Loop
      }
      scanPosRef.current = nextScanPos;
      setScanPos(nextScanPos);

      // Trigger Notes
      // Determine which column index corresponds to current scanPos (0-1)
      const colIndex = Math.floor(scanPosRef.current * currentScanWidth) % currentScanWidth;
      
      // If we entered a new column, play notes
      if (colIndex !== currentColumnRef.current) {
        currentColumnRef.current = colIndex;
        playColumn(colIndex);
      }

      // Throttle score re-renders to ~10fps to prevent crashing
      if (time - lastRenderTimeRef.current > SCORE_RENDER_THROTTLE) { // 100ms = 10fps
        lastRenderTimeRef.current = time;
        // This state update triggers the MusicScore component to re-draw
        setScoreVersion(v => v + 1);
      }
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [state, analysis, userTempo, playColumn]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => { 
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate]); 

  const togglePlayback = () => {
    if (state === AppState.PLAYING) {
      audioEngine.stop();
      setState(AppState.IDLE);
    } else {
      audioEngine.init();
      audioEngine.resume(); // Ensure context is running
      scanPosRef.current = 0;
      setScanPos(0);
      setState(AppState.PLAYING);
      lastTimeRef.current = 0;
    }
  };

  const reset = () => {
    audioEngine.stop();
    setState(AppState.IDLE);
    setImageSrc(null);
    setAnalysis(null);
    setScanPos(0);
    gridDataRef.current = [];
    lastColumnBrightnessRef.current = 0;
    heldMelodyNoteRef.current = null;
    heldBassNoteRef.current = null;
    melodyScoreRef.current = [];
    bassScoreRef.current = [];
    harmonyScoreRef.current = [];
    percussionScoreRef.current = [];
    activeNoteRef.current = { melody: null, bass: null };
  };

  return (
    <div className="relative w-full h-screen bg-black text-white overflow-hidden">
      <canvas ref={canvasRef} className="hidden" />
      {/* Background 3D Layer */}
      <ArtVisualizer 
        imageSrc={imageSrc} 
        scanPos={scanPos} 
        isPlaying={state === AppState.PLAYING} 
        visualIntensity={visualIntensity}
      />

      {/* UI Overlay - Using pointer-events-none on container to allow clicking through to canvas */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 z-10">
        
        {/* Header */}
        <header className="flex justify-between items-center pointer-events-auto">
          <div>
            <h1 className="text-3xl font-serif tracking-wider drop-shadow-lg">SYNESTHESIA</h1>
            <p className="text-xs text-gray-300 uppercase tracking-[0.2em] drop-shadow-md">Scan-Line Synthesis</p>
          </div>
          {imageSrc && (
            <div className="flex gap-4 items-center">
              <div className="hidden md:flex items-center gap-2 text-xs text-gray-400 bg-black/40 px-3 py-1 rounded-full border border-white/10 backdrop-blur-sm">
                <CubeIcon />
                <span>Drag to Rotate • Scroll to Zoom</span>
              </div>
              <Button variant="secondary" onClick={reset} className="text-xs py-2 px-4 backdrop-blur-md bg-black/50">
                 <RefreshIcon /> New Artwork
              </Button>
            </div>
          )}
        </header>

        {/* Center Loading/Upload State */}
        <div className="flex-1 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto">
            {!imageSrc && (
              <div className="w-full max-w-md animate-fade-in-up">
                <FileUpload onFileSelect={handleFileSelect} />
              </div>
            )}

            {state === AppState.ANALYZING && (
              <div className="text-center backdrop-blur-sm p-8 rounded-xl bg-black/30">
                <div className="w-12 h-12 border-4 border-t-white border-white/20 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-lg font-light tracking-wide animate-pulse">{loadingMsg}</p>
              </div>
            )}
            
            {state === AppState.ERROR && (
              <div className="text-center max-w-md bg-red-900/80 p-6 rounded-xl backdrop-blur-md">
                <p className="text-white mb-4">Failed to analyze artwork. Please try another file.</p>
                <Button onClick={reset}>Try Again</Button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom UI Panels */}
        {analysis && state !== AppState.ANALYZING && (
          <div className="w-full flex justify-start items-end gap-4 animate-fade-in-up pointer-events-auto">
            {/* Play Button */}
            <Button 
              onClick={togglePlayback} 
              className={`w-16 h-16 !p-0 flex items-center justify-center text-2xl shadow-[0_0_30px_rgba(255,255,255,0.3)] transition-all ${state === AppState.PLAYING ? 'bg-white/90 scale-105' : 'hover:scale-105'}`}
            >
              {state === AppState.PLAYING ? <StopIcon /> : <PlayIcon />}
            </Button>

            {/* Music Score Display */}
            <div className="w-1/3">
              <Card className="backdrop-blur-xl bg-black/70 border-white/20">
                <div className="w-full h-[180px]">
                  <MusicScore 
                    melodyNotes={melodyScoreRef.current}
                    bassNotes={bassScoreRef.current}
                    harmonyNotes={harmonyScoreRef.current}
                    percussionNotes={percussionScoreRef.current}
                    selectedParts={selectedParts}
                    onPartChange={setSelectedParts}
                    currentColumn={currentColumnRef.current} 
                  />
                </div>
              </Card>
            </div>

            {/* Controls */}
            <div className="flex-1">
              <Card className="max-w-5xl backdrop-blur-xl bg-black/70 border-white/20">
                <div className="flex flex-col gap-3">
                  {/* Top Row: Title & Progress */}
                  <div className="flex justify-between items-start gap-4 border-b border-gray-700 pb-3">
                    <div>
                      <h2 className="text-xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                        {analysis.metadata.title || "Untitled Artwork"}
                      </h2>
                      <p className="text-xs text-gray-400 uppercase tracking-wider">
                        {analysis.metadata.artistStyle || "Unknown Style"} • {analysis.audioParams.scale}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-4 items-end">
                      <Select 
                        label="Melody"
                        value={selectedInstruments.melody}
                        options={['synth', 'violin', 'flute', 'pluck', 'chime', 'organ']}
                        onChange={(val) => setSelectedInstruments(p => ({...p, melody: val as Instrument}))}
                      />
                      <Select 
                        label="Harmony"
                        value={selectedInstruments.harmony}
                        options={['pad', 'drone', 'synth', 'organ']}
                        onChange={(val) => setSelectedInstruments(p => ({...p, harmony: val as Instrument}))}
                      />
                      <Select 
                        label="Bass"
                        value={selectedInstruments.bass}
                        options={['bass', 'drone', 'synth']}
                        onChange={(val) => setSelectedInstruments(p => ({...p, bass: val as Instrument}))}
                      />
                      <Select 
                        label="Percussion"
                        value={selectedInstruments.percussion}
                        options={['8-bit', 'pluck', 'chime']}
                        onChange={(val) => setSelectedInstruments(p => ({...p, percussion: val as Instrument}))}
                      />
                    </div>
                  </div>
                  {/* Bottom Row: Controls */}
                  <div className="flex justify-between items-end gap-4">
                    <div className="flex flex-wrap gap-4 items-end">
                      <Slider 
                        label="Tempo (BPM)" 
                        value={userTempo} 
                        min={10} 
                        max={240} 
                        onChange={setUserTempo}
                        formatValue={(v) => `${Math.round(v)}`}
                      />
                      <Slider 
                        label="Jump Height" 
                        value={visualIntensity} 
                        min={0} 
                        max={5} 
                        step={0.1}
                        onChange={setVisualIntensity}
                        formatValue={(v) => v.toFixed(1)}
                      />
                    </div>
                    <div className="flex flex-col gap-1 w-1/3">
                      <span className="text-xs text-gray-500 uppercase flex justify-between">
                        <span>Scan Progress</span>
                        <span className="text-white font-mono">{Math.floor(scanPos * 100)}%</span>
                      </span>
                      <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-cyan-400 transition-all duration-75 ease-linear shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                          style={{ width: `${scanPos * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;