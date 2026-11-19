import { formatHm, sessionsOn, today } from '@gduthelp/shared';
import { useMemo } from 'react';
import { GlassCard } from '../../components/GlassCard';
import { WeatherIcon } from '../../components/WeatherIcon';
import { useAuth } from '../../lib/auth-store';
import { useTimetable, useWeather } from '../../lib/queries';
import { stagger } from '../../motion/presets';

const COL = 56;
const HOURS = 16;
/** 课程块最小宽度，正在上的课只剩十几分钟时也能看清名字 */
const MIN_BLOCK = 76;

/** 逐小时天气，下方一条课程轨道：课程块按时间对齐到对应的小时 */
export function TimelineCard() {
  const weather = useWeather().data;
  const timetable = useTimetable().data;
  const campusId = useAuth((s) => s.user?.campusId);
  const hours = weather?.hourly.slice(0, HOURS) ?? [];
  const sessions = useMemo(() => (timetable ? sessionsOn(timetable, today(), campusId) : []), [timetable, campusId]);

  const origin = hours[0] ? new Date(hours[0].time).getTime() : 0;
  const x = (iso: string) => ((new Date(iso).getTime() - origin) / 3600_000) * COL;
  const width = HOURS * COL;
  const visible = sessions.filter((s) => x(s.end) > 0 && x(s.start) < width);

  return (
    <GlassCard variants={stagger.item} className="col-span-2 p-4 xl:col-span-4">
      <h2 className="mb-3 text-[15px] font-semibold">逐小时天气 · 今日课程</h2>
      {hours.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-muted">暂无天气数据</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <div style={{ width }} className="relative">
            <div className="flex">
              {hours.map((h, i) => (
                <div key={h.time} style={{ width: COL }} className="flex shrink-0 flex-col items-center gap-1.5 text-xs">
                  <span className="text-fg-muted">{i === 0 ? '现在' : `${formatHm(h.time).slice(0, 2)}时`}</span>
                  <WeatherIcon scene={h.scene} size={22} />
                  <span className="font-num text-sm tabular-nums">{h.temp}°</span>
                  <span className="h-4 text-[11px] text-accent">{h.pop !== null && h.pop >= 30 ? `${h.pop}%` : ''}</span>
                </div>
              ))}
            </div>
            <div className="relative mt-2 h-11">
              <div className="absolute inset-x-0 top-1/2 h-px bg-current opacity-15" />
              {visible.map((s) => {
                const left = Math.min(Math.max(0, x(s.start)), width - MIN_BLOCK);
                const right = Math.max(left + MIN_BLOCK, Math.min(width, x(s.end)));
                return (
                  <div
                    key={`${s.courseId}-${s.periodStart}`}
                    className="absolute top-0 flex h-11 flex-col justify-center overflow-hidden rounded-xl px-2 text-[11px] leading-tight text-white shadow"
                    style={{ left, width: right - left - 2, background: s.color }}
                    title={`${s.name} ${formatHm(s.start)}–${formatHm(s.end)}`}
                  >
                    <span className="truncate font-semibold">{s.name}</span>
                    <span className="truncate opacity-90">{s.location ?? `${formatHm(s.start)}`}</span>
                  </div>
                );
              })}
              {visible.length === 0 && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 pr-2 text-xs text-fg-muted [background:inherit]">
                  {sessions.length ? '接下来的时间没有课' : '今天没有课'}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
      {weather && <p className="mt-2 text-right text-[10px] text-fg-muted">{weather.attribution}</p>}
    </GlassCard>
  );
}
