import { Canvas, useThree } from '@react-three/fiber';
import { useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { ColorManagement, type Material, type Mesh, type Object3D, type Texture } from 'three';
import type { Scene, TimePhase } from '../lib/scene';
import { Clouds } from './layers/Clouds';
import { Lightning } from './layers/Lightning';
import { Moon } from './layers/Moon';
import { Precipitation } from './layers/Precipitation';
import { Stars } from './layers/Stars';
import { Sun } from './layers/Sun';
import { PerfWatch } from './PerfWatch';
import { SKY3D_SETTINGS, type Quality } from './quality';
import { Rig } from './Rig';
import { resolveSkyConfig } from './scenes';
import { FADE_SECONDS } from './use-fade';
import { useParallaxInput } from './use-parallax-input';

// 颜色按写下的 sRGB 值直接输出，和 CSS 渐变保持一致（配合 Canvas 的 linear / flat）
ColorManagement.enabled = false;

export interface Sky3DProps {
  scene: Scene;
  timePhase: TimePhase;
  quality: Exclude<Quality, 'low'>;
  /** 是否持续动画（所有页面前台可见时保持同步动画，切入后台自动暂停省电） */
  animate: boolean;
  gyro: boolean;
  /** 只在画质为「自动」时传入：帧率不足时降档 */
  onSlow?: () => void;
}

/** 3D 天空。透明画布叠在 CSS 渐变之上，只负责太阳、云、雨雪、星月等元素。 */
export default function Sky3D({ scene, timePhase, quality, animate, gyro, onSlow }: Sky3DProps) {
  const reduced = useReducedMotion() ?? false;
  const settings = SKY3D_SETTINGS[quality];
  const cfg = resolveSkyConfig(scene, timePhase);
  useParallaxInput(gyro && !reduced);

  // 场景或时段切换后的一段时间内保持渲染，确保淡入淡出播完
  const key = `${scene}|${timePhase}|${quality}`;
  const [settledKey, setSettledKey] = useState<string | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setSettledKey(key), (FADE_SECONDS + 0.4) * 1000);
    return () => window.clearTimeout(id);
  }, [key]);
  const settling = settledKey !== key;

  const running = !reduced && (animate || settling);

  return (
    <Canvas
      className="absolute! inset-0"
      frameloop={running ? 'always' : 'demand'}
      dpr={[1, settings.dpr]}
      camera={{ position: [0, 0, 10], fov: 50, near: 0.1, far: 50 }}
      gl={{ alpha: true, antialias: false, powerPreference: 'default' }}
      linear
      flat
      aria-hidden="true"
    >
      <Redraw scene={scene} timePhase={timePhase} quality={quality} reduced={reduced} />
      <Rig />
      <Stars active={cfg.stars} count={settings.stars} instant={reduced} />
      <Moon active={cfg.moon} instant={reduced} />
      <Sun intensity={cfg.sun} instant={reduced} />
      <Lightning active={cfg.lightning} instant={reduced} />
      <Clouds look={cfg.clouds} max={settings.clouds} instant={reduced} />
      <Precipitation kind="rain" count={settings.rain} amount={cfg.rain} instant={reduced} />
      <Precipitation kind="snow" count={settings.snow} amount={cfg.snow ? 1 : 0} instant={reduced} />
      {onSlow && running && <PerfWatch key={quality} onSlow={onSlow} />}
      <Precompile />
    </Canvas>
  );
}

function Precompile() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const hidden: Object3D[] = [];
    scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
      const material = (o as Mesh).material as (Material & { map?: Texture | null }) | undefined;
      if (material?.map) gl.initTexture(material.map);
    });
    void gl.compileAsync(scene, camera);
    for (const o of hidden) o.visible = false;
  }, [gl, scene, camera]);
  return null;
}

function Redraw({
  scene,
  timePhase,
  quality,
  reduced,
}: {
  scene: Scene;
  timePhase: TimePhase;
  quality: Quality;
  reduced: boolean;
}) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [invalidate, scene, timePhase, quality, reduced]);
  return null;
}
