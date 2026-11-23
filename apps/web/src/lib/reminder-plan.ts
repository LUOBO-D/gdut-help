/** 待办、课前与考前提醒 → 本地通知的排程计算。纯函数，不依赖 Capacitor，方便测试 */
import {
  addDays,
  examStartDate,
  formatHm,
  reminderBody,
  sessionsOn,
  shanghaiTime,
  today,
  type CourseSelectionReminder,
  type ExamData,
  type TimetableData,
  type Todo,
} from '@gduthelp/shared';

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

/** 从考试安排算出未来 7 天的考前本地通知：考前一天 20:00 + 考前 1 小时 */
export function planExamReminders(examData: ExamData | undefined, now: Date): PlannedReminder[] {
  if (!examData?.exams.length) return [];
  const nowMs = now.getTime();
  const untilMs = nowMs + HORIZON_MS;
  const planned: PlannedReminder[] = [];

  for (const exam of examData.exams) {
    const start = examStartDate(exam);
    const placeParts = [exam.location, exam.seatNo ? `座位 ${exam.seatNo}` : null].filter(Boolean);
    const place = placeParts.length ? ` · ${placeParts.join(' · ')}` : '';
    const detail = `${exam.startTime}–${exam.endTime}${place}`;

    // 1. 前一天晚上 20:00 提前提醒（检查证件、文具和考场）
    const eve = shanghaiTime(addDays(exam.examDate, -1), '20:00');
    if (eve.getTime() > nowMs && eve.getTime() <= untilMs) {
      planned.push({
        id: notificationId(`exam:eve:${exam.id}:${exam.examDate}`),
        todoId: `exam:${exam.id}`,
        title: `明天考试：${exam.courseName}`,
        body: `${detail}（记得带好校园卡/身份证）`,
        at: eve,
        link: '/timetable?view=exam',
      });
    }

    // 2. 考前 60 分钟提醒出发
    const oneHourBefore = new Date(start.getTime() - 60 * 60_000);
    if (oneHourBefore.getTime() > nowMs && oneHourBefore.getTime() <= untilMs) {
      planned.push({
        id: notificationId(`exam:1h:${exam.id}:${exam.examDate}:${exam.startTime}`),
        todoId: `exam:${exam.id}`,
        title: `1 小时后开考：${exam.courseName}`,
        body: detail,
        at: oneHourBefore,
        link: '/timetable?view=exam',
      });
    }
  }

  return planned.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED);
}

/** 从选课时间提醒算出未来 7 天的抢课本地通知（支持提前 1 天 / 1 小时 / 30 分钟 / 10 分钟 / 5 分钟） */
export function planSelectionReminders(
  items: readonly CourseSelectionReminder[] | undefined,
  now: Date,
): PlannedReminder[] {
  if (!items?.length) return [];
  const nowMs = now.getTime();
  const untilMs = nowMs + HORIZON_MS;
  const planned: PlannedReminder[] = [];

  for (const item of items) {
    if (!item.enabled) continue;
    const start = new Date(item.startAt);
    const startMs = start.getTime();
    if (Number.isNaN(startMs) || startMs <= nowMs) continue;

    for (const mins of item.leadMinutes) {
      const fireMs = startMs - mins * 60_000;
      if (fireMs <= nowMs || fireMs > untilMs) continue;
      const leadLabel =
        mins >= 1440
          ? `${Math.round(mins / 1440)} 天后`
          : mins >= 60
            ? `${Math.round(mins / 60)} 小时后`
            : `${mins} 分钟后`;
      planned.push({
        id: notificationId(`selection:${item.id}:${mins}`),
        todoId: `selection:${item.id}`,
        title: `选课提醒（${leadLabel}开始）：${item.title}`,
        body: item.note
          ? `${formatHm(start)} 准点开放 · ${item.note}`
          : `${formatHm(start)} 准点开放，记得提前登录广工教务`,
        at: new Date(fireMs),
        link: '/study?tab=reviews',
      });
    }
  }

  return planned.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED);
}

/** 合并待办 + 课前 + 考前 + 选课通知并控制在安卓安全上限内 */
export function planAllReminders(opts: {
  todos: Todo[];
  timetable?: TimetableData;
  exams?: ExamData;
  courseSelections?: CourseSelectionReminder[];
  campusId?: string | null;
  classRemindMinutes: number;
  now: Date;
}): PlannedReminder[] {
  const merged = [
    ...planReminders(opts.todos, opts.now),
    ...planClassReminders(opts.timetable, opts.campusId, opts.classRemindMinutes, opts.now),
    ...planExamReminders(opts.exams, opts.now),
    ...planSelectionReminders(opts.courseSelections, opts.now),
  ];
  return merged.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED);
}
