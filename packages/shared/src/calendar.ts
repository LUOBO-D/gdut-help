/**
 * 广东工业大学官方教学日历（校历）数据与周次/假期倒计时计算引擎。
 *
 * 数据来源：广东工业大学教务处（jwc.gdut.edu.cn）公布的 2025-2026、2026-2027 学年度教学日历。
 * 供「学业 → 校历」视图展示全学期周历、当前周高亮、节假日与寒暑假倒计时。
 */
import { addDays, daysBetween, parseDate, today } from './time.js';

export type CalendarEventKind = 'start' | 'holiday' | 'campus' | 'exam' | 'vacation';

export interface CalendarMilestone {
  id: string;
  title: string;
  /** 开始日期 'YYYY-MM-DD' */
  startDate: string;
  /** 结束日期 'YYYY-MM-DD'（单日事件与 startDate 相同） */
  endDate: string;
  kind: CalendarEventKind;
  note?: string;
}

export interface GdutCalendarTerm {
  /** 学期代码，例如 '202601' */
  code: string;
  /** 显示名称，例如 '2026-2027 学年秋季学期' */
  name: string;
  /** 短名称，例如 '2026 秋' */
  shortName: string;
  /** 第 1 周周一 'YYYY-MM-DD' */
  startDate: string;
  /** 教学总周数（含考试周） */
  totalWeeks: number;
  /** 考试周起始周次（一般为最后 2 周） */
  examStartWeek: number;
  /** 假期区间（寒假 / 暑假） */
  vacation: {
    label: string;
    startDate: string;
    endDate: string;
  };
  milestones: CalendarMilestone[];
}

export interface CalendarWeekRow {
  week: number;
  /** 周一日期 'YYYY-MM-DD' */
  monday: string;
  /** 周日日期 'YYYY-MM-DD' */
  sunday: string;
  /** 主归属月份（1–12） */
  month: number;
  isExamWeek: boolean;
  events: CalendarMilestone[];
}

export interface CalendarTermProgress {
  status: 'before' | 'in-term' | 'vacation' | 'ended';
  currentWeek: number | null;
  percent: number;
  daysToStart: number | null;
  daysToVacation: number | null;
  daysLeftInVacation: number | null;
}

export const GDUT_CALENDAR_TERMS: readonly GdutCalendarTerm[] = [
  {
    code: '202601',
    name: '2026-2027 学年秋季学期',
    shortName: '2026-2027 秋',
    startDate: '2026-08-31',
    totalWeeks: 20,
    examStartWeek: 19,
    vacation: {
      label: '寒假',
      startDate: '2027-01-16',
      endDate: '2027-02-25',
    },
    milestones: [
      { id: '2601-reg', title: '本科老生注册', startDate: '2026-08-28', endDate: '2026-08-29', kind: 'start' },
      { id: '2601-open', title: '正式开课', startDate: '2026-08-31', endDate: '2026-08-31', kind: 'start', note: '第 1 周周一' },
      { id: '2601-mid', title: '中秋节', startDate: '2026-09-25', endDate: '2026-09-27', kind: 'holiday' },
      { id: '2601-nat', title: '国庆节假期', startDate: '2026-10-01', endDate: '2026-10-07', kind: 'holiday' },
      { id: '2601-sport', title: '学校田径运动会', startDate: '2026-11-13', endDate: '2026-11-14', kind: 'campus', note: '第 11 周周五至周六' },
      { id: '2601-ny', title: '元旦假期', startDate: '2027-01-01', endDate: '2027-01-03', kind: 'holiday' },
      { id: '2601-exam', title: '期末复习与考试周', startDate: '2027-01-04', endDate: '2027-01-15', kind: 'exam', note: '第 19–20 周' },
      { id: '2601-vac', title: '学生寒假', startDate: '2027-01-16', endDate: '2027-02-25', kind: 'vacation', note: '2027 年春节为 2 月 6 日' },
    ],
  },
  {
    code: '202602',
    name: '2026-2027 学年春季学期',
    shortName: '2026-2027 春',
    startDate: '2027-03-01',
    totalWeeks: 18,
    examStartWeek: 17,
    vacation: {
      label: '暑假',
      startDate: '2027-07-05',
      endDate: '2027-08-29',
    },
    milestones: [
      { id: '2602-reg', title: '春季注册报到', startDate: '2027-02-26', endDate: '2027-02-28', kind: 'start' },
      { id: '2602-open', title: '春季正式开课', startDate: '2027-03-01', endDate: '2027-03-01', kind: 'start', note: '第 1 周周一' },
      { id: '2602-qm', title: '清明节', startDate: '2027-04-04', endDate: '2027-04-06', kind: 'holiday' },
      { id: '2602-may', title: '劳动节假期', startDate: '2027-05-01', endDate: '2027-05-05', kind: 'holiday' },
      { id: '2602-dw', title: '端午节', startDate: '2027-06-09', endDate: '2027-06-11', kind: 'holiday' },
      { id: '2602-exam', title: '期末考试周', startDate: '2027-06-21', endDate: '2027-07-02', kind: 'exam', note: '第 17–18 周' },
      { id: '2602-vac', title: '学生暑假', startDate: '2027-07-05', endDate: '2027-08-29', kind: 'vacation', note: '具体以教务处正式校历为准' },
    ],
  },
  {
    code: '202502',
    name: '2025-2026 学年春季学期',
    shortName: '2025-2026 春',
    startDate: '2026-03-09',
    totalWeeks: 18,
    examStartWeek: 17,
    vacation: {
      label: '暑假',
      startDate: '2026-07-11',
      endDate: '2026-08-27',
    },
    milestones: [
      { id: '2502-reg', title: '春季注册报到', startDate: '2026-03-06', endDate: '2026-03-08', kind: 'start' },
      { id: '2502-open', title: '正式开课', startDate: '2026-03-09', endDate: '2026-03-09', kind: 'start' },
      { id: '2502-qm', title: '清明节', startDate: '2026-04-04', endDate: '2026-04-06', kind: 'holiday' },
      { id: '2502-may', title: '劳动节假期', startDate: '2026-05-01', endDate: '2026-05-05', kind: 'holiday' },
      { id: '2502-dw', title: '端午节', startDate: '2026-06-19', endDate: '2026-06-21', kind: 'holiday' },
      { id: '2502-exam', title: '期末考试周', startDate: '2026-06-29', endDate: '2026-07-10', kind: 'exam', note: '第 17–18 周' },
      { id: '2502-vac', title: '学生暑假', startDate: '2026-07-11', endDate: '2026-08-27', kind: 'vacation' },
    ],
  },
];

