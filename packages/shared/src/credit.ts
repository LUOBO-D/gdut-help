/**
 * 广东工业大学本科生学分进度计算与培养方案完成情况解析引擎。
 *
 * 支持：
 * 1. 按广工五大培养模块（通识必修、专业必修、专业选修、通识选修、集中实践）自动归类已修课程成绩；
 * 2. 结合用户自定义（或专业预设/教务培养方案同步）的毕业学分目标计算总体与分项完成进度；
 * 3. 解析广工乘方教务系统「培养方案完成情况 / 学分统计」JSON 或 HTML 表格。
 */
import type { CourseGrade } from './grade.js';

export const CREDIT_BUCKETS = [
  'general_required',
  'major_required',
  'major_elective',
  'general_elective',
  'practice',
] as const;

export type CreditBucketKey = (typeof CREDIT_BUCKETS)[number];

export const CREDIT_BUCKET_LABELS: Record<CreditBucketKey, string> = {
  general_required: '通识必修',
  major_required: '学科与专业必修',
  major_elective: '专业选修',
  general_elective: '通识选修（公选）',
  practice: '集中实践环节',
};

export interface CreditOfficialModule {
  name: string;
  required: number;
  earned: number;
  missing: number;
}

export interface CreditPlan {
  totalTarget: number;
  generalRequiredTarget: number;
  majorRequiredTarget: number;
  majorElectiveTarget: number;
  generalElectiveTarget: number;
  practiceTarget: number;
  majorName: string | null;
  /** 可选：从广工教务「学分完成情况」直接同步的官方模块快照 */
  officialModules: CreditOfficialModule[];
  officialSyncedAt: string | null;
  updatedAt: string | null;
}

export interface CreditPreset {
  id: string;
  label: string;
  description: string;
  targets: Pick<
    CreditPlan,
    | 'totalTarget'
    | 'generalRequiredTarget'
    | 'majorRequiredTarget'
    | 'majorElectiveTarget'
    | 'generalElectiveTarget'
    | 'practiceTarget'
  >;
}

/** 广工常见大类本科毕业学分参考预设（用户可在前端按本专业培养方案一键微调） */
export const GDUT_CREDIT_PRESETS: readonly CreditPreset[] = [
  {
    id: 'engineering',
    label: '工科参考 (160 分)',
    description: '计算机 / 自动化 / 机电 / 信息 / 材料等典型四年制工科',
    targets: {
      totalTarget: 160,
      generalRequiredTarget: 42,
      majorRequiredTarget: 64,
      majorElectiveTarget: 22,
      generalElectiveTarget: 10,
      practiceTarget: 22,
    },
  },
  {
    id: 'business',
    label: '经管文法 (152 分)',
    description: '管理 / 经济 / 法学 / 外语等专业常见学分结构',
    targets: {
      totalTarget: 152,
      generalRequiredTarget: 40,
      majorRequiredTarget: 58,
      majorElectiveTarget: 24,
      generalElectiveTarget: 12,
      practiceTarget: 18,
    },
  },
  {
    id: 'design',
    label: '艺术设计 (156 分)',
    description: '工业设计 / 视觉传达 / 建筑等设计类专业参考',
    targets: {
      totalTarget: 156,
      generalRequiredTarget: 36,
      majorRequiredTarget: 60,
      majorElectiveTarget: 24,
      generalElectiveTarget: 10,
      practiceTarget: 26,
    },
  },
];

export const DEFAULT_CREDIT_PLAN: CreditPlan = {
  ...GDUT_CREDIT_PRESETS[0]!.targets,
  majorName: null,
  officialModules: [],
  officialSyncedAt: null,
  updatedAt: null,
};

export interface CreditBucketProgress {
  key: CreditBucketKey;
  label: string;
  earned: number;
  target: number;
  remaining: number;
  percent: number;
  courseCount: number;
  courses: CourseGrade[];
}

