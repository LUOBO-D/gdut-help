import { addDays, formatDate, shanghaiDate, shanghaiTime, today } from './time.js';
import { sessionsOn, type ClassSession, type TimetableData } from './timetable.js';

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;

/** 各优先级默认提前量（分钟，docs/03-backend.md 4.4） */
const PRIORITY_LEADS: Record<number, number[]> = {
  1: [24 * 60, 3 * 60], // P1 紧急：截止前 1 天 + 3 小时
  2: [24 * 60], // P2 重要：截止前 1 天
  3: [3 * 60], // P3 普通：截止前 3 小时
  4: [60], // P4 不急：截止前 1 小时
};

/** 23:30–07:30 免打扰：挪到前一天 22:00（北京时间） */
export function avoidQuietHours(at: Date): { time: Date; shifted: boolean } {
  const local = shanghaiDate(at);
  const bj = new Date(at.getTime() + 8 * HOUR_MS);
  const mins = bj.getUTCHours() * 60 + bj.getUTCMinutes();
  const dateStr = formatDate(local);

  if (mins >= 23 * 60 + 30) {
    return { time: shanghaiTime(dateStr, '22:00'), shifted: true };
  }
  if (mins < 7 * 60 + 30) {
    return { time: shanghaiTime(addDays(dateStr, -1), '22:00'), shifted: true };
  }
  return { time: at, shifted: false };
}

/**
 * 如果提醒落在上课时间内，挪到这节课开始前 10 分钟或下课后 5 分钟
 * （取离截止更远且仍在截止前且未过期的那个）。
 */
export function avoidClassHours(
  at: Date,
  sessions: ClassSession[],
  dueAt: Date,
  now: Date,
): { time: Date; shifted: boolean; courseName?: string } {
  const t = at.getTime();
  const hit = sessions.find((s) => {
    const start = new Date(s.start).getTime();
    const end = new Date(s.end).getTime();
    return t >= start && t < end;
  });
  if (!hit) return { time: at, shifted: false };

  const before = new Date(new Date(hit.start).getTime() - 10 * MIN_MS);
  const after = new Date(new Date(hit.end).getTime() + 5 * MIN_MS);

  const valid = [before, after].filter((c) => c.getTime() < dueAt.getTime() && c.getTime() > now.getTime());
  if (!valid.length) return { time: at, shifted: false };

  // 离截止更远（即更早）的优先
  valid.sort((a, b) => a.getTime() - b.getTime());
  return { time: valid[0]!, shifted: true, courseName: hit.name };
}

/**
 * 查找截止前 24 小时内的一段 ≥ 2 小时的空闲时段（08:00–22:30 北京时间），
 * 用于在提醒正文里附上「你今晚 19:00–21:00 没课」。
 */
