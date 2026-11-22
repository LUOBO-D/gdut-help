import { findCampus, formatHm } from '@gduthelp/shared';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useState } from 'react';
import { GlassCard } from '../../components/GlassCard';
import { WeatherIcon } from '../../components/WeatherIcon';
import { ChevronRightIcon } from '../../components/icons';
import { useAuth } from '../../lib/auth-store';
import { useWeather } from '../../lib/queries';

/** 温度变化时数字平滑过渡 */
function RollingNumber({ value }: { value: number }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => String(Math.round(v)));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.5, ease: 'easeOut' });
    return () => controls.stop();
  }, [mv, value]);
  return <motion.span>{text}</motion.span>;
}

/**
 * 紧凑校区天气条：弱化「天气预报」占比，把首屏视觉重心留给课表、待办与吃什么；
 * 需要看未来逐小时天气时，轻点天气条即可展开。
 */
export function WeatherHero() {
  const { data: w, isPending, isError } = useWeather();
  const campus = findCampus(useAuth((s) => s.user?.campusId));
  const [expanded, setExpanded] = useState(false);

  if (!w) {
    return (
      <section aria-label="天气">
        <GlassCard variant="thin" className="flex items-center justify-between gap-3 rounded-2xl! px-4 py-2.5">
          <div className="flex items-center gap-2.5 text-sm text-fg-muted">
            <span className="font-num text-xl font-light tabular-nums">--°</span>
            <span>{isPending ? '正在同步校区天气…' : isError ? '天气暂时获取不到' : ''}</span>
          </div>
          {campus && <span className="text-xs text-fg-muted">{campus.name}</span>}
        </GlassCard>
      </section>
    );
  }

  const needUmbrella = w.today.pop !== null && w.today.pop >= 50;
  const hours = w.hourly.slice(0, 14);
  const hasHourly = hours.length > 0;

  return (
    <section aria-label="校区天气">
      <GlassCard variant="thin" className="overflow-hidden rounded-2xl!">
        <button
          type="button"
          onClick={() => hasHourly && setExpanded((v) => !v)}
          aria-expanded={hasHourly ? expanded : undefined}
          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="shrink-0">
              <WeatherIcon scene={w.now.scene} size={22} />
            </span>
            <span className="font-num text-xl font-semibold leading-none tabular-nums" aria-label={`${w.now.temp} 度`}>
              <RollingNumber value={w.now.temp} />°
            </span>
            <span className="truncate text-sm font-medium">{w.now.text}</span>
            {needUmbrella && (
              <span className="shrink-0 rounded-full bg-accent/18 px-2 py-0.5 text-[11px] font-medium text-accent">
                记得带伞
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 text-right">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="hidden text-fg-muted sm:inline">{campus ? campus.name : w.location}</span>
              <span className="font-num text-fg-muted tabular-nums">
                {w.today.min}°/{w.today.max}°
                {w.today.pop !== null && w.today.pop >= 20 ? ` · ${w.today.pop}%` : ''}
              </span>
            </div>
            {hasHourly && (
              <ChevronRightIcon
                size={14}
                className={`text-fg-muted transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
              />
            )}
          </div>
        </button>

        {w.stale && (
          <p className="px-4 pb-2 text-[11px] text-fg-muted">天气服务暂时不可用，显示的是较早的数据</p>
        )}

        {expanded && hasHourly && (
          <div className="border-t border-current/10 px-4 pb-3 pt-2.5">
            <div className="-mx-4 flex overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
              {hours.map((h, i) => (
                <div key={h.time} className="flex w-13 shrink-0 flex-col items-center gap-1 text-xs">
                  <span className="text-[11px] text-fg-muted">{i === 0 ? '现在' : `${formatHm(h.time).slice(0, 2)}时`}</span>
                  <WeatherIcon scene={h.scene} size={18} />
                  <span className="font-num text-xs font-medium tabular-nums">{h.temp}°</span>
                  {h.pop !== null && h.pop >= 30 && (
                    <span className="font-num text-[10px] text-accent tabular-nums">{h.pop}%</span>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-1.5 flex items-center justify-between text-[10px] text-fg-muted">
              <span>体感 {w.now.feelsLike}°{w.now.humidity != null ? ` · 湿度 ${w.now.humidity}%` : ''}</span>
              <span>{w.attribution}</span>
            </p>
          </div>
        )}
      </GlassCard>
    </section>
  );
}
