import { Vec3, clamp, easeOut } from '../../lib/math';

export interface Projector {
  readonly canvas: HTMLCanvasElement;
  project(p: Vec3): [number, number, number] | null;
  pick(): Vec3;
}

interface Node { sx: number; sy: number; state: 'open' | 'close' | 'dead'; closeAt?: number; anchor?: boolean }
interface Box extends Node { p: Vec3; size: number; ox: number; oy: number; born: number; life: number; zoom: number; no: number }
interface Link { a: Node; b: Box; born: number; dead?: boolean }

const SIZES = [54, 68, 86, 110, 140, 176, 210];
const OPEN_MS = 420, CLOSE_MS = 380;

/**
 * Small "section nn" frames that open over the bloom, show a magnified crop
 * of it, and chain together dot-to-dot with thin lines.
 */
export class InspectionBoxes {
  private ctx: CanvasRenderingContext2D;
  private boxes: Box[] = [];
  private links: Link[] = [];
  private chainHead: Node | null = null;
  private sectionNo = 36;
  private lastSpawn = 0;
  private avoid: DOMRect[] = [];
  private avoidAt = -1e9;
  private font = '"Syne Mono", monospace';

  constructor(
    private overlay: HTMLCanvasElement,
    private source: Projector,
    /** CSS selector for UI the boxes must never cover */
    private avoidSelector: string,
    /** optional element whose centre can start a chain (the dot above "upload artwork") */
    private anchorEl?: () => HTMLElement | null,
  ) {
    this.ctx = overlay.getContext('2d')!;
  }

  setFont(family: string) { this.font = family; }

  clear() { this.boxes = []; this.links = []; this.chainHead = null; }

  private refreshAvoid(now: number) {
    if (now - this.avoidAt < 200) return;
    this.avoidAt = now;
    this.avoid = [...document.querySelectorAll<HTMLElement>(this.avoidSelector)]
      .filter(el => el.offsetParent !== null)
      .map(el => el.getBoundingClientRect())
      .filter(r => r.width > 0);
  }

  private hits(x: number, y: number, w: number, h: number, m = 14) {
    return this.avoid.some(r => x < r.right + m && x + w > r.left - m && y < r.bottom + m && y + h > r.top - m);
  }

  private anchorNode(): Node | null {
    const el = this.anchorEl?.();
    if (!el || el.offsetParent === null) return null;
    return {
      anchor: true, state: 'open',
      get sx() { const r = el.getBoundingClientRect(); return r.left + r.width / 2; },
      get sy() { const r = el.getBoundingClientRect(); return r.top + r.height / 2; },
    } as Node;
  }

  private spawn(now: number) {
    this.refreshAvoid(now);
    let prev = this.chainHead && this.chainHead.state !== 'dead' ? this.chainHead : null;
    if (!prev && Math.random() < .55) prev = this.anchorNode();
    const W = innerWidth, H = innerHeight;
    for (let tries = 0; tries < 60; tries++) {
      const p = this.source.pick();
      const s = this.source.project(p);
      if (!s || s[2] > 6) continue;
      const size = SIZES[(Math.random() * SIZES.length) | 0] * (W < 900 ? .7 : 1);
      const ox = .3 + Math.random() * .4, oy = .28 + Math.random() * .44;
      const x = s[0] - size * ox, y = s[1] - size * oy;
      if (x < 8 || y < 70 || x + size > W - 8 || y + size > H - 8) continue;
      if (this.hits(x, y, size, size)) continue;
      const overlaps = this.boxes.some(b => {
        if (b.state === 'dead') return false;
        const bx = b.sx - b.size * b.ox, by = b.sy - b.size * b.oy;
        return x < bx + b.size + 10 && x + size > bx - 10 && y < by + b.size + 10 && y + size > by - 10;
      });
      if (overlaps) continue;
      if (prev) {
        const d = Math.hypot(prev.sx - s[0], prev.sy - s[1]);
        if (d < 90 || d > (prev.anchor ? 520 : 340)) continue;
      }
      const box: Box = {
        p, size, ox, oy, born: now, life: 4200 + Math.random() * 2800, zoom: 1.35 + Math.random() * .75,
        no: ++this.sectionNo, state: 'open', sx: s[0], sy: s[1],
      };
      if (this.sectionNo > 99) this.sectionNo = 10;
      this.boxes.push(box);
      if (prev) this.links.push({ a: prev, b: box, born: now });
      this.chainHead = Math.random() < .82 ? box : null;
      return;
    }
    this.chainHead = null;
  }

