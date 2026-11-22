/**
 * 零依赖中文待办快速解析器：
 * 在待办极速输入栏中实时识别常见口语时间与重复规则（按北京时间 UTC+8 计算），
 * 例如「明晚8点交高数作业」「周五前交实验报告」「每周五提交周报」「每天早上8点背单词」。
 */
import { addDays, formatDate, shanghaiDate, shanghaiTime } from './time.js';
import type { TodoRepeat } from './todo.js';

export interface ParsedQuickTodo {
  /** 去掉时间/重复短语后的干净标题（若剥离后为空则回退原句） */
  title: string;
  /** 解析出的截止时间（ISO 字符串） */
  dueAt: string | null;
  /** 解析出的重复周期 */
  repeat: TodoRepeat;
  /** 给人看的一句简短预览，如「明天 20:00」或「每周 · 周五 22:00」 */
  label: string | null;
}

const CN_WEEKDAY: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
};

const WEEKDAY_CN = ['', '一', '二', '三', '四', '五', '六', '日'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function nextWeekdayDate(todayStr: string, todayWd: number, targetWd: number, forceNextWeek: boolean): string {
  if (forceNextWeek) {
    // 严格落到下一周（周一为一周起点）的指定星期
    const daysToNextMonday = 8 - todayWd;
    return addDays(todayStr, daysToNextMonday + (targetWd - 1));
  }
  const delta = (targetWd - todayWd + 7) % 7;
  return addDays(todayStr, delta);
}

/**
 * 解析中文快捷待办文本。只匹配高置信度常见校园表达，避免误判纯文本标题。
 */
export function parseQuickTodo(raw: string, now: Date = new Date()): ParsedQuickTodo {
  const input = raw.trim();
  if (!input) return { title: '', dueAt: null, repeat: 'none', label: null };

  const bj = shanghaiDate(now);
  const todayStr = formatDate(bj);

  let working = input;
  let repeat: TodoRepeat = 'none';
  let dateStr: string | null = null;
  let dateDisplay: string | null = null;
  let periodHint: 'morning' | 'noon' | 'afternoon' | 'evening' | null = null;
  let hasDeadlineBefore = false;

  // 1) 识别重复周期：「每天 / 每日 / 每周X / 每星期X / 每周」
  const weeklyWdRe = /每(?:周|星期)([一二三四五六日天])/;
  const weeklyWdMatch = weeklyWdRe.exec(working);
  if (weeklyWdMatch) {
    repeat = 'weekly';
    const wd = CN_WEEKDAY[weeklyWdMatch[1]!]!;
    dateStr = nextWeekdayDate(todayStr, bj.weekday, wd, false);
    dateDisplay = `周${WEEKDAY_CN[wd]}`;
    working = working.replace(weeklyWdMatch[0], ' ');
  } else if (/每[天日]/.test(working)) {
    repeat = 'daily';
    dateStr = todayStr;
    dateDisplay = '今天';
    working = working.replace(/每[天日]/, ' ');
  } else if (/每周/.test(working)) {
    repeat = 'weekly';
    dateStr = todayStr;
    dateDisplay = '本周';
    working = working.replace(/每周/, ' ');
  }

  // 2) 识别日期（若尚未由「每周X」确定具体星期）
  if (!dateStr || dateDisplay === '今天' || dateDisplay === '本周') {
    const relRe = /(大后天|后天|后晚|明天|明早|明晚|明日|今天|今晚|今日)/;
    const relMatch = relRe.exec(working);
    if (relMatch) {
      const tok = relMatch[1]!;
      if (tok === '大后天') {
        dateStr = addDays(todayStr, 3);
        dateDisplay = '大后天';
      } else if (tok === '后天' || tok === '后晚') {
        dateStr = addDays(todayStr, 2);
        dateDisplay = '后天';
        if (tok === '后晚') periodHint = 'evening';
      } else if (tok.startsWith('明')) {
        dateStr = addDays(todayStr, 1);
        dateDisplay = '明天';
        if (tok === '明早') periodHint = 'morning';
        else if (tok === '明晚') periodHint = 'evening';
      } else {
        dateStr = todayStr;
        dateDisplay = '今天';
        if (tok === '今晚') periodHint = 'evening';
      }
      working = working.replace(tok, ' ');
    } else {
      const wdRe = /(下周|下星期|本周|这周|周|星期)([一二三四五六日天])/;
      const wdMatch = wdRe.exec(working);
      if (wdMatch) {
        const prefix = wdMatch[1]!;
        const wd = CN_WEEKDAY[wdMatch[2]!]!;
        const forceNext = prefix.startsWith('下');
        dateStr = nextWeekdayDate(todayStr, bj.weekday, wd, forceNext);
        dateDisplay = `${forceNext ? '下' : ''}周${WEEKDAY_CN[wd]}`;
        working = working.replace(wdMatch[0], ' ');
      } else {
        const mdRe = /(\d{1,2})月(\d{1,2})[日号]?/;
        const mdMatch = mdRe.exec(working);
        if (mdMatch) {
          const month = Number(mdMatch[1]);
          const day = Number(mdMatch[2]);
          if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            let year = bj.year;
            const candidate = formatDate({ year, month, day });
            if (candidate < todayStr) year += 1;
            dateStr = formatDate({ year, month, day });
            dateDisplay = `${month}月${day}日`;
            working = working.replace(mdMatch[0], ' ');
          }
        }
      }
    }
  }

  // 3) 识别时间段与钟点：「晚上8点半」「下午3:30」「上午10点」「18:00」
  let hour: number | null = null;
  let minute = 0;

  // 只在明确有钟点符号（: / ： / 点 / 时）时提取小时，避免把「高数第3章」误判成 3 点
  const explicitClockRe = /(凌晨|早上|上午|中午|下午|傍晚|晚上|晚)?\s*(\d{1,2})\s*[:：点时]\s*(半|\d{1,2})?\s*分?/;
  const clockMatch = explicitClockRe.exec(working);
  if (clockMatch) {
    const p = clockMatch[1];
    let h = Number(clockMatch[2]);
    const rawMin = clockMatch[3];
    const m = rawMin === '半' ? 30 : rawMin ? Number(rawMin) : 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      if (p === '下午' || p === '傍晚' || p === '晚上' || p === '晚') {
        if (h >= 1 && h <= 11) h += 12;
      } else if (p === '中午') {
        if (h >= 1 && h <= 5) h += 12;
      } else if (!p && periodHint === 'evening' && h >= 1 && h <= 11) {
        h += 12;
      }
      hour = h;
      minute = m;
      working = working.replace(clockMatch[0], ' ');
    }
  } else {
    const barePeriodRe = /(早上|上午|中午|下午|傍晚|晚上)/;
    const barePeriod = barePeriodRe.exec(working);
    if (barePeriod && dateStr) {
      const p = barePeriod[1]!;
      if (p === '早上' || p === '上午') periodHint = 'morning';
      else if (p === '中午') periodHint = 'noon';
      else if (p === '下午') periodHint = 'afternoon';
      else periodHint = 'evening';
      working = working.replace(p, ' ');
    }
  }

  // 4) 剥离残留的连接词「之前 / 前 / 截止」
  if ((dateStr || hour !== null) && /^\s*(?:之前|前|截止|以前)/.test(working)) {
    hasDeadlineBefore = true;
    working = working.replace(/^\s*(?:之前|前|截止|以前)/, ' ');
  } else if ((dateStr || hour !== null) && /(?:之前|前|截止)\s*$/.test(working)) {
    hasDeadlineBefore = true;
    working = working.replace(/(?:之前|前|截止)\s*$/, ' ');
  }

  if (!dateStr && hour === null && repeat === 'none') {
    return { title: input, dueAt: null, repeat: 'none', label: null };
  }

  // 若只写了钟点没写日期：今天该时间未过则算今天，已过则顺延明天
  if (!dateStr && hour !== null) {
    const candidate = shanghaiTime(todayStr, `${pad2(hour)}:${pad2(minute)}`);
    if (candidate.getTime() > now.getTime()) {
      dateStr = todayStr;
      dateDisplay = '今天';
    } else {
      dateStr = addDays(todayStr, 1);
      dateDisplay = '明天';
    }
  }

  // 若有日期但未写具体钟点：按时段或校园作息给合理默认时间
  if (dateStr && hour === null) {
    if (periodHint === 'morning') {
      hour = 9;
    } else if (periodHint === 'noon') {
      hour = 12;
    } else if (periodHint === 'afternoon') {
      hour = 15;
    } else if (periodHint === 'evening') {
      hour = 20;
    } else {
      hour = hasDeadlineBefore ? 22 : 22;
    }
  }

  let dueDate = dateStr && hour !== null ? shanghaiTime(dateStr, `${pad2(hour)}:${pad2(minute)}`) : null;
  // 若是「每天」且今天的默认/指定钟点已过，顺延到明天
  if (dueDate && repeat === 'daily' && dueDate.getTime() <= now.getTime()) {
    dateStr = addDays(dateStr!, 1);
    dateDisplay = '明天';
    dueDate = shanghaiTime(dateStr, `${pad2(hour!)}:${pad2(minute)}`);
  }
  // 若是「周X / 每周X」且刚好今天就是周X但钟点已过，顺延到下周同日
  if (dueDate && dateStr === todayStr && dueDate.getTime() <= now.getTime() && repeat === 'weekly') {
    dateStr = addDays(dateStr, 7);
    dueDate = shanghaiTime(dateStr, `${pad2(hour!)}:${pad2(minute)}`);
  }

  const cleanedTitle = working
    .replace(/^[\s,，:：\-—]+|[\s,，:：\-—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const timeText = hour !== null ? `${pad2(hour)}:${pad2(minute)}` : null;
  const repeatPrefix = repeat === 'daily' ? '每天' : repeat === 'weekly' ? '每周' : null;
  const parts = [repeatPrefix, dateDisplay && timeText ? `${dateDisplay} ${timeText}` : dateDisplay || timeText].filter(
    Boolean,
  );

  return {
    title: cleanedTitle || input,
    dueAt: dueDate ? dueDate.toISOString() : null,
    repeat,
    label: parts.length ? parts.join(' · ') : null,
  };
}
