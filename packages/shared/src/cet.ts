/**
 * 全国大学英语四、六级考试（CET-4 / CET-6）成绩模型、过线判定与智能解析器。
 *
 * 满分为 710 分（及格线 425 分）：
 * - 听力：248.5 分（35%）
 * - 阅读：248.5 分（35%）
 * - 写作和翻译：213 分（30%）
 */

export const CET_LEVELS = ['cet4', 'cet6'] as const;
export type CetLevel = (typeof CET_LEVELS)[number];

export const CET_LEVEL_LABELS: Record<CetLevel, string> = {
  cet4: '大学英语四级',
  cet6: '大学英语六级',
};

export const CET_SHORT_LABELS: Record<CetLevel, string> = {
  cet4: 'CET-4',
  cet6: 'CET-6',
};

export const CET_PASS_LINE = 425;
export const CET_MAX_TOTAL = 710;
export const CET_MAX_LISTENING = 248.5;
export const CET_MAX_READING = 248.5;
export const CET_MAX_WRITING = 213;

export const CET_OFFICIAL_LINKS = {
  scoreQuery: 'https://cjcx.neea.edu.cn/html1/folder/21033/653-1.htm',
  register: 'https://cet-bm.neea.edu.cn/',
  chsiQuery: 'https://www.chsi.com.cn/cet/',
} as const;

export interface CetScheduleTip {
  term: string;
  register: string;
  writtenExam: string;
  scoreRelease: string;
}

export const CET_SCHEDULE_GUIDE: readonly CetScheduleTip[] = [
  {
    term: '上半年考次',
    register: '3 月中下旬',
    writtenExam: '6 月中旬周六',
    scoreRelease: '8 月下旬',
  },
  {
    term: '下半年考次',
    register: '9 月中下旬',
    writtenExam: '12 月中旬周六',
    scoreRelease: '次年 2 月下旬',
  },
];

export interface CetRecord {
  id: string;
  level: CetLevel;
  /** 考次标签，例如 '2026年6月' 或 '2025年12月' */
  examSession: string;
  totalScore: number;
  listening: number | null;
  reading: number | null;
  writing: number | null;
  /** 口语成绩等级，例如 'A' | 'B+' | 'C' */
  oralGrade: string | null;
  ticketNo: string | null;
  source: 'manual' | 'jw';
  note: string | null;
  createdAt: string;
}

export interface CetSummary {
  bestCet4: CetRecord | null;
  bestCet6: CetRecord | null;
  cet4Passed: boolean;
  cet6Passed: boolean;
  totalCount: number;
}

export type CetScoreTier = 'high' | 'good' | 'pass' | 'fail';

export function cetScoreTier(totalScore: number): CetScoreTier {
  if (totalScore >= 550) return 'high';
  if (totalScore >= 500) return 'good';
  if (totalScore >= CET_PASS_LINE) return 'pass';
  return 'fail';
}

export const CET_TIER_LABELS: Record<CetScoreTier, string> = {
  high: '高分通过',
  good: '优秀通过',
  pass: '已过 425 线',
  fail: '未达 425 线',
};

export function summarizeCetRecords(records: readonly CetRecord[]): CetSummary {
  let bestCet4: CetRecord | null = null;
  let bestCet6: CetRecord | null = null;
  for (const r of records) {
    if (r.level === 'cet4') {
      if (!bestCet4 || r.totalScore > bestCet4.totalScore) bestCet4 = r;
    } else if (!bestCet6 || r.totalScore > bestCet6.totalScore) {
      bestCet6 = r;
    }
  }
  return {
    bestCet4,
    bestCet6,
    cet4Passed: (bestCet4?.totalScore ?? 0) >= CET_PASS_LINE,
    cet6Passed: (bestCet6?.totalScore ?? 0) >= CET_PASS_LINE,
    totalCount: records.length,
  };
}

export interface ParsedCetDraft {
  level?: CetLevel;
  examSession?: string;
  totalScore?: number;
  listening?: number | null;
  reading?: number | null;
  writing?: number | null;
  oralGrade?: string | null;
  ticketNo?: string | null;
}

function clampScore(val: string | undefined, max: number): number | null {
  if (!val) return null;
  const n = Math.round(Number(val));
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return n;
}

function normalizeSession(raw: string): string | undefined {
  const ym = /(20\d{2})\s*[年./-]\s*(\d{1,2})\s*月?/.exec(raw);
  if (ym) {
    const year = ym[1]!;
    const month = Number(ym[2]!);
    if (month >= 1 && month <= 12) return `${year}年${month}月`;
  }
  const half = /(20\d{2})\s*年?\s*(上半年|下半年)/.exec(raw);
  if (half) {
    return `${half[1]!}年${half[2] === '上半年' ? 6 : 12}月`;
  }
  return undefined;
}

/**
 * 智能解析从中国教育考试网 / 微信查分小程序复制出来的四六级成绩文本。
 */
