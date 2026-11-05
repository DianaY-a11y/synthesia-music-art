import { Vec3, add, sub, mul, cross, norm, mix3, clamp, seededRandom } from '../../lib/math';

/**
 * Builds the landing bloom as a cloud of 3D gaussian splats.
 * Each splat has a centre, an anisotropic covariance (stored as two vec3s:
 * xx xy xz / yy yz zz) and a colour + opacity.
 */
export interface FlowerField {
  positions: Float32Array;
  covA: Float32Array;
  covB: Float32Array;
  colors: Float32Array;
  count: number;
  /** points on the petals the inspection boxes can anchor to */
  features: Vec3[];
  center: Vec3;
}

interface Layer { n: number; L: number; W: number; elev: number; curl: number; cup: number; ruffle?: number }
interface FlowerType { layers: Layer[]; profile: (u: number) => number; center: number; stamens: number; nu: number; nv: number; veins: number; fill: boolean }
interface SurfaceOptions {
  L: number; W: number; elev: number; curl: number; cup: number; ruffle?: number; phase: number; tone?: number;
  profile: (u: number) => number; nu: number; nv: number; veins: number; thick: number;
  c0: Vec3; c1: Vec3; c2: Vec3; alpha: number; fill?: boolean;
}

// strictly blue
const DEEP: Vec3 = [0.06, 0.20, 0.95];
const MID: Vec3 = [0.26, 0.52, 1.00];
const PALE: Vec3 = [0.72, 0.86, 1.00];
const ICE: Vec3 = [0.90, 0.96, 1.00];

const petalProfile = (u: number) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.55);
const leafProfile = (u: number) => Math.pow(Math.sin(Math.PI * u), 0.9) * (1 - 0.35 * u);

const POPPY: FlowerType = {
  layers: [
    { n: 5, L: 1.0, W: 1.15, elev: .32, curl: .75, cup: .40, ruffle: .42 },
    { n: 4, L: .80, W: 1.05, elev: .72, curl: .85, cup: .45, ruffle: .36 },
  ],
  profile: petalProfile, center: .13, stamens: 60, nu: 40, nv: 22, veins: 0, fill: true,
};

