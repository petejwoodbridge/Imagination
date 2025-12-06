import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DetectionResult } from '../types';

interface VisualizerProps {
  videoTexture: THREE.VideoTexture | null;
  trackingData: DetectionResult | null;
  activeColor: string;
}

// Enhanced VHS/Grunge Shader
const BackgroundShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uContrast: { value: 2.2 }, // Higher contrast
    uBrightness: { value: -0.05 }, 
    uHandPos: { value: new THREE.Vector2(0.5, 0.5) },
    uDistortion: { value: 0.0 },
    uColor: { value: new THREE.Color(1.0, 1.0, 1.0) }
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
      
      // Noise grain
      float grain = (rand(uv * uTime * 10.0) - 0.5) * 0.3;
      gray += grain;

      // Scanlines
      float scanline = sin(uv.y * 600.0) * 0.1;
      gray -= scanline;

      // Force Black and White output primarily
      vec3 finalColor = vec3(gray);

      // Tint slightly with active color based on distortion level (glitch moments)
      vec3 tint = mix(vec3(gray), uColor * gray, uDistortion * 0.5); 
      finalColor = mix(finalColor, tint, 0.3);

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

// New Head Tracking Component
const HeadHalo = ({ trackingData, color }: { trackingData: DetectionResult | null, color: string }) => {
  const meshRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!meshRef.current) return;
    
    // Default position (hidden or neutral)
    let targetPos = new THREE.Vector3(0, 10, 0);
    let scale = 0;

    if (trackingData && trackingData.faceLandmarks.length > 0) {
        // Nose tip is usually index 1 or 4. 
        // 1 is tip of nose.
        const nose = trackingData.faceLandmarks[0][1];
        
        // Map normalized coordinates to world space (roughly matching plane size)
        // x: 0..1 => -8..8
        // y: 0..1 => 5..-5
        const x = (nose.x - 0.5) * -16; 
        const y = (nose.y - 0.5) * -10;
        // z is relative depth. We want it slightly behind detection
        const z = -nose.z * 5; 

        targetPos.set(x, y, z);
        scale = 1;
    }

    meshRef.current.position.lerp(targetPos, 0.1);
    
    // Use scale for smooth entrance/exit
    const currentScale = meshRef.current.scale.x;
    const nextScale = THREE.MathUtils.lerp(currentScale, scale, 0.1);
    meshRef.current.scale.set(nextScale, nextScale, nextScale);

    // Rotate the halo
    meshRef.current.rotation.y += 0.01;
    meshRef.current.rotation.z += 0.005;
  });

  return (
    <group ref={meshRef}>
        {/* Outer Ring */}
        <mesh>
            <icosahedronGeometry args={[1.5, 0]} />
            <meshBasicMaterial color={color} wireframe transparent opacity={0.5} />
        </mesh>
        {/* Inner Ring */}
        <mesh rotation={[Math.PI / 4, 0, 0]}>
            <torusGeometry args={[1.0, 0.02, 16, 100]} />
            <meshBasicMaterial color="white" />
        </mesh>
    </group>
  )
}

const Visualizer: React.FC<VisualizerProps> = ({ videoTexture, trackingData, activeColor }) => {
  const shaderRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport, camera } = useThree();

  const distance = 15;
  const vFov = (camera as THREE.PerspectiveCamera).fov * Math.PI / 180;
  const height = 2 * Math.tan(vFov / 2) * distance;
  const width = height * viewport.aspect;

  useFrame((state) => {
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      shaderRef.current.uniforms.uColor.value.set(activeColor);
      
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
      <HeadHalo trackingData={trackingData} color={activeColor} />
      
      <ambientLight intensity={0.5} />
    </>
  );
};

export default Visualizer;