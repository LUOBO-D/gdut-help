import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BufferAttribute, BufferGeometry, type Points, type ShaderMaterial } from 'three';
import { mulberry32 } from '../textures';
import { useFade } from '../use-fade';

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aRand;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.5 + aRand * aRand * 4.5) * uPixelRatio;
    // 每颗星以不同频率闪烁
    vAlpha = 0.55 + 0.45 * sin(uTime * (0.6 + aRand * 2.2) + aRand * 40.0);
  }
`;

const fragment = /* glsl */ `
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = (1.0 - smoothstep(0.0, 0.5, d)) * vAlpha * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(0.92, 0.95, 1.0, a);
  }
`;

export function Stars({ active, count, instant }: { active: boolean; count: number; instant: boolean }) {
  const fade = useFade(active, instant);
  const points = useRef<Points>(null);
  const material = useRef<ShaderMaterial>(null);
  const dpr = useThree((s) => s.viewport.dpr);

  const geometry = useMemo(() => {
    const rand = mulberry32(5);
    const pos = new Float32Array(count * 3);
    const rnd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * 22;
      // 星星集中在上半部分，越往下越稀
      pos[i * 3 + 1] = 9 - Math.pow(rand(), 0.7) * 14;
      pos[i * 3 + 2] = -6 - rand() * 4;
      rnd[i] = rand();
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aRand', new BufferAttribute(rnd, 1));
    return g;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: dpr }, uOpacity: { value: 0 } }), [dpr]);

  useFrame(({ clock }) => {
    const v = fade.current;
    const p = points.current!;
    p.visible = v > 0.002;
    if (!p.visible) return;
    const u = material.current!.uniforms;
    u.uTime!.value = clock.elapsedTime;
    u.uOpacity!.value = v;
  });

  return (
    <points ref={points} geometry={geometry} renderOrder={0} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertex}
        fragmentShader={fragment}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
