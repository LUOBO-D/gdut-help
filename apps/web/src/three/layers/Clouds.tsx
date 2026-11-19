import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, type Group, type SpriteMaterial } from 'three';
import type { CloudLook } from '../scenes';
import { skyInput } from '../sky-input';
import { makeCloudTexture, mulberry32 } from '../textures';
import { FADE_SECONDS, moveTowards } from '../use-fade';
import { useViewAt } from '../view';

interface Puff {
  x: number;
  y: number;
  scale: number;
  tex: number;
}

interface Cluster {
  /** 初始横向位置，相对半屏宽 -1..1 */
  x: number;
  /** 相对屏幕高度的位置 0..1（0 为中线，1 为顶边） */
  yRatio: number;
  z: number;
  drift: number;
  puffs: Puff[];
}

const WHITE = new Color('#ffffff');
const MAX_CLUSTERS = 10;
const CAMERA_Z = 10;
const DEFAULT_LOOK: CloudLook = { count: 0, color: '#ffffff', opacity: 0, scale: 1, speed: 0.1 };

function buildClusters(): Cluster[] {
  const rand = mulberry32(42);
  return Array.from({ length: MAX_CLUSTERS }, (_, i) => ({
    // 前几个云团（晴天只显示这几个）分布均匀，后面的补满天空
    x: ((i % 5) / 5 - 0.5) * 2 + rand() * 0.3,
    yRatio: 0.1 + rand() * 0.85,
    z: -1.5 - rand() * 6,
    drift: 0.7 + rand() * 0.6,
    puffs: Array.from({ length: 4 + Math.floor(rand() * 3) }, () => ({
      x: (rand() - 0.5) * 3.2,
      y: (rand() - 0.5) * 0.7,
      scale: 2.2 + rand() * 1.6,
      tex: Math.floor(rand() * 3),
    })),
  }));
}

/**
 * 云层：一组由柔边贴图拼成的云团，横向漂移并在屏幕外循环。
 * 场景切换时数量、颜色、透明度逐渐过渡；打雷时被闪电提亮。
 */
export function Clouds({ look, max, instant }: { look: CloudLook | null; max: number; instant: boolean }) {
  const view = useViewAt(0);
  const clusters = useMemo(() => buildClusters(), []);
  const textures = useMemo(() => [makeCloudTexture(7), makeCloudTexture(19), makeCloudTexture(73)], []);
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);

  const groups = useRef<(Group | null)[]>([]);
  const materials = useRef<SpriteMaterial[][]>(clusters.map(() => []));
  /** 当前横向位置（场景单位），首帧根据屏幕宽度初始化 */
  const offsets = useRef<number[] | null>(null);
  const fades = useRef(clusters.map(() => 0));
  // 最后一次有云时的外观：云全部消失的过程中保持颜色、大小不突变
  const lastLook = useRef<CloudLook>(look ?? DEFAULT_LOOK);
  const color = useRef(new Color((look ?? DEFAULT_LOOK).color));
  const target = useMemo(() => new Color(), []);
  const tint = useMemo(() => new Color(), []);
  const scale = useRef((look ?? DEFAULT_LOOK).scale);
  const opacity = useRef((look ?? DEFAULT_LOOK).opacity);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    if (look) lastLook.current = look;
    const l = lastLook.current;
    const k = instant ? 1 : Math.min(1, dt * 1.2);
    color.current.lerp(target.set(l.color), k);
    scale.current += (l.scale - scale.current) * k;
    opacity.current += (l.opacity - opacity.current) * k;
    tint.copy(color.current).lerp(WHITE, skyInput.flash * 0.7);

    const shown = look ? Math.min(look.count, max) : 0;
    // view 是 z=0 处的可见范围；更远的云团可见范围按透视比例放大（相机在 z=10）
    const halfW = view.width * 0.5;
    const halfH = view.height * 0.5;
    const depth = (c: Cluster) => (CAMERA_Z - c.z) / CAMERA_Z;
    const offs = (offsets.current ??= clusters.map((c) => c.x * halfW * depth(c)));

    clusters.forEach((c, i) => {
      const goal = i < shown ? 1 : 0;
      const f = instant ? goal : moveTowards(fades.current[i]!, goal, dt / FADE_SECONDS);
      fades.current[i] = f;
      const g = groups.current[i];
      if (!g) return;
      g.visible = f > 0.002;
      if (!g.visible) return;

      // 越远的云漂得越慢，增强景深
      // 云团完全移出屏幕右侧后，从左侧重新进入
      const wrapAt = halfW * depth(c) + 4 * scale.current;
      let x = offs[i]! + dt * l.speed * c.drift * (1 + c.z / 12);
      if (x > wrapAt) x = -wrapAt;
      offs[i] = x;
      g.position.set(x, c.yRatio * halfH * depth(c), c.z);
      g.scale.setScalar(scale.current);
      for (const m of materials.current[i]!) {
        m.opacity = f * opacity.current;
        m.color.copy(tint);
      }
    });
  });

  return (
    <>
      {clusters.map((c, i) => (
        <group key={i} ref={(g) => void (groups.current[i] = g)} visible={false}>
          {c.puffs.map((p, j) => (
            <sprite key={j} position={[p.x, p.y, 0]} scale={[p.scale * 1.6, p.scale, 1]} renderOrder={3}>
              <spriteMaterial
                ref={(m) => {
                  if (m) materials.current[i]![j] = m;
                }}
                map={textures[p.tex]}
                transparent
                depthWrite={false}
                opacity={0}
              />
            </sprite>
          ))}
        </group>
      ))}
    </>
  );
}
