import { useRef } from 'react';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';
import { clamp } from '../../lib/math';
import { MAX_PITCH, MIN_PITCH } from '../../constants';
import type { Player } from '../../audio/Player';
import type { Part } from '../../types';

const DOT_SIZE: Record<Part, number> = { bass: 4.2, harmony: 3.6, melody: 3, percussion: 2.2 };

/**
 * The artwork's loudness across time, drawn like an EQ curve around a centre
 * line with a stippled, grain-like fill. Played notes glow as small dots and a
 * thin line marks the playhead.
 */
export function CurveView({ player, active }: { player: Player; active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stipple = useRef<{ pattern: CanvasPattern; dpr: number } | null>(null);

  useAnimationFrame(() => {
    const el = canvas.current, profile = player.score?.profile;
    if (!el || !profile?.length) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
    const c = el.getContext('2d')!;
    c.clearRect(0, 0, w, h);
    const padX = 22 * dpr, iw = w - padX * 2, mid = h * .5;

    // guides
    c.strokeStyle = 'rgba(220,230,255,.07)'; c.lineWidth = dpr;
    for (let i = 0; i <= 8; i++) { const x = padX + iw * i / 8; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    c.beginPath(); c.moveTo(0, mid); c.lineTo(w, mid); c.stroke();

    // smoothed loudness curve, as deviation from the average
    const N = 64, mean = profile.reduce((a, b) => a + b, 0) / profile.length;
    const raw: number[] = [];
    let maxDev = 1e-3;
    for (let i = 0; i <= N; i++) {
      const a = Math.floor(i / N * (profile.length - 1)), b = Math.min(profile.length - 1, a + Math.ceil(profile.length / N));
      let s = 0;
      for (let k = a; k <= b; k++) s += profile[k];
      raw.push(s / (b - a + 1) - mean);
      maxDev = Math.max(maxDev, Math.abs(raw[i]));
    }
    const pts = raw.map((d, i) => [padX + iw * i / N, mid - d / maxDev * h * .32]);
    const trace = () => {
      c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i];
        c.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      }
      c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    };
    if (!stipple.current || stipple.current.dpr !== dpr) {
      const tile = document.createElement('canvas'), s = Math.round(4 * dpr);
      tile.width = tile.height = s;
      const t = tile.getContext('2d')!;
      t.fillStyle = 'rgba(225,235,255,.55)'; t.beginPath(); t.arc(s / 2, s / 2, .8 * dpr, 0, Math.PI * 2); t.fill();
      stipple.current = { pattern: c.createPattern(tile, 'repeat')!, dpr };
    }
    c.beginPath(); c.moveTo(pts[0][0], mid); trace(); c.lineTo(pts[pts.length - 1][0], mid); c.closePath();
    c.fillStyle = stipple.current.pattern; c.fill();
    c.beginPath(); trace(); c.strokeStyle = 'rgba(235,242,255,.75)'; c.lineWidth = 1.2 * dpr; c.stroke();

    // notes
    const width = player.width;
    for (const n of [...player.notes, ...player.sounding]) {
      if (n.startColumn > player.column) continue;
      const x = padX + iw * n.startColumn / width;
      const y = h * (.12 + .76 * (1 - clamp((n.pitch - MIN_PITCH) / (MAX_PITCH - MIN_PITCH), 0, 1)));
      c.shadowColor = 'rgba(160,195,255,.9)'; c.shadowBlur = 8 * dpr;
      c.beginPath(); c.arc(x, y, DOT_SIZE[n.part] * dpr * .8, 0, Math.PI * 2); c.fillStyle = '#f4f7ff'; c.fill();
      c.shadowBlur = 0;
    }

    // playhead
    const px = padX + iw * player.scanPos;
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = dpr;
    c.beginPath(); c.moveTo(px, 0); c.lineTo(px, h); c.stroke();
  }, active);

  return <div className="wave"><canvas ref={canvas} /></div>;
}
