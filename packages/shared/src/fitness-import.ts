/**
 * 广工体测成绩多格式智能解析与差异比对。
 *
 * 兼容四大常见复制/导出源：
 * 1. 体测系统（tzcs.gdut.edu.cn）或个人备份导出的 JSON 对象/数组；
 * 2. 体测网页 HTML `<table>` 表格；
 * 3. 从体测网页或 Excel 直接复制的 Tab 分隔表格（TSV，支持一次导入多学年）；
 * 4. 从「广东工业大学体育学院」微信公众号成绩页长按复制的键值对文本。
 *
 * 不依赖 zod，不拖慢首屏体积。
 */
import {
  defaultAcademicYear,
  parseRunTime,
  type FitnessGender,
  type FitnessGradeYear,
  type FitnessRecord,
} from './fitness.js';

export interface ImportedFitnessRecord {
  academicYear: string;
  gradeYear: FitnessGradeYear;
  gender: FitnessGender;
  heightCm: number | null;
  weightKg: number | null;
  lungCapacityMl: number | null;
  sprint50mSec: number | null;
  sitAndReachCm: number | null;
  standingLongJumpCm: number | null;
  strengthCount: number | null;
  enduranceSec: number | null;
  exempt: boolean;
  officialTotal: number | null;
  testedAt: string | null;
  note: string | null;
}

export interface FitnessImportParseResult {
  records: ImportedFitnessRecord[];
  warnings: string[];
}

export interface FitnessImportDefaults {
  gender?: FitnessGender;
  academicYear?: string;
  gradeYear?: FitnessGradeYear;
}

export interface FitnessImportDiff {
  added: ImportedFitnessRecord[];
  changed: { before: FitnessRecord; after: ImportedFitnessRecord }[];
  unchanged: number;
}

const FIELD_ALIASES = {
  academicYear: ['academicYear', 'academic_year', 'xn', 'xnmc', 'year', 'testYear', '学年', '测试学年', '年度'],
  gradeYear: ['gradeYear', 'grade_year', 'grade', 'nj', 'njmc', '年级', '测试年级'],
  gender: ['gender', 'sex', 'xb', 'xbmc', '性别'],
  heightCm: ['heightCm', 'height_cm', 'height', 'sg', '身高'],
  weightKg: ['weightKg', 'weight_kg', 'weight', 'tz', '体重'],
  lungCapacityMl: ['lungCapacityMl', 'lung_capacity_ml', 'lungCapacity', 'fhl', '肺活量'],
  sprint50mSec: ['sprint50mSec', 'sprint_50m_sec', 'sprint50m', 'wsm', 'run50', '50米跑', '50米', '五十米跑', '五十米'],
  sitAndReachCm: ['sitAndReachCm', 'sit_and_reach_cm', 'sitAndReach', 'zwtqq', '坐位体前屈', '体前屈'],
  standingLongJumpCm: ['standingLongJumpCm', 'standing_long_jump_cm', 'standingLongJump', 'ldty', '立定跳远', '跳远'],
  strengthCount: [
    'strengthCount',
    'strength_count',
    'pullUp',
    'pullUps',
    'ytxs',
    'sitUp',
    'sitUps',
    'ywqz',
    '引体向上',
    '一分钟仰卧起坐',
    '1分钟仰卧起坐',
    '仰卧起坐',
    '引体/仰卧',
  ],
  enduranceSec: [
    'enduranceSec',
    'endurance_sec',
    'run1000',
    'run800',
    'yqm',
    'bbm',
    '1000米跑',
    '1000米',
    '一千米',
    '800米跑',
    '800米',
    '八百米',
    '长跑',
    '1000米/800米',
  ],
  exempt: ['exempt', 'isExempt', 'mc', '免测', '是否免测', '免予执行'],
  officialTotal: ['officialTotal', 'official_total', 'totalScore', 'total', 'zf', '总分', '学年总分', '总成绩', '标准分'],
  testedAt: ['testedAt', 'tested_at', 'testDate', 'csrq', '测试日期', '体测日期'],
  note: ['note', 'remark', 'bz', '备注'],
} as const;

