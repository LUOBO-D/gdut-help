import { useEffect, useRef } from 'react';
import { QUALITY_LABEL } from '../three/quality';
import { useEffectiveQuality } from '../three/quality-store';

/** 页面帧率读数（每 0.5 秒更新），显示在右下角，在「我的 → 显示设置」中开启，用来在真机上验证流畅度。 */
export function FpsMeter() {
  const quality = useEffectiveQuality();
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      frames++;
      if (now - last >= 500) {
        // 直接写 DOM，避免每 0.5 秒触发一次 React 渲染
        if (label.current) label.current.textContent = String(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="glass-thick pointer-events-none fixed bottom-[calc(max(env(safe-area-inset-bottom),12px)+84px)] right-3 z-50 xl:bottom-4 rounded-full! px-3 py-1 font-num text-xs tabular-nums">
      <span ref={label}>--</span> fps · {quality ? QUALITY_LABEL[quality] : '检测中'}
    </div>
  );
}
