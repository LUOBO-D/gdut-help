import { periodsFor } from './gdut.js';
import { addDays, daysBetween, formatDate, parseDate, shanghaiDate, shanghaiTime } from './time.js';
import type { CourseSlot, SemesterInput } from './timetable-schema.js';

export type { CourseInput, CourseSlot, SemesterInput } from './timetable-schema.js';

export { COURSE_COLORS, MAX_WEEKS } from './timetable-schema.js';

/** 找到给定日期所在周或之后最近的星期一 */
function mondayNearest(year: number, month: number, day: number): string {
  const base = formatDate({ year, month, day });
  const wd = parseDate(base).weekday;
  // 若是周二至周四回退到本周一；周五至周日顺延到下周一
  const delta = wd === 1 ? 0 : wd <= 4 ? -(wd - 1) : 8 - wd;
  return addDays(base, delta);
}

/**
 * 根据当前北京时间推算广工默认学期（用于首次冷启动自动初始化，不再卡死在「等管理员设置学期」）。
 * 2–7 月为春季学期（3 月初开学），8–1 月为秋季学期（9 月初开学），默认 20 周。
 */
export function defaultGdutSemester(now: Date = new Date()): SemesterInput {
  const bj = shanghaiDate(now);
  if (bj.month >= 2 && bj.month <= 7) {
    return {
      name: `${bj.year}春季学期`,
      startDate: mondayNearest(bj.year, 3, 1),
      totalWeeks: 20,
    };
  }
  const autumnYear = bj.month === 1 ? bj.year - 1 : bj.year;
  return {
    name: `${autumnYear}秋季学期`,
    startDate: mondayNearest(autumnYear, 9, 1),
    totalWeeks: 20,
  };
}


export interface Semester extends SemesterInput {
  id: string;
}

export interface Course {
  id: string;
  name: string;
  teacher: string | null;
  location: string | null;
  color: string;
  /** manual：自己添加；import：从教务系统导入 */
  source: 'manual' | 'import';
  importKey: string | null;
  slots: (CourseSlot & { id: string })[];
}

/** 当前学期与本人课程，前端用它在本地算出任意一天的课（离线也能看） */
export interface TimetableData {
  semester: Semester | null;
  courses: Course[];
}

/** 某天是学期第几周；不在学期内返回 null */
export function weekOf(semester: Pick<Semester, 'startDate' | 'totalWeeks'>, date: string): number | null {
  const diff = daysBetween(semester.startDate, date);
  if (diff < 0) return null;
  const week = Math.floor(diff / 7) + 1;
  return week <= semester.totalWeeks ? week : null;
}

/** 第 week 周星期 weekday 的日期 */
export function dateOf(semester: Pick<Semester, 'startDate'>, week: number, weekday: number): string {
  return addDays(semester.startDate, (week - 1) * 7 + (weekday - 1));
}

export interface ClassSession {
  courseId: string;
  name: string;
  teacher: string | null;
  location: string | null;
  color: string;
  periodStart: number;
  periodEnd: number;
  /** ISO 时间 */
  start: string;
  end: string;
}

/** 某天的所有课，按开始时间排序 */
export function sessionsOn(data: TimetableData, date: string, campusId: string | null | undefined): ClassSession[] {
  const { semester, courses } = data;
  if (!semester) return [];
  const week = weekOf(semester, date);
  if (week === null) return [];
  const weekday = parseDate(date).weekday;
  const periods = periodsFor(campusId);
  const at = (no: number, edge: 'start' | 'end') => {
    const p = periods.find((x) => x.no === no) ?? periods[periods.length - 1]!;
    return shanghaiTime(date, p[edge]).toISOString();
  };

  const sessions: ClassSession[] = [];
  for (const c of courses) {
    for (const s of c.slots) {
      if (s.weekday !== weekday || !s.weeks.includes(week)) continue;
      sessions.push({
        courseId: c.id,
        name: c.name,
        teacher: c.teacher,
        location: s.location || c.location,
        color: c.color,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        start: at(s.periodStart, 'start'),
        end: at(s.periodEnd, 'end'),
      });
    }
  }
  return sessions.sort((a, b) => a.start.localeCompare(b.start));
}
