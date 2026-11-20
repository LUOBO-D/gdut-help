import { dateOf, MAX_PERIOD, parseDate, type ClassPeriod, type Course, type Semester } from '@gduthelp/shared';
import { motion } from 'motion/react';
import { GlassCard } from '../../components/GlassCard';
import { spring } from '../../motion/presets';
import type { CourseDraft } from './CourseEditor';
import { WEEKDAY_LABEL } from './weekday';

const ROW = 52;

/** 整周网格视图：横轴星期，纵轴节次 */
export function WeekGrid({
  semester,
  courses,
  shown,
  todayStr,
  periods,
  setDraft,
}: {
  semester: Semester;
  courses: Course[];
  shown: number;
  todayStr: string;
  periods: ClassPeriod[];
  setDraft: (d: CourseDraft) => void;
}) {
  const blocks = courses.flatMap((c) => c.slots.filter((s) => s.weeks.includes(shown)).map((s) => ({ course: c, slot: s })));
  const days = blocks.some((b) => b.slot.weekday >= 6) ? 7 : 5;
  return (
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
  );
}
