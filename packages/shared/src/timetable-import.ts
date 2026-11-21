/**
 * 教务系统课表导入：把从教务系统复制来的课表数据（JSON）解析成课程，并和现有课表比较差异。
 *
 * 广工教务系统（jxfw.gdut.edu.cn）的 xsgrkbcx!getKbRq.action?xnxqdm=学期代码 返回 [记录数组, []]，
 * 每条记录是某一周的一次课：kcdm 课程代码、kcmc 课程名、teaxms 老师（逗号分隔）、xq 星期、
 * jcdm 节次（「0102」）、zc 周次（单个数字）、jxcdmc 教室。
 * 也兼容其他常见的拼音缩写和中文字段名（见 FIELD_ALIASES），方便粘贴别的格式。
 *
 * 不依赖 zod，课表页按需加载这个模块时不会拖慢首屏。
 */
import { MAX_PERIOD, periodsFor } from './gdut.js';
import { daysBetween, formatDate, parseDate } from './time.js';

const MAX_WEEK = 30;

/** 解析出的一门课（还没有颜色和 id） */
export interface ImportedCourse {
  /** 匹配键：有课程代码时用课程代码，否则用课程名 + 老师。重新导入时据此判断是不是同一门课 */
  importKey: string;
  name: string;
  teacher: string | null;
  location: string | null;
  slots: ImportedSlot[];
}

export interface ImportedSlot {
  weekday: number;
  periodStart: number;
  periodEnd: number;
  weeks: number[];
  /** 为空表示用课程的教室 */
  location?: string | null;
}

export interface ImportParseResult {
  courses: ImportedCourse[];
  /** 读不懂或被跳过的记录，显示给用户核对 */
  warnings: string[];
  /** 一共读到多少条上课记录 */
  records: number;
}

/** 每个字段可能的名字，按顺序尝试。比较时忽略大小写 */
export const FIELD_ALIASES = {
  code: ['kcdm', 'courseCode', 'course_code', 'kch', '课程代码', '课程号'],
  name: ['kcmc', 'kcm', 'courseName', 'course_name', 'name', '课程名称', '课程名', '课程'],
  teacher: ['teaxms', 'jsxm', 'xm_js', 'teacherName', 'teacher', 'skjs', '教师', '任课教师', '授课教师', '老师'],
  location: ['jxcdmc', 'jxcd', 'cdmc', 'jsmc', 'classroom', 'room', 'location', '教学场地', '上课地点', '教室', '地点'],
  weekday: ['xq', 'xqj', 'weekday', 'week_day', 'dayOfWeek', 'day', '星期'],
  periods: ['jcdm', 'jcdm2', 'jc', 'jcs', 'jcor', 'sections', 'periods', 'section', '节次'],
  periodStart: ['ksjc', 'qsjc', 'startSection', 'start_section', 'periodStart', '开始节次'],
  periodEnd: ['jsjc', 'jzjc', 'endSection', 'end_section', 'periodEnd', '结束节次'],
  weeks: ['zcs', 'zcd', 'zc', 'skzc', 'weeks', 'week', 'weekList', '周次', '上课周次'],
} as const;

type Field = keyof typeof FIELD_ALIASES;
type RawRecord = Record<string, unknown>;

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return s && s !== 'null' && s !== 'undefined' ? s : null;
};

function pick(rec: RawRecord, field: Field): unknown {
  const keys = Object.keys(rec);
  for (const alias of FIELD_ALIASES[field]) {
    const hit = keys.find((k) => k.toLowerCase() === alias.toLowerCase());
    if (hit !== undefined && rec[hit] !== null && rec[hit] !== undefined && rec[hit] !== '') return rec[hit];
  }
  return undefined;
}

const CN_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7, 七: 7 };

/** 「1」「星期一」「周日」→ 1…7（周一为 1） */
export function parseWeekday(v: unknown): number | null {
  const s = clean(v);
  if (!s) return null;
  const n = Number(s);
  if (Number.isInteger(n) && n >= 1 && n <= 7) return n;
  const m = /(?:星期|周|礼拜)?([一二三四五六日天七])/.exec(s);
  return m ? (CN_DIGITS[m[1]!] ?? null) : null;
}

