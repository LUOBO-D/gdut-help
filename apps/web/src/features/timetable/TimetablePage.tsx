import {
  addDays,
  dateOf,
  examStatus,
  formatHm,
  matchCampusBuilding,
  parseDate,
  periodsFor,
  sessionsOn,
  today,
  weekOf,
  type ClassSession,
  type Exam,
  type TimetableData,
  type TimetableShareCreated,
} from '@gduthelp/shared';
import { useMutation } from '@tanstack/react-query';
import { motion, type PanInfo } from 'motion/react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { ChevronLeftIcon, ChevronRightIcon, NavigationIcon, PinIcon, PlusIcon } from '../../components/icons';
import { PageHeader } from '../../components/PageHeader';
import { Sheet } from '../../components/Sheet';
import { CardSkeleton } from '../../components/Skeleton';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';
import { useExams, useTimetable } from '../../lib/queries';
import { toast } from '../../lib/toast-store';
import { useNow } from '../../lib/use-now';
import { pressable, spring } from '../../motion/presets';
import { CourseEditor, type CourseDraft } from './CourseEditor';
import { ExamEditorSheet, type ExamDraft } from './ExamEditorSheet';
import { ExamPanel } from './ExamPanel';
import { WEEKDAY_LABEL } from './weekday';
import { WeekGrid } from './WeekGrid';

// 导入用得少，按需加载
const ImportSheet = lazy(() => import('./ImportSheet').then((m) => ({ default: m.ImportSheet })));
const ExamImportSheet = lazy(() => import('./ExamImportSheet').then((m) => ({ default: m.ExamImportSheet })));

type View = 'day' | 'week' | 'exam';
const VIEW_KEY = 'gduthelp-timetable-view';
const EMPTY_EXAMS: Exam[] = [];

function resolveInitialView(param: string | null): View {
  if (param === 'exam' || param === 'day' || param === 'week') return param;
  const saved = localStorage.getItem(VIEW_KEY);
  return saved === 'week' || saved === 'exam' ? saved : 'day';
}

