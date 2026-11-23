/**
 * 广东工业大学教务系统（jxfw.gdut.edu.cn，乘方教务）课程成绩解析与差异比对。
 *
 * 兼容：
 * 1. 乘方教务 /xskccjxx!getDataList.action 返回的 `{ total, rows: [...] }` JSON；
 * 2. 通用 JSON 数组 / 个人备份；
 * 3. 从教务成绩网页直接复制的 HTML <table> 或 Tab 分隔表格（TSV）。
 *
 * 不依赖 zod，保持轻量。
 */
import {
  convertGdutScore,
  formatSemesterName,
  normalizeSemesterCode,
  type CourseGrade,
} from './grade.js';

export interface ImportedCourseGrade {
  importKey: string;
  semesterCode: string;
  semesterName: string;
  courseCode: string | null;
  courseName: string;
  credits: number;
  scoreText: string;
  scoreNum: number | null;
  gradePoint: number;
  courseType: string | null;
  examType: string | null;
}

export interface GradeImportParseResult {
  grades: ImportedCourseGrade[];
  warnings: string[];
  records: number;
}

export interface GradeSyncDiff {
  added: ImportedCourseGrade[];
  changed: { before: CourseGrade; after: ImportedCourseGrade }[];
  removed: CourseGrade[];
  unchanged: number;
}

const GRADE_FIELD_ALIASES = {
  semesterCode: ['xnxqdm', 'xnxq', 'semesterCode', 'semester_code', 'semester', '学年学期', '开课学期', '学期'],
  courseCode: ['kcdm', 'kcbh', 'courseCode', 'course_code', '课程编号', '课程代码'],
  courseName: ['kcmc', 'courseName', 'course_name', 'name', '课程名称', '课程名'],
  credits: ['xf', 'credit', 'credits', '学分'],
  scoreText: ['zcj', 'cj', 'kccj', 'score', 'scoreText', '总成绩', '成绩', '最终成绩'],
  gradePoint: ['cjjd', 'jd', 'gp', 'gpa', 'gradePoint', 'grade_point', '成绩绩点', '绩点'],
  courseType: ['kcdlmc', 'kcflmc', 'kcxzmc', 'kcxz', 'courseType', 'course_type', '课程大类', '课程分类', '课程性质'],
  examType: ['cjfsmc', 'ksxzmc', 'ksxz', 'xdfsmc', 'examType', 'exam_type', '成绩方式', '考试性质', '修读方式'],
} as const;

type Field = keyof typeof GRADE_FIELD_ALIASES;
type RawRecord = Record<string, unknown>;

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  return s && s !== 'null' && s !== 'undefined' && s !== '-' && s !== '--' ? s : null;
};

const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();

function pick(rec: RawRecord, field: Field): string | null {
  const keys = Object.keys(rec);
  for (const alias of GRADE_FIELD_ALIASES[field]) {
    const target = norm(alias);
    const hit = keys.find((k) => norm(k) === target);
    if (hit !== undefined) {
      const val = clean(rec[hit]);
      if (val !== null) return val;
    }
  }
  return null;
}

export function gradeImportKeyOf(
  semesterCode: string,
  courseCode: string | null,
  courseName: string,
  examType: string | null,
): string {
  const coursePart = courseCode ? `code:${norm(courseCode)}` : `name:${norm(courseName)}`;
  const examPart = examType && !/正常/.test(examType) ? `|${norm(examType)}` : '';
  return `${normalizeSemesterCode(semesterCode)}|${coursePart}${examPart}`.slice(0, 120);
}

function collectJsonRecords(node: unknown, out: RawRecord[], depth = 0) {
  if (depth > 6 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonRecords(item, out, depth + 1);
    return;
  }
  const rec = node as RawRecord;
  if (pick(rec, 'courseName') !== null && (pick(rec, 'scoreText') !== null || pick(rec, 'gradePoint') !== null)) {
    out.push(rec);
    return;
  }
  for (const value of Object.values(rec)) collectJsonRecords(value, out, depth + 1);
}

