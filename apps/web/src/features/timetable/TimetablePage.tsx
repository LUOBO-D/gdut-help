import { addDays, dateOf, formatHm, parseDate, periodsFor, sessionsOn, today, weekOf, type ClassSession, type TimetableData } from '@gduthelp/shared';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { ChevronLeftIcon, ChevronRightIcon, PinIcon, PlusIcon } from '../../components/icons';
import { PageHeader } from '../../components/PageHeader';
import { CardSkeleton } from '../../components/Skeleton';
import { useAuth } from '../../lib/auth-store';
import { useTimetable } from '../../lib/queries';
import { useNow } from '../../lib/use-now';
import { pressable, spring } from '../../motion/presets';
import { CourseEditor, type CourseDraft } from './CourseEditor';
import { WEEKDAY_LABEL } from './weekday';
import { WeekGrid } from './WeekGrid';

// 导入用得少，按需加载
const ImportSheet = lazy(() => import('./ImportSheet').then((m) => ({ default: m.ImportSheet })));

type View = 'day' | 'week';
const VIEW_KEY = 'gduthelp-timetable-view';

export function TimetablePage() {
  const { data, isPending } = useTimetable();
  const user = useAuth((s) => s.user);
  const now = useNow();
  const semester = data?.semester ?? null;
  const todayStr = today(now);
  const currentWeek = semester ? weekOf(semester, todayStr) : null;
  const [week, setWeek] = useState<number | null>(null);
  /** 选中的是星期几（1–7）。没选时：本周默认今天，其他周默认周一 */
  const [weekday, setWeekday] = useState<number | null>(null);
  const [view, setView] = useState<View>(() => (localStorage.getItem(VIEW_KEY) === 'week' ? 'week' : 'day'));
  const [draft, setDraft] = useState<CourseDraft | null>(null);
  const [importing, setImporting] = useState(false);
  /** 打开过一次后保持挂载，关闭时才有收起动画 */
  const [importLoaded, setImportLoaded] = useState(false);

  if (isPending && !data) {
    return (
      <>
        <PageHeader title="课表" subtitle="正在同步课表…" />
        <CardSkeleton rows={4} />
      </>
    );
  }

  if (!semester) {
    return (
      <>
        <PageHeader title="课表" />
        <GlassCard className="p-5 text-[15px]">
          {user?.role === 'admin' ? (
            <>
              还没有设置当前学期。请先到{' '}
              <Link to="/me" className="text-accent underline">
                我的 → 学期设置
              </Link>{' '}
              填写开学日期和总周数。
            </>
          ) : (
            '管理员还没有设置当前学期，设置好后就能添加课程。'
          )}
        </GlassCard>
      </>
    );
  }

  const shown = week ?? currentWeek ?? (todayStr < semester.startDate ? 1 : semester.totalWeeks);
  const selectedWeekday = weekday ?? (shown === currentWeek ? parseDate(todayStr).weekday : 1);
  const selectedDate = dateOf(semester, shown, selectedWeekday);
  const periods = periodsFor(user?.campusId);

  const goWeek = (w: number) => {
    const next = Math.min(semester.totalWeeks, Math.max(1, w));
    setWeek(next);
    if (next === currentWeek) setWeekday(null);
  };
  const changeView = (v: View) => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };
  const openImport = () => {
    setImportLoaded(true);
    setImporting(true);
  };

  return (
    <>
      <PageHeader
        title="课表"
        subtitle={`${semester.name} · ${currentWeek ? `本周第 ${currentWeek} 周` : todayStr < semester.startDate ? '还没开学' : '学期已结束'}`}
        action={
          <div className="flex gap-2">
            <Button variant="ghost" className="h-10 px-3 text-sm" onClick={openImport}>
              导入
            </Button>
            <Button className="h-10 px-3 text-sm" onClick={() => setDraft(view === 'day' ? { weekday: selectedWeekday } : {})}>
              <PlusIcon size={18} />
              添加
            </Button>
          </div>
        }
      />

      <div className="mb-3 flex items-center justify-between gap-3">
        <ViewSwitch value={view} onChange={changeView} />
        <div className="flex items-center gap-1">
          <button type="button" className="glass-thin grid size-9 place-items-center rounded-full!" aria-label="上一周" disabled={shown <= 1} onClick={() => goWeek(shown - 1)}>
            <ChevronLeftIcon size={18} />
          </button>
          <div className="min-w-[4.5rem] text-center">
            <p className="text-sm font-semibold">第 {shown} 周</p>
            {currentWeek !== null && shown !== currentWeek && (
              <button type="button" className="text-xs text-accent" onClick={() => goWeek(currentWeek)}>
                回到本周
              </button>
            )}
          </div>
          <button
            type="button"
            className="glass-thin grid size-9 place-items-center rounded-full!"
            aria-label="下一周"
            disabled={shown >= semester.totalWeeks}
            onClick={() => goWeek(shown + 1)}
          >
            <ChevronRightIcon size={18} />
          </button>
        </div>
      </div>

      {view === 'day' ? (
        <>
          <WeekStrip
            data={data!}
            campusId={user?.campusId}
            week={shown}
            selected={selectedWeekday}
            todayStr={todayStr}
            onSelect={setWeekday}
            onSwipe={(dir) => goWeek(shown + dir)}
          />
          <DayList
            key={selectedDate}
            sessions={sessionsOn(data!, selectedDate, user?.campusId)}
            date={selectedDate}
            todayStr={todayStr}
            now={now}
            onOpen={(id) => {
              const course = data!.courses.find((c) => c.id === id);
              if (course) setDraft({ course });
            }}
          />
        </>
      ) : (
        <WeekGrid semester={semester} courses={data!.courses} shown={shown} todayStr={todayStr} periods={periods} setDraft={setDraft} />
      )}

      {data!.courses.length === 0 && <p className="mt-3 text-center text-sm text-fg-muted">点右上角「添加」录入第一门课，或者「导入」教务系统的课表</p>}

      <CourseEditor draft={draft} semester={semester} onClose={() => setDraft(null)} />
      {importLoaded && (
        <Suspense fallback={null}>
          <ImportSheet open={importing} onClose={() => setImporting(false)} semester={semester} courses={data!.courses} />
        </Suspense>
      )}
    </>
  );
}

