export type Vec3 = [number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: Vec3, fallback: Vec3 = [0, 1, 0]): Vec3 => {
  const l = len(a);
  return l < 1e-7 ? fallback : [a[0] / l, a[1] / l, a[2] / l];
};
export const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Deterministic random numbers, so the bloom looks the same on every visit. */
export function seededRandom(seed: number) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const range = (a: number, b: number) => a + (b - a) * rnd();
  return { rnd, range };
}

/** Minimal column-major 4×4 matrix helpers for the landscape camera. */
export const mat4 = {
  perspective(fov: number, aspect: number, near: number, far: number): number[] {
    const t = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
    return [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  },
  lookAt(eye: Vec3, center: Vec3, up: Vec3): number[] {
    const z = norm(sub(eye, center)), x = norm(cross(up, z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1];
  },
  transform(m: number[], v: [number, number, number, number]) {
    return [0, 1, 2, 3].map(i => m[i] * v[0] + m[4 + i] * v[1] + m[8 + i] * v[2] + m[12 + i] * v[3]);
  },
};
