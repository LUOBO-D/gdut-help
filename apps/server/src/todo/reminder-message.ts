import { formatRemaining, formatWhen } from '@gduthelp/shared';

export { formatRemaining, formatWhen };

/** 提醒的正文。lateMinutes > 5 时注明这条提醒迟到了（服务停机期间错过的提醒会在恢复后补发） */
export function reminderBody(dueAt: Date | null, now: Date, lateMinutes: number): string {
  const parts: string[] = [];
  if (dueAt) parts.push(`截止 ${formatWhen(dueAt, now)}，${formatRemaining(dueAt, now)}`);
  else parts.push('提醒时间到了');
  if (lateMinutes > 5) parts.push(`（这条提醒晚了 ${lateMinutes} 分钟）`);
  return parts.join('');
}