export function findFreeSlotHint(
  timetable: TimetableData | null | undefined,
  campusId: string | null | undefined,
  dueAt: Date,
  now: Date = new Date(),
): string | null {
  if (!timetable?.semester) return null;
  const windowStart = Math.max(now.getTime() + 15 * MIN_MS, dueAt.getTime() - 24 * HOUR_MS);
  const windowEnd = dueAt.getTime();
  if (windowEnd - windowStart < 2 * HOUR_MS) return null;

  const todayStr = today(now);
  const tomorrowStr = addDays(todayStr, 1);
  const candidateDates = [...new Set([today(new Date(windowStart)), today(dueAt)])].sort();

  const fmtHm = (ms: number) => {
    const d = new Date(ms + 8 * HOUR_MS);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  };

  for (const date of candidateDates) {
    const dayStart = Math.max(windowStart, shanghaiTime(date, '08:00').getTime());
    const dayEnd = Math.min(windowEnd, shanghaiTime(date, '22:30').getTime());
    if (dayEnd - dayStart < 2 * HOUR_MS) continue;

    const busy = sessionsOn(timetable, date, campusId)
      .map((s) => ({ start: new Date(s.start).getTime(), end: new Date(s.end).getTime() }))
      .filter((b) => b.end > dayStart && b.start < dayEnd)
      .sort((a, b) => a.start - b.start);

    let cursor = dayStart;
    const gaps: { start: number; end: number }[] = [];
    for (const b of busy) {
      if (b.start - cursor >= 2 * HOUR_MS) gaps.push({ start: cursor, end: b.start });
      cursor = Math.max(cursor, b.end);
    }
    if (dayEnd - cursor >= 2 * HOUR_MS) gaps.push({ start: cursor, end: dayEnd });

    if (gaps.length > 0) {
      // 取第一段可用空档，截取至多 2 小时便于阅读（如 19:00–21:00）
      const g = gaps[0]!;
      // 向上取整到 5 分钟刻度
      const roundedStart = Math.ceil(g.start / (5 * MIN_MS)) * (5 * MIN_MS);
      const shownEnd = Math.min(g.end, roundedStart + 2 * HOUR_MS);
      if (shownEnd - roundedStart >= 2 * HOUR_MS) {
        const dayPrefix = date === todayStr ? '今天' : date === tomorrowStr ? '明天' : `${date.slice(5)} `;
        return `你${dayPrefix} ${fmtHm(roundedStart)}–${fmtHm(shownEnd)} 没课`;
      }
    }
  }
  return null;
}

export interface SmartReminderPlan {
  reminders: { at: string; reason: string }[];
  freeSlotHint: string | null;
}

/** 计算待办的智能提醒计划：按优先级选提前量 → 避开上课时间 → 避开深夜免打扰 */
export function computeSmartReminders(opts: {
  dueAt: string;
  priority: number;
  timetable: TimetableData | null | undefined;
  campusId: string | null | undefined;
  now?: Date;
}): SmartReminderPlan {
  const now = opts.now ?? new Date();
  const due = new Date(opts.dueAt);
  const leads = PRIORITY_LEADS[opts.priority] ?? PRIORITY_LEADS[3]!;

  // 收集涉及日期的课程
  const sessions: ClassSession[] = [];
  if (opts.timetable?.semester) {
    const startDate = addDays(today(due), -2);
    for (let i = 0; i <= 2; i++) {
      sessions.push(...sessionsOn(opts.timetable, addDays(startDate, i), opts.campusId));
    }
  }

  const seen = new Set<number>();
  const reminders: { at: string; reason: string }[] = [];

  for (const leadMin of leads) {
    let fire = new Date(due.getTime() - leadMin * MIN_MS);
    const notes: string[] = [leadMin >= 1440 ? '提前 1 天' : `提前 ${leadMin / 60} 小时`];

    const c = avoidClassHours(fire, sessions, due, now);
    if (c.shifted) {
      fire = c.time;
      notes.push(`已避开「${c.courseName}」`);
    }

    const q = avoidQuietHours(fire);
    if (q.shifted) {
      fire = q.time;
      notes.push('已避开深夜免打扰');
      // 挪到 22:00 后再检查一次是否撞晚课
      const c2 = avoidClassHours(fire, sessions, due, now);
      if (c2.shifted) {
        fire = c2.time;
        notes.push(`已避开「${c2.courseName}」`);
      }
    }

    if (fire.getTime() <= now.getTime() || fire.getTime() >= due.getTime()) continue;
    if (seen.has(fire.getTime())) continue;
    seen.add(fire.getTime());
    reminders.push({ at: fire.toISOString(), reason: notes.join(' · ') });
  }

  // 如果全部提前量都已过期，但还没到截止时间，至少在截止前 15 分钟提醒一次
  if (reminders.length === 0 && due.getTime() - now.getTime() > 5 * MIN_MS) {
    const fallback = new Date(Math.max(now.getTime() + 2 * MIN_MS, due.getTime() - 15 * MIN_MS));
    reminders.push({ at: fallback.toISOString(), reason: '临近截止提醒' });
  }

  const freeSlotHint = findFreeSlotHint(opts.timetable, opts.campusId, due, now);
  return { reminders, freeSlotHint };
}