export function TimetablePage() {
  const { data, isPending } = useTimetable();
  const examsQuery = useExams();
  const user = useAuth((s) => s.user);
  const now = useNow();
  const [searchParams, setSearchParams] = useSearchParams();
  const semester = data?.semester ?? null;
  const todayStr = today(now);
  const currentWeek = semester ? weekOf(semester, todayStr) : null;
  const [week, setWeek] = useState<number | null>(null);
  /** 选中的是星期几（1–7）。没选时：本周默认今天，其他周默认周一 */
  const [weekday, setWeekday] = useState<number | null>(null);
  const [view, setView] = useState<View>(() => resolveInitialView(searchParams.get('view')));
  const [draft, setDraft] = useState<CourseDraft | null>(null);
  const [importing, setImporting] = useState(false);
  /** 打开过一次后保持挂载，关闭时才有收起动画 */
  const [importLoaded, setImportLoaded] = useState(false);
  const [examDraft, setExamDraft] = useState<ExamDraft | null>(null);
  const [examImporting, setExamImporting] = useState(false);
  const [examImportLoaded, setExamImportLoaded] = useState(false);
  const [shareInfo, setShareInfo] = useState<TimetableShareCreated | null>(null);

  const exams = examsQuery.data?.exams ?? EMPTY_EXAMS;
  const upcomingExamCount = useMemo(
    () => exams.filter((e) => examStatus(e, now) !== 'finished').length,
    [exams, now],
  );

  const shareMutation = useMutation({
    mutationFn: () => api<TimetableShareCreated>('/timetable/share', { method: 'POST' }),
    onSuccess: (res) => setShareInfo(res),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : '生成分享码失败'),
  });

  const copyShareCode = async () => {
    if (!shareInfo) return;
    try {
      await navigator.clipboard.writeText(shareInfo.code);
      toast.success(`已复制分享码 ${shareInfo.code}`);
    } catch {
      toast.info(`分享码：${shareInfo.code}`);
    }
  };

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
            '正在初始化当前学期，稍候刷新即可导入或添加课程。'
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
    if (v !== 'exam') localStorage.setItem(VIEW_KEY, v);
    if (searchParams.has('view')) {
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      setSearchParams(next, { replace: true });
    }
  };
  const openImport = () => {
    setImportLoaded(true);
    setImporting(true);
  };
  const openExamImport = () => {
    setExamImportLoaded(true);
    setExamImporting(true);
  };

  return (
    <>
      <PageHeader
        title="课表"
        subtitle={`${semester.name} · ${currentWeek ? `本周第 ${currentWeek} 周` : todayStr < semester.startDate ? '还没开学' : '学期已结束'}`}
        action={
          view === 'exam' ? (
            <div className="flex gap-2">
              <Button variant="ghost" className="h-10 px-3 text-sm" onClick={openExamImport}>
                同步
              </Button>
              <Button className="h-10 px-3 text-sm" onClick={() => setExamDraft({})}>
                <PlusIcon size={18} />
                添加
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              {data!.courses.length > 0 && (
                <Button variant="ghost" className="h-10 px-3 text-sm" loading={shareMutation.isPending} onClick={() => shareMutation.mutate()}>
                  分享
                </Button>
              )}
              <Button variant="ghost" className="h-10 px-3 text-sm" onClick={openImport}>
                导入
              </Button>
              <Button className="h-10 px-3 text-sm" onClick={() => setDraft(view === 'day' ? { weekday: selectedWeekday } : {})}>
                <PlusIcon size={18} />
                添加
              </Button>
            </div>
          )
        }
      />

      <div className="mb-3 flex items-center justify-between gap-3">
        <ViewSwitch value={view} onChange={changeView} examCount={upcomingExamCount} />
        {view === 'exam' ? (
          <Link
            to="/fitness"
            className="glass-thin inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-xs font-medium text-accent transition-colors hover:bg-white/25"
          >
            <span>体测成绩</span>
            <ChevronRightIcon size={14} />
          </Link>
        ) : (
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
        )}
      </div>

      {view === 'exam' ? (
        <ExamPanel
          exams={exams}
          isLoading={examsQuery.isPending}
          now={now}
          onAdd={() => setExamDraft({})}
          onImport={openExamImport}
          onEdit={(exam) => setExamDraft({ exam })}
        />
      ) : view === 'day' ? (
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

      {view !== 'exam' && data!.courses.length === 0 && (
        <p className="mt-3 text-center text-sm text-fg-muted">点右上角「添加」录入第一门课，或者「导入」教务系统的课表</p>
      )}

      <CourseEditor draft={draft} semester={semester} onClose={() => setDraft(null)} />
      <ExamEditorSheet draft={examDraft} onClose={() => setExamDraft(null)} />
      <Sheet open={Boolean(shareInfo)} onClose={() => setShareInfo(null)} title="分享本学期课表">
        {shareInfo && (
          <div className="space-y-4 pb-2 text-center">
            <p className="text-sm text-fg-muted">
              把下面 6 位分享码发给同班或室友，在「课表 → 导入」里输入即可 10 秒复制这 {shareInfo.courseCount} 门课（不含你的个人信息）。
            </p>
            <div className="surface-subtle rounded-3xl py-5">
              <p className="font-num text-3xl font-bold tracking-[0.28em] text-accent tabular-nums">{shareInfo.code}</p>
              <p className="mt-2 text-xs text-fg-muted">
                {shareInfo.semesterName} · 7 天内有效
              </p>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => void copyShareCode()}>
                复制分享码
              </Button>
              <Button variant="ghost" onClick={() => setShareInfo(null)}>
                关闭
              </Button>
            </div>
          </div>
        )}
      </Sheet>
      {importLoaded && (
        <Suspense fallback={null}>
          <ImportSheet open={importing} onClose={() => setImporting(false)} semester={semester} courses={data!.courses} />
        </Suspense>
      )}
      {examImportLoaded && (
        <Suspense fallback={null}>
          <ExamImportSheet open={examImporting} onClose={() => setExamImporting(false)} exams={exams} />
        </Suspense>
      )}
    </>
  );
}

