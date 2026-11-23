/**
 * 广东工业大学第二课堂（素质拓展）时长与学分统计引擎。
 *
 * 围绕广工同学每学期 / 每学年查第二课堂时长（综测、评奖评优与毕业考核）的核心场景：
 * - 自动按北京时间推算「当前学期」与「当前学年」；
 * - 汇总当前学期与当前学年的已认定 / 待审核时长、折算二课学分及六大模块分布；
 * - 支持解析广工第二课堂（Better Me / 网上办事大厅 / i志愿）JSON、HTML 表格与粘贴文本。
 */
import { defaultAcademicYear } from './fitness.js';
import { formatSemesterName, normalizeSemesterCode } from './grade.js';
import { parseDate, today } from './time.js';

export const SECOND_CLASS_CATEGORIES = [
  'ideology',
  'volunteer',
  'innovation',
  'culture',
  'practice',
  'leadership',
] as const;

export type SecondClassCategory = (typeof SECOND_CLASS_CATEGORIES)[number];

export const SECOND_CLASS_CATEGORY_LABELS: Record<SecondClassCategory, string> = {
  ideology: '思想成长',
  volunteer: '公益志愿',
  innovation: '创新创业',
  culture: '文体活动',
  practice: '社会实践',
  leadership: '工作履历',
};

export const SECOND_CLASS_STATUSES = ['approved', 'pending'] as const;
export type SecondClassStatus = (typeof SECOND_CLASS_STATUSES)[number];

export type SecondClassSource = 'manual' | 'import';

export interface SecondClassRecord {
  id: string;
  academicYear: string;
  semesterCode: string;
  semesterName: string;
  title: string;
  category: SecondClassCategory;
  /** 时长（小时 / 学时） */
  hours: number;
  /** 折算第二课堂学分（可选，默认 0） */
  credits: number;
  /** 活动日期 'YYYY-MM-DD' */
  activityDate: string;
  organizer: string | null;
  status: SecondClassStatus;
  source: SecondClassSource;
  importKey: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SecondClassCategoryStat {
  category: SecondClassCategory;
  label: string;
  hours: number;
  credits: number;
  count: number;
}

export interface SecondClassScopeStats {
  label: string;
  totalHours: number;
  approvedHours: number;
  pendingHours: number;
  totalCredits: number;
  targetHours: number;
  percent: number;
  remainingHours: number;
  count: number;
  byCategory: SecondClassCategoryStat[];
  records: SecondClassRecord[];
}

export interface SecondClassSummaryResponse {
  academicYear: string;
  semesterCode: string;
  semesterName: string;
  semesterTargetHours: number;
  yearTargetHours: number;
  currentSemester: SecondClassScopeStats;
  currentAcademicYear: SecondClassScopeStats;
  syncedAt: string | null;
}

export interface SecondClassSyncItem {
  academicYear: string;
  semesterCode: string;
  title: string;
  category: SecondClassCategory;
  hours: number;
  credits: number;
  activityDate: string;
  organizer: string | null;
  status: SecondClassStatus;
  note: string | null;
  importKey: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 根据北京时间推算广工当前学期代码（8月–次年1月为秋季 YYYY01；2月–7月为春季 YYYY02） */
export function defaultSemesterCode(now: Date = new Date()): string {
  const { year, month } = parseDate(today(now));
  if (month >= 8) return `${year}01`;
  if (month === 1) return `${year - 1}01`;
  return `${year - 1}02`;
}

/** 根据活动日期 'YYYY-MM-DD' 推算归属学期代码 */
export function inferSemesterCodeFromDate(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (!m) return defaultSemesterCode();
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month >= 8) return `${year}01`;
  if (month === 1) return `${year - 1}01`;
  return `${year - 1}02`;
}

/** 由学期代码推算学年（例如 '202601' / '202602' → '2026-2027'） */
export function academicYearOfSemester(semesterCode: string): string {
  const norm = normalizeSemesterCode(semesterCode);
  const m = /^(20\d{2})0[123]$/.exec(norm);
  if (m) {
    const start = Number(m[1]);
    return `${start}-${start + 1}`;
  }
  return defaultAcademicYear();
}

/** 识别第二课堂六大模块 */
export function classifySecondClassCategory(raw: string | null | undefined, title = ''): SecondClassCategory {
  const text = `${raw ?? ''} ${title}`.trim();
  if (/志愿|公益|义工|献血|支教|敬老|环保|i志愿/.test(text)) return 'volunteer';
  if (/创新|创业|竞赛|比赛|挑战杯|大创|专利|论文|科创|学术|讲座|科技/.test(text)) return 'innovation';
  if (/文体|文艺|体育|运动会|跑|晚会|合唱|美育|音乐|摄影|辩论|社团文化/.test(text)) return 'culture';
  if (/实践|三下乡|调研|实习|技能|证书|培训|考察/.test(text)) return 'practice';
  if (/履历|班委|团支书|学生会|干事|部长|社长|干部|助理/.test(text)) return 'leadership';
  return 'ideology';
}

function buildScopeStats(
  records: SecondClassRecord[],
  label: string,
  targetHours: number,
): SecondClassScopeStats {
  const sorted = [...records].sort(
    (a, b) => b.activityDate.localeCompare(a.activityDate) || b.createdAt.localeCompare(a.createdAt),
  );
  let approvedHours = 0;
  let pendingHours = 0;
  let totalCredits = 0;

  const catMap = new Map<SecondClassCategory, { hours: number; credits: number; count: number }>();
  for (const cat of SECOND_CLASS_CATEGORIES) {
    catMap.set(cat, { hours: 0, credits: 0, count: 0 });
  }

  for (const r of sorted) {
    const h = Math.max(0, r.hours);
    const c = Math.max(0, r.credits);
    if (r.status === 'pending') pendingHours += h;
    else approvedHours += h;
    totalCredits += c;

    const bucket = catMap.get(r.category)!;
    bucket.hours += h;
    bucket.credits += c;
    bucket.count += 1;
  }

  const totalHours = round1(approvedHours + pendingHours);
  const safeTarget = round1(Math.max(1, targetHours));
  const percent = Math.min(100, Math.round((totalHours / safeTarget) * 100));

  const byCategory: SecondClassCategoryStat[] = SECOND_CLASS_CATEGORIES.map((category) => {
    const item = catMap.get(category)!;
    return {
      category,
      label: SECOND_CLASS_CATEGORY_LABELS[category],
      hours: round1(item.hours),
      credits: round2(item.credits),
      count: item.count,
    };
  });

  return {
    label,
    totalHours,
    approvedHours: round1(approvedHours),
    pendingHours: round1(pendingHours),
    totalCredits: round2(totalCredits),
    targetHours: safeTarget,
    percent,
    remainingHours: round1(Math.max(0, safeTarget - totalHours)),
    count: sorted.length,
    byCategory,
    records: sorted,
  };
}

/** 分别统计当前学期与当前学年的第二课堂时长与模块分布 */
export function summarizeSecondClass(
  records: SecondClassRecord[],
  opts: {
    academicYear: string;
    semesterCode: string;
    semesterTargetHours?: number;
    yearTargetHours?: number;
    syncedAt?: string | null;
  },
): SecondClassSummaryResponse {
  const semesterCode = normalizeSemesterCode(opts.semesterCode);
  const academicYear = opts.academicYear;
  const semesterName = formatSemesterName(semesterCode);
  const semesterTargetHours = opts.semesterTargetHours ?? 12;
  const yearTargetHours = opts.yearTargetHours ?? 24;

  const yearRecords = records.filter((r) => r.academicYear === academicYear);
  const semesterRecords = yearRecords.filter((r) => normalizeSemesterCode(r.semesterCode) === semesterCode);

  return {
    academicYear,
    semesterCode,
    semesterName,
    semesterTargetHours,
    yearTargetHours,
    currentSemester: buildScopeStats(semesterRecords, `${semesterName}（当前学期）`, semesterTargetHours),
    currentAcademicYear: buildScopeStats(yearRecords, `${academicYear} 学年（当前学年）`, yearTargetHours),
    syncedAt: opts.syncedAt ?? null,
  };
}

// ============================================================
// 第二课堂时长导入解析（支持 Better Me / 办事大厅 JSON、HTML、粘贴表格）
// ============================================================

type RawRec = Record<string, unknown>;

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  return s && s !== 'null' && s !== 'undefined' && s !== '-' && s !== '--' ? s : null;
};

