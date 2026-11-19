import { findCampus } from '@gduthelp/shared';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect } from 'react';
import { useAuth } from '../../lib/auth-store';
import { useWeather } from '../../lib/queries';

/** 温度变化时数字滚动过去，而不是直接跳变 */
function RollingNumber({ value }: { value: number }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => String(Math.round(v)));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.6, ease: 'easeOut' });
    return () => controls.stop();
  }, [mv, value]);
  return <motion.span>{text}</motion.span>;
}

export function WeatherHero() {
  const { data: w, isPending, isError } = useWeather();
  const campus = findCampus(useAuth((s) => s.user?.campusId));

  if (!w) {
    return (
      <section className="py-10 text-center" aria-label="天气">
        <p className="flex items-start justify-center font-num font-extralight leading-none tabular-nums">
          <span className="text-[96px] tracking-tight">--</span>
          <span className="mt-3 text-4xl text-fg-muted">°</span>
        </p>
        <p className="mt-3 text-fg-muted">{isPending ? '正在获取天气…' : isError ? '天气暂时获取不到' : ''}</p>
      </section>
    );
  }

  const tip = w.today.pop !== null && w.today.pop >= 50 ? ' · 记得带伞' : '';
  return (
    <section className="py-8 text-center" aria-label="天气">
      <p className="text-sm text-fg-muted">
        {w.location}
        {campus && ` · ${campus.name}`}
      </p>
      <p className="mt-1 flex items-start justify-center font-num font-extralight leading-none tabular-nums" aria-label={`${w.now.temp} 度`}>
        <span className="text-[96px] tracking-tight">
          <RollingNumber value={w.now.temp} />
        </span>
        <span className="mt-3 text-4xl text-fg-muted">°</span>
      </p>
      <p className="mt-2 text-lg">{w.now.text}</p>
      <p className="mt-1 text-sm text-fg-muted">
        {w.today.min}° / {w.today.max}° · 体感 {w.now.feelsLike}°{w.today.pop !== null && ` · 降水 ${w.today.pop}%`}
        {tip}
      </p>
      {w.stale && <p className="mt-1 text-xs text-fg-muted">天气服务暂时不可用，显示的是较早的数据</p>}
    </section>
  );
}
