/**
 * 广工教务系统（jxfw.gdut.edu.cn，乘方教务）考试安排解析与差异比对。
 *
 * 兼容：
 * 1. 乘方教务 /xsksap!getDataList.action 返回的 `{ total, rows: [...] }` JSON；
 * 2. 其他高校/导出工具的 JSON 数组；
 * 3. 从教务网页直接复制的 HTML 表格或 Tab 分隔文本（TSV）。
 *
 * 不依赖 zod，不拖慢首屏体积。
 */
import type { Exam } from './exam.js';

export interface ImportedExam {
  importKey: string;
  courseName: string;
  examDate: string;
  startTime: string;
  endTime: string;
  location: string | null;
  seatNo: string | null;
  examType: string | null;
  campus: string | null;
  note: string | null;
}

export interface ExamImportParseResult {
  exams: ImportedExam[];
  warnings: string[];
  records: number;
}

export const EXAM_FIELD_ALIASES = {
  code: ['kcdm', 'courseCode', 'course_code', 'kch', '课程代码', '课程编号'],
  courseName: ['kcmc', 'courseName', 'course_name', 'name', '课程名称', '课程名', '考试科目', '科目'],
  examDate: ['ksrq', 'examDate', 'exam_date', 'rq', '考试日期', '日期'],
  timeRange: ['kssj', 'kssjd', 'ksap', 'jcsj', 'examTime', 'exam_time', '考试时间', '具体时间', '时间'],
  startTime: ['ks_kssj', 'startTime', 'start_time', 'qssj', '开始时间'],
  endTime: ['ks_jssj', 'jssj', 'endTime', 'end_time', '结束时间'],
  location: ['kscdmc', 'ksdd', 'cdmc', 'jxcdmc', 'kcmc_cd', 'location', 'examRoom', '考场名称', '考场地点', '考试地点', '考场', '教室'],
  seatNo: ['zwh', 'kszwh', 'zw', 'seatNo', 'seat_no', 'seat', '座位号', '考场座位号', '座号'],
  examType: ['ksaplxmc', 'kslx', 'kslxmc', 'ksfsmc', 'ksxz', 'ksxzmc', 'examType', '考试类型', '考试性质', '考试形式', '考核方式'],
  campus: ['xqmc', 'ksxq', 'campus', '校区', '考试校区'],
  note: ['bz', 'ksbz', 'note', 'remark', '备注'],
} as const;

type Field = keyof typeof EXAM_FIELD_ALIASES;
type RawRecord = Record<string, unknown>;

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  return s && s !== 'null' && s !== 'undefined' && s !== '-' && s !== '--' ? s : null;
};

const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();

