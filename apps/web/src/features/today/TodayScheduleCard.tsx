import {
  addDays,
  formatDuration,
  formatHm,
  matchCampusBuilding,
  sessionsOn,
  today,
  type ClassSession,
  type WeatherHour,
} from '@gduthelp/shared';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { GlassCard } from '../../components/GlassCard';
import { WeatherIcon } from '../../components/WeatherIcon';
import { CalendarIcon, ChevronRightIcon, ClockIcon, NavigationIcon, PinIcon } from '../../components/icons';
import { useAuth } from '../../lib/auth-store';
import { useTimetable, useWeather } from '../../lib/queries';
import { useNow } from '../../lib/use-now';
import { stagger } from '../../motion/presets';

interface SpotlightSession {
  session: ClassSession;
  label: string;
  ongoing: boolean;
  isTomorrow: boolean;
}

function findSpotlight(
  sessionsToday: ClassSession[],
  sessionsTomorrow: ClassSession[],
  now: Date,
): SpotlightSession | null {
  for (const s of sessionsToday) {
    const start = new Date(s.start);
    const end = new Date(s.end);
    if (end <= now) continue;
    if (start <= now) {
      return {
        session: s,
        label: `正在上课 · 还剩 ${formatDuration((end.getTime() - now.getTime()) / 60_000)}`,
        ongoing: true,
        isTomorrow: false,
      };
    }
    return {
      session: s,
      label: `${formatDuration((start.getTime() - now.getTime()) / 60_000)}后上课`,
      ongoing: false,
      isTomorrow: false,
    };
  }
  const firstTomorrow = sessionsTomorrow[0];
  return firstTomorrow
    ? {
        session: firstTomorrow,
        label: `明日首节 · ${formatHm(firstTomorrow.start)}`,
        ongoing: false,
        isTomorrow: true,
      }
    : null;
}

/** 为每节课匹配最接近上课时刻的天气摘要 */
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

const DEFAULT_VISIBLE_ROWS = 3;

/**
 * 首页核心视觉焦点卡：将「下一节课」与「今日课程」收拢为统一卡片，
 * 全宽呈现避免长课名截断，细线分隔消除嵌套套娃，一键直达 3D 校园导航。
 */
