import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DetectionResult } from '../types';

interface VisualizerProps {
  videoTexture: THREE.VideoTexture | null;
  trackingData: DetectionResult | null;
  activeColor: string;
  audioIntensity: number;
  songProgress: number;
}

// Enhanced VHS/Grunge Shader
const BackgroundShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uContrast: { value: 2.2 },
    uBrightness: { value: -0.05 },
    uHandPos: { value: new THREE.Vector2(0.5, 0.5) },
    uDistortion: { value: 0.0 },
    uColor: { value: new THREE.Color(1.0, 1.0, 1.0) },
    uIntensity: { value: 0.0 },
    uTheme: { value: 0.0 } // 0=fantasy, 1=glitch, 2=digital, 3=imagination
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uContrast;
    uniform float uBrightness;
    uniform vec2 uHandPos;
    uniform float uDistortion;
    uniform vec3 uColor;
    uniform float uIntensity;
    uniform float uTheme;
    varying vec2 vUv;

    float rand(vec2 co){
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      
      // Tracking error line (VHS artifact)
      float trackingLine = step(0.98, sin(uv.y * 3.0 + uTime * 20.0)) * step(sin(uTime * 5.0), 0.0);
      uv.x += trackingLine * 0.02;

      // Hand warp
      float dist = distance(uv, uHandPos);
      float warp = sin(dist * 20.0 - uTime * 8.0) * uDistortion * 0.02;
      uv += (uv - uHandPos) * warp;

      // Scanline noise
      float noiseVal = rand(vec2(0.0, uv.y + uTime));
      float tear = step(0.99 - (uDistortion * 0.01), noiseVal); 
      uv.x += tear * 0.05;

      // Chromatic Aberration
      float r = texture2D(tDiffuse, uv + vec2(0.002, 0.0)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - vec2(0.002, 0.0)).b;
      
      vec3 col = vec3(r, g, b);
      
      // Heavy Grayscale / BW conversion
      float gray = dot(col, vec3(0.299, 0.587, 0.114));
      
      // High Contrast Curve
      gray = (gray - 0.5) * uContrast + 0.5 + uBrightness;
      
      // Theme-based effects
      // Theme 0: Fantasy - soft glow, reduce grain
      // Theme 1: Glitch - extreme distortion, high grain
      // Theme 2: Digital - crisp, pixelated, clean lines
      // Theme 3: Imagination - blend of all, dreamy
      
      float themeBlend = mod(uTheme, 1.0);
      float themePhase = floor(uTheme);
      
      // Intensity-driven grain and distortion
      float grain = (rand(uv * uTime * 10.0) - 0.5) * 0.3 * (0.5 + uIntensity);
      gray += grain;

      // Theme-specific scanlines
      float scanlineIntensity = 0.1;
      if (themePhase == 1.0) {
        scanlineIntensity = 0.2 + uIntensity * 0.3; // Glitch: more scanlines
      } else if (themePhase == 2.0) {
        scanlineIntensity = 0.05; // Digital: crisp, fewer lines
      }
      
      float scanline = sin(uv.y * 600.0) * scanlineIntensity;
      gray -= scanline;

      // Force Black and White output primarily
      vec3 finalColor = vec3(gray);

      // Tint with active color and intensity
      float colorTint = mix(0.2, 0.5, uIntensity);
      vec3 tint = mix(vec3(gray), uColor * gray, uDistortion * 0.5 + colorTint); 
      finalColor = mix(finalColor, tint, 0.2 + uIntensity * 0.3);

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
};

