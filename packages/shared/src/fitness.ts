/**
 * 广东工业大学体测成绩模型与《国家学生体质健康标准（2014年修订）》大学组自动评分引擎。
 *
 * 严格遵循教育部教体艺〔2014〕5号大学组（大一/大二组、大三/大四组）标准：
 * - 单项权重：BMI 15%、肺活量 15%、50米跑 20%、坐位体前屈 10%、立定跳远 10%、引体向上/仰卧起坐 10%、1000米/800米跑 20%
 * - 附加分（最高 +20）：男引体向上/1000米跑、女仰卧起坐/800米跑超出 100 分基准时各最高加 10 分
 * - 毕业总评公式：大四学年总分 × 50% + 其他学年平均分 × 50%（达到 50.0 分方可毕业）
 *
 * 不依赖 zod，保持前后端零负担共享。
 */

export const FITNESS_GENDERS = ['male', 'female'] as const;
export type FitnessGender = (typeof FITNESS_GENDERS)[number];

export const FITNESS_GENDER_LABELS: Record<FitnessGender, string> = {
  male: '男生',
  female: '女生',
};

export const FITNESS_GRADE_YEARS = [1, 2, 3, 4] as const;
export type FitnessGradeYear = (typeof FITNESS_GRADE_YEARS)[number];

export const FITNESS_GRADE_LABELS: Record<FitnessGradeYear, string> = {
  1: '大一',
  2: '大二',
  3: '大三',
  4: '大四',
};

export type FitnessSource = 'manual' | 'import';

export type FitnessLevel = 'excellent' | 'good' | 'pass' | 'fail' | 'exempt' | 'incomplete';

export const FITNESS_LEVEL_LABELS: Record<FitnessLevel, string> = {
  excellent: '优秀',
  good: '良好',
  pass: '及格',
  fail: '不及格',
  exempt: '免测',
  incomplete: '待完善',
};

export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese';

export const BMI_CATEGORY_LABELS: Record<BmiCategory, string> = {
  underweight: '低体重',
  normal: '正常',
  overweight: '超重',
  obese: '肥胖',
};

export type FitnessItemKey =
  | 'bmi'
  | 'lungCapacity'
  | 'sprint50m'
  | 'sitAndReach'
  | 'standingLongJump'
  | 'strength'
  | 'endurance';

export interface FitnessRecord {
  id: string;
  /** 学年，例如 '2025-2026' */
  academicYear: string;
  /** 年级：1 大一 / 2 大二 / 3 大三 / 4 大四 */
  gradeYear: FitnessGradeYear;
  gender: FitnessGender;
  /** 身高（cm） */
  heightCm: number | null;
  /** 体重（kg） */
  weightKg: number | null;
  /** 肺活量（mL） */
  lungCapacityMl: number | null;
  /** 50米跑（秒） */
  sprint50mSec: number | null;
  /** 坐位体前屈（cm，可为负） */
  sitAndReachCm: number | null;
  /** 立定跳远（cm） */
  standingLongJumpCm: number | null;
  /** 男生引体向上 / 女生1分钟仰卧起坐（次） */
  strengthCount: number | null;
  /** 男生1000米跑 / 女生800米跑（秒，如 3'45" 存为 225） */
  enduranceSec: number | null;
  /** 是否办理免测（按国家标准记 60 分，不参与评优） */
  exempt: boolean;
  /** 体测系统官方总分（可选对照） */
  officialTotal: number | null;
  /** 测试日期 'YYYY-MM-DD' */
  testedAt: string | null;
  note: string | null;
  source: FitnessSource;
  createdAt: string;
  updatedAt: string;
}

export interface FitnessData {
  records: FitnessRecord[];
}

export type FitnessMeasurements = Pick<
  FitnessRecord,
  | 'gradeYear'
  | 'gender'
  | 'heightCm'
  | 'weightKg'
  | 'lungCapacityMl'
  | 'sprint50mSec'
  | 'sitAndReachCm'
  | 'standingLongJumpCm'
  | 'strengthCount'
  | 'enduranceSec'
  | 'exempt'