function parseHtmlTableRecords(html: string): RawRecord[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rows.length < 2) return [];
  const cellsOf = (rowHtml: string) =>
    [...rowHtml.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => clean(m[1]) ?? '');
  const headerIdx = rows.findIndex((r) => {
    const cells = cellsOf(r[1]!);
    return cells.some((c) => /课程名称|课程名/.test(c)) && cells.some((c) => /成绩|绩点|学分/.test(c));
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

function parseTsvRecords(text: string): RawRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headerIdx = lines.findIndex((l) => l.includes('\t') && /课程名称|课程名/.test(l) && /成绩|绩点|学分/.test(l));
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

export function parseGradeImport(raw: string): GradeImportParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { grades: [], warnings: [], records: 0 };

  let rawRecords: RawRecord[] = [];
  const warnings: string[] = [];

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      collectJsonRecords(parsed, rawRecords);
    } catch {
      return { grades: [], warnings: ['JSON 格式有误，请检查复制内容是否完整'], records: 0 };
    }
  } else if (/<tr\b/i.test(trimmed)) {
    rawRecords = parseHtmlTableRecords(trimmed);
  } else if (trimmed.includes('\t')) {
    rawRecords = parseTsvRecords(trimmed);
  } else {
    return { grades: [], warnings: ['无法识别格式：支持教务系统 JSON 或直接复制成绩表格'], records: 0 };
  }

  const dedup = new Map<string, ImportedCourseGrade>();

  for (const rec of rawRecords) {
    const courseName = pick(rec, 'courseName');
    const scoreText = pick(rec, 'scoreText');
    if (!courseName || !scoreText) continue;

    const rawSem = pick(rec, 'semesterCode') ?? 'unknown';
    const semesterCode = normalizeSemesterCode(rawSem);
    const semesterName = formatSemesterName(semesterCode);

    const creditsRaw = pick(rec, 'credits');
    const creditsParsed = creditsRaw ? Number(creditsRaw.replace(/[^\d.]/g, '')) : 0;
    const credits = Number.isFinite(creditsParsed) && creditsParsed >= 0 && creditsParsed <= 30
      ? Math.round(creditsParsed * 10) / 10
      : 0;

    const gpRaw = pick(rec, 'gradePoint');
    const explicitGp = gpRaw ? Number(gpRaw.replace(/[^\d.]/g, '')) : null;
    const conv = convertGdutScore(scoreText, Number.isFinite(explicitGp) ? explicitGp : null);

    const courseCode = pick(rec, 'courseCode')?.slice(0, 40) ?? null;
    const courseType = pick(rec, 'courseType')?.slice(0, 40) ?? null;
    const examType = pick(rec, 'examType')?.slice(0, 30) ?? null;
    const importKey = gradeImportKeyOf(semesterCode, courseCode, courseName, examType);

    dedup.set(importKey, {
      importKey,
      semesterCode,
      semesterName,
      courseCode,
      courseName: courseName.slice(0, 80),
      credits,
      scoreText: scoreText.slice(0, 20),
      scoreNum: conv.scoreNum,
      gradePoint: conv.gradePoint,
      courseType,
      examType,
    });
  }

  const grades = [...dedup.values()].sort(
    (a, b) => b.semesterCode.localeCompare(a.semesterCode) || b.credits - a.credits || a.courseName.localeCompare(b.courseName, 'zh-CN'),
  );

  return { grades, warnings, records: rawRecords.length };
}

function sameGradeContent(a: CourseGrade, b: ImportedCourseGrade): boolean {
  return (
    a.semesterCode === b.semesterCode &&
    a.semesterName === b.semesterName &&
    a.courseCode === b.courseCode &&
    a.courseName === b.courseName &&
    a.credits === b.credits &&
    a.scoreText === b.scoreText &&
    a.scoreNum === b.scoreNum &&
    a.gradePoint === b.gradePoint &&
    a.courseType === b.courseType &&
    a.examType === b.examType
  );
}

export function diffGradeSync(existing: CourseGrade[], incoming: ImportedCourseGrade[]): GradeSyncDiff {
  const importedByKey = new Map(
    existing.filter((g) => g.source === 'import' && g.importKey).map((g) => [g.importKey!, g]),
  );
  const incomingKeys = new Set<string>();
  const added: ImportedCourseGrade[] = [];
  const changed: { before: CourseGrade; after: ImportedCourseGrade }[] = [];
  let unchanged = 0;

  for (const item of incoming) {
    incomingKeys.add(item.importKey);
    const prev = importedByKey.get(item.importKey);
    if (!prev) {
      added.push(item);
    } else if (sameGradeContent(prev, item)) {
      unchanged++;
    } else {
      changed.push({ before: prev, after: item });
    }
  }

  const removed = existing.filter(
    (g) => g.source === 'import' && g.importKey && !incomingKeys.has(g.importKey),
  );

  return { added, changed, removed, unchanged };
}
