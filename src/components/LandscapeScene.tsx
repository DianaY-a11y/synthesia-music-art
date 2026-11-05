import { useEffect, useRef } from 'react';
import { LandscapeRenderer } from '../scenes/landscape/LandscapeRenderer';
import { useAnimationFrame } from '../hooks/useAnimationFrame';
import { useViewportSize } from '../hooks/useViewportSize';
import type { Player } from '../audio/Player';

interface Props {
  image: TexImageSource | null;
  visible: boolean;
  player: Player;
  /** how high the grains jump under the scan line */
  intensity: number;
}

/** The uploaded artwork as a field of grains that rise as the music scans across it. */
export function LandscapeScene({ image, visible, player, intensity }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<LandscapeRenderer | null>(null);
  const { width, height } = useViewportSize();

  useEffect(() => {
    const r = LandscapeRenderer.create(canvasRef.current!);
    renderer.current = r;
    return () => { r?.dispose(); renderer.current = null; };
  }, []);

  useEffect(() => {
    renderer.current?.resize(width, height, Math.min(window.devicePixelRatio || 1, 2));
  }, [width, height]);

  useEffect(() => { if (image) renderer.current?.setImage(image); }, [image]);

  useAnimationFrame(time => {
    renderer.current?.render(time, { scanPos: player.scanPos, playing: player.playing, intensity });
  }, visible && !!image);

  return <canvas ref={canvasRef} className={`layer land ${visible ? 'on' : ''}`} />;
}
