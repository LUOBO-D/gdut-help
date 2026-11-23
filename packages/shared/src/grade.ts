/**
 * 广东工业大学本科生课程成绩与 5.0 制绩点（GPA）计算引擎。
 *
 * 严格遵循《广东工业大学本科学生学籍管理规定》：
 * - 百分制成绩 >= 60：课程绩点 = (成绩 - 50) / 10（精确到 0.1，满分 5.0）
 * - 百分制成绩 < 60：课程绩点 = 0（学分仍计入平均学分绩点分母）
 * - 五级制：优秀 4.5（95）、良好 3.5（85）、中等 2.5（75）、及格/合格/通过 1.5（65）、不及格/缺考 0
 * - 平均学分绩点 GPA = Σ(课程学分 × 课程绩点) / Σ(课程学分)
 * - 学士学位授予底线：累计平均学分绩点 >= 1.6
 *
 * 不依赖 zod，保持前后端零负担共享。
 */

export type GradeSource = 'manual' | 'import';

export interface CourseGrade {
  id: string;
  /** 学期代码，例如 '202501'（2025-2026 秋季）或 '202502'（2025-2026 春季） */
  semesterCode: string;
  /** 可读学期名，例如 '2025-2026 秋季' */
  semesterName: string;
  /** 课程编号（可选） */
  courseCode: string | null;
  /** 课程名称 */
  courseName: string;
  /** 学分（如 3.5） */
  credits: number;
  /** 原始成绩文本（如 '88'、'优秀'、'通过'） */
  scoreText: string;
  /** 折算百分制分数（用于计算加权平均分；无数值映射时为 null） */
  scoreNum: number | null;
  /** 课程绩点（0.0–5.0） */
  gradePoint: number;
  /** 课程性质/分类（如 '必修'、'选修'、'公共选修'、'通识'） */
  courseType: string | null;
  /** 考试性质（如 '正常考试'、'补考'、'重修'） */
  examType: string | null;
  source: GradeSource;
  importKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GradeData {
  grades: CourseGrade[];
  /** 最近一次同步或更新时间（ISO 字符串） */
  syncedAt: string | null;
}

export interface SemesterGpaSummary {
  semesterCode: string;
  semesterName: string;
  gpa: number;
  weightedAvg: number | null;
  totalCredits: number;
  earnedCredits: number;
  courseCount: number;
  failedCount: number;
  grades: CourseGrade[];
}

export interface GpaSummary {
  /** 平均学分绩点（5.0 制，保留 2 位小数） */
  gpa: number;
  /** 加权平均分（保留 1 位小数，无可计算数值成绩时为 null） */
  weightedAvg: number | null;
  /** 参与计算的总学分（分母） */
  totalCredits: number;
  /** 已获得的及格学分 */
  earnedCredits: number;
  /** 课程门数 */
  courseCount: number;
  /** 不及格门数 */
  failedCount: number;
  /** 是否满足广工 1.6 学位授予底线 */
  meetsDegreeLine: boolean;
  /** 按学期倒序分组统计 */
  semesters: SemesterGpaSummary[];
}

export interface ScoreConversion {
  scoreNum: number | null;
  gradePoint: number;
  passed: boolean;
}

const FIVE_LEVEL_MAP: { re: RegExp; scoreNum: number; gradePoint: number; passed: boolean }[] = [
  { re: /^(?:优秀|优|a\+?)$/i, scoreNum: 95, gradePoint: 4.5, passed: true },
  { re: /^(?:良好|良|b\+?)$/i, scoreNum: 85, gradePoint: 3.5, passed: true },
  { re: /^(?:中等|中|c\+?)$/i, scoreNum: 75, gradePoint: 2.5, passed: true },
  { re: /^(?:及格|合格|通过|p|pass|d)$/i, scoreNum: 65, gradePoint: 1.5, passed: true },
  { re: /^(?:不及格|不合格|未通过|不通过|缺考|作弊|违纪|取消资格|f|fail|旷考)$/i, scoreNum: 0, gradePoint: 0, passed: false },
];

/** 按广工 5.0 绩点规则将成绩文本（百分制或五级制）转换为数值分与绩点 */
export function convertGdutScore(scoreText: string, explicitGp?: number | null): ScoreConversion {
  const clean = scoreText.trim();
  const numMatch = /^-?\d+(?:\.\d+)?$/.exec(clean);
  if (numMatch) {
    const raw = Number(numMatch[0]);
    const clamped = Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
    const passed = clamped >= 60;
    const computedGp = passed ? Math.min(5, Math.max(1, Math.round(((clamped - 50) / 10) * 100) / 100)) : 0;
    const gp =
      explicitGp != null && Number.isFinite(explicitGp) && explicitGp >= 0 && explicitGp <= 5
        ? Math.round(explicitGp * 100) / 100
        : computedGp;
    return { scoreNum: clamped, gradePoint: gp, passed };
  }

  for (const item of FIVE_LEVEL_MAP) {
    if (item.re.test(clean)) {
      const gp =
        explicitGp != null && Number.isFinite(explicitGp) && explicitGp >= 0 && explicitGp <= 5
          ? Math.round(explicitGp * 100) / 100
          : item.gradePoint;
      return { scoreNum: item.scoreNum, gradePoint: gp, passed: item.passed };
    }
  }

  const fallbackGp =
    explicitGp != null && Number.isFinite(explicitGp) && explicitGp >= 0 && explicitGp <= 5
      ? Math.round(explicitGp * 100) / 100
      : 0;
  return { scoreNum: null, gradePoint: fallbackGp, passed: fallbackGp > 0 };
}

/** 将广工教务学期代码（如 '202501' / '202502' / '2025-2026-1'）转为易读名称 */
export function formatSemesterName(code: string): string {
  const trimmed = code.trim();
  const m6 = /^(20\d{2})0?([123])$/.exec(trimmed);
  if (m6) {
    const start = Number(m6[1]);
    const term = m6[2] === '1' ? '秋季' : m6[2] === '2' ? '春季' : '夏季';
    return `${start}-${start + 1} ${term}`;
  }
  const mDash = /^(20\d{2})-(20\d{2})[-_ ]*([123])$/.exec(trimmed);
  if (mDash) {
    const term = mDash[3] === '1' ? '秋季' : mDash[3] === '2' ? '春季' : '夏季';
    return `${mDash[1]}-${mDash[2]} ${term}`;
  }
  return trimmed || '未知学期';
}

/** 规范化广工学期代码为 6 位数字（如 '2025-2026-1' → '202501'） */
export function normalizeSemesterCode(raw: string): string {
  const s = raw.trim();
  const m6 = /^(20\d{2})0([123])$/.exec(s);
  if (m6) return `${m6[1]}0${m6[2]}`;
  const m5 = /^(20\d{2})([123])$/.exec(s);
  if (m5) return `${m5[1]}0${m5[2]}`;
  const mDash = /^(20\d{2})\s*[-–—/]\s*20\d{2}\s*(?:[-–—\s]*([123])|.*?(秋|上|第一)|.*?(春|下|第二))/.exec(s);
  if (mDash) {
    const term = mDash[2] ?? (mDash[3] ? '1' : mDash[4] ? '2' : '1');
    return `${mDash[1]}0${term}`;
  }
  return s.slice(0, 20) || 'unknown';
}

export function isRequiredCourseType(courseType: string | null | undefined): boolean {
  if (!courseType) return false;
  return /必修|核心|专业基础|学科基础|公共基础/.test(courseType) && !/选修/.test(courseType);
}

function isPassedGrade(g: Pick<CourseGrade, 'gradePoint' | 'scoreNum' | 'scoreText'>): boolean {
  if (g.gradePoint > 0) return true;
  if (g.scoreNum !== null) return g.scoreNum >= 60;
  return /^(?:优秀|优|良好|良|中等|中|及格|合格|通过)$/i.test(g.scoreText.trim());
}

function aggregateGrades(list: CourseGrade[]): Omit<SemesterGpaSummary, 'semesterCode' | 'semesterName' | 'grades'> {
  let creditSum = 0;
  let gpWeighted = 0;
  let scoreCreditSum = 0;
  let scoreWeighted = 0;
  let earnedCredits = 0;
  let failedCount = 0;

  for (const g of list) {
    const c = Math.max(0, g.credits);
    const passed = isPassedGrade(g);
    if (passed) earnedCredits += c;
    else failedCount++;

    if (c > 0) {
      creditSum += c;
      gpWeighted += c * g.gradePoint;
      if (g.scoreNum !== null) {
        scoreCreditSum += c;
        scoreWeighted += c * g.scoreNum;
      }
    }
  }

  const gpa = creditSum > 0 ? Math.round((gpWeighted / creditSum) * 100) / 100 : 0;
  const weightedAvg = scoreCreditSum > 0 ? Math.round((scoreWeighted / scoreCreditSum) * 10) / 10 : null;

  return {
    gpa,
    weightedAvg,
    totalCredits: Math.round(creditSum * 10) / 10,
    earnedCredits: Math.round(earnedCredits * 10) / 10,
    courseCount: list.length,
    failedCount,
  };
}

export function computeGpaSummary(
  grades: CourseGrade[],
  opts?: { semesterCode?: string | null; requiredOnly?: boolean },
): GpaSummary {
  let filtered = grades;
  if (opts?.requiredOnly) {
    filtered = filtered.filter((g) => isRequiredCourseType(g.courseType));
  }
  if (opts?.semesterCode) {
    filtered = filtered.filter((g) => g.semesterCode === opts.semesterCode);
  }

  const bySem = new Map<string, CourseGrade[]>();
  for (const g of filtered) {
    const arr = bySem.get(g.semesterCode);
    if (arr) arr.push(g);
    else bySem.set(g.semesterCode, [g]);
  }

  const semesters: SemesterGpaSummary[] = [...bySem.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([semesterCode, list]) => {
      const sorted = [...list].sort((a, b) => b.credits - a.credits || a.courseName.localeCompare(b.courseName, 'zh-CN'));
      const stats = aggregateGrades(sorted);
      return {
        semesterCode,
        semesterName: sorted[0]?.semesterName || formatSemesterName(semesterCode),
        ...stats,
        grades: sorted,
      };
    });

  const overall = aggregateGrades(filtered);
  return {
    ...overall,
    meetsDegreeLine: overall.courseCount === 0 ? true : overall.gpa >= 1.6,
    semesters,
  };
}

/** 模拟新增一门目标课程后对当前平均学分绩点的影响 */
export function simulateGpaWithCourse(
  current: Pick<GpaSummary, 'gpa' | 'totalCredits'>,
  addedCredits: number,
  targetScoreText: string,
): { newGpa: number; delta: number; courseGp: number } {
  const conv = convertGdutScore(targetScoreText);
  const c = Math.max(0, addedCredits);
  const nextCredits = current.totalCredits + c;
  if (nextCredits <= 0) {
    return { newGpa: current.gpa, delta: 0, courseGp: conv.gradePoint };
  }
  const newGpa = Math.round(((current.gpa * current.totalCredits + conv.gradePoint * c) / nextCredits) * 100) / 100;
  const delta = Math.round((newGpa - current.gpa) * 100) / 100;
  return { newGpa, delta, courseGp: conv.gradePoint };
}
