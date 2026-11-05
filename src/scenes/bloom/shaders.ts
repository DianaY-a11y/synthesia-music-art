/** Splat pass: projects each 3D gaussian to a screen-space ellipse (additive). */
export const SPLAT_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 aCenter;
layout(location=2) in vec3 aCovA;
layout(location=3) in vec3 aCovB;
layout(location=4) in vec4 aColor;
uniform mat3 uR; uniform vec3 uEye; uniform vec2 uVp; uniform float uF; uniform float uT;
uniform vec3 uCenter; uniform float uMorph;
out vec2 vP; out vec4 vC;
void main(){
  vec3 c = aCenter;
  vec3 dc = c - uCenter; float dd = length(dc);
  c = uCenter + dc * (1.0 + uMorph * (0.09 * sin(uT * 2.8 - dd * 9.0) + 0.04 * sin(uT * 1.3)));
  float h = max(c.y + 2.6, 0.0);
  c.x += sin(uT*.55 + c.z*1.3 + c.y*.4) * .010 * h * h * .25;
  c.z += cos(uT*.42 + c.x*1.1) * .006 * h * h * .25;
  vec3 cam = uR * (c - uEye);
  if (cam.z < 0.08) { gl_Position = vec4(0,0,2,1); return; }
  float iz = 1.0 / cam.z;
  vec2 ndc = vec2(uF*cam.x*iz/(uVp.x*.5), uF*cam.y*iz/(uVp.y*.5));
  if (abs(ndc.x) > 1.4 || abs(ndc.y) > 1.4) { gl_Position = vec4(0,0,2,1); return; }
  mat3 J = mat3(uF*iz,0.,0., 0.,uF*iz,0., -uF*cam.x*iz*iz, -uF*cam.y*iz*iz, 0.);
  mat3 V = mat3(aCovA.x,aCovA.y,aCovA.z, aCovA.y,aCovB.x,aCovB.y, aCovA.z,aCovB.y,aCovB.z);
  mat3 T = J * uR;
  mat3 cv = T * V * transpose(T);
  float a = cv[0][0] + .3, b = cv[0][1], d = cv[1][1] + .3;
  float mid = .5*(a+d), rad = length(vec2(.5*(a-d), b));
  float l1 = mid + rad, l2 = max(mid - rad, .1);
  vec2 dg = abs(b) < 1e-6 ? (a >= d ? vec2(1,0) : vec2(0,1)) : normalize(vec2(b, l1 - a));
  vec2 M = min(sqrt(2.*l1), 600.) * dg;
  vec2 m = min(sqrt(2.*l2), 600.) * vec2(dg.y, -dg.x);
  gl_Position = vec4(ndc + (aCorner.x*M + aCorner.y*m) * 2. / uVp, 0., 1.);
  vP = aCorner;
  float fade = smoothstep(9.5, 2.5, cam.z) * smoothstep(.15, .7, cam.z);
  vC = vec4(aColor.rgb, aColor.a * fade);
}`;
export const SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 vP; in vec4 vC; out vec4 o;
void main(){ float A = -dot(vP,vP); if (A < -4.) discard; float B = exp(A) * vC.a; o = vec4(vC.rgb * B, B); }`;
/** Fullscreen triangle. */
export const QUAD_VERT = `#version 300 es
out vec2 vUv; void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); vUv = p; gl_Position = vec4(p*2.-1., 0, 1); }`;
/** Character-grid pass: renders the splat buffer as a flowing grid of glyphs. */
export const GLYPH_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform float uExp; uniform float uDim; uniform float uT; uniform vec2 uVp;
uniform sampler2D uGlyph; uniform float uGlyphN; uniform float uCell;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
vec3 S(vec2 uv){ return texture(uTex, uv).rgb; }
float lumAt(vec2 uv){
  vec2 px = 3.0 / uVp;
  vec3 h = S(uv)*.36 + (S(uv+vec2(px.x,0.)) + S(uv-vec2(px.x,0.)) + S(uv+vec2(0.,px.y)) + S(uv-vec2(0.,px.y)))*.16;
  vec3 c = 1. - exp(-h * uExp);
  return pow(clamp(dot(c, vec3(.2,.35,.45)) * 1.25, 0., 1.), .72);
}
void main(){
  vec2 p = vUv * uVp;
  // the character grid bends along the petal folds: offset by the brightness gradient
  vec2 e = vec2(uCell * 1.5) / uVp;
  float gx = lumAt(vUv + vec2(e.x, 0.)) - lumAt(vUv - vec2(e.x, 0.));
  float gy = lumAt(vUv + vec2(0., e.y)) - lumAt(vUv - vec2(0., e.y));
  vec2 warp = vec2(gy, -gx) * uCell * 1.8 + vec2(gx, gy) * uCell * .9;
  vec2 q = p + warp;
  vec2 cell = floor(q / uCell), f = fract(q / uCell);
  vec2 centre = ((cell + .5) * uCell - warp) / uVp;
  float L = lumAt(centre);
  float Lp = lumAt(vUv);
  // glyph lookup — atlas is sorted from sparse to dense
  float gi = floor(clamp(.12 + L * .98, 0., .999) * uGlyphN);
  float jitter = step(.82, hash(cell + floor(uT * 1.5)));          // a few glyphs flicker
  gi = clamp(gi + jitter * (hash(cell * 1.7 + floor(uT * 1.5)) > .5 ? 1. : -1.), 0., uGlyphN - 1.);
  vec2 auv = vec2((gi + f.x) / uGlyphN, f.y);
  float g = texture(uGlyph, auv).r * smoothstep(.06, .14, L);
  // faint woven flow lines between rows
  float row = smoothstep(.10, 0., abs(f.y - .02)) * smoothstep(.04, .3, Lp) * .35;
  vec3 glyphC = mix(vec3(.30, .48, .95), vec3(.86, .93, 1.), smoothstep(.25, .85, L));
  glyphC = mix(glyphC, vec3(1.), smoothstep(.85, 1., L));
  vec3 glow = vec3(.05, .16, .62) * pow(Lp, 1.6) * 1.1 + vec3(.25, .45, 1.) * pow(Lp, 4.) * .55;
  vec3 bg = mix(vec3(.010,.022,.055), vec3(0.), smoothstep(0., .55, vUv.y));
  vec2 d = vUv - .5; float vig = 1. - dot(d, d) * 1.1;
  vec3 col = bg + (g * glyphC * (.55 + .8 * L) + row * vec3(.35,.5,.9) + glow) * uDim * vig;
  col += (hash(vUv * uVp + uT) - .5) * .018;
  o = vec4(col, 1.);
}`;
