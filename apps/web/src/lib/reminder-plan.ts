/** 待办与课前提醒 → 本地通知的排程计算。纯函数，不依赖 Capacitor，方便测试 */
import { addDays, formatHm, reminderBody, sessionsOn, today, type TimetableData, type Todo } from '@gduthelp/shared';

/** 只排未来 7 天内的提醒。之后的会在下次打开 App 时排上 */
const HORIZON_DAYS = 7;
const HORIZON_MS = HORIZON_DAYS * 24 * 3600_000;
/** 安卓对单个应用的定时闹钟数量有上限（约 500），这里留足余量 */
const MAX_SCHEDULED = 64;
/** 「我的 → 提醒设置」里测试通知用的 id，重排时不取消它 */
export const TEST_NOTIFICATION_ID = 1;

export interface PlannedReminder {
  id: number;
  todoId: string;
  title: string;
  body: string;
  at: Date;
  link?: string;
}

/** 把提醒的 uuid 映射成安卓通知需要的正 32 位整数 id（FNV-1a）。同一条提醒每次算出来都一样 */
export function notificationId(reminderId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < reminderId.length; i++) {
    h ^= reminderId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const id = h >>> 1;
  return id <= TEST_NOTIFICATION_ID ? id + 2 : id;
}

/** 从待办列表算出要排的本地通知：未完成、待发送、在未来 7 天内，按时间先后取前 MAX_SCHEDULED 条 */
export function planReminders(todos: Todo[], now: Date): PlannedReminder[] {
  const until = now.getTime() + HORIZON_MS;
  const planned: PlannedReminder[] = [];
  for (const todo of todos) {
    if (todo.completedAt) continue;
    const dueAt = todo.dueAt ? new Date(todo.dueAt) : null;
    for (const r of todo.reminders) {
      const at = new Date(r.fireAt);
      if (r.status !== 'pending' || at.getTime() <= now.getTime() || at.getTime() > until) continue;
      planned.push({
        id: notificationId(r.id),
        todoId: todo.id,
        title: todo.title,
        body: reminderBody(dueAt, at),
        at,
        link: '/todo',
      });
    }
  }
  return planned.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED);
}

/** 从课表算出未来 7 天的课前本地通知（断网、服务端关机也准点响） */
export function planClassReminders(
  timetable: TimetableData | undefined,
  campusId: string | null | undefined,
  leadMinutes: number,
  now: Date,
): PlannedReminder[] {
  if (!timetable?.semester || !timetable.courses.length || leadMinutes <= 0) return [];
  const baseDate = today(now);
  const nowMs = now.getTime();
  const untilMs = nowMs + HORIZON_MS;
  const planned: PlannedReminder[] = [];

  for (let offset = 0; offset <= HORIZON_DAYS; offset++) {
    const date = addDays(baseDate, offset);
    const sessions = sessionsOn(timetable, date, campusId);
    for (const s of sessions) {
      const start = new Date(s.start);
      const end = new Date(s.end);
      const at = new Date(start.getTime() - leadMinutes * 60_000);
      if (at.getTime() <= nowMs || at.getTime() > untilMs) continue;
      const loc = s.location ? ` · ${s.location}` : '';
      planned.push({
        id: notificationId(`class:${date}:${s.courseId}:${s.periodStart}`),
        todoId: `class:${s.courseId}`,
        title: `${leadMinutes} 分钟后上课：${s.name}`,
        body: `${formatHm(start)}–${formatHm(end)}${loc}`,
        at,
        link: '/timetable',
      });
    }
  }
  return planned.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED);
}

/** 合并待办 + 课前通知并控制在安卓安全上限内 */
export function planAllReminders(opts: {
  todos: Todo[];
  timetable?: TimetableData;
  campusId?: string | null;
  classRemindMinutes: number;
  now: Date;
}): PlannedReminder[] {
  const merged = [
    ...planReminders(opts.todos, opts.now),
    ...planClassReminders(opts.timetable, opts.campusId, opts.classRemindMinutes, opts.now),
  ];
  return merged.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED);
}