export function parseCetText(raw: string): ParsedCetDraft | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const draft: ParsedCetDraft = {};

  if (/六级|cet\s*-?\s*6/i.test(text)) draft.level = 'cet6';
  else if (/四级|cet\s*-?\s*4/i.test(text)) draft.level = 'cet4';

  const session = normalizeSession(text);
  if (session) draft.examSession = session;

  const ticketMatch = /(?:准考证号?|考号|成绩报告单编号)[：:\s]*([0-9A-Za-z]{12,18})/.exec(text);
  if (ticketMatch) draft.ticketNo = ticketMatch[1]!;

  const totalMatch = /(?:总分|笔试总分|成绩)[：:\s]*(\d{3})(?!\d)/.exec(text);
  const listenMatch = /(?:听力)[：:\s]*(\d{2,3})(?!\d)/.exec(text);
  const readMatch = /(?:阅读)[：:\s]*(\d{2,3})(?!\d)/.exec(text);
  const writeMatch = /(?:写作(?:和|与)?翻译|写作|翻译)[：:\s]*(\d{2,3})(?!\d)/.exec(text);
  const oralMatch = /(?:口试|口语)[等级成绩：:\s]*([ABCD][+-]?)/i.exec(text);

  const listening = clampScore(listenMatch?.[1], 249);
  const reading = clampScore(readMatch?.[1], 249);
  const writing = clampScore(writeMatch?.[1], 213);
  let total = clampScore(totalMatch?.[1], CET_MAX_TOTAL);

  if (total === null && listening !== null && reading !== null && writing !== null) {
    const sum = listening + reading + writing;
    if (sum <= CET_MAX_TOTAL) total = sum;
  }

  if (listening !== null) draft.listening = listening;
  if (reading !== null) draft.reading = reading;
  if (writing !== null) draft.writing = writing;
  if (total !== null) draft.totalScore = total;
  if (oralMatch) draft.oralGrade = oralMatch[1]!.toUpperCase();

  if (draft.totalScore === undefined && !draft.level && !draft.ticketNo) return null;
  return draft;
}

export interface ParsedJwCetItem {
  level: CetLevel;
  examSession: string;
  totalScore: number;
  listening: number | null;
  reading: number | null;
  writing: number | null;
  oralGrade: string | null;
  ticketNo: string | null;
}

type RawRec = Record<string, unknown>;

const cleanCell = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  return s && s !== 'null' && s !== 'undefined' && s !== '-' && s !== '--' ? s : null;
};

function pickField(rec: RawRec, aliases: readonly string[]): string | null {
  const keys = Object.keys(rec);
  for (const alias of aliases) {
    const k = keys.find((key) => key.toLowerCase() === alias.toLowerCase());
    if (k !== undefined) {
      const val = cleanCell(rec[k]);
      if (val !== null) return val;
    }
  }
  return null;
}

function collectJsonRecords(node: unknown, out: RawRec[], depth = 0) {
  if (depth > 6 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonRecords(item, out, depth + 1);
    return;
  }
  const rec = node as RawRec;
  if (pickField(rec, ['ksmc', 'djksmc', 'kmmc', 'xm', '考试名称', '等级考试名称', '科目名称'])) {
    out.push(rec);
    return;
  }
  for (const val of Object.values(rec)) collectJsonRecords(val, out, depth + 1);
}

function parseHtmlRows(html: string): RawRec[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rows.length < 2) return [];
  const cellsOf = (r: string) =>
    [...r.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => cleanCell(m[1]) ?? '');
  const headerIdx = rows.findIndex((r) => cellsOf(r[1]!).some((c) => /考试|等级|科目/.test(c)));
  if (headerIdx < 0) return [];
  const headers = cellsOf(rows[headerIdx]![1]!);
  const out: RawRec[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cells = cellsOf(rows[i]![1]!);
    const rec: RawRec = {};
    headers.forEach((h, idx) => {
      if (h && cells[idx] !== undefined) rec[h] = cells[idx];
    });
    if (Object.keys(rec).length > 0) out.push(rec);
  }
  return out;
}

/** 解析广工教务系统「等级考试 / 社会考试成绩」JSON 或 HTML 表格，提取 CET-4 / CET-6 记录 */
export function parseJwCetScores(raw: string): ParsedJwCetItem[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let rows: RawRec[] = [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      collectJsonRecords(JSON.parse(trimmed) as unknown, rows);
    } catch {
      return [];
    }
  } else if (/<tr\b/i.test(trimmed)) {
    rows = parseHtmlRows(trimmed);
  }

  const dedup = new Map<string, ParsedJwCetItem>();
  for (const rec of rows) {
    const name = pickField(rec, ['ksmc', 'djksmc', 'kmmc', 'xm', '考试名称', '等级考试名称', '科目名称']);
    if (!name) continue;
    let level: CetLevel | null = null;
    if (/英语六级|大学英语六级|cet\s*-?\s*6/i.test(name)) level = 'cet6';
    else if (/英语四级|大学英语四级|cet\s*-?\s*4/i.test(name)) level = 'cet4';
    if (!level) continue;

    const scoreRaw = pickField(rec, ['zcj', 'cj', 'fs', 'score', '总成绩', '总分', '成绩']);
    const totalScore = clampScore(scoreRaw?.replace(/[^\d.]/g, ''), CET_MAX_TOTAL);
    if (totalScore === null || totalScore === 0) continue;

    const dateRaw =
      pickField(rec, ['ksrq', 'kssj', 'ksmc_sj', 'xnxqmc', 'xnxqdm', '考试时间', '考试日期', '学年学期']) ?? '';
    const examSession = normalizeSession(dateRaw) ?? normalizeSession(name) ?? (dateRaw || '历史考次');

    const listening = clampScore(pickField(rec, ['tlcj', 'tl', '听力', '听力成绩'])?.replace(/[^\d.]/g, ''), 249);
    const reading = clampScore(pickField(rec, ['ydcj', 'yd', '阅读', '阅读成绩'])?.replace(/[^\d.]/g, ''), 249);
    const writing = clampScore(
      pickField(rec, ['xzcj', 'xzyfy', 'xz', '写作', '写作与翻译', '写作和翻译'])?.replace(/[^\d.]/g, ''),
      213,
    );
    const ticketNo = pickField(rec, ['zkzh', 'ksbh', '准考证号', '考号']);

    const key = `${level}|${examSession}|${totalScore}`;
    dedup.set(key, {
      level,
      examSession,
      totalScore,
      listening,
      reading,
      writing,
      oralGrade: null,
      ticketNo,
    });
  }

  return [...dedup.values()];
}
