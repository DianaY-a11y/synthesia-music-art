import { Vec3, add, sub, cross, norm, dot3 } from '../../lib/math';
import { createProgram, floatAttribute, setLinearClamp } from '../../lib/webgl';
import { generateFlowerField, FlowerField } from './flowerField';
import { SPLAT_VERT, SPLAT_FRAG, QUAD_VERT, GLYPH_FRAG } from './shaders';
import type { Projector } from '../boxes/InspectionBoxes';

// glyphs for the character grid; sorted by ink coverage at runtime
const GLYPHS = [...new Set(' .,:;-~=+*1279o0386%9@#8&gBQ'.split(''))];
const GLYPH_SIZE = 48;
const FOV = 38 * Math.PI / 180;
const EYE: Vec3 = [0.15, 0.05, -4.2];
const TARGET: Vec3 = [0, -0.48, 0.2];

/**
 * Renders the landing bloom: gaussian splats accumulated additively into an
 * HDR buffer, then redrawn as a grid of characters that bends along the petals.
 */
export class BloomRenderer implements Projector {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private field: FlowerField;
  private splatProgram: WebGLProgram;
  private glyphProgram: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private emptyVao: WebGLVertexArrayObject;
  private hdr: boolean;
  private fbo: WebGLFramebuffer | null = null;
  private target: WebGLTexture | null = null;
  private glyphTex: WebGLTexture;
  private glyphCount = 0;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private morph = 0;
  private spin = 0;
  private eye: Vec3 = EYE;
  private basis = { r: [1, 0, 0] as Vec3, u: [0, 1, 0] as Vec3, f: [0, 0, 1] as Vec3 };
  private rotation = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private u: Record<string, WebGLUniformLocation | null>;

