import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, type Group, type ShaderMaterial, type Sprite } from 'three';
import { makeGlowTexture } from '../textures';
import { useFade } from '../use-fade';
import { useViewAt } from '../view';

const Z = -5;

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** 月面：边缘柔化 + 球面明暗 + 几处暗斑，全部在片元着色器里算。 */
const fragment = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  float spot(vec2 p, vec2 c, float r) { return smoothstep(r, r * 0.4, length(p - c)); }
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(p);
    float disc = smoothstep(1.0, 0.96, d);
    float shade = 0.82 + 0.18 * sqrt(max(0.0, 1.0 - d * d)) - 0.12 * (p.x + p.y) * 0.5;
    float maria = spot(p, vec2(-0.3, 0.25), 0.32) * 0.5 + spot(p, vec2(0.25, -0.2), 0.25) * 0.4
                + spot(p, vec2(0.35, 0.4), 0.14) * 0.35 + spot(p, vec2(-0.1, -0.45), 0.18) * 0.3;
    vec3 color = vec3(0.93, 0.95, 1.0) * shade * (1.0 - maria * 0.18);
    gl_FragColor = vec4(color, disc * uOpacity);
  }
`;

export function Moon({ active, instant }: { active: boolean; instant: boolean }) {
  const fade = useFade(active, instant);
  const view = useViewAt(Z);
  const group = useRef<Group>(null);
  const disc = useRef<ShaderMaterial>(null);
  const halo = useRef<Sprite>(null);
  const glow = useMemo(() => makeGlowTexture(), []);
  useEffect(() => () => glow.dispose(), [glow]);
  const uniforms = useMemo(() => ({ uOpacity: { value: 0 } }), []);

  useFrame(({ clock }) => {
    const v = fade.current;
    const g = group.current!;
    g.visible = v > 0.002;
    if (!g.visible) return;
    disc.current!.uniforms.uOpacity!.value = v;
    halo.current!.material.opacity = v * (0.5 + Math.sin(clock.elapsedTime * 0.6) * 0.05);
  });

  return (
    <group ref={group} position={[view.width * 0.24, view.height * 0.3, Z]}>
      <sprite ref={halo} scale={5} renderOrder={1}>
        <spriteMaterial map={glow} color="#aebfff" transparent depthWrite={false} blending={AdditiveBlending} />
      </sprite>
      <mesh renderOrder={1}>
        <planeGeometry args={[1.5, 1.5]} />
        <shaderMaterial
          ref={disc}
          uniforms={uniforms}
          vertexShader={vertex}
          fragmentShader={fragment}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
