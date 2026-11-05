import { clamp } from '../lib/math';
import type { ArtworkReading, Scale } from '../types';

/**
 * Reads simple visual cues straight from the pixels — brightness, colour,
 * texture — and turns them into musical starting points. No AI, no network.
 */
export function readArtwork(image: CanvasImageSource): ArtworkReading {
  const W = 64, H = 48;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;

  const lum = (i: number) => (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
  let brightness = 0, saturation = 0, warmth = 0, texture = 0;
  const n = W * H;
  for (let p = 0; p < n; p++) {
    const i = p * 4, r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    brightness += lum(i);
    saturation += mx ? (mx - mn) / mx : 0;
    warmth += r - b;
    if (p % W < W - 1) texture += Math.abs(lum(i) - lum(i + 4)); // neighbour contrast
  }
  brightness /= n; saturation /= n; warmth /= n; texture /= n;

  const chaotic = texture > .09, dark = brightness < .32, calm = texture < .045;
  const scale: Scale = chaotic ? (warmth > 0 ? 'chromatic' : 'wholetone') : dark ? 'minor' : calm ? 'pentatonic' : 'major';

  return {
    tempo: Math.round(clamp(62 + texture * 520 + brightness * 18, 60, 140)),
    scale,
    density: clamp(.3 + saturation * .7, 0, 1),
    darkness: clamp(1 - brightness / .32, 0, 1),
  };
}
