const timeFmt = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', weekday: 'short' });
const dayKey = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

/** 北京时间 HH:mm */
export function formatHm(at: Date | string): string {
  return timeFmt.format(typeof at === 'string' ? new Date(at) : at);
}

/** 相对今天差几天（北京时间） */
export function dayOffset(at: Date, now: Date): number {
  return Math.round((Date.parse(dayKey(at)) - Date.parse(dayKey(now))) / 86_400_000);
}

/** 「今天 23:59」「明天 08:00」「11/25周二 10:00」 */
export function formatWhen(at: Date, now: Date): string {
  const diff = dayOffset(at, now);
  const day = diff === 0 ? '今天' : diff === 1 ? '明天' : diff === -1 ? '昨天' : dateFmt.format(at);
  return `${day} ${timeFmt.format(at)}`;
}

/** 「45 分钟」「1 小时 20 分」「3 天」 */
export function formatDuration(minutes: number): string {
  const abs = Math.abs(Math.round(minutes));
  if (abs < 60) return `${abs} 分钟`;
  if (abs < 24 * 60) return `${Math.floor(abs / 60)} 小时${abs % 60 ? ` ${abs % 60} 分` : ''}`;
  return `${Math.round(abs / 1440)} 天`;
}

/** 「还有 1 小时 20 分」「已超时 5 分钟」 */
export function formatRemaining(due: Date, now: Date): string {
  const mins = (due.getTime() - now.getTime()) / 60_000;
  return mins >= 0 ? `还有 ${formatDuration(mins)}` : `已超时 ${formatDuration(mins)}`;
}