type Field = keyof typeof FIELD_ALIASES;
type RawRecord = Record<string, unknown>;

const cleanText = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  return s && s !== 'null' && s !== 'undefined' && s !== '-' && s !== '--' && s !== '无' ? s : null;
};

const normHeader = (s: string) =>
  s
    .normalize('NFKC')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();

function pickRaw(rec: RawRecord, field: Field): { key: string; value: string } | null {
  const keys = Object.keys(rec);
  for (const alias of FIELD_ALIASES[field]) {
    const target = normHeader(alias);
    const hit = keys.find((k) => {
      const nk = normHeader(k);
      if (nk === target) return true;
      // 允许「身高cm」「50米跑成绩」「引体向上成绩」等常见后缀，但跳过「得分 / 等级」列
      if (/(得分|分数|等级|评定|score|level)$/.test(nk) && field !== 'officialTotal') return false;
      return target.length >= 2 && nk.startsWith(target);
    });
    if (hit !== undefined) {
      const value = cleanText(rec[hit]);
      if (value !== null) return { key: hit, value };
    }
  }
  return null;
}

function parseNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /-?\d+(?:\.\d+)?/.exec(raw.replace(/,/g, ''));
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function normalizeAcademicYear(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const range = /(\d{4})\s*[-–—~～/]\s*(\d{2,4})/.exec(raw);
  if (range) {
    const start = Number(range[1]);
    const endRaw = range[2]!;
    const end = endRaw.length === 2 ? Math.floor(start / 100) * 100 + Number(endRaw) : Number(endRaw);
    if (start >= 2015 && start <= 2040 && end === start + 1) return `${start}-${end}`;
  }
  const single = /\b(20\d{2})\b/.exec(raw);
  if (single) {
    const start = Number(single[1]);
    if (start >= 2015 && start <= 2040) return `${start}-${start + 1}`;
  }
  return null;
}

function normalizeGradeYear(raw: string | null | undefined): FitnessGradeYear | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/大一|一年级|大学一|^1$/.test(s)) return 1;
  if (/大二|二年级|大学二|^2$/.test(s)) return 2;
  if (/大三|三年级|大学三|^3$/.test(s)) return 3;
  if (/大四|四年级|大学四|^4$/.test(s)) return 4;
  return null;
}

function normalizeGender(raw: string | null | undefined): FitnessGender | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'male' || s === 'm' || s === '1' || s.includes('男')) return 'male';
  if (s === 'female' || s === 'f' || s === '2' || s.includes('女')) return 'female';
  return null;
}

function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/.exec(raw);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function inferGenderFromKeys(rec: RawRecord): FitnessGender | null {
  const joinedKeys = Object.keys(rec).join(' ');
  if (/引体|1000|一千米|pullup|ytxs|yqm/i.test(joinedKeys)) return 'male';
  if (/仰卧起坐|800|八百米|situp|ywqz|bbm/i.test(joinedKeys)) return 'female';
  return null;
}

function normalizeHeight(val: number | null): number | null {
  if (val === null) return null;
  // 兼容按米录入的身高（如 1.75 → 175）
  const cm = val >= 1.0 && val <= 2.5 ? Math.round(val * 1000) / 10 : Math.round(val * 10) / 10;
  return cm >= 100 && cm <= 250 ? cm : null;
}

function normalizeLongJump(val: number | null): number | null {
  if (val === null) return null;
  // 兼容按米录入的立定跳远（如 2.35 → 235）
  const cm = val >= 0.8 && val <= 3.8 ? Math.round(val * 100) : Math.round(val);
  return cm >= 50 && cm <= 380 ? cm : null;
}

