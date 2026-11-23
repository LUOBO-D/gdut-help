import {
  calendarTermProgress,
  currentPeriodBlock,
  findCalendarTermForDate,
  GDUT_STUDY_SPOTS,
  parseDate,
  parseEmptyClassrooms,
  periodBlocksFor,
  today,
  weekOf,
  type EmptyClassroom,
} from '@gduthelp/shared';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { ClockIcon, NavigationIcon, PinIcon } from '../../components/icons';
import { useAuth } from '../../lib/auth-store';
import { jwEmptyClassroomsPayload, JwLoginRequired, jwSemesters, loginToJw } from '../../lib/jw';
import { isNative } from '../../lib/platform';
import { useTimetable } from '../../lib/queries';
import { toast } from '../../lib/toast-store';
import { useNow } from '../../lib/use-now';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'] as const;

/**
 * 空教室查询与常驻自习空间推荐面板：
 * - 安卓端支持按周次、星期、节次实时直连教务系统查空教室，并一键跳转 3D 校园地图导航；
 * - 全端常驻展示广工热门自习建筑与开放时段，下课顺路直接去自习。
 */
export function EmptyClassroomPanel() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const timetable = useTimetable().data;
  const now = useNow(60_000);
  const todayStr = today(now);
  const todayWeekday = parseDate(todayStr).weekday;

  const calendarTerm = findCalendarTermForDate(todayStr);
  const semester = timetable?.semester ?? null;
  const defaultWeek =
    (semester ? weekOf(semester, todayStr) : null) ??
    calendarTermProgress(calendarTerm, todayStr).currentWeek ??
    1;

  const periodBlocks = useMemo(() => periodBlocksFor(user?.campusId), [user?.campusId]);
  const defaultBlock = currentPeriodBlock(now, user?.campusId);

  const [week, setWeek] = useState<number>(defaultWeek);
  const [weekday, setWeekday] = useState<number>(todayWeekday);
  const [periodCode, setPeriodCode] = useState<string>(defaultBlock.code);

  const [querying, setQuerying] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<EmptyClassroom[]>([]);
  const [buildingFilter, setBuildingFilter] = useState<string>('全部');

  const selectedBlock = periodBlocks.find((b) => b.code === periodCode) ?? periodBlocks[0]!;

  const buildingGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rooms) {
      counts.set(r.building, (counts.get(r.building) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'));
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    if (buildingFilter === '全部') return rooms;
    return rooms.filter((r) => r.building === buildingFilter);
  }, [rooms, buildingFilter]);

  const queryLiveRooms = async () => {
    if (!isNative) return;
    setQuerying(true);
    setQueryError(null);

    const run = async () => {
      const { current } = await jwSemesters();
      const semesterCode = current?.code ?? calendarTerm.code;
      const raw = await jwEmptyClassroomsPayload({
        semesterCode,
        week,
        weekday,
        periodCode,
      });
      return parseEmptyClassrooms(raw);
    };

    try {
      let result: EmptyClassroom[];
      try {
        result = await run();
      } catch (err) {
        if (err instanceof JwLoginRequired) {
          const ok = await loginToJw();
          if (!ok) {
            setQueryError('未完成教务系统登录，已取消查询');
            return;
          }
          result = await run();
        } else {
          throw err;
        }
      }
      setRooms(result);
      setBuildingFilter('全部');
      setHasQueried(true);
      if (result.length > 0) {
        toast.success(`已找到 ${result.length} 间空闲教室`);
      } else {
        setQueryError('该时段教务未返回空闲教室记录，可切换节次重试或直接参考下方常驻自习去处');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '查询失败，请确认校园网连接后重试';
      setQueryError(msg);
      toast.error(msg);
    } finally {
      setQuerying(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 时段选择 + 实时查询卡片 */}
      <GlassCard className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold">查空闲教室</h2>
            <p className="mt-0.5 text-xs text-fg-muted">
              已默认定位到当前时段（周{WEEKDAYS[weekday - 1]} · {selectedBlock.label}）
            </p>
          </div>
          <div className="glass-thin inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs">
            <button
              type="button"
              className="px-1.5 font-semibold text-fg-muted hover:text-fg disabled:opacity-40"
              disabled={week <= 1}
              onClick={() => setWeek((w) => Math.max(1, w - 1))}
              aria-label="上一周"
            >
              −
            </button>
            <span className="min-w-[3.5rem] text-center font-num font-semibold tabular-nums">第 {week} 周</span>
            <button
              type="button"
              className="px-1.5 font-semibold text-fg-muted hover:text-fg disabled:opacity-40"
              disabled={week >= 22}
              onClick={() => setWeek((w) => Math.min(22, w + 1))}
              aria-label="下一周"
            >
              +
            </button>
          </div>
        </div>

        {/* 星期选择 */}
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((label, idx) => {
            const wd = idx + 1;
            const active = wd === weekday;
            const isToday = wd === todayWeekday && week === defaultWeek;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setWeekday(wd)}
                className={`relative rounded-xl py-2 text-xs font-medium transition-colors ${
                  active ? 'bg-accent font-semibold text-accent-fg shadow-sm' : 'surface-subtle text-fg-muted hover:text-fg'
                }`}
              >
                周{label}
                {isToday && (
                  <span
                    className={`mx-auto mt-0.5 block size-1 rounded-full ${active ? 'bg-accent-fg' : 'bg-accent'}`}
                    aria-label="今天"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* 2 节连堂时段块 */}
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {periodBlocks.map((block) => {
            const active = block.code === periodCode;
            return (
              <button
                key={block.code}
                type="button"
                onClick={() => setPeriodCode(block.code)}
                className={`rounded-2xl px-2 py-2 text-center transition-colors ${
                  active ? 'bg-accent text-accent-fg shadow-sm' : 'surface-subtle text-fg-muted hover:text-fg'
                }`}
              >
                <p className="text-xs font-semibold">{block.label}</p>
                <p className={`mt-0.5 font-num text-[10px] tabular-nums ${active ? 'text-accent-fg/85' : 'opacity-75'}`}>
                  {block.timeRange}
                </p>
              </button>
            );
          })}
        </div>

        {isNative ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button className="w-full sm:w-auto" loading={querying} onClick={() => void queryLiveRooms()}>
              查询教务实时空教室
            </Button>
            <p className="text-[11px] text-fg-muted">本机直连广工教务，查询结果支持一键 3D 导航</p>
          </div>
        ) : (
          <p className="surface-subtle rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed text-fg-muted">
            教务实时空教室需通过安卓 App 本机直连广工教务获取；下方常驻开放自习楼全端可用，支持一键 3D 校园导航。
          </p>
        )}

        {queryError && <p className="text-xs text-amber-600 dark:text-amber-400">{queryError}</p>}
      </GlassCard>

      {/* 教务实时查询结果 */}
      {hasQueried && rooms.length > 0 && (
        <GlassCard className="space-y-3 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              查询结果 · <span className="font-num text-accent tabular-nums">{filteredRooms.length}</span> 间空闲
            </h3>
            <span className="text-[11px] text-fg-muted">
              第 {week} 周 周{WEEKDAYS[weekday - 1]} {selectedBlock.label}
            </span>
          </div>

          {buildingGroups.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setBuildingFilter('全部')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  buildingFilter === '全部' ? 'bg-accent text-accent-fg' : 'surface-subtle text-fg-muted'
                }`}
              >
                全部 ({rooms.length})
              </button>
              {buildingGroups.map(([b, count]) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBuildingFilter(b)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    buildingFilter === b ? 'bg-accent text-accent-fg' : 'surface-subtle text-fg-muted'
                  }`}
                >
                  {b} ({count})
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {filteredRooms.slice(0, 60).map((room) => (
              <div
                key={room.name}
                className="surface-subtle flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{room.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-fg-muted">
                    {room.seats ? `${room.seats} 座` : room.building}
                    {room.roomType ? ` · ${room.roomType}` : ''}
                  </p>
                </div>
                {room.mapBuildingId && (
                  <button
                    type="button"
                    onClick={() => void navigate(`/map?q=${encodeURIComponent(room.name)}`)}
                    aria-label={`导航到 ${room.name}`}
                    title={`在 3D 地图中导航到 ${room.name}`}
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/15 text-accent transition-opacity hover:opacity-85"
                  >
                    <NavigationIcon size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {filteredRooms.length > 60 && (
            <p className="text-center text-xs text-fg-muted">已展示前 60 间，可按上方教学楼标签筛选缩小范围</p>
          )}
        </GlassCard>
      )}

      {/* 常驻自习去处（全端可用 + 一键去自习导航） */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold tracking-wide text-fg-muted">广工常驻自习去处</h2>
          <span className="text-[11px] text-fg-muted">点「去自习」直达 3D 导航</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {GDUT_STUDY_SPOTS.map((spot) => (
            <GlassCard key={spot.id} className="flex flex-col justify-between gap-3 p-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold">{spot.name}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-fg-muted">
                      <PinIcon size={12} className="shrink-0" />
                      <span className="truncate">{spot.area}</span>
                    </p>
                  </div>
                  <span className="surface-subtle inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-num text-[11px] text-fg-muted tabular-nums">
                    <ClockIcon size={11} />
                    {spot.hours}
                  </span>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-fg-muted">{spot.tip}</p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap gap-1">
                  {spot.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-accent/12 px-2 py-0.5 text-[10px] font-medium text-accent"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void navigate(`/map?q=${encodeURIComponent(spot.mapQuery)}`)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90"
                >
                  <NavigationIcon size={12} />
                  去自习
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      </section>
    </div>
  );
}
