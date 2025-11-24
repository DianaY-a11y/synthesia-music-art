import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// Grid Configuration
// 600x500 = 300,000 instances.
const COLUMNS = 600; 
const ROWS = 500;
const WIDTH = 16;
const HEIGHT = 12;

// Vertex Shader
const vertexShader = `
uniform float uTime;
uniform float uScanPos; // 0.0 to 1.0 (Left to Right)
uniform float uIsPlaying;
uniform float uIntensity; // User controlled jump height
uniform sampler2D uTexture;

attribute vec3 aBasePos;
attribute vec2 aGridUv;

varying vec3 vColor;
varying float vScanIntensity;
varying float vBrightness;
varying float vEdgeFactor;

// Pseudo-random function
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

void main() {
  // 1. Texture Lookup
  vec4 texColor = texture2D(uTexture, aGridUv);
  vColor = texColor.rgb;
  
  float brightness = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
  vBrightness = brightness;
  
  // 2. Scan Line Logic
  float dist = abs(aGridUv.x - uScanPos);
  
  float scanWave = 0.0;
  if (uIsPlaying > 0.5) {
     // Gaussian curve for smooth scan bar
     scanWave = exp(-pow(dist * 60.0, 2.0)); 
  }
  vScanIntensity = scanWave;

  // 3. Edge Disintegration Logic (Box/Rectangular)
  // Convert UV (0..1) to centered coords (-0.5..0.5) and take absolute
  vec2 centerDist = abs(aGridUv - 0.5) * 2.0; // Range 0.0 center to 1.0 edge
  // Chebyshev distance (Box shape) - takes the max of x or y
  float maxDist = max(centerDist.x, centerDist.y);
  
  // Start disintegrating at 90% from center
  float edge = smoothstep(0.9, 1.0, maxDist);
  vEdgeFactor = edge;

  // 4. Instance Transformation
  vec3 pos = position; 
  
  // Dynamic Scaling
  // Particles at edges become smaller
  float edgeScale = 1.0 - (edge * 0.9);
  
  float scale = 1.0; 
  if (scanWave > 0.01) {
    // Pop effect when scanned
    scale = 1.0 + (scanWave * 0.5); // reduced pop scale
  }
  pos *= scale * edgeScale;

  // 5. World Position
  vec3 instancePos = aBasePos;
  
  // Edge Scattering: Push edge particles outward randomly
  if (edge > 0.01) {
     float rnd = random(aGridUv);
     float rnd2 = random(aGridUv + 1.0);
     
     // Push them outward based on their quadrant
     vec2 dir = sign(aGridUv - 0.5); 
     
     instancePos.x += dir.x * edge * (rnd * 0.5);
     instancePos.y += dir.y * edge * (rnd2 * 0.5);
     // Scatter Z for loose dust look
     instancePos.z += (rnd - 0.5) * edge * 1.5;
  }

  // Z-Displacement (Height Map)
  
  // Static Variance: Random offset per grain to make surface uneven
  float staticNoise = (random(aGridUv) - 0.5) * 0.3;

  // Base Height: Significantly increased multiplier (0.4) for deeper resting texture
  float baseHeight = (brightness * 0.4) + staticNoise; 
  
  // Active Jump (Scan)
  // Reduced significantly: base 0.2 + brightness * 0.8. Multiplied by user intensity.
  float activeJump = scanWave * (0.2 + brightness * 0.8) * uIntensity;
  
  // Idle Motion (Dynamic Liquid) 
  // Only apply if NOT at the very edge
  float idleBreath = 0.0;
  if (edge < 0.2) {
     // Combine multiple sine waves for organic "liquid" feel
     float w1 = sin(uTime * 0.8 + instancePos.x * 2.0);
     float w2 = cos(uTime * 1.1 + instancePos.y * 3.0);
     float w3 = sin(uTime * 0.5 + (instancePos.x + instancePos.y) * 1.0);
     
     idleBreath = (w1 + w2 + w3) * 0.06 * (0.5 + brightness); 
  }
  
  instancePos.z += baseHeight + idleBreath + activeJump;
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4(instancePos + pos, 1.0);
}
`;