function hasAnyFitnessField(rec: RawRecord): boolean {
  return (
    pickRaw(rec, 'heightCm') !== null ||
    pickRaw(rec, 'weightKg') !== null ||
    pickRaw(rec, 'lungCapacityMl') !== null ||
    pickRaw(rec, 'sprint50mSec') !== null ||
    pickRaw(rec, 'sitAndReachCm') !== null ||
    pickRaw(rec, 'standingLongJumpCm') !== null ||
    pickRaw(rec, 'strengthCount') !== null ||
    pickRaw(rec, 'enduranceSec') !== null ||
    pickRaw(rec, 'officialTotal') !== null
  );
}

function collectJsonRecords(node: unknown, out: RawRecord[], depth = 0) {
  if (depth > 6 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonRecords(item, out, depth + 1);
    return;
  }
  const rec = node as RawRecord;
  if (hasAnyFitnessField(rec)) {
    out.push(rec);
    return;
  }
  for (const val of Object.values(rec)) collectJsonRecords(val, out, depth + 1);
}

const FITNESS_HEADER_RE = /身高|体重|肺活量|50米|体前屈|跳远|引体|仰卧|1000米|800米|学年|总分/;

function parseHtmlTableRecords(html: string): RawRecord[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rows.length < 2) return [];
  const cellsOf = (rowHtml: string) =>
    [...rowHtml.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => cleanText(m[1]) ?? '');
  const headerIdx = rows.findIndex((r) => {
    const cells = cellsOf(r[1]!);
    return cells.filter((c) => FITNESS_HEADER_RE.test(c)).length >= 2;
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
    if (hasAnyFitnessField(rec)) out.push(rec);
  }
  return out;
}

function parseTsvRecords(text: string): RawRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headerIdx = lines.findIndex((l) => {
    if (!l.includes('\t')) return false;
    const cells = l.split('\t');
    return cells.filter((c) => FITNESS_HEADER_RE.test(c)).length >= 2;
  });
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
    if (hasAnyFitnessField(rec)) out.push(rec);
  }
  return out;
}

/**
 * 解析公众号成绩页或手机复制的纯文本键值对，例如：
 * ```
 * 2025-2026学年 大二 男
 * 身高：175.2cm
 * 体重：64.5kg
 * 肺活量：4520ml
 * 50米跑：7.2秒
 * 坐位体前屈：16.8cm
 * 立定跳远：242cm
 * 引体向上：14个
 * 1000米跑：3'48"
 * ```
 */
