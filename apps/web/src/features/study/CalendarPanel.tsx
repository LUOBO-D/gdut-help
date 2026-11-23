import {
  buildCalendarWeeks,
  calendarTermProgress,
  findCalendarTermForDate,
  GDUT_CALENDAR_TERMS,
  parseDate,
  today,
  upcomingTermMilestones,
  type CalendarEventKind,
} from '@gduthelp/shared';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { GlassCard } from '../../components/GlassCard';
import { CalendarIcon } from '../../components/icons';
import { spring } from '../../motion/presets';

function shortMd(dateStr: string): string {
  const { month, day } = parseDate(dateStr);
  return `${month}/${day}`;
}

function formatRange(startDate: string, endDate: string): string {
  if (startDate === endDate) return shortMd(startDate);
  return `${shortMd(startDate)}–${shortMd(endDate)}`;
}

const KIND_STYLES: Record<CalendarEventKind, string> = {
  start: 'bg-accent/15 text-accent',
  holiday: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  campus: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  exam: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  vacation: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
};

interface CalendarPanelProps {
  now: Date;
}

/**
 * 广东工业大学官方教学日历（校历）面板：
 * 展示学期进度、假期倒计时、重要节点（节假日/运动会/考试周）及完整教学周历。
 */
export function CalendarPanel({ now }: CalendarPanelProps) {
  const todayStr = today(now);
  const currentTerm = useMemo(() => findCalendarTermForDate(todayStr), [todayStr]);
  const [selectedCode, setSelectedCode] = useState<string>(currentTerm.code);

  const term = useMemo(
    () => GDUT_CALENDAR_TERMS.find((t) => t.code === selectedCode) ?? currentTerm,
    [selectedCode, currentTerm],
  );
  const progress = useMemo(() => calendarTermProgress(term, todayStr), [term, todayStr]);
  const weeks = useMemo(() => buildCalendarWeeks(term), [term]);
  const milestones = useMemo(() => upcomingTermMilestones(term, todayStr, 4), [term, todayStr]);

  return (
    <div className="space-y-4">
      {/* 学期快速切换 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="glass-thin inline-flex rounded-full p-1" role="tablist" aria-label="校历学期">
          {GDUT_CALENDAR_TERMS.map((item) => {
            const active = item.code === term.code;
            return (
              <button
                key={item.code}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedCode(item.code)}
                className={`relative rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  active ? 'text-accent-fg' : 'text-fg-muted'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="calendar-term-pill"
                    transition={spring.snappy}
                    className="absolute inset-0 rounded-full bg-accent"
                  />
                )}
                <span className="relative">{item.shortName}</span>
              </button>
            );
          })}
        </div>

        {term.code !== currentTerm.code && (
          <button
            type="button"
            onClick={() => setSelectedCode(currentTerm.code)}
            className="text-xs font-medium text-accent hover:opacity-80"
          >
            回到当前学期
          </button>
        )}
      </div>

      {/* 学期进度与放假倒计时主卡 */}
      <GlassCard className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-fg-muted">{term.name}</p>
            <div className="mt-1 flex items-baseline gap-2">
              {progress.status === 'in-term' && progress.currentWeek !== null ? (
                <>
                  <span className="font-num text-3xl font-bold tracking-tight tabular-nums">
                    第 {progress.currentWeek} 周
                  </span>
                  <span className="text-sm text-fg-muted">
                    / 共 {term.totalWeeks} 周 · 已过 {progress.percent}%
                  </span>
                </>
              ) : progress.status === 'before' && progress.daysToStart !== null ? (
                <>
                  <span className="font-num text-2xl font-bold tracking-tight tabular-nums">
                    距开学 {progress.daysToStart} 天
                  </span>
                  <span className="text-sm text-fg-muted">{shortMd(term.startDate)} 正式开课</span>
                </>
              ) : progress.status === 'vacation' && progress.daysLeftInVacation !== null ? (
                <>
                  <span className="font-num text-2xl font-bold tracking-tight text-accent tabular-nums">
                    {term.vacation.label}中
                  </span>
                  <span className="text-sm text-fg-muted">剩余 {progress.daysLeftInVacation} 天</span>
                </>
              ) : (
                <span className="text-xl font-bold text-fg-muted">本学期已结束</span>
              )}
            </div>
          </div>

          {progress.daysToVacation !== null && progress.daysToVacation > 0 && (
            <div className="surface-subtle rounded-2xl px-3.5 py-2 text-right">
              <p className="text-[11px] text-fg-muted">距{term.vacation.label}</p>
              <p className="font-num text-lg font-bold text-accent tabular-nums">
                {progress.daysToVacation} <span className="text-xs font-medium">天</span>
              </p>
            </div>
          )}
        </div>

        {/* 学期进度条 */}
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-current/10">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-fg-muted">
            <span>开课 {shortMd(term.startDate)}</span>
            <span>考试周 第 {term.examStartWeek}–{term.totalWeeks} 周</span>
            <span>
              {term.vacation.label} {formatRange(term.vacation.startDate, term.vacation.endDate)}
            </span>
          </div>
        </div>

        {/* 即将到来的重要节点 */}
        {milestones.length > 0 && (
          <div className="border-t border-current/10 pt-3.5">
            <p className="mb-2 text-xs font-semibold text-fg-muted">重要节点倒计时</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {milestones.map((m) => (
                <div
                  key={m.id}
                  className="surface-subtle flex items-center justify-between gap-2 rounded-2xl px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{m.title}</span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${KIND_STYLES[m.kind]}`}>
                        {formatRange(m.startDate, m.endDate)}
                      </span>
                    </div>
                    {m.note && <p className="mt-0.5 truncate text-[11px] text-fg-muted">{m.note}</p>}
                  </div>
                  <span className="shrink-0 font-num text-xs font-semibold text-accent tabular-nums">
                    {m.ongoing ? '进行中' : m.daysLeft === 0 ? '今天' : `${m.daysLeft} 天后`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </GlassCard>

      {/* 全学期教学周历 */}
      <GlassCard className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <CalendarIcon size={15} className="text-accent" />
            <span>全学期教学周历（共 {term.totalWeeks} 周）</span>
          </h2>
          <span className="text-[11px] text-fg-muted">周一至周日</span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {weeks.map((row) => {
            const isCurrent = progress.currentWeek === row.week;
            return (
              <div
                key={row.week}
                className={`flex items-center justify-between gap-2 rounded-2xl px-3.5 py-2.5 transition-colors ${
                  isCurrent ? 'bg-accent/12 ring-1.5 ring-accent' : 'surface-subtle'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`w-11 shrink-0 font-num text-xs font-bold tabular-nums ${
                      isCurrent ? 'text-accent' : 'text-fg'
                    }`}
                  >
                    第 {row.week} 周
                  </span>
                  <span className="shrink-0 font-num text-xs text-fg-muted tabular-nums">
                    {shortMd(row.monday)} – {shortMd(row.sunday)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-1">
                  {isCurrent && (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-fg">
                      本周
                    </span>
                  )}
                  {row.isExamWeek && !row.events.some((e) => e.kind === 'exam') && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${KIND_STYLES.exam}`}>
                      考试周
                    </span>
                  )}
                  {row.events.map((ev) => (
                    <span
                      key={ev.id}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${KIND_STYLES[ev.kind]}`}
                    >
                      {ev.title}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-fg-muted">
          参考广东工业大学教务处官方教学日历（jwc.gdut.edu.cn），具体调休安排以学校最新通知为准。
        </p>
      </GlassCard>
    </div>
  );
}