const SwarmParticles = ({ trackingData }: { trackingData: DetectionResult | null }) => {
  const count = 400;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  const particles = useMemo(() => {
    return new Array(count).fill(0).map(() => ({
      position: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 5),
      velocity: new THREE.Vector3(0,0,0),
      scale: Math.random() * 0.4 + 0.1
    }));
  }, []);

  useFrame(() => {
    if (!mesh.current) return;

    let target = new THREE.Vector3(0, 0, 0);
    let influence = 0.01;

    if (trackingData && trackingData.handLandmarks.length > 0) {
      const lm = trackingData.handLandmarks[0][8]; // Index finger tip
      target.set((lm.x - 0.5) * -16, (lm.y - 0.5) * -10, 0); 
      influence = 0.35; 
    }

    particles.forEach((particle, i) => {
      const dir = new THREE.Vector3().copy(target).sub(particle.position);
      const dist = dir.length();
      
      const cross = new THREE.Vector3(-dir.y, dir.x, dir.z).normalize().multiplyScalar(dist * 0.3);
      dir.normalize().multiplyScalar(influence);
      particle.velocity.add(dir);
      particle.velocity.add(cross.multiplyScalar(0.05)); 
      particle.velocity.multiplyScalar(0.92); 
      
      // Add jitter noise
      particle.velocity.x += (Math.random() - 0.5) * 0.15;
      particle.velocity.y += (Math.random() - 0.5) * 0.15;

      particle.position.add(particle.velocity);
      dummy.position.copy(particle.position);
      
      dummy.rotation.x += 0.2;
      dummy.rotation.y += 0.2;
      
      // Glitch scale
      const s = particle.scale * (1 + (Math.random() > 0.95 ? 1.5 : 0.0)); 
      dummy.scale.set(s, s, s);
      
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    
      mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <tetrahedronGeometry args={[0.1, 0]} />
      {/* Force White wireframe for B&W look */}
      <meshBasicMaterial wireframe color="#FFFFFF" toneMapped={false} transparent opacity={0.6} />
    </instancedMesh>
  );
};

// New Head Tracking Component - Animal Shape Morphing with Audio Response
const HeadHalo = ({ trackingData, color, audioIntensity }: { trackingData: DetectionResult | null, color: string, audioIntensity: number }) => {
  const meshRef = useRef<THREE.Group>(null);
  const animalShapesRef = useRef<THREE.Mesh[]>([]);
  const timeRef = useRef(0);

  // Animal-inspired shape names: wolf ears, bird wings, rabbit ears
  const animalShapes = ['wolf', 'bird', 'rabbit'];
  const baseSize = 1.5;
  const maxAudioScale = 2.5; // Max size at peak audio

  useFrame(() => {
    if (!meshRef.current) return;
    
    timeRef.current += 0.016; // ~60fps increment
    
    // Default position (hidden or neutral)
    let targetPos = new THREE.Vector3(0, 10, 0);
    let scale = 0;

    if (trackingData && trackingData.faceLandmarks.length > 0) {
        const nose = trackingData.faceLandmarks[0][1];
        const x = (nose.x - 0.5) * -16; 
        const y = (nose.y - 0.5) * -10;
        const z = -nose.z * 5; 

        targetPos.set(x, y, z);
        scale = 1;
    }

    meshRef.current.position.lerp(targetPos, 0.1);
    
    const currentScale = meshRef.current.scale.x;
    const nextScale = THREE.MathUtils.lerp(currentScale, scale, 0.1);
    meshRef.current.scale.set(nextScale, nextScale, nextScale);

    // Rotate the halo with intensity-driven wobble
    meshRef.current.rotation.y += 0.01 + audioIntensity * 0.02;
    meshRef.current.rotation.z += 0.005 + audioIntensity * 0.01;

    // Cycle through animal shapes every 2 seconds
    const shapeIndex = Math.floor((timeRef.current / 2.0) % animalShapes.length);
    
    // Audio-responsive scaling
    const audioScale = 1 + audioIntensity * (maxAudioScale - 1);
    
    animalShapesRef.current.forEach((mesh, i) => {
      mesh.visible = i === shapeIndex;
      if (i === shapeIndex) {
        mesh.scale.set(audioScale, audioScale, audioScale);
      }
    });
  });

  return (
    <group ref={meshRef}>
        {/* Wolf/Predator - Tetrahedron (sharp, pointy ears) */}
        <mesh ref={(m) => { if (m && !animalShapesRef.current[0]) animalShapesRef.current[0] = m; }}>
            <tetrahedronGeometry args={[baseSize, 1]} />
            <meshBasicMaterial color={color} wireframe transparent opacity={0.6} />
        </mesh>
        {/* Bird/Wings - Octahedron (geometric, wing-like) */}
        <mesh ref={(m) => { if (m && !animalShapesRef.current[1]) animalShapesRef.current[1] = m; }}>
            <octahedronGeometry args={[baseSize, 1]} />
            <meshBasicMaterial color={color} wireframe transparent opacity={0.6} />
        </mesh>
        {/* Rabbit/Prey - Icosahedron (smooth, soft, rounded) */}
        <mesh ref={(m) => { if (m && !animalShapesRef.current[2]) animalShapesRef.current[2] = m; }}>
            <icosahedronGeometry args={[baseSize, 2]} />
            <meshBasicMaterial color={color} wireframe transparent opacity={0.6} />
        </mesh>
        {/* Inner Ring (pulsates with audio) */}
        <mesh rotation={[Math.PI / 4, 0, 0]}>
            <torusGeometry args={[1.0, 0.02, 16, 100]} />
            <meshBasicMaterial 
              color="white" 
              transparent
              opacity={0.4 + audioIntensity * 0.6}
            />
        </mesh>
    </group>
  )
}

const Visualizer: React.FC<VisualizerProps> = ({ videoTexture, trackingData, activeColor, audioIntensity, songProgress }) => {
  const shaderRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport, camera } = useThree();

  const distance = 15;
  const vFov = (camera as THREE.PerspectiveCamera).fov * Math.PI / 180;
  const height = 2 * Math.tan(vFov / 2) * distance;
  const width = height * viewport.aspect;

  // Calculate current theme (0..4 over full song)
  const themeValue = songProgress * 4;

  useFrame((state) => {
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      shaderRef.current.uniforms.uColor.value.set(activeColor);
      shaderRef.current.uniforms.uIntensity.value = audioIntensity;
      shaderRef.current.uniforms.uTheme.value = themeValue;
      
      if (trackingData && trackingData.handLandmarks.length > 0) {
         const rawX = trackingData.handLandmarks[0][8].x;
         const rawY = 1.0 - trackingData.handLandmarks[0][8].y; 
         
         const currentX = shaderRef.current.uniforms.uHandPos.value.x;
         const currentY = shaderRef.current.uniforms.uHandPos.value.y;
         
         shaderRef.current.uniforms.uHandPos.value.set(
            THREE.MathUtils.lerp(currentX, rawX, 0.2),
            THREE.MathUtils.lerp(currentY, rawY, 0.2)
         );
         
         shaderRef.current.uniforms.uDistortion.value = THREE.MathUtils.lerp(
             shaderRef.current.uniforms.uDistortion.value, 
             10.0, 
             0.2
         );
      } else {
          shaderRef.current.uniforms.uDistortion.value = THREE.MathUtils.lerp(
             shaderRef.current.uniforms.uDistortion.value, 
             0.0, 
             0.05
         );
      }
    }
  });

  return (
    <>
      <mesh position={[0, 0, -10]}>
        <planeGeometry args={[width, height]} />
        <shaderMaterial
          ref={shaderRef}
          args={[BackgroundShader]}
          uniforms-tDiffuse-value={videoTexture}
          transparent={true}
        />
      </mesh>
      
      <SwarmParticles trackingData={trackingData} />
      <HeadHalo trackingData={trackingData} color={activeColor} audioIntensity={audioIntensity} />
      
      <ambientLight intensity={0.5} />
    </>
  );
};

export default Visualizer;