function parseKeyValueText(text: string): RawRecord[] {
  const rec: RawRecord = {};
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 先在全文里捕获学年 / 年级 / 性别上下文
  const yearMatch = /\b(20\d{2}\s*[-–—~～/]\s*20\d{2})\b/.exec(text);
  if (yearMatch) rec['学年'] = yearMatch[1];
  const gradeMatch = /(大[一二三四]|[一二三四]年级)/.exec(text);
  if (gradeMatch) rec['年级'] = gradeMatch[1];
  const genderMatch = /性别\s*[:：\s]\s*([男女])/.exec(text) ?? /(?:^|[\s，,、])([男女])(?:生)?(?:$|[\s，,、])/.exec(lines[0] ?? '');
  if (genderMatch) rec['性别'] = genderMatch[1];
  if (/免测|免予执行/.test(text)) rec['免测'] = '是';

  const kvPatterns: { key: string; re: RegExp }[] = [
    { key: '身高', re: /身高(?:\s*[（(][^）)]*[）)])?\s*[:：\t\s]\s*(-?\d+(?:\.\d+)?)/i },
    { key: '体重', re: /体重(?!(?:指数|bmi))(?:\s*[（(][^）)]*[）)])?\s*[:：\t\s]\s*(-?\d+(?:\.\d+)?)/i },
    { key: '肺活量', re: /肺活量(?:\s*[（(][^）)]*[）)])?\s*[:：\t\s]\s*(\d+(?:\.\d+)?)/i },
    { key: '50米跑', re: /(?:50|五十)\s*米(?:跑)?(?:\s*[（(][^）)]*[）)])?\s*[:：\t\s]\s*(\d+(?:\.\d+)?)/i },
    { key: '坐位体前屈', re: /(?:坐位)?体前屈(?:\s*[（(][^）)]*[）)])?\s*[:：\t\s]\s*(-?\d+(?:\.\d+)?)/i },
    { key: '立定跳远', re: /(?:立定)?跳远(?:\s*[（(][^）)]*[）)])?\s*[:：\t\s]\s*(\d+(?:\.\d+)?)/i },
    { key: '引体向上', re: /引体向上(?:\s*[（(][^）)]*[）)])?\s*[:：\t\s]\s*(\d+)/i },
    { key: '仰卧起坐', re: /(?:1分钟|一分钟)?仰卧起坐(?:\s*[（(][^）)]*[）)])?\s*[:：\t\s]\s*(\d+)/i },
    {
      key: '1000米跑',
      re: /(?:1000|一千)\s*米(?:跑)?(?:\s*[（(][^）)]*[）)])?\s*[:：\t\s]\s*(\d{1,2}\s*(?:['′’:：分]\s*\d{1,2}\s*["″”秒]?|\.\d{2})|\d{2,3}\s*(?:秒|s)?)/i,
    },
    {
      key: '800米跑',
      re: /(?:800|八百)\s*米(?:跑)?(?:\s*[（(][^）)]*[）)])?\s*[:：\t\s]\s*(\d{1,2}\s*(?:['′’:：分]\s*\d{1,2}\s*["″”秒]?|\.\d{2})|\d{2,3}\s*(?:秒|s)?)/i,
    },
    { key: '总分', re: /(?:学年)?(?:总分|总成绩)(?:\s*[（(][^）)]*[）)])?\s*[:：\t\s]\s*(\d+(?:\.\d+)?)/i },
  ];

  for (const { key, re } of kvPatterns) {
    const m = re.exec(text);
    if (m?.[1]) rec[key] = m[1].trim();
  }

  return hasAnyFitnessField(rec) ? [rec] : [];
}

export function parseFitnessImport(raw: string, defaults?: FitnessImportDefaults): FitnessImportParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { records: [], warnings: [] };

  let rawRecords: RawRecord[] = [];
  const warnings: string[] = [];

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      collectJsonRecords(parsed, rawRecords);
    } catch {
      return { records: [], warnings: ['JSON 格式有误，请检查粘贴内容是否完整'] };
    }
  } else if (/<tr\b/i.test(trimmed)) {
    rawRecords = parseHtmlTableRecords(trimmed);
  } else if (trimmed.includes('\t')) {
    rawRecords = parseTsvRecords(trimmed);
    if (rawRecords.length === 0) rawRecords = parseKeyValueText(trimmed);
  } else {
    rawRecords = parseKeyValueText(trimmed);
  }

  if (rawRecords.length === 0) {
    return {
      records: [],
      warnings: ['未识别到体测项目数据：支持粘贴体测系统表格（TSV / HTML）、公众号成绩文本或 JSON'],
    };
  }

  const fallbackYear = defaults?.academicYear ?? defaultAcademicYear();
  const fallbackGender = defaults?.gender ?? 'male';
  const fallbackGrade = defaults?.gradeYear ?? 1;

  const dedup = new Map<string, ImportedFitnessRecord>();

  rawRecords.forEach((rec, idx) => {
    const parsedYear = normalizeAcademicYear(pickRaw(rec, 'academicYear')?.value);
    const academicYear = parsedYear ?? fallbackYear;
    if (!parsedYear && rawRecords.length > 1) {
      warnings.push(`第 ${idx + 1} 条缺少学年字段，已默认归入 ${academicYear} 学年`);
    }

    const gradeYear = normalizeGradeYear(pickRaw(rec, 'gradeYear')?.value) ?? fallbackGrade;
    const gender = normalizeGender(pickRaw(rec, 'gender')?.value) ?? inferGenderFromKeys(rec) ?? fallbackGender;

    const heightCm = normalizeHeight(parseNumber(pickRaw(rec, 'heightCm')?.value));
    const weightRaw = parseNumber(pickRaw(rec, 'weightKg')?.value);
    const weightKg = weightRaw !== null && weightRaw >= 25 && weightRaw <= 200 ? Math.round(weightRaw * 10) / 10 : null;
    const lungRaw = parseNumber(pickRaw(rec, 'lungCapacityMl')?.value);
    const lungCapacityMl = lungRaw !== null && lungRaw >= 500 && lungRaw <= 10000 ? Math.round(lungRaw) : null;
    const sprintRaw = parseNumber(pickRaw(rec, 'sprint50mSec')?.value);
    const sprint50mSec = sprintRaw !== null && sprintRaw >= 5 && sprintRaw <= 25 ? Math.round(sprintRaw * 10) / 10 : null;
    const reachRaw = parseNumber(pickRaw(rec, 'sitAndReachCm')?.value);
    const sitAndReachCm = reachRaw !== null && reachRaw >= -30 && reachRaw <= 50 ? Math.round(reachRaw * 10) / 10 : null;
    const standingLongJumpCm = normalizeLongJump(parseNumber(pickRaw(rec, 'standingLongJumpCm')?.value));
    const strengthRaw = parseNumber(pickRaw(rec, 'strengthCount')?.value);
    const strengthCount = strengthRaw !== null && strengthRaw >= 0 && strengthRaw <= 150 ? Math.round(strengthRaw) : null;
    const enduranceSec = parseRunTime(pickRaw(rec, 'enduranceSec')?.value);
    const exemptVal = pickRaw(rec, 'exempt')?.value;
    const exempt = exemptVal ? /^(true|1|是|免测|免予执行|yes)$/i.test(exemptVal) : false;
    const officialRaw = parseNumber(pickRaw(rec, 'officialTotal')?.value);
    const officialTotal = officialRaw !== null && officialRaw >= 0 && officialRaw <= 120 ? Math.round(officialRaw * 10) / 10 : null;
    const testedAt = normalizeDate(pickRaw(rec, 'testedAt')?.value);
    const note = pickRaw(rec, 'note')?.value?.slice(0, 120) ?? null;

    dedup.set(academicYear, {
      academicYear,
      gradeYear,
      gender,
      heightCm,
      weightKg,
      lungCapacityMl,
      sprint50mSec,
      sitAndReachCm,
      standingLongJumpCm,
      strengthCount,
      enduranceSec,
      exempt,
      officialTotal,
      testedAt,
      note,
    });
  });

  const records = [...dedup.values()].sort((a, b) => b.academicYear.localeCompare(a.academicYear));
  return { records, warnings };
}