  /** Draw one frame. `active` false lets open boxes finish but spawns no more. */
  draw(now: number, active: boolean) {
    const ctx = this.ctx, overlay = this.overlay;
    const k = overlay.width / innerWidth;
    if (active && now - this.lastSpawn > (this.boxes.length < 2 ? 650 : 1250)) {
      this.lastSpawn = now;
      if (this.boxes.length < 5) this.spawn(now);
    }
    this.refreshAvoid(now);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);

    for (const b of this.boxes) {
      const s = this.source.project(b.p);
      if (s) { b.sx = s[0]; b.sy = s[1]; } else b.state = 'dead';
      const age = now - b.born, bx = b.sx - b.size * b.ox, by = b.sy - b.size * b.oy;
      if (b.state === 'open' && (age > b.life || !active || (age > 450 && this.hits(bx, by, b.size, b.size, 4)))) { b.state = 'close'; b.closeAt = now; }
      if (b.state === 'close' && now - (b.closeAt ?? now) > CLOSE_MS) b.state = 'dead';
    }

    // connecting lines, drawn first so the boxes sit on top
    ctx.lineWidth = 1;
    for (const L of this.links) {
      if (L.a.state === 'dead' || L.b.state === 'dead' || (L.a.anchor && !active)) { L.dead = true; continue; }
      const grow = easeOut(clamp((now - L.born) / 520, 0, 1));
      const fade = (n: Node) => n.state === 'close' ? 1 - (now - (n.closeAt ?? now)) / CLOSE_MS : 1;
      ctx.strokeStyle = `rgba(215,228,255,${.55 * clamp(Math.min(fade(L.a), fade(L.b)), 0, 1)})`;
      ctx.beginPath();
      ctx.moveTo(L.a.sx, L.a.sy);
      ctx.lineTo(L.a.sx + (L.b.sx - L.a.sx) * grow, L.a.sy + (L.b.sy - L.a.sy) * grow);
      ctx.stroke();
    }

    for (const b of this.boxes) {
      if (b.state === 'dead') continue;
      const age = now - b.born;
      const open = b.state === 'open' ? clamp(age / OPEN_MS, 0, 1) : 1 - clamp((now - (b.closeAt ?? now)) / CLOSE_MS, 0, 1);
      const stepped = Math.round(easeOut(open) * 7) / 7; // stepped, slightly glitchy reveal
      const s = b.size, x = b.sx - s * b.ox, y = b.sy - s * b.oy, revealed = s * stepped;
      if (revealed < 1) continue;
      if (b.state === 'open' && age < 140 && ((age / 35) | 0) % 2) { this.stroke(x, y, s, s, .35); continue; }

      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, s, revealed); ctx.clip();
      const cw = s / b.zoom;
      ctx.filter = 'brightness(1.35) contrast(1.08)';
      ctx.drawImage(this.source.canvas, (b.sx - cw * b.ox) * k, (b.sy - cw * b.oy) * k, cw * k, cw * k, x, y, s, s);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(70,120,230,0.38)'; ctx.fillRect(x, y, s, s);
      ctx.globalCompositeOperation = 'source-over';
      const gr = ctx.createLinearGradient(x, y, x + s, y + s);
      gr.addColorStop(0, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(10,30,90,0.18)');
      ctx.fillStyle = gr; ctx.fillRect(x, y, s, s);
      ctx.fillStyle = 'rgba(0,10,40,0.10)';
      for (let yy = y; yy < y + s; yy += 3) ctx.fillRect(x, yy, s, 1);
      ctx.restore();
      this.stroke(x, y, s, revealed, .75);

      if (stepped > .5) {
        const label = `section ${b.no}`, small = s < 70;
        ctx.font = `600 ${small ? 9 : 10.5}px ${this.font}`;
        const tw = ctx.measureText(label).width, pad = small ? 3 : 4, th = small ? 13 : 16;
        ctx.fillStyle = 'rgba(8,18,44,0.88)'; ctx.fillRect(x + 3, y + 3, tw + pad * 2, th);
        ctx.fillStyle = '#f4f7ff'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + 3 + pad, y + 3 + th / 2 + .5);
      }
      if (b.sy < y + revealed) {
        ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(190,215,255,.95)'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(b.sx, b.sy, 3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      }
    }
    this.boxes = this.boxes.filter(b => b.state !== 'dead');
    this.links = this.links.filter(l => !l.dead);
  }

  private stroke(x: number, y: number, w: number, h: number, alpha: number) {
    const ctx = this.ctx;
    ctx.strokeStyle = `rgba(205,222,255,${alpha})`; ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x) + .5, Math.round(y) + .5, Math.round(w), Math.round(h));
  }
}