>;

export interface FitnessItemEvaluation {
  key: FitnessItemKey;
  label: string;
  unit: string;
  /** 权重百分比（15 / 20 / 10） */
  weightPercent: number;
  /** 原始展示值，如 "7.2 秒" / "3'45\"" / "21.4 · 正常"，未录入为 null */
  displayValue: string | null;
  /** 单项标准分（0–100）；未录入为 null */
  score: number | null;
  /** 单项附加分（0–10）；非加分项恒为 0 */
  bonus: number;
  /** 折算到总分的贡献分（score * weight + bonus） */
  weightedScore: number | null;
  level: FitnessLevel;
  /** 距离下一关键档位（及格/良好/优秀/满分）的简明提分建议 */
  nextTargetTip: string | null;
}

export interface FitnessEvaluation {
  bmi: number | null;
  bmiCategory: BmiCategory | null;
  items: FitnessItemEvaluation[];
  /** 已录入项目数（0–7） */
  completedCount: number;
  /** 标准分（满分 100，保留 1 位小数） */
  standardScore: number;
  /** 附加分（满分 20） */
  bonusScore: number;
  /** 学年总分（标准分 + 附加分，满分 120；免测记 60） */
  totalScore: number;
  level: FitnessLevel;
}

export interface GraduationFitnessEstimate {
  /** 已纳入统计的有效学年数 */
  recordCount: number;
  /** 是否已包含大四学年成绩 */
  hasSenior: boolean;
  /** 毕业体测总评（有大四按 大四×50%+其他均分×50%，否则按当前均分估算） */
  score: number | null;
  level: FitnessLevel;
  /** 是否已满足 50 分毕业底线 */
  meetsGraduation: boolean;
  /** 尚未测大四时：为满足 50 分毕业线大四至少需考多少分 */
  neededSeniorFor50: number | null;
  /** 尚未测大四时：为达到 60 分及格线大四至少需考多少分 */
  neededSeniorFor60: number | null;
  /** 尚未测大四时：为达到 80 分良好评优线大四至少需考多少分 */
  neededSeniorFor80: number | null;
  /** 与上一学年相比的总分变化（至少 2 条有效记录时提供） */
  latestDelta: number | null;
}

// ============================================================
// 《国家学生体质健康标准（2014年修订）》大学组官方档位表
// ============================================================

const STANDARD_SCORES = [100, 95, 90, 85, 80, 78, 76, 74, 72, 70, 68, 66, 64, 62, 60, 50, 40, 30, 20, 10] as const;

type Tier = readonly [score: number, threshold: number];

function zipTiers(thresholds: readonly number[]): Tier[] {
  return STANDARD_SCORES.map((score, idx) => [score, thresholds[idx]!] as const);
}

type GradeGroup = 'lower' | 'upper';
const gradeGroupOf = (gradeYear: FitnessGradeYear): GradeGroup => (gradeYear <= 2 ? 'lower' : 'upper');

const LUNG_TIERS: Record<FitnessGender, Record<GradeGroup, Tier[]>> = {
  male: {
    lower: zipTiers([5040, 4920, 4800, 4550, 4300, 4180, 4060, 3940, 3820, 3700, 3580, 3460, 3340, 3220, 3100, 2940, 2780, 2620, 2460, 2300]),
    upper: zipTiers([5140, 5020, 4900, 4650, 4400, 4280, 4160, 4040, 3920, 3800, 3680, 3560, 3440, 3320, 3200, 3030, 2860, 2690, 2520, 2350]),
  },
  female: {
    lower: zipTiers([3400, 3350, 3300, 3150, 3000, 2900, 2800, 2700, 2600, 2500, 2400, 2300, 2200, 2100, 2000, 1960, 1920, 1880, 1840, 1800]),
    upper: zipTiers([3450, 3400, 3350, 3200, 3050, 2950, 2850, 2750, 2650, 2550, 2450, 2350, 2250, 2150, 2050, 2010, 1970, 1930, 1890, 1850]),
  },
};

