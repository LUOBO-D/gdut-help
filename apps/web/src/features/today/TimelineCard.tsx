import { formatHm, matchCampusBuilding, sessionsOn, today, type WeatherHour } from '@gduthelp/shared';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { GlassCard } from '../../components/GlassCard';
import { WeatherIcon } from '../../components/WeatherIcon';
import { ChevronRightIcon, NavigationIcon, PinIcon } from '../../components/icons';
import { useAuth } from '../../lib/auth-store';
import { useTimetable, useWeather } from '../../lib/queries';
import { useNow } from '../../lib/use-now';
import { stagger } from '../../motion/presets';

/** 为每节课匹配最接近上课时刻的天气摘要，只在有课时展示 */
function weatherAt(hours: WeatherHour[], iso: string): WeatherHour | null {
  if (!hours.length) return null;
  const target = new Date(iso).getTime();
  let best: WeatherHour | null = null;
  let bestDiff = 90 * 60_000;
  for (const h of hours) {
    const diff = Math.abs(new Date(h.time).getTime() - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = h;
    }
  }
  return best;
}

/** 今日课程日程卡：围绕校园课程而非天气预报；当天无课时不占首屏空间 */
export function TimelineCard() {
  const weather = useWeather().data;
  const timetable = useTimetable().data;
  const campusId = useAuth((s) => s.user?.campusId);
  const now = useNow(60_000);
  const todayStr = today(now);
  const sessions = useMemo(
    () => (timetable ? sessionsOn(timetable, todayStr, campusId) : []),
    [timetable, todayStr, campusId],
  );

  if (sessions.length === 0) return null;

  const hours = weather?.hourly ?? [];

  return (
    <GlassCard variants={stagger.item} className="col-span-2 p-4 xl:col-span-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold">今日课程</h2>
          <span className="text-xs text-fg-muted">共 {sessions.length} 节</span>
        </div>
        <Link to="/timetable" className="inline-flex items-center gap-0.5 text-xs font-medium text-accent">
          查看课表
          <ChevronRightIcon size={14} />
        </Link>
      </div>

      <ul className="space-y-2">
        {sessions.map((s) => {
          const start = new Date(s.start);
          const end = new Date(s.end);
          const ongoing = now >= start && now < end;
          const done = now >= end;
          const w = weatherAt(hours, s.start);
          const mapped = s.location ? matchCampusBuilding(s.location) : null;

          return (
            <li
              key={`${s.courseId}-${s.periodStart}`}
              className={`surface-subtle flex items-center gap-2 rounded-2xl px-3 py-2.5 transition-opacity ${
                ongoing ? 'ring-2 ring-accent' : done ? 'opacity-55' : ''
              }`}
            >
              <Link to="/timetable" className="flex min-w-0 flex-1 items-center gap-3">
                <div className="w-11 shrink-0 text-right font-num tabular-nums">
                  <p className="text-sm font-semibold leading-tight">{formatHm(start)}</p>
                  <p className="text-[11px] text-fg-muted">{formatHm(end)}</p>
                </div>
                <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-fg-muted">
                    {s.location && (
                      <>
                        <PinIcon size={12} className="shrink-0" />
                        <span className="truncate">{s.location}</span>
                        <span aria-hidden>·</span>
                      </>
                    )}
                    <span className="shrink-0">
                      第 {s.periodStart}
                      {s.periodEnd > s.periodStart ? `-${s.periodEnd}` : ''} 节
                    </span>
                  </p>
                </div>
              </Link>
              {ongoing ? (
                <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg">
                  上课中
                </span>
              ) : w ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-fg-muted">
                  <WeatherIcon scene={w.scene} size={15} />
                  <span className="font-num tabular-nums">{w.temp}°</span>
                </span>
              ) : null}
              {mapped && s.location && (
                <Link
                  to={`/map?q=${encodeURIComponent(s.location)}`}
                  aria-label={`导航到 ${s.location}`}
                  title={`导航到 ${mapped.name}`}
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/15 text-accent"
                >
                  <NavigationIcon size={14} />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