function ViewSwitch({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const options: [View, string][] = [
    ['day', '按天'],
    ['week', '整周'],
  ];
  return (
    <div className="glass-thin flex rounded-full p-1 text-sm" role="tablist" aria-label="课表视图">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} className="relative rounded-full px-3.5 py-1.5" onClick={() => onChange(v)}>
          {value === v && <motion.span layoutId="timetable-view" className="absolute inset-0 rounded-full bg-white/35 shadow-sm" transition={spring.snappy} />}
          <span className={`relative ${value === v ? 'font-semibold' : 'text-fg-muted'}`}>{label}</span>
        </button>
      ))}
    </div>
  );
}

/** 一周七天的日期条。有课的日子下面有小圆点；左右滑动切换周 */
function WeekStrip({
  data,
  campusId,
  week,
  selected,
  todayStr,
  onSelect,
  onSwipe,
}: {
  data: TimetableData;
  campusId: string | null | undefined;
  week: number;
  selected: number;
  todayStr: string;
  onSelect: (weekday: number) => void;
  onSwipe: (dir: 1 | -1) => void;
}) {
  const semester = data.semester!;
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 60 && Math.abs(info.offset.x) > Math.abs(info.offset.y)) onSwipe(info.offset.x < 0 ? 1 : -1);
  };
  return (
    <GlassCard className="mb-4 overflow-hidden p-2">
      <motion.div
        key={week}
        className="grid touch-pan-y grid-cols-7"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.25}
        onDragEnd={onDragEnd}
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        {WEEKDAY_LABEL.map((label, i) => {
          const wd = i + 1;
          const date = dateOf(semester, week, wd);
          const active = wd === selected;
          const isToday = date === todayStr;
          const hasClass = sessionsOn(data, date, campusId).length > 0;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onSelect(wd)}
              className="relative flex flex-col items-center gap-0.5 rounded-2xl py-2"
              aria-pressed={active}
              aria-label={`周${label} ${parseDate(date).month}月${parseDate(date).day}日${hasClass ? '，有课' : ''}`}
            >
              {active && <motion.span layoutId="timetable-day" className="absolute inset-0 rounded-2xl bg-accent shadow-[0_6px_18px_-6px_var(--accent)]" transition={spring.snappy} />}
              <span className={`relative text-xs ${active ? 'text-accent-fg' : isToday ? 'font-semibold text-accent' : 'text-fg-muted'}`}>{label}</span>
              <span className={`relative text-lg font-semibold tabular-nums ${active ? 'text-accent-fg' : isToday ? 'text-accent' : ''}`}>{parseDate(date).day}</span>
              <span className={`relative size-1.5 rounded-full ${hasClass ? (active ? 'bg-accent-fg' : 'bg-accent') : 'bg-transparent'}`} aria-hidden />
            </button>
          );
        })}
      </motion.div>
    </GlassCard>
  );
}

/** 选中那天的课，按时间排列。正在上的课高亮，上完的变淡 */
function DayList({
  sessions,
  date,
  todayStr,
  now,
  onOpen,
}: {
  sessions: ClassSession[];
  date: string;
  todayStr: string;
  now: Date;
  onOpen: (courseId: string) => void;
}) {
  const d = parseDate(date);
  const label = date === todayStr ? '今天' : date === addDays(todayStr, 1) ? '明天' : `周${WEEKDAY_LABEL[d.weekday - 1]}`;
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm text-fg-muted">
        {d.month}月{d.day}日 · {label} · {sessions.length ? `${sessions.length} 节课` : '没有课'}
      </h2>
      {sessions.length === 0 ? (
        <GlassCard className="p-6 text-center text-sm text-fg-muted">这天没有课，好好休息</GlassCard>
      ) : (
        <ul className="space-y-2.5">
          <AnimatePresence initial={false}>
            {sessions.map((s, i) => {
              const start = new Date(s.start);
              const end = new Date(s.end);
              const ongoing = now >= start && now < end;
              const done = now >= end;
              return (
                <motion.li
                  key={`${s.courseId}-${s.periodStart}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: done ? 0.55 : 1, y: 0 }}
                  transition={{ ...spring.snappy, delay: i * 0.03 }}
                >
                  <motion.button
                    type="button"
                    {...pressable}
                    onClick={() => onOpen(s.courseId)}
                    className={`glass flex w-full items-center gap-3 rounded-3xl p-4 text-left ${ongoing ? 'ring-2 ring-accent' : ''}`}
                  >
                    <div className="w-12 shrink-0 text-right tabular-nums">
                      <p className="text-[17px] font-semibold leading-tight">{formatHm(start)}</p>
                      <p className="text-xs text-fg-muted">{formatHm(end)}</p>
                    </div>
                    <span className="h-11 w-1 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-semibold">{s.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-fg-muted">
                        {s.location && (
                          <>
                            <PinIcon size={14} className="shrink-0" />
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
                    {ongoing && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-fg">上课中</span>}
                  </motion.button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
