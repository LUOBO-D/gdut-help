import { Canvas, useThree } from '@react-three/fiber';
import { useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { ColorManagement, type Material, type Mesh, type Object3D, type Texture } from 'three';
import type { Scene } from '../lib/scene';
import { Clouds } from './layers/Clouds';
import { Lightning } from './layers/Lightning';
import { Moon } from './layers/Moon';
import { Precipitation } from './layers/Precipitation';
import { Stars } from './layers/Stars';
import { Sun } from './layers/Sun';
import { PerfWatch } from './PerfWatch';
import { SKY3D_SETTINGS, type Quality } from './quality';
import { Rig } from './Rig';
import { SKY_CONFIG } from './scenes';
import { FADE_SECONDS } from './use-fade';
import { useParallaxInput } from './use-parallax-input';

// 颜色按写下的 sRGB 值直接输出，和 CSS 渐变保持一致（配合 Canvas 的 linear / flat）
ColorManagement.enabled = false;

export interface Sky3DProps {
  scene: Scene;
  quality: Exclude<Quality, 'low'>;
  /** 是否持续动画。不在首页时只保留最后一帧，不占 GPU */
  animate: boolean;
  gyro: boolean;
  /** 只在画质为「自动」时传入：帧率不足时降档 */
  onSlow?: () => void;
}

/** 3D 天空。透明画布叠在 CSS 渐变之上，只负责太阳、云、雨雪、星月等元素。 */
export default function Sky3D({ scene, quality, animate, gyro, onSlow }: Sky3DProps) {
  const reduced = useReducedMotion() ?? false;
  const settings = SKY3D_SETTINGS[quality];
  const cfg = SKY_CONFIG[scene];
  useParallaxInput(gyro && !reduced);

  // 场景切换或首次出现后的一段时间内保持渲染，让淡入淡出播完，即使当前不在首页
  const key = `${scene}|${quality}`;
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
      <Redraw scene={scene} quality={quality} reduced={reduced} />
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

/**
 * 启动时一次性编译所有元素的着色器、上传贴图。
 * 否则某种天气的元素第一次出现时才编译，切换天气那一刻会卡顿几百毫秒。
 * three.js 的 compile 只处理可见对象，所以先临时把隐藏的元素设为可见；
 * 各元素每帧都会重新设置自己的可见性，这里改完不需要再还原。
 */
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
    // compileAsync 在调用时就已收集好要编译的程序，可以立刻恢复隐藏状态，避免下一帧闪现
    for (const o of hidden) o.visible = false;
  }, [gl, scene, camera]);
  return null;
}

/** 按需渲染模式下，场景、画质或动效设置变化后补画一帧 */
function Redraw({ scene, quality, reduced }: { scene: Scene; quality: Quality; reduced: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [invalidate, scene, quality, reduced]);
  return null;
}