export function generateFlowerField(): FlowerField {
  const { rnd, range: rr } = seededRandom(20261104);
  const pos: number[] = [], covA: number[] = [], covB: number[] = [], col: number[] = [];
  const features: Vec3[] = [];

  function splat(p: Vec3, t: Vec3, b: Vec3, n: Vec3, st: number, sb: number, sn: number, c: Vec3, a: number) {
    const s1 = st * st, s2 = sb * sb, s3 = sn * sn;
    const cv = (i: number, j: number) => t[i] * t[j] * s1 + b[i] * b[j] * s2 + n[i] * n[j] * s3;
    pos.push(p[0], p[1], p[2]);
    covA.push(cv(0, 0), cv(0, 1), cv(0, 2));
    covB.push(cv(1, 1), cv(1, 2), cv(2, 2));
    col.push(c[0], c[1], c[2], a);
  }
  const blob = (p: Vec3, s: number, c: Vec3, a: number) => splat(p, [1, 0, 0], [0, 1, 0], [0, 0, 1], s, s, s, c, a);

  /** A parametric curled surface, used for petals and leaves.
   *  O origin, D length dir, Pp width dir, U lift dir. */
  function surface(O: Vec3, D: Vec3, Pp: Vec3, U: Vec3, o: SurfaceOptions) {
    const cvv = Math.abs(o.curl) < 1e-3 ? 1e-3 : o.curl;
    const pt = (u: number, v: number): Vec3 => {
      const ph = o.elev + cvv * u;
      const x = o.L * (Math.sin(ph) - Math.sin(o.elev)) / cvv;
      const z = o.L * (Math.cos(o.elev) - Math.cos(ph)) / cvv;
      const w = o.W * o.profile(u);
      const ruffle = o.ruffle ? Math.sin(v * 7 + u * 5 + o.phase) * o.ruffle * w * u : 0;
      const yy = v * w, zz = z + o.cup * v * v * w + ruffle;
      return [O[0] + D[0] * x + Pp[0] * yy + U[0] * zz, O[1] + D[1] * x + Pp[1] * yy + U[1] * zz, O[2] + D[2] * x + Pp[2] * yy + U[2] * zz];
    };
    for (let i = 0; i < o.nu; i++) for (let j = 0; j < o.nv; j++) {
      const u = clamp((i + rnd()) / o.nu, 0.015, 0.985);
      const v = -1 + 2 * (j + rnd()) / o.nv;
      const w = o.W * o.profile(u);
      if (w < 0.0015) continue;
      const p = pt(u, v);
      const tu = norm(sub(pt(u + .01, v), pt(u - .01, v)));
      const tv = sub(pt(u, v + .03), pt(u, v - .03));
      const n = norm(cross(tu, tv), U);
      const bv = norm(cross(n, tu), Pp);
      const edge = Math.pow(Math.abs(v), 5);
      const vein = Math.exp(-Math.pow(v * 5, 2));
      const f = o.fill
        ? clamp(0.5 + (o.tone ?? 0) + 0.22 * (1 - Math.abs(v)) - 0.25 * Math.pow(u, 2) + 0.18 * Math.sin(v * 3.1 + u * 4 + o.phase) + rr(-.06, .06), 0, 1)
        : clamp(0.18 + 0.75 * edge + 0.35 * vein * (1 - u * 0.6) + 0.35 * Math.pow(u, 3), 0, 1);
      const c = f < 0.5 ? mix3(o.c0, o.c1, f * 2) : mix3(o.c1, o.c2, (f - .5) * 2);
      splat(p, tu, bv, n, o.L / o.nu * 0.85, Math.max(w * 2 / o.nv * 0.8, .002), o.thick, c, o.alpha * (0.55 + 0.8 * f));
    }
    // fine radial veins — the x-ray "bones" of the petal
    for (let k = 0; k < o.veins; k++) {
      const v0 = o.veins === 1 ? 0 : -0.75 + 1.5 * k / (o.veins - 1);
      for (let i = 0; i < o.nu * 1.4; i++) {
        const u = clamp(i / (o.nu * 1.4), 0.02, 0.96);
        const v = v0 * Math.pow(u, 0.35);
        const p = pt(u, v), tu = norm(sub(pt(u + .01, v), pt(u - .01, v)));
        const n = norm(cross(tu, sub(pt(u, v + .03), pt(u, v - .03))), U);
        splat(p, tu, norm(cross(n, tu), Pp), n, o.L / o.nu * 0.9, .0022, .002, o.c2, o.alpha * 1.1 * (1 - u * .5));
      }
    }
    features.push(pt(0.85, 0), pt(0.5, 0.4));
  }

  function flower(position: Vec3, axis: Vec3, T: FlowerType, R: number) {
    const A = norm(axis);
    const X = norm(cross(Math.abs(A[1]) < 0.92 ? [0, 1, 0] : [1, 0, 0], A));
    const Y = cross(A, X);
    const toWorld = (x: number, y: number, z: number): Vec3 => [
      position[0] + X[0] * x + Y[0] * y + A[0] * z,
      position[1] + X[1] * x + Y[1] * y + A[1] * z,
      position[2] + X[2] * x + Y[2] * y + A[2] * z,
    ];
    // petals: irregular sizes, tilts and tones so the silhouette ruffles
    T.layers.forEach((layer, li) => {
      const off = rr(0, Math.PI * 2) + li * Math.PI / layer.n;
      for (let i = 0; i < layer.n; i++) {
        const th = off + i * Math.PI * 2 / layer.n + rr(-.08, .08);
        const D = add(mul(X, Math.cos(th)), mul(Y, Math.sin(th)));
        const Pp = add(mul(X, -Math.sin(th)), mul(Y, Math.cos(th)));
        const O = add(position, mul(D, R * 0.06));
        surface(O, D, Pp, A, {
          L: R * layer.L * rr(.72, 1.18), W: R * layer.W * rr(.85, 1.15) * 0.5,
          elev: layer.elev + rr(-.08, .08) + rr(-.3, .3), curl: layer.curl + rr(-.15, .15) + rr(-.35, .35),
          cup: layer.cup, ruffle: (layer.ruffle || 0) * 1.6, phase: rr(0, 6), tone: rr(-.28, .22),
          profile: T.profile, nu: T.nu, nv: T.nv, veins: T.veins, thick: .0035,
          c0: DEEP, c1: MID, c2: PALE, alpha: .055, fill: T.fill,
        });
      }
    });
    // centre dome
    const rc = R * T.center;
    for (let k = 0; k < 420; k++) {
      const a = rr(0, Math.PI * 2), r = Math.sqrt(rnd()) * rc;
      const h = rc * 0.55 * (1 - (r / rc) ** 2) + R * .02;
      blob(toWorld(Math.cos(a) * r, Math.sin(a) * r, h), rr(.004, .009) * R / .45, mix3(MID, ICE, rnd()), .22);
    }
    // stamens — thin filaments with bright anthers
    for (let k = 0; k < T.stamens; k++) {
      const a = rr(0, Math.PI * 2), tilt = rr(.35, .9), L = R * rr(.18, .32);
      const dir = norm(add(mul(add(mul(X, Math.cos(a)), mul(Y, Math.sin(a))), Math.sin(tilt)), mul(A, Math.cos(tilt))));
      const base = toWorld(Math.cos(a) * rc * .4, Math.sin(a) * rc * .4, R * .03);
      const nrm = norm(cross(dir, A), X), bn = cross(dir, nrm);
      for (let s = 0; s < 9; s++) splat(add(base, mul(dir, L * s / 9)), dir, nrm, bn, L / 14, .0016, .0016, PALE, .16);
      blob(add(base, mul(dir, L)), R * .014, ICE, .5);
    }
    features.push(toWorld(0, 0, rc * .5));

    // stem
    const S0 = sub(position, mul(A, R * .08));
    const S1 = sub(S0, mul(A, .45));
    const S3: Vec3 = [position[0] * .55 + rr(-.25, .25), -2.6, position[2] + rr(-.2, .2)];
    const S2: Vec3 = [mix3(S1, S3, .5)[0] + rr(-.2, .2), (S1[1] + S3[1]) * .5, mix3(S1, S3, .5)[2]];
    const bezier = (t: number): Vec3 => {
      const m = 1 - t;
      return add(add(mul(S0, m * m * m), mul(S1, 3 * m * m * t)), add(mul(S2, 3 * m * t * t), mul(S3, t * t * t)));
    };
    const steps = 150, sr = .011 * R / .45 + .004;
    for (let i = 0; i < steps; i++) {
      const t = i / steps, p = bezier(t), tg = norm(sub(bezier(t + .004), p));
      const nx = norm(cross(tg, [0, 0, 1]), [1, 0, 0]), ny = cross(tg, nx);
      for (let r = 0; r < 3; r++) {
        const ang = r * 2.094 + t * 9;
        const q = add(p, add(mul(nx, Math.cos(ang) * sr * .6), mul(ny, Math.sin(ang) * sr * .6)));
        splat(q, tg, nx, ny, .012, sr * .55, sr * .55, r ? DEEP : MID, .10 * (1 - t * .6));
      }
      if (i % 3 === 0) splat(p, tg, nx, ny, .012, .0016, .0016, PALE, .14 * (1 - t * .7)); // vascular line
    }
    // leaves
    const nLeaves = 1 + (rnd() < .6 ? 1 : 0);
    for (let l = 0; l < nLeaves; l++) {
      const t = rr(.35, .75), O = bezier(t);
      const out = norm([rr(-1, 1), rr(.2, .6), rr(-1, 1)]);
      const Pp = norm(cross([0, 1, 0], out), [1, 0, 0]);
      const U = norm(cross(out, Pp));
      const LL = rr(.4, .7);
      surface(O, out, Pp, U, { L: LL, W: LL * .12, elev: rr(.5, .9), curl: rr(-1.6, -1.0), cup: .2, profile: leafProfile, nu: 34, nv: 7, veins: 1, thick: .003, c0: DEEP, c1: DEEP, c2: MID, alpha: .10, phase: 0 });
    }
  }

  const center: Vec3 = [0, 0, 0];
  flower(center, [-0.32, 0.50, -1.0], POPPY, .88);

  return {
    positions: new Float32Array(pos), covA: new Float32Array(covA), covB: new Float32Array(covB),
    colors: new Float32Array(col), count: pos.length / 3, features, center,
  };
}