export function TodayScheduleCard() {
  const { data: timetable, isPending } = useTimetable();
  const weather = useWeather().data;
  const campusId = useAuth((s) => s.user?.campusId);
  const now = useNow(30_000);
  const [expanded, setExpanded] = useState(false);

  const todayStr = today(now);
  const sessionsToday = useMemo(
    () => (timetable ? sessionsOn(timetable, todayStr, campusId) : []),
    [timetable, todayStr, campusId],
  );
  const sessionsTomorrow = useMemo(
    () => (timetable ? sessionsOn(timetable, addDays(todayStr, 1), campusId) : []),
    [timetable, todayStr, campusId],
  );

  const spotlight = useMemo(
    () => findSpotlight(sessionsToday, sessionsTomorrow, now),
    [sessionsToday, sessionsTomorrow, now],
  );

  let emptyText: string | null = null;
  let needsImport = false;
  if (isPending && !timetable) {
    emptyText = '正在同步课表…';
  } else if (!timetable?.semester) {
    emptyText = '正在初始化学期…';
  } else if (!spotlight && sessionsToday.length === 0) {
    if (timetable.courses.length === 0) {
      emptyText = '还没有导入课表，点此一键从教务系统导入';
      needsImport = true;
    } else {
      emptyText = '今明两天没有课，好好安排自己的时间';
    }
  }

  const mappedSpotlight = spotlight?.session.location ? matchCampusBuilding(spotlight.session.location) : null;

  const allDoneToday = sessionsToday.length > 0 && sessionsToday.every((s) => new Date(s.end) <= now);

  // 若今天只有 1 节课且它正好作为顶部聚焦展示，则不再重复画一遍列表；全天已上完时默认折叠为轻巧一行回顾
  const hasTodayList =
    sessionsToday.length > 1 ||
    (sessionsToday.length === 1 && (!spotlight || spotlight.isTomorrow));
  const showListRows = hasTodayList && (!allDoneToday || expanded);

  const visibleSessions = useMemo(() => {
    if (!showListRows) return [];
    if (expanded || sessionsToday.length <= DEFAULT_VISIBLE_ROWS) return sessionsToday;
    // 未展开时优先展示尚未结束的课程；若全天已上完则展示全部
    const upcomingIdx = sessionsToday.findIndex((s) => new Date(s.end) > now);
    if (upcomingIdx <= 0) return sessionsToday.slice(0, DEFAULT_VISIBLE_ROWS);
    const startIdx = Math.min(upcomingIdx, Math.max(0, sessionsToday.length - DEFAULT_VISIBLE_ROWS));
    return sessionsToday.slice(startIdx, startIdx + DEFAULT_VISIBLE_ROWS);
  }, [expanded, now, sessionsToday, showListRows]);

  const hours = weather?.hourly ?? [];

  return (
    <GlassCard variants={stagger.item} className="p-4 sm:p-5">
      {/* 统一轻盈卡头 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted">
          <CalendarIcon size={15} className="shrink-0 text-accent" />
          <h2>{sessionsToday.length > 0 ? '今日课程' : '下一节课'}</h2>
          {sessionsToday.length > 0 && (
            <span className="font-normal text-fg-muted">· 共 {sessionsToday.length} 节</span>
          )}
        </div>
        <Link
          to="/timetable"
          className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-accent transition-opacity hover:opacity-80"
        >
          课表
          <ChevronRightIcon size={14} />
        </Link>
      </div>

      {/* 主视觉焦点区：下一节 / 正在上课 / 空状态 */}
      {spotlight ? (
        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            {spotlight.ongoing && (
              <span className="relative flex size-2 shrink-0" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-accent" />
              </span>
            )}
            <span
              className={`text-xs font-medium ${
                spotlight.isTomorrow ? 'text-fg-muted' : 'text-accent'
              }`}
            >
              {spotlight.label}
            </span>
          </div>

          <div className="mt-1.5 flex items-start justify-between gap-3">
            <Link to="/timetable" className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[19px] font-bold leading-snug tracking-tight">
                {spotlight.session.name}
              </p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted">
                <span className="inline-flex items-center gap-1 font-num tabular-nums">
                  <ClockIcon size={12} className="shrink-0" />
                  {formatHm(spotlight.session.start)}–{formatHm(spotlight.session.end)}
                </span>
                <span>
                  第 {spotlight.session.periodStart}
                  {spotlight.session.periodEnd > spotlight.session.periodStart
                    ? `–${spotlight.session.periodEnd}`
                    : ''}{' '}
                  节
                </span>
                {spotlight.session.location && !mappedSpotlight && (
                  <span className="inline-flex items-center gap-0.5 truncate">
                    <PinIcon size={12} className="shrink-0" />
                    <span className="truncate">{spotlight.session.location}</span>
                  </span>
                )}
              </p>
            </Link>

            {spotlight.session.location && mappedSpotlight && (
              <Link
                to={`/map?q=${encodeURIComponent(spotlight.session.location)}`}
                className="mt-0.5 inline-flex max-w-[44%] shrink-0 items-center gap-1 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-opacity hover:opacity-85"
                title={`导航到 ${mappedSpotlight.name}`}
              >
                <PinIcon size={12} className="shrink-0" />
                <span className="truncate">{spotlight.session.location}</span>
                <NavigationIcon size={11} className="shrink-0" />
              </Link>
            )}
          </div>
        </div>
      ) : emptyText ? (
        <Link to="/timetable" className="mt-3 flex items-center justify-between gap-3 py-1">
          <p className="text-sm text-fg-muted">{emptyText}</p>
          {needsImport && (
            <span className="shrink-0 rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
              去导入
            </span>
          )}
        </Link>
      ) : null}

      {/* 今日其余课程细线列表（全天已上完时默认折叠为一行轻回顾，不占首屏空间） */}
      {hasTodayList && (
        <div className="mt-4 border-t border-current/10 pt-1">
          {showListRows && visibleSessions.length > 0 && (
            <ul className="divide-y divide-current/8">
              {visibleSessions.map((s) => {
                const start = new Date(s.start);
                const end = new Date(s.end);
                const ongoing = now >= start && now < end;
                const done = now >= end;
                const isNextUp =
                  !ongoing &&
                  !done &&
                  Boolean(
                    spotlight &&
                      !spotlight.isTomorrow &&
                      spotlight.session.courseId === s.courseId &&
                      spotlight.session.periodStart === s.periodStart,
                  );
                const w = weatherAt(hours, s.start);
                const mapped = s.location ? matchCampusBuilding(s.location) : null;

                return (
                  <li
                    key={`${s.courseId}-${s.periodStart}`}
                    className={`flex items-center gap-2.5 py-2.5 transition-opacity ${
                      done ? 'opacity-55' : ''
                    }`}
                  >
                    <Link to="/timetable" className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="w-10 shrink-0 text-right font-num tabular-nums">
                        <p className="text-[13px] font-semibold leading-tight">{formatHm(start)}</p>
                        <p className="text-[11px] leading-tight text-fg-muted">{formatHm(end)}</p>
                      </div>
                      <span
                        className="h-7 w-1 shrink-0 rounded-full"
                        style={{ background: s.color }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-fg-muted">
                          {s.location && (
                            <>
                              <span className="truncate">{s.location}</span>
                              <span aria-hidden>·</span>
                            </>
                          )}
                          <span className="shrink-0">
                            第 {s.periodStart}
                            {s.periodEnd > s.periodStart ? `–${s.periodEnd}` : ''} 节
                          </span>
                        </p>
                      </div>
                    </Link>

                    {ongoing ? (
                      <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg">
                        上课中
                      </span>
                    ) : isNextUp ? (
                      <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
                        下节
                      </span>
                    ) : w ? (
                      <span className="hidden shrink-0 items-center gap-1 text-xs text-fg-muted sm:flex">
                        <WeatherIcon scene={w.scene} size={14} />
                        <span className="font-num tabular-nums">{w.temp}°</span>
                      </span>
                    ) : null}

                    {mapped && s.location && (
                      <Link
                        to={`/map?q=${encodeURIComponent(s.location)}`}
                        aria-label={`导航到 ${s.location}`}
                        title={`导航到 ${mapped.name}`}
                        className={`grid size-7 shrink-0 place-items-center rounded-full transition-opacity hover:opacity-80 ${
                          done ? 'surface-subtle text-fg-muted' : 'bg-accent/15 text-accent'
                        }`}
                      >
                        <NavigationIcon size={13} />
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {allDoneToday ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex w-full items-center justify-between pt-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
            >
              <span>今日 {sessionsToday.length} 节课已全部结束</span>
              <span className="font-medium text-accent">{expanded ? '收起' : '展开回顾'}</span>
            </button>
          ) : (
            sessionsToday.length > DEFAULT_VISIBLE_ROWS && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 flex w-full items-center justify-center gap-1 pt-1.5 text-xs font-medium text-fg-muted transition-colors hover:text-fg"
              >
                {expanded ? '收起今日课程' : `展开今日全部 ${sessionsToday.length} 节课`}
              </button>
            )
          )}
        </div>
      )}
    </GlassCard>
  );
}