function sameFitnessContent(a: FitnessRecord, b: ImportedFitnessRecord): boolean {
  return (
    a.gradeYear === b.gradeYear &&
    a.gender === b.gender &&
    a.heightCm === b.heightCm &&
    a.weightKg === b.weightKg &&
    a.lungCapacityMl === b.lungCapacityMl &&
    a.sprint50mSec === b.sprint50mSec &&
    a.sitAndReachCm === b.sitAndReachCm &&
    a.standingLongJumpCm === b.standingLongJumpCm &&
    a.strengthCount === b.strengthCount &&
    a.enduranceSec === b.enduranceSec &&
    a.exempt === b.exempt &&
    a.officialTotal === b.officialTotal &&
    a.testedAt === b.testedAt &&
    a.note === b.note
  );
}

export function diffFitnessImport(existing: FitnessRecord[], incoming: ImportedFitnessRecord[]): FitnessImportDiff {
  const byYear = new Map(existing.map((r) => [r.academicYear, r]));
  const added: ImportedFitnessRecord[] = [];
  const changed: { before: FitnessRecord; after: ImportedFitnessRecord }[] = [];
  let unchanged = 0;

  for (const item of incoming) {
    const prev = byYear.get(item.academicYear);
    if (!prev) {
      added.push(item);
    } else if (sameFitnessContent(prev, item)) {
      unchanged++;
    } else {
      changed.push({ before: prev, after: item });
    }
  }

  return { added, changed, unchanged };
}
