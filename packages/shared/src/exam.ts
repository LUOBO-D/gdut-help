import { daysBetween, shanghaiTime, today } from './time.js';
import type { Semester } from './timetable.js';

export type ExamSource = 'manual' | 'import';

export interface Exam {
  id: string;
  courseName: string;
  /** 北京日期 YYYY-MM-DD */
  examDate: string;
  /** 开始时间 HH:mm */
  startTime: string;
  /** 结束时间 HH:mm */
  endTime: string;
  /** 考场教室，例如 教3-305 */
  location: string | null;
  /** 座位号，例如 18 */
  seatNo: string | null;
  /** 考试类型/形式，例如 期末考试、闭卷 */
  examType: string | null;
  /** 校区，例如 大学城校区 */
  campus: string | null;
  /** 备注（如开卷、带计算器） */
  note: string | null;
  source: ExamSource;
  importKey: string | null;
}

export interface ExamData {
  semester: Semester | null;
  exams: Exam[];
}

export type ExamStatus = 'upcoming' | 'today' | 'ongoing' | 'finished';

export function examStartDate(exam: Pick<Exam, 'examDate' | 'startTime'>): Date {
  return shanghaiTime(exam.examDate, exam.startTime);
}

export function examEndDate(exam: Pick<Exam, 'examDate' | 'endTime'>): Date {
  return shanghaiTime(exam.examDate, exam.endTime);
}

export function examStatus(exam: Pick<Exam, 'examDate' | 'startTime' | 'endTime'>, now: Date = new Date()): ExamStatus {
  const startMs = examStartDate(exam).getTime();
  const endMs = examEndDate(exam).getTime();
  const nowMs = now.getTime();
  if (nowMs >= endMs) return 'finished';
  if (nowMs >= startMs) return 'ongoing';
  if (exam.examDate === today(now)) return 'today';
  return 'upcoming';
}

export function examCountdownText(
  exam: Pick<Exam, 'examDate' | 'startTime' | 'endTime'>,
  now: Date = new Date(),
): string {
  const status = examStatus(exam, now);
  if (status === 'ongoing') return '考试进行中';
  if (status === 'finished') return '已结束';
  const startMs = examStartDate(exam).getTime();
  const diffMin = Math.max(1, Math.ceil((startMs - now.getTime()) / 60_000));
  if (status === 'today') {
    if (diffMin <= 60) return `${diffMin} 分钟后开考`;
    const hours = Math.floor(diffMin / 60);
    return `今天 ${exam.startTime}（${hours} 小时后）`;
  }
  const days = daysBetween(today(now), exam.examDate);
  if (days <= 1) return `明天 ${exam.startTime}`;
  return `还剩 ${days} 天`;
}

/** 排序：未结束（进行中/即将开考）按时间正序排前面，已结束按最近考完排在下面 */
export function sortExams<T extends Pick<Exam, 'examDate' | 'startTime' | 'endTime'>>(
  exams: T[],
  now: Date = new Date(),
): T[] {
  const active: T[] = [];
  const finished: T[] = [];
  for (const exam of exams) {
    if (examStatus(exam, now) === 'finished') finished.push(exam);
    else active.push(exam);
  }
  active.sort((a, b) => a.examDate.localeCompare(b.examDate) || a.startTime.localeCompare(b.startTime));
  finished.sort((a, b) => b.examDate.localeCompare(a.examDate) || b.startTime.localeCompare(a.startTime));
  return [...active, ...finished];
}

/** 离现在最近的一场未结束考试 */
export function nextUpcomingExam<T extends Pick<Exam, 'examDate' | 'startTime' | 'endTime'>>(
  exams: T[],
  now: Date = new Date(),
): T | null {
  const sorted = sortExams(exams, now);
  const first = sorted[0];
  if (!first || examStatus(first, now) === 'finished') return null;
  return first;
}
