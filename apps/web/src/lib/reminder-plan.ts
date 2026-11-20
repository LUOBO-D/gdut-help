/** 待办提醒 → 本地通知的排程计算。纯函数，不依赖 Capacitor，方便测试 */
import { reminderBody, type Todo } from '@gduthelp/shared';

/** 只排未来 7 天内的提醒。之后的会在下次打开 App 时排上 */
const HORIZON_MS = 7 * 24 * 3600_000;
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
      planned.push({ id: notificationId(r.id), todoId: todo.id, title: todo.title, body: reminderBody(dueAt, at), at });
    }
  }
  return planned.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED);
}