function ViewSwitch({ value, onChange, examCount }: { value: View; onChange: (v: View) => void; examCount: number }) {
  const options: [View, string][] = [
    ['day', '按天'],
    ['week', '整周'],
    ['exam', '考试'],
  ];
  return (
    <div className="glass-thin flex rounded-full p-1 text-sm" role="tablist" aria-label="课表视图">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} className="relative flex items-center gap-1 rounded-full px-3.5 py-1.5" onClick={() => onChange(v)}>
          {value === v && <motion.span layoutId="timetable-view" className="absolute inset-0 rounded-full bg-white/35 shadow-sm" transition={spring.snappy} />}
          <span className={`relative ${value === v ? 'font-semibold' : 'text-fg-muted'}`}>{label}</span>
          {v === 'exam' && examCount > 0 && (
            <span className="relative rounded-full bg-accent px-1.5 py-0.2 text-[10px] font-semibold text-accent-fg tabular-nums">
              {examCount}
            </span>
          )}
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
  const days = useMemo(
    () =>
      WEEKDAY_LABEL.map((label, i) => {
        const wd = i + 1;
        const date = dateOf(semester, week, wd);
        const parsed = parseDate(date);
        return {
          label,
          wd,
          date,
          month: parsed.month,
          day: parsed.day,
          hasClass: sessionsOn(data, date, campusId).length > 0,
        };
      }),
    [campusId, data, semester, week],
  );
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
      >
        {days.map(({ label, wd, date, month, day, hasClass }) => {
          const active = wd === selected;
          const isToday = date === todayStr;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onSelect(wd)}
              className="relative flex flex-col items-center gap-0.5 rounded-2xl py-2"
              aria-pressed={active}
              aria-label={`周${label} ${month}月${day}日${hasClass ? '，有课' : ''}`}
            >
              {active && <motion.span layoutId="timetable-day" className="absolute inset-0 rounded-2xl bg-accent shadow-[0_6px_18px_-6px_var(--accent)]" transition={spring.snappy} />}
              <span className={`relative text-xs ${active ? 'text-accent-fg' : isToday ? 'font-semibold text-accent' : 'text-fg-muted'}`}>{label}</span>
              <span className={`relative text-lg font-semibold tabular-nums ${active ? 'text-accent-fg' : isToday ? 'text-accent' : ''}`}>{day}</span>
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
  const navigate = useNavigate();
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
          {sessions.map((s) => {
            const start = new Date(s.start);
            const end = new Date(s.end);
            const ongoing = now >= start && now < end;
            const done = now >= end;
            const mapped = s.location ? matchCampusBuilding(s.location) : null;
            return (
              <li key={`${s.courseId}-${s.periodStart}`} className={done ? 'opacity-55' : undefined}>
                <div className={`glass flex w-full items-center gap-2 rounded-3xl p-4 ${ongoing ? 'ring-2 ring-accent' : ''}`}>
                  <motion.button
                    type="button"
                    {...pressable}
                    onClick={() => onOpen(s.courseId)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
                  </motion.button>
                  {ongoing && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-fg">上课中</span>}
                  {mapped && s.location && (
                    <button
                      type="button"
                      onClick={() => void navigate(`/map?q=${encodeURIComponent(s.location!)}`)}
                      title={`在 3D 校园地图中导航到 ${mapped.name}`}
                      aria-label={`导航到 ${s.location}`}
                      className="surface-subtle surface-subtle-hover grid size-9 shrink-0 place-items-center rounded-full text-accent"
                    >
                      <NavigationIcon size={16} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
