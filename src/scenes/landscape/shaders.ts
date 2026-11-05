/** Port of the original ArtVisualizer grain shader: height from brightness,
 *  edge scatter, idle breathing, and the jump under the scan line. */
export const GRAIN_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 aBasePos;
layout(location=2) in vec2 aGridUv;
uniform mat4 uProj, uView;
uniform float uTime, uScanPos, uIsPlaying, uIntensity;
uniform vec2 uGrain;
uniform sampler2D uTexture;
out vec3 vColor; out float vScanIntensity, vBrightness, vEdgeFactor, vDepth;
float random(vec2 st){ return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
void main(){
  vec4 texColor = texture(uTexture, aGridUv);
  vColor = texColor.rgb;
  float brightness = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
  vBrightness = brightness;
  float dist = abs(aGridUv.x - uScanPos);
  float scanWave = 0.0;
  if (uIsPlaying > 0.5) scanWave = exp(-pow(dist * 60.0, 2.0));
  vScanIntensity = scanWave;
  vec2 centerDist = abs(aGridUv - 0.5) * 2.0;
  float maxDist = max(centerDist.x, centerDist.y);
  float edge = smoothstep(0.9, 1.0, maxDist);
  vEdgeFactor = edge;
  vec3 pos = vec3(aCorner * uGrain, 0.0);
  float edgeScale = 1.0 - (edge * 0.9);
  float scale = 1.0;
  if (scanWave > 0.01) scale = 1.0 + (scanWave * 0.5);
  pos *= scale * edgeScale;
  vec3 instancePos = aBasePos;
  if (edge > 0.01) {
    float rnd = random(aGridUv), rnd2 = random(aGridUv + 1.0);
    vec2 dir = sign(aGridUv - 0.5);
    instancePos.x += dir.x * edge * (rnd * 0.5);
    instancePos.y += dir.y * edge * (rnd2 * 0.5);
    instancePos.z += (rnd - 0.5) * edge * 1.5;
  }
  float staticNoise = (random(aGridUv) - 0.5) * 0.3;
  float baseHeight = (brightness * 0.4) + staticNoise;
  float activeJump = scanWave * (0.2 + brightness * 0.8) * uIntensity;
  float idleBreath = 0.0;
  if (edge < 0.2) {
    float w1 = sin(uTime * 0.8 + instancePos.x * 2.0);
    float w2 = cos(uTime * 1.1 + instancePos.y * 3.0);
    float w3 = sin(uTime * 0.5 + (instancePos.x + instancePos.y) * 1.0);
    idleBreath = (w1 + w2 + w3) * 0.06 * (0.5 + brightness);
  }
  instancePos.z += baseHeight + idleBreath + activeJump;
  vec4 mv = uView * vec4(instancePos + pos, 1.0);
  vDepth = -mv.z;
  gl_Position = uProj * mv;
}`;
export const GRAIN_FRAG = `#version 300 es
precision highp float;
uniform float uTime;
in vec3 vColor; in float vScanIntensity, vBrightness, vEdgeFactor, vDepth;
out vec4 o;
float random(vec2 st){ return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
void main(){
  vec3 finalColor = vColor;
  finalColor *= (1.0 - vEdgeFactor * 0.8);
  float noise = random(gl_FragCoord.xy * 0.01 + uTime * 0.1);
  if (noise > 0.985) finalColor += 0.15;
  finalColor *= 1.1;
  if (vScanIntensity > 0.01) {
    finalColor += finalColor * vScanIntensity * 0.5;
    // scan accent in the new ice-blue
    finalColor += vec3(0.16, 0.30, 0.62) * vScanIntensity;
  }
  finalColor *= (0.85 + vBrightness * 0.55) * 1.2;
  float fog = clamp((vDepth - 9.0) / 24.0, 0.0, 1.0);
  finalColor = mix(finalColor, vec3(0.008, 0.016, 0.04), fog);
  o = vec4(finalColor, 1.0);
}`;
