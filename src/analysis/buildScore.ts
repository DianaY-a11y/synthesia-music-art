import {
  BRIGHTNESS_THRESHOLD, COLUMNS_PER_BEAT, MAX_SCAN_WIDTH, MIN_SCAN_WIDTH, SCAN_COLUMNS, SCAN_ROWS,
} from '../constants';
import type { GridCell, Score } from '../types';

type Source = HTMLImageElement | HTMLCanvasElement;
const lum = (d: Uint8ClampedArray, i: number) => (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;

/**
 * Crop away the edges of the artwork that are too dark to make any sound,
 * so a piece doesn't open or close with a long stretch of nothing.
 */
export function trimArtwork(image: Source): Source {
  const SW = 256, SH = SCAN_ROWS;
  const c = document.createElement('canvas');
  c.width = SW; c.height = SH;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(image, 0, 0, SW, SH);
  const d = x.getImageData(0, 0, SW, SH).data;
  const colOn = new Array(SW).fill(0), rowOn = new Array(SH).fill(0);
  for (let yy = 0; yy < SH; yy++) for (let xx = 0; xx < SW; xx++) {
    if (lum(d, (yy * SW + xx) * 4) > BRIGHTNESS_THRESHOLD) { colOn[xx]++; rowOn[yy]++; }
  }
  let L = colOn.findIndex(v => v > 0), R = SW - 1 - [...colOn].reverse().findIndex(v => v > 0);
  let T = rowOn.findIndex(v => v > 1), B = SH - 1 - [...rowOn].reverse().findIndex(v => v > 1);
  if (L < 0 || R - L < SW * .08) return image;        // nothing (or almost nothing) audible: keep it whole
  if (T < 0 || B - T < 3) { T = 0; B = SH - 1; }
  const margin = Math.round(SW * .015);
  L = Math.max(0, L - margin); R = Math.min(SW - 1, R + margin);
  T = Math.max(0, T - 1); B = Math.min(SH - 1, B + 1);

  const w = image.width, h = image.height;
  const sx = L / SW * w, sw = (R - L + 1) / SW * w, sy = T / SH * h, sh = (B - T + 1) / SH * h;
  if (sw > w * .97 && sh > h * .97) return image;
  const out = document.createElement('canvas');
  out.width = Math.round(sw); out.height = Math.round(sh);
  out.getContext('2d')!.drawImage(image, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

/** Sample the artwork into a grid: columns are time, rows are pitch (row 0 = bottom = low). */
export function buildScore(image: Source): Score {
  const width = Math.max(MIN_SCAN_WIDTH, Math.min(MAX_SCAN_WIDTH, Math.floor(SCAN_COLUMNS * image.width / image.height)));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = SCAN_ROWS;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, width, SCAN_ROWS);
  const data = ctx.getImageData(0, 0, width, SCAN_ROWS).data;

  const grid: GridCell[][] = [];
  for (let x = 0; x < width; x++) {
    const column: GridCell[] = [];
    for (let y = SCAN_ROWS - 1; y >= 0; y--) {
      const i = (y * width + x) * 4;
      column.push({ r: data[i], g: data[i + 1], b: data[i + 2], brightness: lum(data, i), row: SCAN_ROWS - 1 - y });
    }
    grid.push(column);
  }

  const profile = grid.map(col => col.reduce((s, c) => s + c.brightness, 0) / col.length);

  // silences longer than two beats: keep the first beat as a rest, glide through the rest
  const audible = grid.map(col => col.some(c => c.brightness > BRIGHTNESS_THRESHOLD));
  const skip = new Array(width).fill(false);
  for (let i = 0; i < width;) {
    if (audible[i]) { i++; continue; }
    let j = i;
    while (j < width && !audible[j]) j++;
    if (j - i > COLUMNS_PER_BEAT * 2) for (let k = i + COLUMNS_PER_BEAT; k < j - 2; k++) skip[k] = true;
    i = j;
  }
  return { grid, profile, skip };
}