function pick(rec: RawRecord, field: Field): string | null {
  const keys = Object.keys(rec);
  for (const alias of EXAM_FIELD_ALIASES[field]) {
    const hit = keys.find((k) => k.toLowerCase() === alias.toLowerCase());
    if (hit !== undefined) {
      const val = clean(rec[hit]);
      if (val !== null) return val;
    }
  }
  return null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function normalizeDateToken(raw: string): string | null {
  const m = /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/.exec(raw);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function normalizeTimeToken(raw: string): string | null {
  const m = /^(\d{1,2})[:：](\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${pad2(h)}:${pad2(min)}`;
}

function addMinutesClamped(hhmm: string, deltaMin: number): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const total = Math.min(23 * 60 + 59, h * 60 + m + deltaMin);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/**
 * 从多个可能的日期/时间字段中提取规范的 (examDate, startTime, endTime)。
 * 兼容：
 * - ksrq="2027-01-08", kssj="08:30-10:30"
 * - kssj="2027-01-08(08:30-10:30)" 或 "2027年1月8日 14:00~16:00"
 * - ksrq="2027-01-08", startTime="08:30", endTime="10:30"
 */
export function parseExamDateAndTimes(input: {
  examDate?: string | null;
  timeRange?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}): { examDate: string; startTime: string; endTime: string } | null {
  const joined = [input.examDate, input.timeRange, input.startTime, input.endTime].filter(Boolean).join(' ');
  const examDate =
    (input.examDate ? normalizeDateToken(input.examDate) : null) ??
    (input.timeRange ? normalizeDateToken(input.timeRange) : null) ??
    normalizeDateToken(joined);
  if (!examDate) return null;

  let startTime = input.startTime ? normalizeTimeToken(input.startTime) : null;
  let endTime = input.endTime ? normalizeTimeToken(input.endTime) : null;

  if (!startTime || !endTime) {
    const timeSource = input.timeRange ?? joined;
    const rangeMatch = /(\d{1,2}[:：]\d{2})\s*[-~～至到—–]+\s*(\d{1,2}[:：]\d{2})/.exec(timeSource);
    if (rangeMatch) {
      startTime = startTime ?? normalizeTimeToken(rangeMatch[1]!);
      endTime = endTime ?? normalizeTimeToken(rangeMatch[2]!);
    } else {
      const singles = [...timeSource.matchAll(/(\d{1,2}[:：]\d{2})/g)]
        .map((m) => normalizeTimeToken(m[1]!))
        .filter((v): v is string => Boolean(v));
      if (singles.length >= 2) {
        startTime = startTime ?? singles[0]!;
        endTime = endTime ?? singles[1]!;
      } else if (singles.length === 1) {
        startTime = startTime ?? singles[0]!;
      }
    }
  }

  if (!startTime) {
    // 部分只公布日期未公布具体时间段的考试，默认 08:30-10:30 以便展示和编辑
    startTime = '08:30';
    endTime = '10:30';
  }
  if (!endTime || endTime <= startTime) {
    endTime = addMinutesClamped(startTime, 120);
  }
  if (endTime <= startTime) return null;
  return { examDate, startTime, endTime };
}

function extractLocationAndSeat(rawLocation: string | null, rawSeat: string | null): { location: string | null; seatNo: string | null } {
  let location = rawLocation;
  let seatNo = rawSeat;
  if (location && !seatNo) {
    const seatMatch = /[（(]?\s*(?:座位号?|座号)\s*[:：]?\s*([A-Za-z0-9-]+)\s*[）)]?/.exec(location);
    if (seatMatch) {
      seatNo = seatMatch[1]!.trim();
      location = location.replace(seatMatch[0], '').trim() || null;
    }
  }
  if (seatNo) {
    seatNo = seatNo.replace(/^(?:座位号?|座号)\s*[:：]?\s*/, '').replace(/号$/, '').trim() || null;
  }
  return { location: location ? location.slice(0, 40) : null, seatNo: seatNo ? seatNo.slice(0, 20) : null };
}

export function examImportKeyOf(
  code: string | null,
  courseName: string,
  examDate: string,
  examType: string | null,
): string {
  const base = code ? `code:${norm(code)}` : `name:${norm(courseName)}`;
  const typePart = examType ? `|${norm(examType)}` : '';
  return `${base}|${examDate}${typePart}`.slice(0, 120);
}

function collectJsonRecords(node: unknown, out: RawRecord[], depth = 0) {
  if (depth > 6 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonRecords(item, out, depth + 1);
    return;
  }
  const rec = node as RawRecord;
  if (
    pick(rec, 'courseName') !== null &&
    (pick(rec, 'examDate') !== null || pick(rec, 'timeRange') !== null || pick(rec, 'location') !== null)
  ) {
    out.push(rec);
    return;
  }
  for (const value of Object.values(rec)) collectJsonRecords(value, out, depth + 1);
}

/** 从 HTML <table> 解析记录（兼容直接返回网页表格的教务接口或复制的 HTML） */
function parseHtmlTableRecords(html: string): RawRecord[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rows.length < 2) return [];
  const cellsOf = (rowHtml: string) =>
    [...rowHtml.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => clean(m[1]) ?? '');
  const headerIdx = rows.findIndex((r) => {
    const cells = cellsOf(r[1]!);
    return cells.some((c) => /课程|科目/.test(c)) && cells.some((c) => /时间|日期|考场|地点/.test(c));
  });
  if (headerIdx < 0) return [];
  const headers = cellsOf(rows[headerIdx]![1]!);
  const out: RawRecord[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cells = cellsOf(rows[i]![1]!);
    if (cells.length < 2) continue;
    const rec: RawRecord = {};
    headers.forEach((h, idx) => {
      if (h && cells[idx] !== undefined) rec[h] = cells[idx];
    });
    out.push(rec);
  }
  return out;
}

/** 从浏览器全选复制的 Tab 分隔表格文本解析记录 */
function parseTsvRecords(text: string): RawRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headerIdx = lines.findIndex((l) => l.includes('\t') && /课程|科目/.test(l) && /时间|日期|考场|地点/.test(l));
  if (headerIdx < 0) return [];
  const headers = lines[headerIdx]!.split('\t').map((h) => h.trim());
  const out: RawRecord[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = lines[i]!.split('\t').map((c) => c.trim());
    if (cells.length < 2) continue;
    const rec: RawRecord = {};
    headers.forEach((h, idx) => {
      if (h && cells[idx] !== undefined) rec[h] = cells[idx];
    });
    out.push(rec);
  }
  return out;
}

export function parseExamImport(raw: string): ExamImportParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { exams: [], warnings: [], records: 0 };

  let rawRecords: RawRecord[] = [];
  const warnings: string[] = [];

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      collectJsonRecords(parsed, rawRecords);
    } catch {
      return { exams: [], warnings: ['JSON 格式有误，请检查是否完整复制了教务接口返回内容'], records: 0 };
    }
  } else if (/<tr\b/i.test(trimmed)) {
    rawRecords = parseHtmlTableRecords(trimmed);
  } else if (trimmed.includes('\t')) {
    rawRecords = parseTsvRecords(trimmed);
  } else {
    return { exams: [], warnings: ['无法识别格式：支持粘贴教务系统 JSON 或直接复制考试安排表格'], records: 0 };
  }

  const dedup = new Map<string, ImportedExam>();

  for (const rec of rawRecords) {
    const courseName = pick(rec, 'courseName');
    if (!courseName) continue;
    const dt = parseExamDateAndTimes({
      examDate: pick(rec, 'examDate'),
      timeRange: pick(rec, 'timeRange'),
      startTime: pick(rec, 'startTime'),
      endTime: pick(rec, 'endTime'),
    });
    if (!dt) {
      warnings.push(`${courseName}：缺少可识别的考试日期（如 2027-01-08），已跳过`);
      continue;
    }

    const code = pick(rec, 'code');
    const examType = pick(rec, 'examType')?.slice(0, 30) ?? null;
    const campus = pick(rec, 'campus')?.slice(0, 30) ?? null;
    const note = pick(rec, 'note')?.slice(0, 120) ?? null;
    const { location, seatNo } = extractLocationAndSeat(pick(rec, 'location'), pick(rec, 'seatNo'));
    const importKey = examImportKeyOf(code, courseName, dt.examDate, examType);

    dedup.set(importKey, {
      importKey,
      courseName: courseName.slice(0, 50),
      examDate: dt.examDate,
      startTime: dt.startTime,
      endTime: dt.endTime,
      location,
      seatNo,
      examType,
      campus,
      note,
    });
  }

  const exams = [...dedup.values()].sort(
    (a, b) => a.examDate.localeCompare(b.examDate) || a.startTime.localeCompare(b.startTime),
  );
  return { exams, warnings, records: rawRecords.length };
}

export interface ExamImportDiff {
  added: ImportedExam[];
  changed: { before: Exam; after: ImportedExam }[];
  removed: Exam[];
  unchanged: number;
}

function sameExamContent(a: Exam, b: ImportedExam): boolean {
  return (
    a.courseName === b.courseName &&
    a.examDate === b.examDate &&
    a.startTime === b.startTime &&
    a.endTime === b.endTime &&
    (a.location ?? null) === (b.location ?? null) &&
    (a.seatNo ?? null) === (b.seatNo ?? null) &&
    (a.examType ?? null) === (b.examType ?? null) &&
    (a.campus ?? null) === (b.campus ?? null) &&
    (a.note ?? null) === (b.note ?? null)
  );
}

/** 比对已有考试与新导入列表：只增改删 source='import' 的记录，手动添加的考试不受影响 */
export function diffExamImport(existing: Exam[], incoming: ImportedExam[]): ExamImportDiff {
  const existingByKey = new Map<string, Exam>();
  for (const e of existing) {
    if (e.source === 'import' && e.importKey) {
      existingByKey.set(e.importKey, e);
    }
  }

  const added: ImportedExam[] = [];
  const changed: { before: Exam; after: ImportedExam }[] = [];
  let unchanged = 0;
  const seenKeys = new Set<string>();

  for (const item of incoming) {
    seenKeys.add(item.importKey);
    const prev = existingByKey.get(item.importKey);
    if (!prev) {
      added.push(item);
    } else if (sameExamContent(prev, item)) {
      unchanged++;
    } else {
      changed.push({ before: prev, after: item });
    }
  }

  const removed: Exam[] = [];
  for (const [key, prev] of existingByKey) {
    if (!seenKeys.has(key)) removed.push(prev);
  }

  return { added, changed, removed, unchanged };
}
