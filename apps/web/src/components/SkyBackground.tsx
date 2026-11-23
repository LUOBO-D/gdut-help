import { motion } from 'motion/react';
import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react';
import { resolveScenePalette, type Scene, type TimePhase } from '../lib/scene';
import { SCENE_FADE } from '../motion/presets';
import { useEffectiveQuality, useQualityStore } from '../three/quality-store';
import { ErrorBoundary } from './ErrorBoundary';

// three.js 体积较大，单独分包，首屏渲染完成后再加载
const Sky3D = lazy(() => import('../three/Sky3D'));

const CSS_RAIN_DROPS = Array.from({ length: 28 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${-((i * 0.23) % 1.4).toFixed(2)}s`,
  duration: `${(0.75 + (i % 5) * 0.14).toFixed(2)}s`,
  opacity: 0.28 + (i % 4) * 0.12,
}));

const CSS_SNOW_FLAKES = Array.from({ length: 22 }, (_, i) => ({
  left: `${(i * 43) % 100}%`,
  delay: `${-((i * 0.55) % 4.5).toFixed(2)}s`,
  duration: `${(4.2 + (i % 5) * 0.9).toFixed(2)}s`,
  size: 4 + (i % 4) * 2,
}));

interface LayerSpec {
  scene: Scene;
  timePhase: TimePhase;
}

/**
 * 全站统一天空背景与天气动效（挂载在 RootLayout，切换任何页面均无缝同步持续播放）：
 * 1. 动态 CSS 渐变（随「天气 × 时间段」平滑交叉淡化）+ 光斑；
 * 2. 3D 天空动效（中/高画质全页面持续动画，仅切后台时自动暂停省电）；
 * 3. 低画质 / WebGL 回退轻量 CSS 雨雪粒子层，确保每台手机每个页面雨雪动效都同步可见。
 */
export function SkyBackground({ scene, timePhase }: { scene: Scene; timePhase: TimePhase }) {
  const quality = useEffectiveQuality();
  const preference = useQualityStore((s) => s.preference);
  const gyro = useQualityStore((s) => s.gyro);
  const downgrade = useQualityStore((s) => s.downgrade);
  const markWebglFailed = useQualityStore((s) => s.markWebglFailed);
  const idle = useAfterFirstPaint();
  const pageVisible = usePageVisible();
  const show3D = idle && (quality === 'high' || quality === 'medium');

  const [layers, setLayers] = useState<{ current: LayerSpec; under: LayerSpec | null }>({
    current: { scene, timePhase },
    under: null,
  });
  if (layers.current.scene !== scene || layers.current.timePhase !== timePhase) {
    setLayers({ current: { scene, timePhase }, under: layers.current });
  }

  const currentKey = `${layers.current.scene}-${layers.current.timePhase}`;

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {layers.under && (
        <SkyLayer scene={layers.under.scene} timePhase={layers.under.timePhase} animateGlows={false} />
      )}
      <motion.div
        key={currentKey}
        className="absolute inset-0"
        initial={{ opacity: layers.under ? 0 : 1 }}
        animate={{ opacity: 1 }}
        transition={SCENE_FADE}
        onAnimationComplete={() => setLayers((l) => ({ ...l, under: null }))}
      >
        <SkyLayer scene={layers.current.scene} timePhase={layers.current.timePhase} animateGlows={!show3D} />
      </motion.div>

      {/* 非 3D 档位 / 3D 加载前依然呈现同步的轻量 CSS 雨雪动效 */}
      {!show3D && (scene === 'rain' || scene === 'thunder') && (
        <div className="absolute inset-0 overflow-hidden">
          {CSS_RAIN_DROPS.map((d, idx) => (
            <span
              key={idx}
              className="css-raindrop"
              style={
                {
                  left: d.left,
                  animationDelay: d.delay,
                  animationDuration: d.duration,
                  opacity: d.opacity,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      {!show3D && scene === 'snow' && (
        <div className="absolute inset-0 overflow-hidden">
          {CSS_SNOW_FLAKES.map((f, idx) => (
            <span
              key={idx}
              className="css-snowflake"
              style={
                {
                  left: f.left,
                  width: `${f.size}px`,
                  height: `${f.size}px`,
                  animationDelay: f.delay,
                  animationDuration: f.duration,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}

      {show3D && (
        <ErrorBoundary onError={markWebglFailed}>
          <Suspense fallback={null}>
            <Sky3D
              scene={scene}
              timePhase={timePhase}
              quality={quality}
              animate={pageVisible}
              gyro={gyro}
              onSlow={preference === 'auto' ? downgrade : undefined}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}

function SkyLayer({
  scene,
  timePhase,
  animateGlows,
}: {
  scene: Scene;
  timePhase: TimePhase;
  animateGlows: boolean;
}) {
  const style = resolveScenePalette(scene, timePhase);
  return (
    <div className="absolute inset-0" style={{ background: style.sky }}>
      <Glow color={style.glows[0]} animate={animateGlows} className="-left-[20vmax] -top-[18vmax] size-[60vmax]" dx="8vw" dy="6vh" duration={22} />
      <Glow color={style.glows[1]} animate={animateGlows} className="-right-[25vmax] top-[20vh] size-[55vmax]" dx="-10vw" dy="-5vh" duration={28} />
      <Glow color={style.glows[2]} animate={animateGlows} className="-bottom-[25vmax] left-[10vw] size-[50vmax]" dx="6vw" dy="-8vh" duration={34} />
    </div>
  );
}

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible',
  );
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

function useAfterFirstPaint(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => setReady(true), 300);
    return () => window.clearTimeout(id);
  }, []);
  return ready;
}

function Glow({
  color,
  animate,
  className,
  dx,
  dy,
  duration,
}: {
  color: string;
  animate: boolean;
  className: string;
  dx: string;
  dy: string;
  duration: number;
}) {
  return (
    <div
      className={`absolute rounded-full opacity-60 ${animate ? 'will-change-transform' : ''} ${className}`}
      style={
        {
          background: `radial-gradient(circle, ${color} 0%, transparent 65%)`,
          animation: animate ? `drift ${duration}s ease-in-out infinite` : 'none',
          '--dx': dx,
          '--dy': dy,
        } as CSSProperties
      }
    />
  );
}
