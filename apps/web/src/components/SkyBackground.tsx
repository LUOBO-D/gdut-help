import { motion } from 'motion/react';
import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react';
import { useLocation } from 'react-router';
import { SCENE_STYLES, type Scene } from '../lib/scene';
import { SCENE_FADE } from '../motion/presets';
import { useEffectiveQuality, useQualityStore } from '../three/quality-store';
import { ErrorBoundary } from './ErrorBoundary';

// three.js 体积较大，单独分包，首屏渲染完成后再加载
const Sky3D = lazy(() => import('../three/Sky3D'));

/** 3D 天空持续动画的页面；其他页面只保留最后一帧 */
const ANIMATED_PATHS = new Set(['/', '/login']);

/**
 * 天空背景，自下而上三层：
 * 1. CSS 渐变（场景切换时交叉淡化）+ 光斑：所有画质都有，3D 加载前也立即可见
 * 2. 3D 天空：高、中画质
 * 3. 细噪点：减少大面积渐变的色带
 */
export function SkyBackground({ scene }: { scene: Scene }) {
  const quality = useEffectiveQuality();
  const preference = useQualityStore((s) => s.preference);
  const gyro = useQualityStore((s) => s.gyro);
  const downgrade = useQualityStore((s) => s.downgrade);
  const markWebglFailed = useQualityStore((s) => s.markWebglFailed);
  const { pathname } = useLocation();
  const idle = useAfterFirstPaint();
  const show3D = idle && (quality === 'high' || quality === 'medium');

  const [layers, setLayers] = useState<{ current: Scene; under: Scene | null }>({ current: scene, under: null });
  if (layers.current !== scene) setLayers({ current: scene, under: layers.current });

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* 旧场景完全不透明地垫在下面，新场景在上面淡入，结束后再移除旧场景。
          如果让两层同时半透明交叉淡化，中途会透出 body 底色，看起来就是一次闪屏 */}
      {layers.under && <SkyLayer scene={layers.under} animateGlows={false} />}
      <motion.div
        key={layers.current}
        className="absolute inset-0"
        initial={{ opacity: layers.under ? 0 : 1 }}
        animate={{ opacity: 1 }}
        transition={SCENE_FADE}
        onAnimationComplete={() => setLayers((l) => ({ ...l, under: null }))}
      >
        <SkyLayer scene={layers.current} animateGlows={!show3D} />
      </motion.div>

      {show3D && (
        <ErrorBoundary onError={markWebglFailed}>
          <Suspense fallback={null}>
            <Sky3D
              scene={scene}
              quality={quality}
              animate={ANIMATED_PATHS.has(pathname)}
              gyro={gyro}
              onSlow={preference === 'auto' ? downgrade : undefined}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
    </div>
  );
}

/** 一个场景的渐变和光斑。有 3D 时光斑静止，动态交给 3D 场景，减少同时进行的合成动画 */
function SkyLayer({ scene, animateGlows }: { scene: Scene; animateGlows: boolean }) {
  const style = SCENE_STYLES[scene];
  return (
    <div className="absolute inset-0" style={{ background: style.sky }}>
      <Glow color={style.glows[0]} animate={animateGlows} className="-left-[20vmax] -top-[18vmax] size-[60vmax]" dx="8vw" dy="6vh" duration={22} />
      <Glow color={style.glows[1]} animate={animateGlows} className="-right-[25vmax] top-[20vh] size-[55vmax]" dx="-10vw" dy="-5vh" duration={28} />
      <Glow color={style.glows[2]} animate={animateGlows} className="-bottom-[25vmax] left-[10vw] size-[50vmax]" dx="6vw" dy="-8vh" duration={34} />
    </div>
  );
}

/** 首屏绘制完成、浏览器空闲后才返回 true，保证 3D 不拖慢首屏 */
function useAfterFirstPaint(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    // Safari 没有 requestIdleCallback
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
      // 径向渐变本身就是柔边，不再叠加 CSS blur：对 60vmax 的大元素做模糊，切换场景时重绘开销很大
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
