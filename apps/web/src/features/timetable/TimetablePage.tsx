import { dateOf, MAX_PERIOD, parseDate, PERIODS_VERIFIED, periodsFor, today, weekOf, type Course } from '@gduthelp/shared';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../../components/icons';
import { PageHeader } from '../../components/PageHeader';
import { useAuth } from '../../lib/auth-store';
import { useTimetable } from '../../lib/queries';
import { useNow } from '../../lib/use-now';
import { spring } from '../../motion/presets';
import { CourseEditor, type CourseDraft } from './CourseEditor';
import { WEEKDAY_LABEL } from './weekday';

const ROW = 52;

export function TimetablePage() {
  const { data, isPending } = useTimetable();
  const user = useAuth((s) => s.user);
  const now = useNow();
  const semester = data?.semester ?? null;
  const todayStr = today(now);
  const currentWeek = semester ? weekOf(semester, todayStr) : null;
  const [week, setWeek] = useState<number | null>(null);
  const [draft, setDraft] = useState<CourseDraft | null>(null);

  if (isPending && !data) return <PageHeader title="课表" subtitle="加载中…" />;

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
  const periods = periodsFor(user?.campusId);
  const inWeek = (c: Course) => c.slots.filter((s) => s.weeks.includes(shown)).map((s) => ({ course: c, slot: s }));
  const blocks = data!.courses.flatMap(inWeek);
  const hasWeekend = blocks.some((b) => b.slot.weekday >= 6);
  const days = hasWeekend ? 7 : 5;

  return (
    <>
      <PageHeader
        title="课表"
        subtitle={`${semester.name} · ${currentWeek ? `本周第 ${currentWeek} 周` : todayStr < semester.startDate ? '还没开学' : '学期已结束'}`}
        action={
          <Button className="h-10 px-3 text-sm" onClick={() => setDraft({})}>
            <PlusIcon size={18} />
            添加
          </Button>
        }
      />

      {!user?.campusId && (
        <GlassCard className="mb-3 p-3 text-sm">
          还没有选择校区，节次时间先按大学城校区显示。可以在{' '}
          <Link to="/me" className="text-accent underline">
            我的
          </Link>{' '}
          里选择。
        </GlassCard>
      )}
      {!PERIODS_VERIFIED && <p className="mb-3 text-xs text-fg-muted">⚠️ 节次时间是通用模板，尚未与学校官方作息表核对。</p>}

      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="glass-thin grid size-10 place-items-center rounded-full!" aria-label="上一周" disabled={shown <= 1} onClick={() => setWeek(Math.max(1, shown - 1))}>
          <ChevronLeftIcon size={20} />
        </button>
        <div className="text-center">
          <p className="font-semibold">第 {shown} 周</p>
          {currentWeek !== null && shown !== currentWeek && (
            <button type="button" className="text-xs text-accent" onClick={() => setWeek(currentWeek)}>
              回到本周
            </button>
          )}
        </div>
        <button
          type="button"
          className="glass-thin grid size-10 place-items-center rounded-full!"
          aria-label="下一周"
          disabled={shown >= semester.totalWeeks}
          onClick={() => setWeek(Math.min(semester.totalWeeks, shown + 1))}
        >
          <ChevronRightIcon size={20} />
        </button>
      </div>

      <GlassCard className="overflow-hidden p-2">
        <div className="grid" style={{ gridTemplateColumns: `28px repeat(${days}, minmax(0, 1fr))` }}>
          <div />
          {WEEKDAY_LABEL.slice(0, days).map((label, i) => {
            const date = dateOf(semester, shown, i + 1);
            const isToday = date === todayStr;
            return (
              <div key={label} className={`pb-2 text-center text-xs ${isToday ? 'font-semibold text-accent' : 'text-fg-muted'}`}>
                <div>周{label}</div>
                <div className="tabular-nums">
                  {parseDate(date).month}/{parseDate(date).day}
                </div>
              </div>
            );
          })}

          <div className="relative" style={{ height: ROW * MAX_PERIOD }}>
            {periods.map((p) => (
              <div key={p.no} className="flex flex-col items-center justify-center text-[10px] leading-tight text-fg-muted" style={{ height: ROW }}>
                <span className="text-xs font-semibold text-fg">{p.no}</span>
                <span>{p.start}</span>
              </div>
            ))}
          </div>

          {Array.from({ length: days }, (_, d) => (
            <div key={d} className="relative border-l border-current/10" style={{ height: ROW * MAX_PERIOD }}>
              {periods.map((p) => (
                <button
                  key={p.no}
                  type="button"
                  aria-label={`在周${WEEKDAY_LABEL[d]}第 ${p.no} 节添加课程`}
                  className={`block w-full ${p.no === 4 || p.no === 9 ? 'border-b border-current/15' : ''}`}
                  style={{ height: ROW }}
                  onClick={() => setDraft({ weekday: d + 1, period: p.no })}
                />
              ))}
              {blocks
                .filter((b) => b.slot.weekday === d + 1)
                .map(({ course, slot }) => (
                  <motion.button
                    key={slot.id}
                    type="button"
                    layout
                    transition={spring.snappy}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setDraft({ course })}
                    className="absolute inset-x-0.5 overflow-hidden rounded-lg p-1 text-left text-[11px] leading-tight text-white shadow-md"
                    style={{ top: (slot.periodStart - 1) * ROW + 1, height: (slot.periodEnd - slot.periodStart + 1) * ROW - 2, background: course.color }}
                  >
                    <span className="line-clamp-3 font-semibold">{course.name}</span>
                    {(slot.location || course.location) && <span className="mt-0.5 line-clamp-2 opacity-90">@{slot.location || course.location}</span>}
                  </motion.button>
                ))}
            </div>
          ))}
        </div>
      </GlassCard>
      {data!.courses.length === 0 && <p className="mt-3 text-center text-sm text-fg-muted">点格子或右上角「添加」录入第一门课</p>}

      <CourseEditor draft={draft} semester={semester} onClose={() => setDraft(null)} />
    </>
  );
}