const SPRINT50_TIERS: Record<FitnessGender, Record<GradeGroup, Tier[]>> = {
  male: {
    lower: zipTiers([6.7, 6.8, 6.9, 7.0, 7.1, 7.3, 7.5, 7.7, 7.9, 8.1, 8.3, 8.5, 8.7, 8.9, 9.1, 9.3, 9.5, 9.7, 9.9, 10.1]),
    upper: zipTiers([6.6, 6.7, 6.8, 6.9, 7.0, 7.2, 7.4, 7.6, 7.8, 8.0, 8.2, 8.4, 8.6, 8.8, 9.0, 9.2, 9.4, 9.6, 9.8, 10.0]),
  },
  female: {
    lower: zipTiers([7.5, 7.6, 7.7, 8.0, 8.3, 8.5, 8.7, 8.9, 9.1, 9.3, 9.5, 9.7, 9.9, 10.1, 10.3, 10.5, 10.7, 10.9, 11.1, 11.3]),
    upper: zipTiers([7.4, 7.5, 7.6, 7.9, 8.2, 8.4, 8.6, 8.8, 9.0, 9.2, 9.4, 9.6, 9.8, 10.0, 10.2, 10.4, 10.6, 10.8, 11.0, 11.2]),
  },
};

const SIT_REACH_TIERS: Record<FitnessGender, Record<GradeGroup, Tier[]>> = {
  male: {
    lower: zipTiers([24.9, 23.1, 21.3, 19.5, 17.7, 16.3, 14.9, 13.5, 12.1, 10.7, 9.3, 7.9, 6.5, 5.1, 3.7, 2.7, 1.7, 0.7, -0.3, -1.3]),
    upper: zipTiers([25.1, 23.3, 21.5, 19.9, 18.2, 16.8, 15.4, 14.0, 12.6, 11.2, 9.8, 8.4, 7.0, 5.6, 4.2, 3.2, 2.2, 1.2, 0.2, -0.8]),
  },
  female: {
    lower: zipTiers([25.8, 24.0, 22.2, 20.6, 19.0, 17.7, 16.4, 15.1, 13.8, 12.5, 11.2, 9.9, 8.6, 7.3, 6.0, 5.2, 4.4, 3.6, 2.8, 2.0]),
    upper: zipTiers([26.3, 24.4, 22.4, 21.0, 19.5, 18.2, 16.9, 15.6, 14.3, 13.0, 11.7, 10.4, 9.1, 7.8, 6.5, 5.7, 4.9, 4.1, 3.3, 2.5]),
  },
};

const LONG_JUMP_TIERS: Record<FitnessGender, Record<GradeGroup, Tier[]>> = {
  male: {
    lower: zipTiers([273, 268, 263, 256, 248, 244, 240, 236, 232, 228, 224, 220, 216, 212, 208, 203, 198, 193, 188, 183]),
    upper: zipTiers([275, 270, 265, 258, 250, 246, 242, 238, 234, 230, 226, 222, 218, 214, 210, 205, 200, 195, 190, 185]),
  },
  female: {
    lower: zipTiers([207, 201, 195, 188, 181, 178, 175, 172, 169, 166, 163, 160, 157, 154, 151, 146, 141, 136, 131, 126]),
    upper: zipTiers([208, 202, 196, 189, 182, 179, 176, 173, 170, 167, 164, 161, 158, 155, 152, 147, 142, 137, 132, 127]),
  },
};

const STRENGTH_TIERS: Record<FitnessGender, Record<GradeGroup, Tier[]>> = {
  male: {
    lower: [
      [100, 19],
      [95, 18],
      [90, 17],
      [85, 16],
      [80, 15],
      [76, 14],
      [72, 13],
      [68, 12],
      [64, 11],
      [60, 10],
      [50, 9],
      [40, 8],
      [30, 7],
      [20, 6],
      [10, 5],
    ],
    upper: [
      [100, 20],
      [95, 19],
      [90, 18],
      [85, 17],
      [80, 16],
      [76, 15],
      [72, 14],
      [68, 13],
      [64, 12],
      [60, 11],
      [50, 10],
      [40, 9],
      [30, 8],
      [20, 7],
      [10, 6],
    ],
  },
  female: {
    lower: zipTiers([56, 54, 52, 49, 46, 44, 42, 40, 38, 36, 34, 32, 30, 28, 26, 24, 22, 20, 18, 16]),
    upper: zipTiers([57, 55, 53, 50, 47, 45, 43, 41, 39, 37, 35, 33, 31, 29, 27, 25, 23, 21, 19, 17]),
  },
};

