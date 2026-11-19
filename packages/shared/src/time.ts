/**
 * 北京时间工具。服务器可能运行在 UTC 时区，所以所有「今天」「第几周」都显式按 UTC+8 计算。
 * 中国不实行夏令时，固定偏移即可。
 */

const OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LocalDate {
  year: number;
  month: number;
  day: number;
  /** 1 = 周一 … 7 = 周日 */
  weekday: number;
}

export function shanghaiDate(at: Date = new Date()): LocalDate {
  const d = new Date(at.getTime() + OFFSET_MS);
  const wd = d.getUTCDay();
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: wd === 0 ? 7 : wd };
}

/** 'YYYY-MM-DD' */
export function formatDate({ year, month, day }: Pick<LocalDate, 'year' | 'month' | 'day'>): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseDate(s: string): LocalDate {
  const [year, month, day] = s.split('-').map(Number) as [number, number, number];
  return shanghaiDate(new Date(Date.UTC(year, month - 1, day) - OFFSET_MS));
}

/** 北京时间某天某时刻对应的绝对时间。time 为 'HH:mm' */
export function shanghaiTime(date: string, time: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const [h, m] = time.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1, day, h, m) - OFFSET_MS);
}

/** 两个北京日期之间相差的天数（b - a） */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number];
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return formatDate({ year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() });
}

/** 今天（北京时间）'YYYY-MM-DD' */
export function today(at: Date = new Date()): string {
  return formatDate(shanghaiDate(at));
}