const parseNumber = (v: unknown): number | null => {
  const s = clean(v);
  if (!s) return null;
  const m = /\d+(?:\.\d+)?/.exec(s);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
};

const normalizeDate = (raw: string | null, fallbackDate: string): string => {
  if (!raw) return fallbackDate;
  const m = /(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/.exec(raw);
  if (!m) return fallbackDate;
  return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
};

const SC_ALIASES = {
  title: ['hdmc', 'xmmc', 'title', 'name', 'activityName', '活动名称', '项目名称', '名称', '活动'],
  category: ['mkmc', 'flmc', 'category', 'type', 'moduleName', '所属模块', '分类', '类别', '模块'],
  hours: ['sc', 'xs', 'hours', 'duration', 'serviceHours', '时长', '学时', '服务时长', '获得时长', '认定学时'],
  credits: ['xf', 'jf', 'credits', 'score', '学分', '积分', '获得学分'],
  date: ['hdrq', 'kssj', 'rq', 'date', 'activityDate', 'startTime', '活动日期', '日期', '时间', '参与时间'],
  semester: ['xnxqdm', 'xq', 'semester', 'semesterCode', '学年学期', '学期'],
  organizer: ['zbdw', 'dwmc', 'organizer', '主办单位', '组织单位', '学院'],
  status: ['shzt', 'zt', 'status', '审核状态', '状态'],
} as const;

function pickSc(rec: RawRec, field: keyof typeof SC_ALIASES): string | null {
  const keys = Object.keys(rec);
  for (const alias of SC_ALIASES[field]) {
    const hit = keys.find((k) => k.toLowerCase() === alias.toLowerCase());
    if (hit !== undefined) {
      const val = clean(rec[hit]);
      if (val !== null) return val;
    }
  }
  return null;
}

function collectScJson(node: unknown, out: RawRec[], depth = 0) {
  if (depth > 6 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectScJson(item, out, depth + 1);
    return;
  }
  const rec = node as RawRec;
  if (pickSc(rec, 'title') && (pickSc(rec, 'hours') || pickSc(rec, 'credits') || pickSc(rec, 'date'))) {
    out.push(rec);
    return;
  }
  for (const v of Object.values(rec)) collectScJson(v, out, depth + 1);
}

function parseScHtml(html: string): RawRec[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rows.length < 2) return [];
  const cellsOf = (r: string) => [...r.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => clean(m[1]) ?? '');
  const headerIdx = rows.findIndex((r) => cellsOf(r[1]!).some((c) => /活动|项目|名称/.test(c)));
  if (headerIdx < 0) return [];
  const headers = cellsOf(rows[headerIdx]![1]!);
  const out: RawRec[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cells = cellsOf(rows[i]![1]!);
    if (cells.length < 2) continue;
    const rec: RawRec = {};
    headers.forEach((h, idx) => {
      if (h && cells[idx] !== undefined) rec[h] = cells[idx];
    });
    if (pickSc(rec, 'title')) out.push(rec);
  }
  return out;
}