  static create(canvas: HTMLCanvasElement): BloomRenderer | null {
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: false });
    return gl ? new BloomRenderer(canvas, gl) : null;
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.field = generateFlowerField();
    this.splatProgram = createProgram(gl, SPLAT_VERT, SPLAT_FRAG);
    this.glyphProgram = createProgram(gl, QUAD_VERT, GLYPH_FRAG);
    const s = (n: string) => gl.getUniformLocation(this.splatProgram, n);
    const g = (n: string) => gl.getUniformLocation(this.glyphProgram, n);
    this.u = {
      R: s('uR'), eye: s('uEye'), vp: s('uVp'), f: s('uF'), t: s('uT'), center: s('uCenter'), morph: s('uMorph'),
      tex: g('uTex'), exp: g('uExp'), dim: g('uDim'), gt: g('uT'), gvp: g('uVp'), glyph: g('uGlyph'), gn: g('uGlyphN'), cell: g('uCell'),
    };
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    floatAttribute(gl, 0, new Float32Array([-2, -2, 2, -2, -2, 2, 2, 2]), 2);
    floatAttribute(gl, 1, this.field.positions, 3, 1);
    floatAttribute(gl, 2, this.field.covA, 3, 1);
    floatAttribute(gl, 3, this.field.covB, 3, 1);
    floatAttribute(gl, 4, this.field.colors, 4, 1);
    this.emptyVao = gl.createVertexArray()!;
    this.hdr = !!gl.getExtension('EXT_color_buffer_float');
    this.glyphTex = gl.createTexture()!;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number) {
    const gl = this.gl;
    this.dpr = dpr;
    this.width = this.canvas.width = Math.floor(cssWidth * dpr);
    this.height = this.canvas.height = Math.floor(cssHeight * dpr);
    if (this.target) gl.deleteTexture(this.target);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    this.target = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.target);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.hdr ? gl.RGBA16F : gl.RGBA8, this.width, this.height, 0, gl.RGBA, this.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    setLinearClamp(gl);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.target, 0);
  }

  /** Re-draw the glyph atlas (call once web fonts have loaded). */
  rebuildAtlas() { this.glyphCount = 0; }

  private buildAtlas() {
    const gl = this.gl, S = GLYPH_SIZE;
    const family = getComputedStyle(document.body).getPropertyValue('--mono').trim() || 'monospace';
    const probe = document.createElement('canvas');
    probe.width = probe.height = S;
    const px = probe.getContext('2d', { willReadFrequently: true })!;
    const coverage = GLYPHS.map(ch => {
      px.clearRect(0, 0, S, S);
      px.fillStyle = '#fff'; px.font = `600 ${S * .78}px ${family}`; px.textAlign = 'center'; px.textBaseline = 'middle';
      px.fillText(ch, S / 2, S / 2 + 2);
      const d = px.getImageData(0, 0, S, S).data;
      let ink = 0; for (let i = 0; i < d.length; i += 4) ink += d[i];
      return { ch, ink };
    }).sort((a, b) => a.ink - b.ink);
    const atlas = document.createElement('canvas');
    atlas.width = S * coverage.length; atlas.height = S;
    const ax = atlas.getContext('2d')!;
    ax.fillStyle = '#fff'; ax.font = `600 ${S * .78}px ${family}`; ax.textAlign = 'center'; ax.textBaseline = 'middle';
    coverage.forEach(({ ch }, i) => ax.fillText(ch, i * S + S / 2, S / 2 + 2));
    gl.bindTexture(gl.TEXTURE_2D, this.glyphTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    setLinearClamp(gl);
    this.glyphCount = coverage.length;
  }

  /** slow orbit + pointer parallax around a fixed framing; `spin` turns it while creating */
  private updateCamera(t: number, pointer: [number, number]) {
    const rel = sub(EYE, TARGET);
    const ang = Math.sin(t * .00009) * .14 + pointer[0] * .22 + this.spin;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    this.eye = add(TARGET, [rel[0] * ca - rel[2] * sa, rel[1] - pointer[1] * .35 + Math.sin(t * .00013) * .06, rel[0] * sa + rel[2] * ca]);
    const f = norm(sub(TARGET, this.eye)), r = norm(cross([0, 1, 0], f)), u = cross(f, r);
    this.basis = { r, u, f };
    this.rotation = [r[0], u[0], f[0], r[1], u[1], f[1], r[2], u[2], f[2]];
  }

  /** world point → CSS pixels (x, y, depth), or null if behind the camera */
  project(p: Vec3): [number, number, number] | null {
    const d = sub(p, this.eye), z = dot3(this.basis.f, d);
    if (z < .2) return null;
    const w = this.width / this.dpr, h = this.height / this.dpr;
    const F = (h * .5) / Math.tan(FOV / 2);
    return [w * .5 + F * dot3(this.basis.r, d) / z, h * .5 - F * dot3(this.basis.u, d) / z, z];
  }

  pick(): Vec3 {
    const f = this.field.features;
    return f[(Math.random() * f.length) | 0];
  }

  render(t: number, pointer: [number, number], creating: boolean) {
    const gl = this.gl, u = this.u;
    // petals ripple and the view turns while "creating..."
    this.morph += ((creating ? 1 : 0) - this.morph) * .04;
    this.spin += this.morph * .006;
    this.updateCamera(t, pointer);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.splatProgram); gl.bindVertexArray(this.vao);
    gl.uniformMatrix3fv(u.R, false, this.rotation);
    gl.uniform3fv(u.eye, this.eye);
    gl.uniform2f(u.vp, this.width, this.height);
    gl.uniform1f(u.f, (this.height * .5) / Math.tan(FOV / 2));
    gl.uniform1f(u.t, t * .001);
    gl.uniform3fv(u.center, this.field.center);
    gl.uniform1f(u.morph, this.morph);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.field.count);

    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.glyphProgram); gl.bindVertexArray(this.emptyVao);
    if (!this.glyphCount) this.buildAtlas();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.target); gl.uniform1i(u.tex, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.glyphTex); gl.uniform1i(u.glyph, 1);
    gl.uniform1f(u.exp, this.hdr ? 1.7 : 1.3);
    gl.uniform1f(u.dim, .95);
    gl.uniform1f(u.gt, (t * .001) % 1000);
    gl.uniform2f(u.gvp, this.width, this.height);
    gl.uniform1f(u.gn, this.glyphCount);
    gl.uniform1f(u.cell, 9.5 * this.dpr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Free GPU buffers. The context itself stays with the canvas so it can be reused. */
  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.splatProgram); gl.deleteProgram(this.glyphProgram);
    gl.deleteVertexArray(this.vao); gl.deleteVertexArray(this.emptyVao);
    gl.deleteTexture(this.glyphTex); gl.deleteTexture(this.target); gl.deleteFramebuffer(this.fbo);
  }
}
