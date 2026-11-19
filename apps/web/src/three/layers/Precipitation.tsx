import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, Color, type Points, type ShaderMaterial } from 'three';
import { mulberry32 } from '../textures';
import { useFade } from '../use-fade';

const BOX = 16;

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uWind;
  uniform float uSway;
  attribute float aRand;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    // 下落完全在 GPU 上计算：按时间平移后对盒子高度取模，循环出现
    float fall = uTime * uSpeed * (0.7 + 0.6 * aRand);
    p.y = mod(p.y - fall + ${BOX / 2}.0, ${BOX}.0) - ${BOX / 2}.0;
    p.x += uWind * p.y + sin(uTime * 1.3 + aRand * 6.2831) * uSway;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (0.6 + 0.8 * aRand) * (10.0 / -mv.z);
    vAlpha = 0.45 + 0.55 * aRand;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uShape;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a;
    if (uShape < 0.5) {
      // 雨：一条细竖线，头部实、尾部虚
      a = (1.0 - smoothstep(0.0, 0.05, abs(c.x))) * smoothstep(-0.5, 0.35, c.y);
    } else {
      // 雪：软边圆点
      a = 1.0 - smoothstep(0.12, 0.5, length(c));
    }
    a *= uOpacity * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

const KINDS = {
  rain: { speed: 9, size: 30, wind: 0.08, sway: 0, color: '#d6ebff', opacity: 0.55, shape: 0 },
  snow: { speed: 0.8, size: 9, wind: 0.02, sway: 0.25, color: '#ffffff', opacity: 0.9, shape: 1 },
} as const;

/** 雨和雪共用的粒子系统：一次绘制调用，位置动画全部在顶点着色器中完成。 */
export function Precipitation({
  kind,
  count,
  amount,
  instant,
}: {
  kind: keyof typeof KINDS;
  count: number;
  amount: number;
  instant: boolean;
}) {
  const fade = useFade(amount > 0, instant);
  const points = useRef<Points>(null);
  const material = useRef<ShaderMaterial>(null);
  const dpr = useThree((s) => s.viewport.dpr);
  const cfg = KINDS[kind];

  const geometry = useMemo(() => {
    const rand = mulberry32(kind === 'rain' ? 3 : 11);
    const pos = new Float32Array(count * 3);
    const rnd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * BOX;
      pos[i * 3 + 1] = (rand() - 0.5) * BOX;
      pos[i * 3 + 2] = 3 - rand() * 9;
      rnd[i] = rand();
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aRand', new BufferAttribute(rnd, 1));
    return g;
  }, [count, kind]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSpeed: { value: cfg.speed },
      uSize: { value: cfg.size },
      uPixelRatio: { value: dpr },
      uWind: { value: cfg.wind },
      uSway: { value: cfg.sway },
      uColor: { value: new Color(cfg.color) },
      uOpacity: { value: 0 },
      uShape: { value: cfg.shape },
    }),
    [cfg, dpr],
  );

  useFrame(({ clock }) => {
    const v = fade.current;
    const p = points.current!;
    p.visible = v > 0.002;
    if (!p.visible) return;
    const u = material.current!.uniforms;
    u.uTime!.value = clock.elapsedTime;
    u.uOpacity!.value = v * cfg.opacity * Math.max(amount, 0.3);
  });

  return (
    <points ref={points} geometry={geometry} renderOrder={4} frustumCulled={false}>
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} transparent depthWrite={false} />
    </points>
  );
}