const ENDURANCE_TIERS: Record<FitnessGender, Record<GradeGroup, Tier[]>> = {
  male: {
    lower: zipTiers([197, 202, 207, 214, 222, 227, 232, 237, 242, 247, 252, 257, 262, 267, 272, 292, 312, 332, 352, 372]),
    upper: zipTiers([195, 200, 205, 212, 220, 225, 230, 235, 240, 245, 250, 255, 260, 265, 270, 290, 310, 330, 350, 370]),
  },
  female: {
    lower: zipTiers([198, 204, 210, 217, 224, 229, 234, 239, 244, 249, 254, 259, 264, 269, 274, 284, 294, 304, 314, 324]),
    upper: zipTiers([196, 202, 208, 215, 222, 227, 232, 237, 242, 247, 252, 257, 262, 267, 272, 282, 292, 302, 312, 322]),
  },
};

/** 附加分超出 100 分基准的阶梯（对应 1..10 分） */
const STRENGTH_BONUS_STEPS: Record<FitnessGender, readonly number[]> = {
  male: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  female: [2, 4, 6, 7, 8, 9, 10, 11, 12, 13],
};

const ENDURANCE_BONUS_STEPS: Record<FitnessGender, readonly number[]> = {
  male: [4, 8, 12, 16, 20, 23, 26, 29, 32, 35],
  female: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
};

// ============================================================
// 工具函数：时间格式、等级判断、单项打分与提分建议
// ============================================================

export function formatRunTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const min = Math.floor(s / 60);
  const rem = s % 60;
  return `${min}'${String(rem).padStart(2, '0')}"`;
}

/**
 * 解析长跑成绩字符串为秒数：
 * 兼容 3'45" / 3'45 / 3:45 / 3：45 / 3分45秒 / 3.45（分.秒，限 2.00–7.59）/ 225 / 225秒
 */
export function parseRunTime(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 90 && raw <= 900 ? Math.round(raw) : null;
  }
  const s = raw.trim().replace(/[′’]/g, "'").replace(/[″”]/g, '"').replace(/：/g, ':');
  if (!s) return null;

  const minSec = /^(\d{1,2})\s*(?:'|:|分)\s*(\d{1,2})(?:\s*(?:"|秒)?)?$/.exec(s);
  if (minSec) {
    const m = Number(minSec[1]);
    const sec = Number(minSec[2]);
    if (m >= 1 && m <= 15 && sec >= 0 && sec < 60) return m * 60 + sec;
    return null;
  }

  const minOnly = /^(\d{1,2})\s*分$/.exec(s);
  if (minOnly) {
    const m = Number(minOnly[1]);
    if (m >= 2 && m <= 15) return m * 60;
    return null;
  }

  const dotMinSec = /^([2-7])\.(\d{2})$/.exec(s);
  if (dotMinSec) {
    const m = Number(dotMinSec[1]);
    const sec = Number(dotMinSec[2]);
    if (sec < 60) return m * 60 + sec;
  }

  const pureSec = /^(\d{2,3})(?:\s*(?:秒|s))?$/i.exec(s);
  if (pureSec) {
    const val = Number(pureSec[1]);
    if (val >= 90 && val <= 900) return val;
  }

  return null;
}

export function scoreToLevel(score: number): FitnessLevel {
  if (score >= 90) return 'excellent';
  if (score >= 80) return 'good';
  if (score >= 60) return 'pass';
  return 'fail';
}