/** 「0102」「01,02」「1-2」「第3-4节」「3」→ [开始节, 结束节] */
export function parsePeriods(v: unknown): [number, number] | null {
  const s = clean(v);
  if (!s) return null;
  let nums: number[];
  const range = /(\d{1,2})\s*[-~至到]\s*(\d{1,2})/.exec(s);
  if (range) nums = [Number(range[1]), Number(range[2])];
  else if (/^\d+$/.test(s) && s.length >= 4 && s.length % 2 === 0) nums = s.match(/\d{2}/g)!.map(Number); // 「0102」「030405」
  else nums = (s.match(/\d+/g) ?? []).map(Number);
  nums = nums.filter((n) => n >= 1 && n <= MAX_PERIOD);
  if (!nums.length) return null;
  return [Math.min(...nums), Math.max(...nums)];
}

/** 「1-16」「1,3,5-7」「1-16单」「2-8(双)周」「[1,2,3]」→ 周次数组 */
export function parseWeeks(v: unknown): number[] {
  if (Array.isArray(v)) return [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_WEEK))].sort((a, b) => a - b);
  const s = clean(v);
  if (!s) return [];
  const weeks = new Set<number>();
  for (const part of s.split(/[,，、;；\s]+/)) {
    if (!part) continue;
    const odd = /单/.test(part);
    const even = /双/.test(part);
    const m = /(\d+)\s*(?:[-~至到]\s*(\d+))?/.exec(part);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let w = Math.min(a, b); w <= Math.max(a, b); w++) {
      if ((odd && w % 2 === 0) || (even && w % 2 === 1)) continue;
      if (w >= 1 && w <= MAX_WEEK) weeks.add(w);
    }
  }
  return [...weeks].sort((a, b) => a - b);
}

const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();

/** 课程名 + 老师，去掉空白和全半角差异，作为同一门课的判断依据（没有课程代码时用） */
export function importKeyOf(name: string, teacher: string | null): string {
  return `${norm(name)}|${norm(teacher ?? '')}`;
}

/** 有课程代码时的匹配键。同一门课的理论课、实验课老师不同，用课程代码才能合成一门 */
export const importKeyOfCode = (code: string) => `code:${norm(code)}`;

/** 在任意嵌套的 JSON 里找出「看起来像上课记录」的对象：同时有课程名和星期 */
function collectRecords(node: unknown, out: RawRecord[], depth = 0) {
  if (depth > 6 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectRecords(item, out, depth + 1);
    return;
  }
  const rec = node as RawRecord;
  if (pick(rec, 'name') !== undefined && pick(rec, 'weekday') !== undefined) {
    out.push(rec);
    return;
  }
  for (const value of Object.values(rec)) collectRecords(value, out, depth + 1);
}

export interface TimetableImportParseOptions {
  /** 解析 .ics 日历文件时用于推算周次的开学第 1 周周一（YYYY-MM-DD） */
  semesterStartDate?: string;
  totalWeeks?: number;
  campusId?: string | null;
}

function parseIcsDate(raw: string): Date | null {
  const value = raw.trim();
  // 支持 YYYYMMDDTHHMMSSZ 或 YYYYMMDDTHHMMSS（按北京时间）
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z === 'Z') {
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
  }
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) - 8 * 3600_000);
}