export interface CreditProgressSummary {
  earnedTotal: number;
  targetTotal: number;
  remainingTotal: number;
  percent: number;
  passedCourseCount: number;
  failedCredits: number;
  failedCourses: CourseGrade[];
  buckets: CreditBucketProgress[];
  /** 是否存在从教务同步的官方培养方案模块数据 */
  hasOfficialAudit: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function isPassed(g: Pick<CourseGrade, 'gradePoint' | 'scoreNum' | 'scoreText'>): boolean {
  if (g.gradePoint > 0) return true;
  if (g.scoreNum !== null) return g.scoreNum >= 60;
  return /^(?:优秀|优|良好|良|中等|中|及格|合格|通过)$/i.test(g.scoreText.trim());
}

/** 按广工课程性质与课程名智能归入五大培养模块 */
export function classifyCourseCreditBucket(
  courseType: string | null | undefined,
  courseName: string,
): CreditBucketKey {
  const type = (courseType ?? '').trim();
  const name = courseName.trim();

  if (
    /实践|实习|实训|课程设计|课设|毕业设计|毕业论文|军训|金工|电工电子实习|综合实验/.test(type) ||
    /课程设计|课设|毕业设计|毕业论文|生产实习|认识实习|专业实习|金工实习|军事技能|军训|综合实训/.test(name)
  ) {
    return 'practice';
  }

  if (/通识选修|公共选修|公选|通选|任选|素质拓展|跨学科选修|创新创业选修|美育/.test(type)) {
    return 'general_elective';
  }

  if (/专业选修|限选|方向选修|专业拓展|学科选修|选修/.test(type)) {
    return 'major_elective';
  }

  if (
    /公共必修|通识必修|公共基础|通识教育/.test(type) ||
    /^(?:高等数学|微积分|线性代数|概率论|大学物理|大学英语|体育|思想道德|中国近现代史|马克思主义|毛泽东思想|习近平新时代|形势与政策|军事理论|大学生心理|大学计算机|劳动教育)/.test(
      name,
    )
  ) {
    return 'general_required';
  }

  return 'major_required';
}

export function computeCreditProgress(grades: CourseGrade[], plan: CreditPlan = DEFAULT_CREDIT_PLAN): CreditProgressSummary {
  const bucketMap = new Map<CreditBucketKey, CourseGrade[]>();
  for (const key of CREDIT_BUCKETS) bucketMap.set(key, []);

  // 按课程去重：同一门课补考/重修通过后只计一次有效获得学分，未通过记录归入挂科待补清单
  const bestByCourse = new Map<string, CourseGrade>();
  for (const g of grades) {
    const key = (g.courseCode?.trim() || g.courseName.trim()).toLowerCase();
    const prev = bestByCourse.get(key);
    if (!prev) {
      bestByCourse.set(key, g);
      continue;
    }
    const prevPass = isPassed(prev);
    const curPass = isPassed(g);
    if ((curPass && !prevPass) || (curPass === prevPass && g.gradePoint > prev.gradePoint)) {
      bestByCourse.set(key, g);
    }
  }

  const failedCourses: CourseGrade[] = [];
  let earnedTotal = 0;
  let failedCredits = 0;
  let passedCourseCount = 0;

  for (const g of bestByCourse.values()) {
    const c = Math.max(0, g.credits);
    if (isPassed(g)) {
      earnedTotal += c;
      passedCourseCount += 1;
      const bucket = classifyCourseCreditBucket(g.courseType, g.courseName);
      bucketMap.get(bucket)!.push(g);
    } else {
      failedCredits += c;
      failedCourses.push(g);
    }
  }

  const targetsByBucket: Record<CreditBucketKey, number> = {
    general_required: plan.generalRequiredTarget,
    major_required: plan.majorRequiredTarget,
    major_elective: plan.majorElectiveTarget,
    general_elective: plan.generalElectiveTarget,
    practice: plan.practiceTarget,
  };

  const buckets: CreditBucketProgress[] = CREDIT_BUCKETS.map((key) => {
    const courses = bucketMap
      .get(key)!
      .sort((a, b) => b.semesterCode.localeCompare(a.semesterCode) || b.credits - a.credits);
    const earned = round1(courses.reduce((s, c) => s + Math.max(0, c.credits), 0));
    const target = round1(Math.max(0, targetsByBucket[key]));
    const remaining = round1(Math.max(0, target - earned));
    const percent = target > 0 ? Math.min(100, Math.round((earned / target) * 100)) : earned > 0 ? 100 : 0;
    return {
      key,
      label: CREDIT_BUCKET_LABELS[key],
      earned,
      target,
      remaining,
      percent,
      courseCount: courses.length,
      courses,
    };
  });

  earnedTotal = round1(earnedTotal);
  const targetTotal = round1(Math.max(1, plan.totalTarget));
  const remainingTotal = round1(Math.max(0, targetTotal - earnedTotal));
  const percent = Math.min(100, Math.round((earnedTotal / targetTotal) * 100));

  return {
    earnedTotal,
    targetTotal,
    remainingTotal,
    percent,
    passedCourseCount,
    failedCredits: round1(failedCredits),
    failedCourses: failedCourses.sort((a, b) => b.semesterCode.localeCompare(a.semesterCode)),
    buckets,
    hasOfficialAudit: plan.officialModules.length > 0,
  };
}

// ============================================================
// 乘方教务「培养方案完成情况 / 学分统计」解析
// ============================================================

type RawRec = Record<string, unknown>;

const cleanText = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  return s && s !== 'null' && s !== 'undefined' && s !== '-' ? s : null;
};