// Fragment Shader
const fragmentShader = `
uniform float uTime;
varying vec3 vColor;
varying float vScanIntensity;
varying float vBrightness;
varying float vEdgeFactor;

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

void main() {
  vec3 finalColor = vColor;
  
  // Edge fading: darken particles at the edge
  finalColor *= (1.0 - vEdgeFactor * 0.8);

  // Twinkle Effect (Glitter) - Subtle
  float noise = random(gl_FragCoord.xy * 0.01 + uTime * 0.1);
  if (noise > 0.985) {
     finalColor += 0.15; 
  }

  // Enhance saturation slightly
  finalColor *= 1.1;

  // Scan Line Highlight (Subtle)
  if (vScanIntensity > 0.01) {
    // Just brighten the existing color, no heavy overlay
    finalColor += finalColor * vScanIntensity * 0.5;
    
    // Very subtle tint shift towards cyan, but keep original hue dominant
    vec3 tint = vec3(0.1, 0.2, 0.3);
    finalColor += tint * vScanIntensity;
  }
  
  // Simple lighting based on brightness
  finalColor *= (0.7 + vBrightness * 0.5);

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

interface ParticlesProps {
  imageSrc: string;
  scanPos: number; // 0 to 1
  isPlaying: boolean;
  intensity: number;
}

const Particles: React.FC<ParticlesProps> = ({ imageSrc, scanPos, isPlaying, intensity }) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  
  const texture = useMemo(() => new THREE.TextureLoader().load(imageSrc), [imageSrc]);
  
  // Generate Instance Attributes
  const { count, basePositions, gridUvs } = useMemo(() => {
    const count = COLUMNS * ROWS;
    const basePositions = new Float32Array(count * 3);
    const gridUvs = new Float32Array(count * 2);
    
    let i = 0;
    for(let iy = 0; iy < ROWS; iy++) {
        for(let ix = 0; ix < COLUMNS; ix++) {
            // UV Coordinates (0 to 1)
            const u = ix / (COLUMNS - 1);
            const v = iy / (ROWS - 1);
            
            // World Position (-Width/2 to Width/2)
            const x = (u - 0.5) * WIDTH;
            const y = (v - 0.5) * HEIGHT;
            const z = 0;
            
            basePositions[i * 3] = x;
            basePositions[i * 3 + 1] = y;
            basePositions[i * 3 + 2] = z;
            
            gridUvs[i * 2] = u;
            gridUvs[i * 2 + 1] = v;
            
            i++;
        }
    }
    return { count, basePositions, gridUvs };
  }, []);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
      materialRef.current.uniforms.uScanPos.value = scanPos;
      materialRef.current.uniforms.uIsPlaying.value = isPlaying ? 1.0 : 0.0;
      materialRef.current.uniforms.uIntensity.value = intensity;
    }
  });

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uTexture: { value: texture },
    uScanPos: { value: 0 },
    uIsPlaying: { value: 0 },
    uIntensity: { value: 1.0 }
  }), [texture]);

  // Reduced grain size for finer detail
  const grainSizeX = (WIDTH / COLUMNS) * 0.35;
  const grainSizeY = (HEIGHT / ROWS) * 0.35;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <boxGeometry args={[grainSizeX, grainSizeY, 0.05]}>
         <instancedBufferAttribute attach="attributes-aBasePos" args={[basePositions, 3]} />
         <instancedBufferAttribute attach="attributes-aGridUv" args={[gridUvs, 2]} />
      </boxGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent={false} 
      />
    </instancedMesh>
  );
};

interface ArtVisualizerProps {
  imageSrc: string | null;
  scanPos: number;
  isPlaying: boolean;
  visualIntensity: number;
}

const ArtVisualizer: React.FC<ArtVisualizerProps> = ({ imageSrc, scanPos, isPlaying, visualIntensity }) => {
  if (!imageSrc) return null;

  return (
    <div className="w-full h-full absolute top-0 left-0 z-0 cursor-move">
      <Canvas 
        camera={{ position: [0, -2, 10], fov: 60 }} 
        dpr={window.devicePixelRatio}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#050505']} />
        
        {/* Fog adds depth and blends the loose edges into the background */}
        <fog attach="fog" args={['#050505', 5, 25]} />

        <ambientLight intensity={0.5} />
        
        <Particles imageSrc={imageSrc} scanPos={scanPos} isPlaying={isPlaying} intensity={visualIntensity} />
        
        <OrbitControls 
          makeDefault
          enableZoom={true} 
          enablePan={true}
          enableRotate={true}
          enableDamping={true}
          dampingFactor={0.05}
          rotateSpeed={0.5}
          minDistance={2}
          maxDistance={40}
          minPolarAngle={0}
          maxPolarAngle={Math.PI}
        />
      </Canvas>
    </div>
  );
};

export default ArtVisualizer;