export function defaultAcademicYear(now: Date = new Date()): string {
  const bj = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = bj.getUTCFullYear();
  const month = bj.getUTCMonth() + 1;
  const startYear = month >= 9 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function evaluateBmi(heightCm: number, weightKg: number, gender: FitnessGender): {
  bmi: number;
  category: BmiCategory;
  score: number;
} {
  const h = heightCm / 100;
  const bmi = Math.round((weightKg / (h * h)) * 10) / 10;
  const minNormal = gender === 'male' ? 17.9 : 17.2;
  if (bmi < minNormal) return { bmi, category: 'underweight', score: 80 };
  if (bmi <= 23.9) return { bmi, category: 'normal', score: 100 };
  if (bmi <= 27.9) return { bmi, category: 'overweight', score: 80 };
  return { bmi, category: 'obese', score: 60 };
}

function lookupTierScore(val: number, tiers: Tier[], higherIsBetter: boolean): number {
  for (const [score, threshold] of tiers) {
    if (higherIsBetter ? val >= threshold - 1e-9 : val <= threshold + 1e-9) {
      return score;
    }
  }
  return 0;
}

function lookupBonus(deltaOver100: number, steps: readonly number[]): number {
  if (deltaOver100 <= 0) return 0;
  let bonus = 0;
  for (let i = 0; i < steps.length; i++) {
    if (deltaOver100 >= steps[i]!) bonus = i + 1;
    else break;
  }
  return bonus;
}

function thresholdForScore(tiers: Tier[], targetScore: number): number | null {
  const hit = tiers.find(([s]) => s === targetScore);
  return hit ? hit[1] : null;
}

function buildTargetTip(
  val: number,
  score: number,
  bonus: number,
  tiers: Tier[],
  opts: {
    higherIsBetter: boolean;
    formatDiff: (diff: number) => string;
    hasBonus?: boolean;
    bonusHint?: string;
  },
): string {
  if (score === 100) {
    if (opts.hasBonus) {
      if (bonus >= 10) return '已拿满 100 分 + 10 分附加分';
      return bonus > 0
        ? `已获 +${bonus} 分附加分，${opts.bonusHint ?? '继续突破可冲 +10 分'}`
        : `已满分 100，${opts.bonusHint ?? '继续突破可拿附加分'}`;
    }
    return '已达单项满分 100 分';
  }

  const milestones = [
    { score: 60, label: '及格(60分)' },
    { score: 80, label: '良好(80分)' },
    { score: 90, label: '优秀(90分)' },
    { score: 100, label: '满分(100分)' },
  ];
  const next = milestones.find((m) => m.score > score);
  if (!next) return '已达高分档位';
  const target = thresholdForScore(tiers, next.score);
  if (target === null) return '';

  const diff = opts.higherIsBetter ? target - val : val - target;
  if (diff <= 0) return `已达${next.label}`;
  const verb = opts.higherIsBetter ? '再提' : '再快';
  return `${verb} ${opts.formatDiff(diff)} 即可上${next.label}`;
}

export function evaluateFitnessRecord(record: FitnessMeasurements): FitnessEvaluation {
  const group = gradeGroupOf(record.gradeYear);
  const { gender } = record;
  const round1 = (n: number) => Math.round(n * 10) / 10;

  const items: FitnessItemEvaluation[] = [];

  // 1. BMI (15%)
  let bmiVal: number | null = null;
  let bmiCategory: BmiCategory | null = null;
  if (record.heightCm && record.weightKg && record.heightCm > 0 && record.weightKg > 0) {
    const res = evaluateBmi(record.heightCm, record.weightKg, gender);
    bmiVal = res.bmi;
    bmiCategory = res.category;
    const minNormal = gender === 'male' ? 17.9 : 17.2;
    const tip =
      res.category === 'normal'
        ? `正常范围（${minNormal}–23.9），已满分 100 分`
        : res.category === 'underweight'
          ? `偏瘦（正常 ≥ ${minNormal}），适当增肌可上满分`
          : '控制 BMI 至 23.9 以内可上满分 100 分';
    items.push({
      key: 'bmi',
      label: '体重指数 BMI',
      unit: 'kg/m²',
      weightPercent: 15,
      displayValue: `${res.bmi.toFixed(1)} · ${BMI_CATEGORY_LABELS[res.category]}`,
      score: res.score,
      bonus: 0,
      weightedScore: round1(res.score * 0.15),
      level: scoreToLevel(res.score),
      nextTargetTip: tip,
    });
  } else {
    items.push({
      key: 'bmi',
      label: '体重指数 BMI',
      unit: 'kg/m²',
      weightPercent: 15,
      displayValue: null,
      score: null,
      bonus: 0,
      weightedScore: null,
      level: 'incomplete',
      nextTargetTip: '录入身高与体重后自动计算',
    });
  }

  // 2. 肺活量 (15%)
  const lungTiers = LUNG_TIERS[gender][group];
  if (record.lungCapacityMl != null) {
    const s = lookupTierScore(record.lungCapacityMl, lungTiers, true);
    items.push({
      key: 'lungCapacity',
      label: '肺活量',
      unit: 'mL',
      weightPercent: 15,
      displayValue: `${record.lungCapacityMl} mL`,
      score: s,
      bonus: 0,
      weightedScore: round1(s * 0.15),
      level: scoreToLevel(s),
      nextTargetTip: buildTargetTip(record.lungCapacityMl, s, 0, lungTiers, {
        higherIsBetter: true,
        formatDiff: (d) => `${Math.ceil(d)} mL`,
      }),
    });
  } else {
    items.push({
      key: 'lungCapacity',
      label: '肺活量',
      unit: 'mL',
      weightPercent: 15,
      displayValue: null,
      score: null,
      bonus: 0,
      weightedScore: null,
      level: 'incomplete',
      nextTargetTip: `及格线 ${thresholdForScore(lungTiers, 60)} mL`,
    });
  }

  // 3. 50米跑 (20%)
  const sprintTiers = SPRINT50_TIERS[gender][group];
  if (record.sprint50mSec != null) {
    const s = lookupTierScore(record.sprint50mSec, sprintTiers, false);
    items.push({
      key: 'sprint50m',
      label: '50米跑',
      unit: '秒',
      weightPercent: 20,
      displayValue: `${record.sprint50mSec.toFixed(1)} 秒`,
      score: s,
      bonus: 0,
      weightedScore: round1(s * 0.2),
      level: scoreToLevel(s),
      nextTargetTip: buildTargetTip(record.sprint50mSec, s, 0, sprintTiers, {
        higherIsBetter: false,
        formatDiff: (d) => `${Math.round(d * 10) / 10} 秒`,
      }),
    });
  } else {
    items.push({
      key: 'sprint50m',
      label: '50米跑',
      unit: '秒',
      weightPercent: 20,
      displayValue: null,
      score: null,
      bonus: 0,
      weightedScore: null,
      level: 'incomplete',
      nextTargetTip: `及格线 ${thresholdForScore(sprintTiers, 60)} 秒`,
    });
  }

  // 4. 坐位体前屈 (10%)
  const reachTiers = SIT_REACH_TIERS[gender][group];
  if (record.sitAndReachCm != null) {
    const s = lookupTierScore(record.sitAndReachCm, reachTiers, true);
    items.push({
      key: 'sitAndReach',
      label: '坐位体前屈',
      unit: 'cm',
      weightPercent: 10,
      displayValue: `${record.sitAndReachCm.toFixed(1)} cm`,
      score: s,
      bonus: 0,
      weightedScore: round1(s * 0.1),
      level: scoreToLevel(s),
      nextTargetTip: buildTargetTip(record.sitAndReachCm, s, 0, reachTiers, {
        higherIsBetter: true,
        formatDiff: (d) => `${Math.round(d * 10) / 10} cm`,
      }),
    });
  } else {
    items.push({
      key: 'sitAndReach',
      label: '坐位体前屈',
      unit: 'cm',
      weightPercent: 10,
      displayValue: null,
      score: null,
      bonus: 0,
      weightedScore: null,
      level: 'incomplete',
      nextTargetTip: `及格线 ${thresholdForScore(reachTiers, 60)} cm`,
    });
  }

  // 5. 立定跳远 (10%)
  const jumpTiers = LONG_JUMP_TIERS[gender][group];
  if (record.standingLongJumpCm != null) {
    const s = lookupTierScore(record.standingLongJumpCm, jumpTiers, true);
    items.push({
      key: 'standingLongJump',
      label: '立定跳远',
      unit: 'cm',
      weightPercent: 10,
      displayValue: `${record.standingLongJumpCm} cm`,
      score: s,
      bonus: 0,
      weightedScore: round1(s * 0.1),
      level: scoreToLevel(s),
      nextTargetTip: buildTargetTip(record.standingLongJumpCm, s, 0, jumpTiers, {
        higherIsBetter: true,
        formatDiff: (d) => `${Math.ceil(d)} cm`,
      }),
    });
  } else {
    items.push({
      key: 'standingLongJump',
      label: '立定跳远',
      unit: 'cm',
      weightPercent: 10,
      displayValue: null,
      score: null,
      bonus: 0,
      weightedScore: null,
      level: 'incomplete',
      nextTargetTip: `及格线 ${thresholdForScore(jumpTiers, 60)} cm`,
    });
  }

  // 6. 男引体向上 / 女1分钟仰卧起坐 (10% + 最高 10 附加分)
  const strengthLabel = gender === 'male' ? '引体向上' : '1分钟仰卧起坐';
  const strengthTiers = STRENGTH_TIERS[gender][group];
  if (record.strengthCount != null) {
    const s = lookupTierScore(record.strengthCount, strengthTiers, true);
    const base100 = thresholdForScore(strengthTiers, 100)!;
    const bonus = s === 100 ? lookupBonus(record.strengthCount - base100, STRENGTH_BONUS_STEPS[gender]) : 0;
    items.push({
      key: 'strength',
      label: strengthLabel,
      unit: '次',
      weightPercent: 10,
      displayValue: `${record.strengthCount} 次`,
      score: s,
      bonus,
      weightedScore: round1(s * 0.1 + bonus),
      level: scoreToLevel(s),
      nextTargetTip: buildTargetTip(record.strengthCount, s, bonus, strengthTiers, {
        higherIsBetter: true,
        formatDiff: (d) => `${Math.ceil(d)} 次`,
        hasBonus: true,
        bonusHint: gender === 'male' ? '每多拉 1 个加 1 分（最高 +10）' : '继续加次数可拿附加分（最高 +10）',
      }),
    });
  } else {
    items.push({
      key: 'strength',
      label: strengthLabel,
      unit: '次',
      weightPercent: 10,
      displayValue: null,
      score: null,
      bonus: 0,
      weightedScore: null,
      level: 'incomplete',
      nextTargetTip: `及格线 ${thresholdForScore(strengthTiers, 60)} 次`,
    });
  }

  // 7. 男1000米跑 / 女800米跑 (20% + 最高 10 附加分)
  const enduranceLabel = gender === 'male' ? '1000米跑' : '800米跑';
  const enduranceTiers = ENDURANCE_TIERS[gender][group];
  if (record.enduranceSec != null) {
    const s = lookupTierScore(record.enduranceSec, enduranceTiers, false);
    const base100 = thresholdForScore(enduranceTiers, 100)!;
    const bonus = s === 100 ? lookupBonus(base100 - record.enduranceSec, ENDURANCE_BONUS_STEPS[gender]) : 0;
    items.push({
      key: 'endurance',
      label: enduranceLabel,
      unit: '分秒',
      weightPercent: 20,
      displayValue: formatRunTime(record.enduranceSec),
      score: s,
      bonus,
      weightedScore: round1(s * 0.2 + bonus),
      level: scoreToLevel(s),
      nextTargetTip: buildTargetTip(record.enduranceSec, s, bonus, enduranceTiers, {
        higherIsBetter: false,
        formatDiff: (d) => `${Math.ceil(d)} 秒`,
        hasBonus: true,
        bonusHint: gender === 'male' ? '每快 4 秒起可获附加分（最高 +10）' : '每快 5 秒加 1 分（最高 +10）',
      }),
    });
  } else {
    items.push({
      key: 'endurance',
      label: enduranceLabel,
      unit: '分秒',
      weightPercent: 20,
      displayValue: null,
      score: null,
      bonus: 0,
      weightedScore: null,
      level: 'incomplete',
      nextTargetTip: `及格线 ${formatRunTime(thresholdForScore(enduranceTiers, 60)!)}`,
    });
  }

  const completedCount = items.filter((i) => i.score !== null).length;

  if (record.exempt) {
    return {
      bmi: bmiVal,
      bmiCategory,
      items,
      completedCount,
      standardScore: 60,
      bonusScore: 0,
      totalScore: 60,
      level: 'exempt',
    };
  }

  const rawStandard = items.reduce((sum, item) => sum + (item.score ?? 0) * (item.weightPercent / 100), 0);
  const standardScore = round1(rawStandard);
  const bonusScore = items.reduce((sum, item) => sum + item.bonus, 0);
  const totalScore = round1(standardScore + bonusScore);

  return {
    bmi: bmiVal,
    bmiCategory,
    items,
    completedCount,
    standardScore,
    bonusScore,
    totalScore,
    level: completedCount === 0 ? 'incomplete' : scoreToLevel(totalScore),
  };
}

/**
 * 估算毕业体测总评：
 * - 官方规则：毕业总评 = 大四学年总分 × 50% + 其他学年平均分 × 50%
 * - 毕业门槛：总评 >= 50.0 分方可毕业，>= 80.0 分具备评优资格
 */
export function estimateGraduationFitness(records: FitnessRecord[]): GraduationFitnessEstimate {
  const scored = records
    .map((r) => {
      const ev = evaluateFitnessRecord(r);
      const effective = r.exempt
        ? 60
        : ev.completedCount > 0
          ? ev.totalScore
          : r.officialTotal !== null
            ? r.officialTotal
            : null;
      return { record: r, effective };
    })
    .filter((x): x is { record: FitnessRecord; effective: number } => x.effective !== null);

  if (scored.length === 0) {
    return {
      recordCount: 0,
      hasSenior: false,
      score: null,
      level: 'incomplete',
      meetsGraduation: false,
      neededSeniorFor50: null,
      neededSeniorFor60: null,
      neededSeniorFor80: null,
      latestDelta: null,
    };
  }

  const byYearAsc = [...scored].sort(
    (a, b) => a.record.academicYear.localeCompare(b.record.academicYear) || a.record.gradeYear - b.record.gradeYear,
  );
  const latestDelta =
    byYearAsc.length >= 2
      ? Math.round((byYearAsc[byYearAsc.length - 1]!.effective - byYearAsc[byYearAsc.length - 2]!.effective) * 10) / 10
      : null;

  const senior = byYearAsc.find((x) => x.record.gradeYear === 4);
  const others = byYearAsc.filter((x) => x.record.gradeYear !== 4);

  const round1 = (n: number) => Math.round(n * 10) / 10;

  if (senior) {
    const otherAvg = others.length ? others.reduce((s, x) => s + x.effective, 0) / others.length : senior.effective;
    const finalScore = round1(senior.effective * 0.5 + otherAvg * 0.5);
    return {
      recordCount: scored.length,
      hasSenior: true,
      score: finalScore,
      level: scoreToLevel(finalScore),
      meetsGraduation: finalScore >= 50,
      neededSeniorFor50: null,
      neededSeniorFor60: null,
      neededSeniorFor80: null,
      latestDelta,
    };
  }

  const avg = round1(scored.reduce((s, x) => s + x.effective, 0) / scored.length);
  const needFor = (target: number) => {
    const raw = round1(target * 2 - avg);
    return raw <= 0 ? 0 : raw;
  };

  return {
    recordCount: scored.length,
    hasSenior: false,
    score: avg,
    level: scoreToLevel(avg),
    meetsGraduation: avg >= 50,
    neededSeniorFor50: needFor(50),
    neededSeniorFor60: needFor(60),
    neededSeniorFor80: needFor(80),
    latestDelta,
  };
}
