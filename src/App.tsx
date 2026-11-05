import { useCallback, useEffect, useRef, useState } from 'react';
import { Player } from './audio/Player';
import { buildScore, trimArtwork } from './analysis/buildScore';
import { readArtwork } from './analysis/readArtwork';
import { BloomScene } from './components/BloomScene';
import { LandscapeScene } from './components/LandscapeScene';
import { Header } from './components/Header';
import { UploadPrompt } from './components/UploadPrompt';
import { Creating, ErrorState } from './components/StatusMessages';
import { ControlPanel } from './components/ControlPanel/ControlPanel';
import { useAnimationFrame } from './hooks/useAnimationFrame';
import { clamp } from './lib/math';
import type { Instrument, Mood, Part } from './types';

type Phase = 'landing' | 'creating' | 'listening' | 'error';

const CREATING_MS = 1600;   // a short, unhurried "creating..." moment
const AUTOPLAY_MS = 900;    // let the landscape fade in before the music starts

const loadImage = (file: File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = url;
});

const readCollapsed = () => { try { return localStorage.getItem('syn-dock') === '1'; } catch { return false; } };

export default function App() {
  const player = useRef<Player>(null as unknown as Player);
  if (!player.current) player.current = new Player();
  const p = player.current;

  const [phase, setPhase] = useState<Phase>('landing');
  const [artwork, setArtwork] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [mood, setMood] = useState<Mood>(p.mood);
  const [instruments, setInstruments] = useState(p.instruments);
  const [volumes, setVolumes] = useState(p.volumes);
  const [tempo, setTempo] = useState(p.tempo);
  const [height, setHeight] = useState(1.5);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const session = useRef(0); // ignores late results after "new artwork"

  // the playback clock
  useAnimationFrame((_, dt) => p.tick(dt), phase === 'listening');

  const syncFromPlayer = useCallback(() => {
    setMood(p.mood); setInstruments(p.instruments); setVolumes(p.volumes); setTempo(p.tempo); setPlaying(p.playing);
  }, [p]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const id = ++session.current;
    try {
      const image = await loadImage(file);
      const art = trimArtwork(image);
      const score = buildScore(art);
      setArtwork(art);
      setPhase('creating');
      await new Promise(r => setTimeout(r, CREATING_MS));
      if (id !== session.current) return;
      p.load(score, readArtwork(art));
      syncFromPlayer();
      setPhase('listening');
      setTimeout(() => {
        if (id === session.current && !p.playing) { p.play(); setPlaying(true); }
      }, AUTOPLAY_MS);
    } catch (err) {
      console.error(err);
      if (id === session.current) setPhase('error');
    }
  }, [p, syncFromPlayer]);

  const reset = useCallback(() => {
    session.current++;
    p.stop();
    setArtwork(null);
    setPlaying(false);
    setPhase('landing');
  }, [p]);

  const togglePlay = useCallback(() => {
    if (p.playing) p.pause(); else p.play();
    setPlaying(p.playing);
  }, [p]);

  const changeMood = (m: Mood) => { p.applyMood(m); syncFromPlayer(); };
  const changeInstrument = (part: Part, i: Instrument) => { p.setInstrument(part, i); setInstruments(p.instruments); };
  const changeVolume = (part: Part, v: number) => { p.setVolume(part, v); setVolumes(p.volumes); };
  const changeTempo = (bpm: number) => { p.setTempo(bpm); setTempo(p.tempo); };
  const changeHeight = (h: number) => setHeight(clamp(h, 0, 5));
  const changeCollapsed = (c: boolean) => {
    setCollapsed(c);
    try { localStorage.setItem('syn-dock', c ? '1' : '0'); } catch { /* storage unavailable */ }
  };

  // keyboard: space plays/pauses, c collapses the panel
  useEffect(() => {
    if (phase !== 'listening') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, button, [role="slider"]')) return;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      if (e.key === 'c') setCollapsed(c => !c);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, togglePlay]);

  useEffect(() => () => p.pause(), [p]);

  const onLanding = phase === 'landing' || phase === 'creating' || phase === 'error';

  return (
    <>
      <BloomScene visible={onLanding} creating={phase === 'creating'} />
      <LandscapeScene image={artwork} visible={phase === 'listening'} player={p} intensity={height} />

      <div className="ui">
        <Header showActions={!!artwork && phase !== 'error'} onNewArtwork={reset} />
        <div className="center">
          {phase === 'landing' && <UploadPrompt onFile={handleFile} onGesture={() => p.unlock()} />}
          {phase === 'creating' && <Creating />}
          {phase === 'error' && <ErrorState onRetry={reset} />}
        </div>
      </div>

      {phase === 'listening' && (
        <ControlPanel
          player={p}
          playing={playing}
          mood={mood}
          instruments={instruments}
          volumes={volumes}
          tempo={tempo}
          height={height}
          collapsed={collapsed}
          onTogglePlay={togglePlay}
          onMood={changeMood}
          onInstrument={changeInstrument}
          onVolume={changeVolume}
          onTempo={changeTempo}
          onHeight={changeHeight}
          onCollapse={changeCollapsed}
        />
      )}
    </>
  );
}
