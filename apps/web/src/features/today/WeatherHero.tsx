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
      <section className="py-7 text-center sm:py-9" aria-label="天气">
        <p className="flex items-start justify-center font-num font-extralight leading-none tabular-nums">
          <span className="text-[84px] tracking-tight sm:text-[96px]">--</span>
          <span className="mt-2.5 text-3xl text-fg-muted sm:mt-3 sm:text-4xl">°</span>
        </p>
        <p className="mt-3 text-sm text-fg-muted">{isPending ? '正在获取实时天气…' : isError ? '天气暂时获取不到' : ''}</p>
      </section>
    );
  }

  const needUmbrella = w.today.pop !== null && w.today.pop >= 50;
  return (
    <section className="py-6 text-center sm:py-8" aria-label="天气">
      <p className="text-sm text-fg-muted">
        {w.location}
        {campus && ` · ${campus.name}`}
      </p>
      <p
        className="mt-1 flex items-start justify-center font-num font-extralight leading-none tabular-nums"
        aria-label={`${w.now.temp} 度`}
      >
        <span className="text-[84px] tracking-tight sm:text-[96px]">
          <RollingNumber value={w.now.temp} />
        </span>
        <span className="mt-2.5 text-3xl text-fg-muted sm:mt-3 sm:text-4xl">°</span>
      </p>
      <div className="mt-2 flex items-center justify-center gap-2">
        <span className="text-lg font-medium">{w.now.text}</span>
        {needUmbrella && (
          <span className="glass-thin rounded-full! px-2.5 py-0.5 text-xs font-medium text-accent">记得带伞</span>
        )}
      </div>
      <p className="mt-1 font-num text-sm text-fg-muted tabular-nums">
        {w.today.min}° / {w.today.max}° · 体感 {w.now.feelsLike}°{w.today.pop !== null && ` · 降水 ${w.today.pop}%`}
      </p>
      {w.stale && <p className="mt-1 text-xs text-fg-muted">天气服务暂时不可用，显示的是较早的数据</p>}
    </section>
  );
}