const toNum = (v: unknown): number | null => {
  const s = cleanText(v);
  if (!s) return null;
  const m = /-?\d+(?:\.\d+)?/.exec(s);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? round1(Math.max(0, n)) : null;
};

const AUDIT_ALIASES = {
  name: ['kcxzmc', 'kclbmc', 'mkflmc', 'fzm', 'kcxz', 'name', 'module', '课程性质', '模块名称', '课程类别', '类别', '要求模块'],
  required: ['yqxf', 'zdxf', 'zxf', 'byxf', 'required', '要求学分', '最低学分', '计划学分', '需修学分', '毕业要求'],
  earned: ['yxxf', 'hdxf', 'yhdxf', 'tgxf', 'earned', '已修学分', '获得学分', '已获得学分', '通过学分'],
  missing: ['qxxf', 'wxxf', 'hcyxf', 'missing', '欠修学分', '尚缺学分', '未修学分', '还差学分'],
} as const;

function pickAudit(rec: RawRec, field: keyof typeof AUDIT_ALIASES): string | null {
  const keys = Object.keys(rec);
  for (const alias of AUDIT_ALIASES[field]) {
    const hit = keys.find((k) => k.toLowerCase() === alias.toLowerCase());
    if (hit !== undefined) {
      const val = cleanText(rec[hit]);
      if (val !== null) return val;
    }
  }
  return null;
}

function collectAuditJson(node: unknown, out: RawRec[], depth = 0) {
  if (depth > 6 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectAuditJson(item, out, depth + 1);
    return;
  }
  const rec = node as RawRec;
  if (pickAudit(rec, 'name') && (pickAudit(rec, 'required') || pickAudit(rec, 'earned'))) {
    out.push(rec);
    return;
  }
  for (const v of Object.values(rec)) collectAuditJson(v, out, depth + 1);
}

function parseAuditHtml(html: string): RawRec[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rows.length < 2) return [];
  const cellsOf = (r: string) => [...r.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => cleanText(m[1]) ?? '');
  const headerIdx = rows.findIndex((r) => {
    const cs = cellsOf(r[1]!);
    return cs.some((c) => /要求学分|计划学分|最低学分/.test(c)) && cs.some((c) => /已修|获得|通过/.test(c));
  });
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
    if (pickAudit(rec, 'name')) out.push(rec);
  }
  return out;
}

/** 解析广工教务培养方案学分完成情况（JSON / HTML） */
export function parseCreditAudit(raw: string): CreditOfficialModule[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  let records: RawRec[] = [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      collectAuditJson(JSON.parse(trimmed) as unknown, records);
    } catch {
      return [];
    }
  } else if (/<tr\b/i.test(trimmed)) {
    records = parseAuditHtml(trimmed);
  }

  const dedup = new Map<string, CreditOfficialModule>();
  for (const rec of records) {
    const name = pickAudit(rec, 'name');
    if (!name) continue;
    const required = toNum(pickAudit(rec, 'required')) ?? 0;
    const earned = toNum(pickAudit(rec, 'earned')) ?? 0;
    if (required === 0 && earned === 0) continue;
    const explicitMissing = toNum(pickAudit(rec, 'missing'));
    const missing = explicitMissing !== null ? explicitMissing : round1(Math.max(0, required - earned));
    dedup.set(name, { name, required, earned, missing });
  }
  return [...dedup.values()];
}
