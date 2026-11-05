import { Vec3, clamp, mat4 } from '../../lib/math';
import { createProgram, floatAttribute, setLinearClamp } from '../../lib/webgl';
import { GRAIN_VERT, GRAIN_FRAG } from './shaders';

// 600 × 500 grains over a 16 × 12 plane, like the original ArtVisualizer
const COLUMNS = 600, ROWS = 500, PLANE_W = 16, PLANE_H = 12;
const START = { theta: 0, phi: Math.acos(-2 / Math.hypot(2, 10)), r: Math.hypot(2, 10) }; // camera at [0, -2, 10]

export interface LandscapeFrame { scanPos: number; playing: boolean; intensity: number }

/** The artwork as a field of grains, with drag-to-rotate and scroll-to-zoom. */
export class LandscapeRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private texture: WebGLTexture;
  private count = COLUMNS * ROWS;
  private u: Record<string, WebGLUniformLocation | null>;
  private orbit = { ...START };
  private goal = { ...START };
  private drag: [number, number] | null = null;
  private cleanup: () => void;

  static create(canvas: HTMLCanvasElement): LandscapeRenderer | null {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    return gl ? new LandscapeRenderer(canvas, gl) : null;
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.program = createProgram(gl, GRAIN_VERT, GRAIN_FRAG);
    const U = (n: string) => gl.getUniformLocation(this.program, n);
    this.u = { proj: U('uProj'), view: U('uView'), time: U('uTime'), scan: U('uScanPos'), play: U('uIsPlaying'), intensity: U('uIntensity'), grain: U('uGrain'), tex: U('uTexture') };

    const base = new Float32Array(this.count * 3), uvs = new Float32Array(this.count * 2);
    let i = 0;
    for (let iy = 0; iy < ROWS; iy++) for (let ix = 0; ix < COLUMNS; ix++) {
      const uu = ix / (COLUMNS - 1), vv = iy / (ROWS - 1);
      base[i * 3] = (uu - .5) * PLANE_W; base[i * 3 + 1] = (vv - .5) * PLANE_H;
      uvs[i * 2] = uu; uvs[i * 2 + 1] = vv;
      i++;
    }
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    floatAttribute(gl, 0, new Float32Array([-.5, -.5, .5, -.5, -.5, .5, .5, .5]), 2);
    floatAttribute(gl, 1, base, 3, 1);
    floatAttribute(gl, 2, uvs, 2, 1);
    this.texture = gl.createTexture()!;

    // orbit controls with damping
    const down = (e: PointerEvent) => { this.drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!this.drag) return;
      this.goal.theta -= (e.clientX - this.drag[0]) * .006;
      this.goal.phi = clamp(this.goal.phi - (e.clientY - this.drag[1]) * .006, .02, Math.PI - .02);
      this.drag = [e.clientX, e.clientY];
    };
    const up = () => { this.drag = null; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); this.goal.r = clamp(this.goal.r * (1 + e.deltaY * .001), 2, 40); };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    this.cleanup = () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      canvas.removeEventListener('wheel', wheel);
    };
  }

  resize(cssWidth: number, cssHeight: number, dpr: number) {
    this.canvas.width = Math.floor(cssWidth * dpr);
    this.canvas.height = Math.floor(cssHeight * dpr);
  }

  setImage(image: TexImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    setLinearClamp(gl);
    this.orbit = { ...START };
    this.goal = { ...START };
  }

  render(t: number, frame: LandscapeFrame) {
    const gl = this.gl, u = this.u, o = this.orbit, g = this.goal;
    o.theta += (g.theta - o.theta) * .08; o.phi += (g.phi - o.phi) * .08; o.r += (g.r - o.r) * .08;
    const eye: Vec3 = [o.r * Math.sin(o.phi) * Math.sin(o.theta), o.r * Math.cos(o.phi), o.r * Math.sin(o.phi) * Math.cos(o.theta)];
    const proj = mat4.perspective(60 * Math.PI / 180, this.canvas.width / this.canvas.height, .1, 100);
    const view = mat4.lookAt(eye, [0, 0, 0], [0, 1, 0]);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(.008, .016, .04, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(this.program); gl.bindVertexArray(this.vao);
    gl.uniformMatrix4fv(u.proj, false, proj);
    gl.uniformMatrix4fv(u.view, false, view);
    gl.uniform1f(u.time, t * .001);
    gl.uniform1f(u.scan, frame.scanPos);
    gl.uniform1f(u.play, frame.playing ? 1 : 0);
    gl.uniform1f(u.intensity, frame.intensity);
    gl.uniform2f(u.grain, (PLANE_W / COLUMNS) * .5, (PLANE_H / ROWS) * .5);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texture); gl.uniform1i(u.tex, 0);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
  }

  dispose() {
    this.cleanup();
    this.gl.deleteProgram(this.program); this.gl.deleteVertexArray(this.vao); this.gl.deleteTexture(this.texture);
  }
}
