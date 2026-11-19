import { z } from 'zod';

export const MAX_REMINDERS = 5;
/** 「截止前 N 分钟」最大一周 */
export const MAX_REMINDER_OFFSET = 7 * 24 * 60;

export const PRIORITY_LABEL: Record<number, string> = { 1: '紧急', 2: '重要', 3: '普通', 4: '不急' };

const reminderSchema = z.union([
  z.object({ offsetMinutes: z.number().int().min(0).max(MAX_REMINDER_OFFSET) }),
  z.object({ at: z.iso.datetime({ offset: true }) }),
]);
export type ReminderInput = z.infer<typeof reminderSchema>;

export const todoInputSchema = z
  .object({
    title: z.string().trim().min(1, { error: '请填写待办内容' }).max(60, { error: '最多 60 个字' }),
    note: z.string().trim().max(500).nullish(),
    dueAt: z.iso.datetime({ offset: true }).nullish(),
    priority: z.number().int().min(1).max(4).default(3),
    reminders: z.array(reminderSchema).max(MAX_REMINDERS).default([]),
  })
  .refine((t) => t.dueAt || t.reminders.every((r) => 'at' in r), {
    error: '「截止前提醒」需要先设置截止时间',
    path: ['reminders'],
  });
export type TodoInput = z.input<typeof todoInputSchema>;

export type ReminderStatus = 'pending' | 'sent' | 'cancelled';

export interface Reminder {
  id: string;
  offsetMinutes: number | null;
  fireAt: string;
  status: ReminderStatus;
}

export interface Todo {
  id: string;
  title: string;
  note: string | null;
  dueAt: string | null;
  priority: number;
  completedAt: string | null;
  createdAt: string;
  reminders: Reminder[];
}

/** 提醒触发时间：「截止前 N 分钟」或指定时间 */
export function reminderFireAt(r: ReminderInput, dueAt: string | null | undefined): Date | null {
  if ('at' in r) return new Date(r.at);
  return dueAt ? new Date(new Date(dueAt).getTime() - r.offsetMinutes * 60_000) : null;
}
