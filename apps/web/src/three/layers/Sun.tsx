import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, Color, type Group, type MeshBasicMaterial, type ShaderMaterial, type Sprite } from 'three';
import { makeGlowTexture } from '../textures';
import { useFade } from '../use-fade';
import { useViewAt } from '../view';

const Z = -4;

const raysVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** 绕太阳缓慢旋转的光芒：按角度的正弦条纹 × 径向衰减，一个四边形完成，开销很小。 */
const raysFragment = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float a = atan(p.y, p.x);
    float rays = pow(0.5 + 0.5 * sin(a * 9.0 + uTime * 0.12), 6.0) * 0.6
               + pow(0.5 + 0.5 * sin(a * 5.0 - uTime * 0.08 + 1.3), 8.0) * 0.5;
    float falloff = smoothstep(1.0, 0.08, r);
    gl_FragColor = vec4(uColor, rays * falloff * uOpacity);
  }
`;

export function Sun({ intensity, instant }: { intensity: number; instant: boolean }) {
  const fade = useFade(intensity > 0, instant);
  const level = useRef(intensity || 1);
  const view = useViewAt(Z);
  const group = useRef<Group>(null);
  const core = useRef<MeshBasicMaterial>(null);
  const halo = useRef<Sprite>(null);
  const corona = useRef<Sprite>(null);
  const rays = useRef<ShaderMaterial>(null);

  const glow = useMemo(() => makeGlowTexture(), []);
  useEffect(() => () => glow.dispose(), [glow]);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new Color('#fff0c2') } }),
    [],
  );

  useFrame(({ clock }, dt) => {
    // 多云时太阳变暗而不是消失：亮度向目标平滑过渡
    if (intensity > 0) level.current += (intensity - level.current) * Math.min(1, dt * 1.5);
    const v = fade.current * level.current;
    const g = group.current!;
    g.visible = v > 0.002;
    if (!g.visible) return;

    const t = clock.elapsedTime;
    const pulse = 1 + Math.sin(t * 0.8) * 0.04;
    const u = rays.current!.uniforms;
    u.uTime!.value = t;
    // 光芒按亮度平方衰减：多云时几乎看不到光芒，只剩一团柔光
    u.uOpacity!.value = v * v * 0.22;
    core.current!.opacity = v;
    halo.current!.material.opacity = v * 0.9;
    halo.current!.scale.setScalar(1.9 * pulse);
    corona.current!.material.opacity = v * 0.4;
    corona.current!.scale.setScalar(5 * (2 - pulse));
  });

  return (
    <group ref={group} position={[view.width * 0.26, view.height * 0.32, Z]} renderOrder={1}>
      <mesh renderOrder={1}>
        <planeGeometry args={[9, 9]} />
        <shaderMaterial
          ref={rays}
          uniforms={uniforms}
          vertexShader={raysVertex}
          fragmentShader={raysFragment}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <sprite ref={corona} renderOrder={1}>
        <spriteMaterial map={glow} color="#ffc56b" transparent depthWrite={false} blending={AdditiveBlending} />
      </sprite>
      <sprite ref={halo} renderOrder={1}>
        <spriteMaterial map={glow} color="#fff3cf" transparent depthWrite={false} blending={AdditiveBlending} />
      </sprite>
      <mesh renderOrder={1}>
        <circleGeometry args={[0.36, 48]} />
        <meshBasicMaterial ref={core} color="#fffaf0" transparent depthWrite={false} />
      </mesh>
    </group>
  );
}
