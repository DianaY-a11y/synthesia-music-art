import { useEffect, useRef } from 'react';
import { BloomRenderer } from '../scenes/bloom/BloomRenderer';
import { InspectionBoxes } from '../scenes/boxes/InspectionBoxes';
import { useAnimationFrame } from '../hooks/useAnimationFrame';
import { useViewportSize } from '../hooks/useViewportSize';

interface Props {
  visible: boolean;
  /** petals ripple and the view turns while the artwork is being read */
  creating: boolean;
}

const AVOID = 'h1, .hdr-r, .upload, .analyzing, .error, .dock';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The landing bloom plus the floating "section" boxes that inspect it. */
export function BloomScene({ visible, creating }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<BloomRenderer | null>(null);
  const boxes = useRef<InspectionBoxes | null>(null);
  const pointer = useRef<[number, number]>([0, 0]);
  const smoothed = useRef<[number, number]>([0, 0]);
  const { width, height } = useViewportSize();

  useEffect(() => {
    const canvas = canvasRef.current!, overlay = overlayRef.current!;
    const r = BloomRenderer.create(canvas);
    if (!r) return;
    renderer.current = r;
    boxes.current = new InspectionBoxes(overlay, r, AVOID, () => document.getElementById('up-dot'));
    // redraw the character atlas once Syne Mono has loaded
    document.fonts?.ready.then(() => r.rebuildAtlas());
    const onMove = (e: PointerEvent) => { pointer.current = [e.clientX / innerWidth - .5, e.clientY / innerHeight - .5]; };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      r.dispose();
      renderer.current = null;
      boxes.current = null;
    };
  }, []);

  useEffect(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    renderer.current?.resize(width, height, dpr);
    const overlay = overlayRef.current!;
    overlay.width = Math.floor(width * dpr);
    overlay.height = Math.floor(height * dpr);
  }, [width, height]);

  useEffect(() => { if (!visible || creating) boxes.current?.clear(); }, [visible, creating]);

  useAnimationFrame(time => {
    const s = smoothed.current, p = pointer.current;
    s[0] += (p[0] - s[0]) * .05; s[1] += (p[1] - s[1]) * .05;
    renderer.current?.render(time, s, creating);
    boxes.current?.draw(time, !creating && !reducedMotion);
  }, visible);

  return (
    <>
      <canvas ref={canvasRef} className={`layer bloom ${visible ? '' : 'off'}`} />
      <canvas ref={overlayRef} className="layer fx" />
    </>
  );
}
