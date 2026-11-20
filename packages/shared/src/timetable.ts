import { periodsFor } from './gdut.js';
import { addDays, daysBetween, parseDate, shanghaiTime } from './time.js';
import type { CourseSlot, SemesterInput } from './timetable-schema.js';

export type { CourseInput, CourseSlot, SemesterInput } from './timetable-schema.js';

export { COURSE_COLORS, MAX_WEEKS } from './timetable-schema.js';


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