function unescapeIcs(s: string): string {
  return s.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

function nearestPeriodRange(startMin: number, endMin: number, campusId?: string | null): [number, number] {
  const periods = periodsFor(campusId).map((p) => {
    const [sh, sm] = p.start.split(':').map(Number) as [number, number];
    const [eh, em] = p.end.split(':').map(Number) as [number, number];
    return { no: p.no, start: sh * 60 + sm, end: eh * 60 + em };
  });
  let pStart = periods[0]!.no;
  let bestStartDiff = Infinity;
  let pEnd = periods[0]!.no;
  let bestEndDiff = Infinity;
  for (const p of periods) {
    const sd = Math.abs(p.start - startMin);
    if (sd < bestStartDiff) {
      bestStartDiff = sd;
      pStart = p.no;
    }
    const ed = Math.abs(p.end - endMin);
    if (ed < bestEndDiff) {
      bestEndDiff = ed;
      pEnd = p.no;
    }
  }
  return [pStart, Math.max(pStart, pEnd)];
}

/** 解析标准 .ics（iCalendar）课表文件 */
function parseIcsTimetable(text: string, opts?: TimetableImportParseOptions): ImportParseResult {
  const warnings: string[] = [];
  if (!opts?.semesterStartDate) {
    return { courses: [], warnings: ['解析 .ics 课表前需要先设置本学期开学日期'], records: 0 };
  }
  // RFC 5545 折行还原
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const blocks = unfolded.split('BEGIN:VEVENT').slice(1);
  if (!blocks.length) {
    return { courses: [], warnings: ['ICS 文件中没有找到任何课程日程（VEVENT）'], records: 0 };
  }

  const maxWeek = Math.min(MAX_WEEK, opts.totalWeeks ?? 25);
  const courses = new Map<string, ImportedCourse>();
  let recordCount = 0;

  for (const block of blocks) {
    const endIdx = block.indexOf('END:VEVENT');
    const body = endIdx >= 0 ? block.slice(0, endIdx) : block;
    const fields = new Map<string, string>();
    for (const line of body.split('\n')) {
      const colon = line.indexOf(':');
      if (colon <= 0) continue;
      const key = line.slice(0, colon).split(';')[0]!.trim().toUpperCase();
      const val = line.slice(colon + 1).trim();
      if (!fields.has(key)) fields.set(key, val);
    }

    const summary = fields.get('SUMMARY') ? unescapeIcs(fields.get('SUMMARY')!) : null;
    const dtStart = fields.get('DTSTART') ? parseIcsDate(fields.get('DTSTART')!) : null;
    const dtEnd = fields.get('DTEND') ? parseIcsDate(fields.get('DTEND')!) : null;
    if (!summary || !dtStart) continue;
    recordCount++;

    const bjStart = new Date(dtStart.getTime() + 8 * 3600_000);
    const bjEnd = dtEnd ? new Date(dtEnd.getTime() + 8 * 3600_000) : new Date(bjStart.getTime() + 90 * 60_000);
    const startDateStr = formatDate({
      year: bjStart.getUTCFullYear(),
      month: bjStart.getUTCMonth() + 1,
      day: bjStart.getUTCDate(),
    });
    const diff = daysBetween(opts.semesterStartDate, startDateStr);
    const baseWeek = Math.floor(diff / 7) + 1;
    if (baseWeek < 1 || baseWeek > maxWeek) {
      warnings.push(`${summary}（${startDateStr}）：不在本学期周次范围内，已跳过`);
      continue;
    }

    // 解析可选 RRULE（如 FREQ=WEEKLY;INTERVAL=1;COUNT=16 或 UNTIL=...）
    const rrule = fields.get('RRULE') ?? '';
    const weeks = new Set<number>([baseWeek]);
    if (/FREQ=WEEKLY/i.test(rrule)) {
      const interval = Number(/INTERVAL=(\d+)/i.exec(rrule)?.[1] ?? 1) || 1;
      const countMatch = /COUNT=(\d+)/i.exec(rrule);
      const untilMatch = /UNTIL=([0-9TZ]+)/i.exec(rrule);
      if (countMatch) {
        const count = Number(countMatch[1]);
        for (let k = 1; k < count; k++) {
          const w = baseWeek + k * interval;
          if (w <= maxWeek) weeks.add(w);
        }
      } else if (untilMatch) {
        const untilDate = parseIcsDate(untilMatch[1]!);
        if (untilDate) {
          const bjUntil = new Date(untilDate.getTime() + 8 * 3600_000);
          const untilStr = formatDate({
            year: bjUntil.getUTCFullYear(),
            month: bjUntil.getUTCMonth() + 1,
            day: bjUntil.getUTCDate(),
          });
          const endWeek = Math.min(maxWeek, Math.floor(daysBetween(opts.semesterStartDate, untilStr) / 7) + 1);
          for (let w = baseWeek + interval; w <= endWeek; w += interval) weeks.add(w);
        }
      }
    }

    const weekday = parseDate(startDateStr).weekday;
    const startMin = bjStart.getUTCHours() * 60 + bjStart.getUTCMinutes();
    const endMin = bjEnd.getUTCHours() * 60 + bjEnd.getUTCMinutes();
    const [periodStart, periodEnd] = nearestPeriodRange(startMin, endMin, opts.campusId);

    const location = fields.get('LOCATION') ? unescapeIcs(fields.get('LOCATION')!).slice(0, 30) : null;
    const desc = fields.get('DESCRIPTION') ? unescapeIcs(fields.get('DESCRIPTION')!) : '';
    const teacherMatch = /(?:教师|老师)[:：\s]*([^\s,，;；]+)/.exec(desc);
    const teacher = teacherMatch?.[1]?.slice(0, 20) ?? null;

    const name = summary.slice(0, 30);
    const key = importKeyOf(name, teacher);
    const course = courses.get(key) ?? { importKey: key, name, teacher, location: null, slots: [] };
    courses.set(key, course);

    const weekArr = [...weeks].sort((a, b) => a - b);
    const slot = course.slots.find(
      (s) => s.weekday === weekday && s.periodStart === periodStart && s.periodEnd === periodEnd && s.location === location,
    );
    if (slot) slot.weeks = [...new Set([...slot.weeks, ...weekArr])].sort((a, b) => a - b);
    else course.slots.push({ weekday, periodStart, periodEnd, weeks: weekArr, location });
  }

  for (const c of courses.values()) {
    c.slots.sort((a, b) => a.weekday - b.weekday || a.periodStart - b.periodStart);
    const rooms = new Set(c.slots.map((s) => s.location));
    if (rooms.size === 1) {
      c.location = c.slots[0]!.location ?? null;
      for (const s of c.slots) s.location = null;
    }
    if (c.slots.length > 10) {
      warnings.push(`${c.name}：上课时间段超过 10 个，只保留前 10 个`);
      c.slots = c.slots.slice(0, 10);
    }
  }

  return { courses: [...courses.values()], warnings, records: recordCount };
}

/** 解析粘贴或上传的课表数据：支持教务系统 JSON 与标准 .ics 日历文件 */
export function parseTimetableImport(text: string, opts?: TimetableImportParseOptions): ImportParseResult {
  const trimmed = text.trim();
  if (trimmed.includes('BEGIN:VCALENDAR') || trimmed.includes('BEGIN:VEVENT')) {
    return parseIcsTimetable(trimmed, opts);
  }
  const warnings: string[] = [];
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return { courses: [], warnings: ['不是有效的 JSON 或 ICS 日历文件。请粘贴教务系统响应 JSON，或选择 .json / .ics 文件'], records: 0 };
  }
  const records: RawRecord[] = [];
  collectRecords(json, records);
  if (!records.length) {
    return { courses: [], warnings: ['没有找到上课记录（需要同时有课程名和星期字段）。把这份数据发给开发者，补充字段名'], records: 0 };
  }

  // 同一门课的同一个时间段（星期 + 节次 + 教室）可能拆成多条记录（每周一条），合并周次
  const courses = new Map<string, ImportedCourse>();
  const teachersOf = new Map<string, Set<string>>();
  records.forEach((rec, i) => {
    const name = clean(pick(rec, 'name'));
    const weekday = parseWeekday(pick(rec, 'weekday'));
    const periods =
      parsePeriods(pick(rec, 'periods')) ??
      (() => {
        const a = Number(clean(pick(rec, 'periodStart')));
        const b = Number(clean(pick(rec, 'periodEnd')) ?? a);
        return Number.isInteger(a) && a >= 1 && a <= MAX_PERIOD ? ([a, Math.max(a, Math.min(b, MAX_PERIOD))] as [number, number]) : null;
      })();
    const weeks = parseWeeks(pick(rec, 'weeks'));
    const label = name ?? `第 ${i + 1} 条`;
    if (!name || !weekday || !periods) {
      warnings.push(`${label}：缺少${!name ? '课程名' : !weekday ? '星期' : '节次'}，已跳过`);
      return;
    }
    if (!weeks.length) {
      warnings.push(`${label}（星期${weekday} 第${periods[0]}-${periods[1]}节）：没有读到周次，已跳过`);
      return;
    }
    const teacher = clean(pick(rec, 'teacher'));
    const location = clean(pick(rec, 'location'));
    const code = clean(pick(rec, 'code'));
    const key = code ? importKeyOfCode(code) : importKeyOf(name, teacher);
    const course = courses.get(key) ?? { importKey: key, name: name.slice(0, 30), teacher: null, location: null, slots: [] };
    courses.set(key, course);
    // 「甲老师,乙老师[主讲]」：按逗号拆开，去掉「[主讲]」这类角色标注，同名去重
    const names = (teacher?.split(/[,，、;；/]/) ?? []).map((t) => t.replace(/[[(（【].*$/, '').trim()).filter(Boolean);
    teachersOf.set(key, new Set([...(teachersOf.get(key) ?? []), ...names]));
    const slot = course.slots.find(
      (s) => s.weekday === weekday && s.periodStart === periods[0] && s.periodEnd === periods[1] && s.location === (location?.slice(0, 30) ?? null),
    );
    if (slot) slot.weeks = [...new Set([...slot.weeks, ...weeks])].sort((a, b) => a - b);
    else course.slots.push({ weekday, periodStart: periods[0], periodEnd: periods[1], weeks, location: location?.slice(0, 30) ?? null });
  });

  for (const c of courses.values()) {
    const teachers = [...(teachersOf.get(c.importKey) ?? [])];
    // 字段最长 20 字：放不下时只列前几位，加「等」
    let shown = teachers.join('、');
    for (let n = teachers.length - 1; shown.length > 20 && n >= 1; n--) shown = `${teachers.slice(0, n).join('、')}等`;
    c.teacher = shown ? shown.slice(0, 20) : null;
    c.slots.sort((a, b) => a.weekday - b.weekday || a.periodStart - b.periodStart);
    // 所有时间段都在同一个教室时，教室记在课程上，时间段里留空（和手动添加的课一致）
    const rooms = new Set(c.slots.map((s) => s.location));
    if (rooms.size === 1) {
      c.location = c.slots[0]!.location ?? null;
      for (const s of c.slots) s.location = null;
    }
    if (c.slots.length > 10) {
      warnings.push(`${c.name}：上课时间段超过 10 个，只保留前 10 个`);
      c.slots = c.slots.slice(0, 10);
    }
  }
  return { courses: [...courses.values()], warnings, records: records.length };
}

/** 现有课程里参与比较的部分 */
export interface ExistingCourse {
  id: string;
  name: string;
  teacher: string | null;
  location: string | null;
  source: 'manual' | 'import';
  importKey: string | null;
  slots: ImportedSlot[];
}

export interface ImportDiff {
  added: ImportedCourse[];
  changed: { before: ExistingCourse; after: ImportedCourse }[];
  /** 以前导入、这次教务系统里没有了的课 */
  removed: ExistingCourse[];
  unchanged: number;
}

const slotSig = (s: ImportedSlot, fallback: string | null) =>
  `${s.weekday}:${s.periodStart}-${s.periodEnd}@${s.location ?? fallback ?? ''}#${s.weeks.join(',')}`;
const courseSig = (c: { location: string | null; slots: ImportedSlot[] }) =>
  c.slots
    .map((s) => slotSig(s, c.location))
    .sort()
    .join('|');

/** 比较导入结果和现有课表。手动添加的课不参与比较，导入时也不会被改动 */
export function diffImport(existing: ExistingCourse[], imported: ImportedCourse[]): ImportDiff {
  const previous = new Map(existing.filter((c) => c.source === 'import' && c.importKey).map((c) => [c.importKey!, c]));
  const diff: ImportDiff = { added: [], changed: [], removed: [], unchanged: 0 };
  for (const after of imported) {
    const before = previous.get(after.importKey);
    if (!before) diff.added.push(after);
    else if (courseSig(before) !== courseSig(after) || before.name !== after.name) diff.changed.push({ before, after });
    else diff.unchanged++;
    previous.delete(after.importKey);
  }
  diff.removed = [...previous.values()];
  return diff;
}