/** 根据给定北京日期匹配当前所处（或最近即将到来）的广工校历学期 */
export function findCalendarTermForDate(dateStr: string = today()): GdutCalendarTerm {
  for (const term of GDUT_CALENDAR_TERMS) {
    const preReg = addDays(term.startDate, -7);
    if (dateStr >= preReg && dateStr <= term.vacation.endDate) {
      return term;
    }
  }
  const sorted = [...GDUT_CALENDAR_TERMS].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const upcoming = sorted.find((t) => t.startDate > dateStr);
  return upcoming ?? sorted[sorted.length - 1]!;
}

/** 生成某学期的完整周历列表（含每周起止日期与落在该周的节假日/重要节点） */
export function buildCalendarWeeks(term: GdutCalendarTerm): CalendarWeekRow[] {
  const rows: CalendarWeekRow[] = [];
  for (let w = 1; w <= term.totalWeeks; w++) {
    const monday = addDays(term.startDate, (w - 1) * 7);
    const sunday = addDays(monday, 6);
    const mid = parseDate(addDays(monday, 3));
    const events = term.milestones.filter((m) => m.startDate <= sunday && m.endDate >= monday);
    rows.push({
      week: w,
      monday,
      sunday,
      month: mid.month,
      isExamWeek: w >= term.examStartWeek,
      events,
    });
  }
  return rows;
}

/** 计算当前日期在指定校历学期中的周次与进度 */
export function calendarTermProgress(term: GdutCalendarTerm, dateStr: string = today()): CalendarTermProgress {
  const termEnd = addDays(term.startDate, term.totalWeeks * 7 - 1);
  if (dateStr < term.startDate) {
    return {
      status: 'before',
      currentWeek: null,
      percent: 0,
      daysToStart: daysBetween(dateStr, term.startDate),
      daysToVacation: daysBetween(dateStr, term.vacation.startDate),
      daysLeftInVacation: null,
    };
  }
  if (dateStr <= termEnd) {
    const diff = daysBetween(term.startDate, dateStr);
    const currentWeek = Math.min(term.totalWeeks, Math.floor(diff / 7) + 1);
    const totalDays = term.totalWeeks * 7;
    const percent = Math.min(100, Math.max(1, Math.round(((diff + 1) / totalDays) * 100)));
    return {
      status: 'in-term',
      currentWeek,
      percent,
      daysToStart: null,
      daysToVacation: Math.max(0, daysBetween(dateStr, term.vacation.startDate)),
      daysLeftInVacation: null,
    };
  }
  if (dateStr >= term.vacation.startDate && dateStr <= term.vacation.endDate) {
    return {
      status: 'vacation',
      currentWeek: null,
      percent: 100,
      daysToStart: null,
      daysToVacation: 0,
      daysLeftInVacation: Math.max(0, daysBetween(dateStr, term.vacation.endDate) + 1),
    };
  }
  return {
    status: 'ended',
    currentWeek: null,
    percent: 100,
    daysToStart: null,
    daysToVacation: null,
    daysLeftInVacation: null,
  };
}

/** 返回指定学期中尚未结束的重要节点及倒计时天数 */
export function upcomingTermMilestones(
  term: GdutCalendarTerm,
  dateStr: string = today(),
  limit = 4,
): (CalendarMilestone & { daysLeft: number; ongoing: boolean })[] {
  return term.milestones
    .filter((m) => m.endDate >= dateStr)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, limit)
    .map((m) => ({
      ...m,
      daysLeft: Math.max(0, daysBetween(dateStr, m.startDate)),
      ongoing: dateStr >= m.startDate && dateStr <= m.endDate,
    }));
}