function parseScText(text: string): RawRec[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: RawRec[] = [];
  for (const line of lines) {
    if (/^(?:序号|活动名称|项目名称|名称)/.test(line)) continue;
    const cols = line.includes('\t') ? line.split('\t').map((c) => c.trim()) : line.split(/\s{2,}|[,，|]/).map((c) => c.trim());
    if (cols.length < 2) continue;
    const dateCol = cols.find((c) => /20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}/.test(c)) ?? null;
    const hourCol = cols.find((c) => /^\d+(?:\.\d+)?\s*(?:小时|学时|h|H)?$/.test(c) && c !== dateCol) ?? null;
    const titleCol = cols.find((c) => c !== dateCol && c !== hourCol && !/^\d+$/.test(c) && c.length >= 2);
    if (!titleCol || !hourCol) continue;
    const catCol = cols.find((c) => c !== titleCol && c !== dateCol && c !== hourCol && /思想|志愿|公益|创新|创业|文体|实践|履历/.test(c)) ?? null;
    out.push({
      title: titleCol,
      hours: hourCol,
      date: dateCol,
      category: catCol,
    });
  }
  return out;
}

/** 解析第二课堂导入文本（JSON / HTML / 粘贴表格） */
export function parseSecondClassImport(
  raw: string,
  opts?: { fallbackDate?: string; fallbackSemesterCode?: string },
): SecondClassSyncItem[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const fallbackDate = opts?.fallbackDate ?? today();
  let rawRecords: RawRec[] = [];

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      collectScJson(JSON.parse(trimmed) as unknown, rawRecords);
    } catch {
      return [];
    }
  } else if (/<tr\b/i.test(trimmed)) {
    rawRecords = parseScHtml(trimmed);
  } else {
    rawRecords = parseScText(trimmed);
  }

  const dedup = new Map<string, SecondClassSyncItem>();
  for (const rec of rawRecords) {
    const title = pickSc(rec, 'title')?.slice(0, 100);
    if (!title) continue;
    const hoursRaw = parseNumber(pickSc(rec, 'hours'));
    const creditsRaw = parseNumber(pickSc(rec, 'credits')) ?? 0;
    const hours = hoursRaw !== null ? round1(Math.min(200, Math.max(0, hoursRaw))) : round1(Math.min(200, creditsRaw * 4));
    if (hours <= 0 && creditsRaw <= 0) continue;

    const activityDate = normalizeDate(pickSc(rec, 'date'), fallbackDate);
    const semRaw = pickSc(rec, 'semester');
    const semesterCode = semRaw
      ? normalizeSemesterCode(semRaw)
      : opts?.fallbackSemesterCode
        ? normalizeSemesterCode(opts.fallbackSemesterCode)
        : inferSemesterCodeFromDate(activityDate);
    const academicYear = academicYearOfSemester(semesterCode);
    const category = classifySecondClassCategory(pickSc(rec, 'category'), title);
    const statusRaw = pickSc(rec, 'status') ?? '';
    const status: SecondClassStatus = /待审|审核中|未审|pending/i.test(statusRaw) ? 'pending' : 'approved';
    const organizer = pickSc(rec, 'organizer')?.slice(0, 60) ?? null;

    const importKey = `${semesterCode}|${activityDate}|${title.toLowerCase()}`.slice(0, 120);
    dedup.set(importKey, {
      academicYear,
      semesterCode,
      title,
      category,
      hours,
      credits: round2(Math.min(20, Math.max(0, creditsRaw))),
      activityDate,
      organizer,
      status,
      note: null,
      importKey,
    });
  }

  return [...dedup.values()];
}
