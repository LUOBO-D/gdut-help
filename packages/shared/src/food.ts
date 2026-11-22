import { z } from 'zod';
import { CAMPUSES } from './gdut.js';
import { addDays, daysBetween, today } from './time.js';
import type { ClassSession } from './timetable.js';
import type { WeatherNow } from './weather.js';

export const MERCHANT_CATEGORIES = [
  'canteen',
  'restaurant',
  'noodle',
  'fastfood',
  'drink',
  'snack',
  'dessert',
  'hotpot',
] as const;
export type MerchantCategory = (typeof MERCHANT_CATEGORIES)[number];

export const MERCHANT_CATEGORY_LABELS: Record<MerchantCategory, string> = {
  canteen: '食堂档口',
  restaurant: '校外餐厅',
  noodle: '粉面粥饺',
  fastfood: '快餐简餐',
  drink: '奶茶咖啡',
  snack: '小吃夜宵',
  dessert: '甜品烘焙',
  hotpot: '火锅烧烤',
};

export const MERCHANT_STATUSES = ['pending', 'approved', 'rejected', 'closed'] as const;
export type MerchantStatus = (typeof MERCHANT_STATUSES)[number];

export const MERCHANT_STATUS_LABELS: Record<MerchantStatus, string> = {
  pending: '待审核',
  approved: '已上架',
  rejected: '已拒绝',
  closed: '已关店',
};

export const FOOD_TAGS = [
  '辣',
  '清淡',
  '酸甜',
  '咸香',
  '汤',
  '面',
  '饭',
  '热食',
  '凉食',
  '甜品',
  '饮品',
  '饱腹',
  '轻食',
  '快手',
  '实惠',
  '聚餐',
] as const;
export type FoodTag = (typeof FOOD_TAGS)[number];

export const MOODS = ['happy', 'calm', 'tired', 'anxious', 'down', 'treat'] as const;
export type MoodType = (typeof MOODS)[number];

export interface MoodMeta {
  label: string;
  desc: string;
  color: string;
  gradient: string;
}

export const MOOD_META: Record<MoodType, MoodMeta> = {
  happy: {
    label: '开心',
    desc: '状态不错，来点带劲或适合分享的',
    color: '#FFB020',
    gradient: 'radial-gradient(circle at 32% 28%, #FFF3C4, #FFB020 55%, #FF6B4A)',
  },
  calm: {
    label: '平静',
    desc: '顺心日常，均衡清爽就很好',
    color: '#4D9FFF',
    gradient: 'radial-gradient(circle at 32% 28%, #E0F4FF, #57B4FF 55%, #3B7BFF)',
  },
  tired: {
    label: '疲惫',
    desc: '累了，吃点热乎饱腹、走得近的',
    color: '#9B8CFF',
    gradient: 'radial-gradient(circle at 32% 28%, #ECE8FF, #9B8CFF 55%, #5C54B8)',
  },
  anxious: {
    label: '焦虑',
    desc: '赶进度，清淡快手少排队',
    color: '#38D9C0',
    gradient: 'radial-gradient(circle at 32% 28%, #D7FFF6, #38D9C0 55%, #1E8C88)',
  },
  down: {
    label: '低落',
    desc: '抱抱自己，来点甜品或治愈热食',
    color: '#FF7EB6',
    gradient: 'radial-gradient(circle at 32% 28%, #FFE3F0, #FF7EB6 55%, #B84D8E)',
  },
  treat: {
    label: '想犒劳自己',
    desc: '今天值得吃顿好的',
    color: '#FF7A45',
    gradient: 'radial-gradient(circle at 32% 28%, #FFE5C7, #FF7A45 55%, #D93860)',
  },
};

export const MEAL_TYPES = ['lunch', 'dinner'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_LABELS: Record<MealType, string> = {
  lunch: '午饭',
  dinner: '晚饭',
};

export const MEAL_FEEDBACK_ACTIONS = ['accepted', 'skipped', 'disliked'] as const;
export type MealFeedbackAction = (typeof MEAL_FEEDBACK_ACTIONS)[number];

export const DINING_PARTY_MODES = ['solo', 'group'] as const;
export type DiningPartyMode = (typeof DINING_PARTY_MODES)[number];
export const DINING_PARTY_LABELS: Record<DiningPartyMode, string> = {
  solo: '一人快吃',
  group: '结伴聚餐',
};

export const DINING_PACE_MODES = ['rush', 'relaxed'] as const;
export type DiningPaceMode = (typeof DINING_PACE_MODES)[number];
export const DINING_PACE_LABELS: Record<DiningPaceMode, string> = {
  rush: '赶时间',
  relaxed: '不急',
};

export interface DiningContext {
  party?: DiningPartyMode;
  pace?: DiningPaceMode;
}

function tagList(min = 0, minMsg?: string) {
  const base = z.array(z.string().trim().min(1).max(16)).max(12, '标签最多选 12 个');
  const sized = min > 0 ? base.min(min, minMsg) : base;
  return sized.transform((arr) => [...new Set(arr)]);
}

const campusIdSet = new Set(CAMPUSES.map((c) => c.id));

export const userPreferenceInputSchema = z
  .object({
    tastes: tagList().default([]),
    dislikes: tagList().default([]),
    budgetMin: z.number().int().min(1).max(500).nullable().optional(),
    budgetMax: z.number().int().min(1).max(500).nullable().optional(),
  })
  .refine(
    (v) => v.budgetMin == null || v.budgetMax == null || v.budgetMin <= v.budgetMax,
    { message: '最低预算不能高于最高预算', path: ['budgetMax'] },
  );

export type UserPreferenceInput = z.infer<typeof userPreferenceInputSchema>;

export interface UserPreference {
  tastes: string[];
  dislikes: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  updatedAt: string | null;
}

export const dishInputSchema = z.object({
  name: z.string().trim().min(1, '请填写菜品名称').max(40, '菜品名称最多 40 字'),
  price: z.number().int().min(1).max(500).nullable().optional(),
  tags: tagList().default([]),
});
export type DishInput = z.infer<typeof dishInputSchema>;

export interface Dish {
  id: string;
  merchantId: string;
  name: string;
  price: number | null;
  tags: string[];
  createdAt: string;
}

export interface MerchantOpenHours {
  meals?: MealType[];
  text?: string;
}

export const merchantInputSchema = z.object({
  name: z.string().trim().min(1, '请填写商家名称').max(50, '商家名称最多 50 字'),
  category: z.enum(MERCHANT_CATEGORIES),
  campusId: z
    .string()
    .trim()
    .refine((id) => campusIdSet.has(id), '请选择有效的校区'),
  locationText: z.string().trim().min(1, '请填写位置（如：二饭三楼）').max(80, '位置描述最多 80 字'),
  walkMinutes: z.number().int().min(1).max(60).nullable().optional(),
  priceAvg: z.number().int().min(1, '人均价格至少 1 元').max(500, '人均价格不超过 500 元'),
  tags: tagList(1, '请至少选择一个口味或特点标签'),
  openMeals: z.array(z.enum(MEAL_TYPES)).min(1).max(2).optional(),
  openHoursText: z.string().trim().max(40).nullable().optional(),
  dishes: z.array(dishInputSchema).max(10).optional(),
});
export type MerchantInput = z.infer<typeof merchantInputSchema>;

export const merchantUpdateSchema = merchantInputSchema.omit({ dishes: true });
export type MerchantUpdateInput = z.infer<typeof merchantUpdateSchema>;

export interface Merchant {
  id: string;
  name: string;
  category: MerchantCategory;
  campusId: string;
  locationText: string;
  walkMinutes: number | null;
  priceAvg: number;
  tags: string[];
  openHours: MerchantOpenHours | null;
  submittedBy: string;
  confirmCount: number;
  status: MerchantStatus;
  ratingAvg: number;
  ratingCount: number;
  bayesScore: number;
  dishes: Dish[];
  createdAt: string;
  updatedAt: string;
}

export interface SimilarMerchant {
  id: string;
  name: string;
  category: MerchantCategory;
  locationText: string;
  priceAvg: number;
  status: MerchantStatus;
  similarity: number;
}

export const moodInputSchema = z.object({
  mood: z.enum(MOODS),
  note: z
    .string()
    .trim()
    .max(80, '备注最多 80 字')
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});
export type MoodInput = z.infer<typeof moodInputSchema>;

export interface MoodLog {
  id: string;
  date: string;
  mood: MoodType;
  note: string | null;
  updatedAt: string;
}

export const mealFeedbackInputSchema = z.object({
  merchantId: z.uuid(),
  meal: z.enum(MEAL_TYPES),
  action: z.enum(MEAL_FEEDBACK_ACTIONS),
});
export type MealFeedbackInput = z.infer<typeof mealFeedbackInputSchema>;

export interface MealFeedback {
  id: string;
  merchantId: string;
  merchantName?: string;
  meal: MealType;
  action: MealFeedbackAction;
  date: string;
  createdAt: string;
}

export interface ScoreBreakdown {
  weather: number;
  distance: number;
  mood: number;
  preference: number;
  community: number;
  repeatPenalty: number;
  total: number;
}

export interface MealRecommendation {
  merchant: Merchant;
  score: number;
  breakdown: ScoreBreakdown;
  reason: string;
  matchedTags: string[];
}

export interface MealRecommendationResponse {
  meal: MealType;
  date: string;
  mood: MoodLog | null;
  weatherSummary: string | null;
  scheduleHint: string | null;
  /** 本校区已上架商家总数，用于冷启动提示（< 10 家引导补充） */
  totalMerchants: number;
  /** 本次过滤后可供挑选的商家数 */
  eligibleCount: number;
  items: MealRecommendation[];
}

// ============================================================
// 纯逻辑：商家查重（不依赖数据库 pg_trgm 扩展，前后端与测试共用）
// ============================================================

const PUNCT_RE = /[\s·・\-_()（）【】[\].,，。!！?？'"“”‘’/\\]+/g;

export function normalizeMerchantName(name: string): string {
  return name.trim().toLowerCase().replace(PUNCT_RE, '');
}

function charBigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  if (s.length === 0) return m;
  if (s.length === 1) {
    m.set(s, 1);
    return m;
  }
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** 0–1 之间的名称相似度（Dice 系数 + 包含关系保底） */
export function nameSimilarity(rawA: string, rawB: string): number {
  const a = normalizeMerchantName(rawA);
  const b = normalizeMerchantName(rawB);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const ga = charBigrams(a);
  const gb = charBigrams(b);
  let overlap = 0;
  let totalA = 0;
  let totalB = 0;
  for (const v of ga.values()) totalA += v;
  for (const v of gb.values()) totalB += v;
  for (const [k, v] of ga) {
    const bv = gb.get(k);
    if (bv) overlap += Math.min(v, bv);
  }
  let score = (2 * overlap) / (totalA + totalB);

  // 一个名字完全包含另一个（至少 2 个字）时提高召回率，如「煲仔饭」与「二饭三楼老广煲仔饭」
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 2 && longer.includes(shorter)) {
    score = Math.max(score, 0.55 + (shorter.length / longer.length) * 0.4);
  }

  return Math.round(Math.min(1, score) * 100) / 100;
}

export interface SimilarCandidate {
  id: string;
  name: string;
  category: MerchantCategory;
  campusId: string;
  locationText: string;
  priceAvg: number;
  status: MerchantStatus;
}

export function findSimilarMerchants(
  candidates: SimilarCandidate[],
  queryName: string,
  campusId: string,
  locationText?: string,
  excludeId?: string,
  threshold = 0.45,
): SimilarMerchant[] {
  const qName = normalizeMerchantName(queryName);
  if (qName.length < 2) return [];
  const qLoc = locationText ? normalizeMerchantName(locationText) : '';

  const hits: SimilarMerchant[] = [];
  for (const c of candidates) {
    if (c.campusId !== campusId || c.id === excludeId || c.status === 'rejected') continue;
    let sim = nameSimilarity(qName, c.name);
    if (qLoc.length >= 2 && c.locationText) {
      const locSim = nameSimilarity(qLoc, c.locationText);
      if (locSim >= 0.6 && sim >= 0.35) {
        sim = Math.min(1, Math.round((sim + 0.15) * 100) / 100);
      }
    }
    if (sim >= threshold) {
      hits.push({
        id: c.id,
        name: c.name,
        category: c.category,
        locationText: c.locationText,
        priceAvg: c.priceAvg,
        status: c.status,
        similarity: sim,
      });
    }
  }
  return hits.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
}

// ============================================================
// 纯逻辑：课表 / 待办 / 考试空档分析与每日随机打分推荐（docs/03-backend.md 4.3）
// ============================================================

export function defaultMealForHour(beijingHour: number): MealType {
  return beijingHour < 14 ? 'lunch' : 'dinner';
}

export interface MealTodoSignal {
  title: string;
  /** 1 最高 … 4 最低 */
  priority: number;
  /** ISO 截止时间；无截止时间时为 null */
  dueAt: string | null;
}

export interface MealExamSignal {
  courseName: string;
  /** 开始时间 'HH:mm' */
  startTime: string;
  /** 结束时间 'HH:mm' */
  endTime: string;
  location: string | null;
}

export interface AnalyzeMealWindowOptions {
  todos?: MealTodoSignal[];
  exams?: MealExamSignal[];
  /** 北京日期 'YYYY-MM-DD'，用于识别今日截止待办；省略时从课程时间或当前时间推断 */
  date?: string;
}

export interface MealScheduleContext {
  /** 本餐窗口内的可用吃饭时长（分钟）；无课/无紧迫安排限制时为 null */
  availableMinutes: number | null;
  /** 餐前最后一节课或考试的地点 */
  lastClassLocation: string | null;
  /** 今天总课节块数 */
  classCount: number;
  /** 今日相关未完成待办数（今日截止 / 已逾期 / 高优待办） */
  todoCount?: number;
  /** 临近本餐窗口或今日高紧迫待办数 */
  urgentTodoCount?: number;
  /** 是否因待办截止紧凑需要省时快吃 */
  tightByTodo?: boolean;
  /** 最需要关注的一条待办标题 */
  nextTodoTitle?: string | null;
  /** 今天考试场数 */
  examCount?: number;
  /** 本餐前后涉及的考试科目名称 */
  examName?: string | null;
  /** 本餐紧接着是否有考试（考前优先清淡稳妥） */
  examUpcoming?: boolean;
  /** 今天是否存在课程、待办或考试安排；false 表示彻底空闲日 */
  hasAnySchedule?: boolean;
  /** 给人看的简短提示 */
  hint: string | null;
}

const BJ_OFFSET_MS = 8 * 60 * 60 * 1000;

function toBeijingDateAndMins(iso: string): { date: string; mins: number } | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + BJ_OFFSET_MS);
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { date, mins: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

function hhmmToMins(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function truncateLabel(text: string, max = 12): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * 分析某餐前后的课表、待办与考试空档：
 * - 午饭关注 10:00–12:30 结束的课/考、11:30–14:30 开始的课/考，以及 11:00–15:30 截止的待办
 * - 晚饭关注 15:30–18:20 结束的课/考、17:00–20:00 开始的课/考，以及 16:30–22:00 截止的待办
 * - 今日无课、无相关待办且无考试时标记 hasAnySchedule = false，供每日随机探索提高多样度
 */
export function analyzeMealWindow(
  sessions: ClassSession[],
  meal: MealType,
  opts?: AnalyzeMealWindowOptions,
): MealScheduleContext {
  const todos = opts?.todos ?? [];
  const exams = opts?.exams ?? [];
  const inferredDate =
    opts?.date ?? (sessions[0] ? toBeijingDateAndMins(sessions[0].start)?.date : undefined) ?? today();

  const mealStart = meal === 'lunch' ? 11 * 60 + 30 : 17 * 60;
  const mealEnd = meal === 'lunch' ? 14 * 60 + 30 : 20 * 60;
  const defaultBase = meal === 'lunch' ? 11 * 60 + 30 : 17 * 60 + 15;

  let prevEnd: number | null = null;
  let lastClassLocation: string | null = null;
  let nextStart: number | null = null;
  let nextIsExam = false;
  let examName: string | null = null;

  for (const s of sessions) {
    const startInfo = toBeijingDateAndMins(s.start);
    const endInfo = toBeijingDateAndMins(s.end);
    if (!startInfo || !endInfo) continue;
    if (endInfo.mins <= mealStart + 60 && endInfo.mins >= mealStart - 120) {
      if (prevEnd === null || endInfo.mins > prevEnd) {
        prevEnd = endInfo.mins;
        lastClassLocation = s.location;
      }
    }
    if (startInfo.mins >= mealStart && startInfo.mins <= mealEnd) {
      if (nextStart === null || startInfo.mins < nextStart) {
        nextStart = startInfo.mins;
        nextIsExam = false;
      }
    }
  }

  for (const ex of exams) {
    const startMins = hhmmToMins(ex.startTime);
    const endMins = hhmmToMins(ex.endTime);
    if (startMins === null || endMins === null) continue;
    if (endMins <= mealStart + 60 && endMins >= mealStart - 120) {
      if (prevEnd === null || endMins > prevEnd) {
        prevEnd = endMins;
        if (ex.location) lastClassLocation = ex.location;
      }
      if (!examName) examName = ex.courseName;
    }
    if (startMins >= mealStart && startMins <= mealEnd + 30) {
      if (nextStart === null || startMins <= nextStart) {
        nextStart = startMins;
        nextIsExam = true;
        examName = ex.courseName;
      }
    } else if (!examName) {
      examName = ex.courseName;
    }
  }

  let availableMinutes: number | null = null;
  if (prevEnd !== null && nextStart !== null) {
    availableMinutes = Math.max(0, nextStart - prevEnd);
  } else if (nextStart !== null) {
    availableMinutes = Math.max(0, nextStart - defaultBase);
  }

  // 分析未完成待办：今日截止、已逾期、晚饭前看明早高优截止、以及无截止日期的高优待办
  const todoWindowStart = meal === 'lunch' ? 11 * 60 : 16 * 60 + 30;
  const todoWindowEnd = meal === 'lunch' ? 15 * 60 + 30 : 22 * 60;
  const tomorrowDate = addDays(inferredDate, 1);

  let todoCount = 0;
  let urgentTodoCount = 0;
  let tightByTodo = false;
  let bestTodo: { title: string; urgencyRank: number; dueMins: number; priority: number } | null = null;

  const considerTodo = (title: string, urgencyRank: number, dueMins: number, priority: number) => {
    const clean = title.trim();
    if (!clean) return;
    if (
      !bestTodo ||
      urgencyRank < bestTodo.urgencyRank ||
      (urgencyRank === bestTodo.urgencyRank &&
        (dueMins < bestTodo.dueMins || (dueMins === bestTodo.dueMins && priority < bestTodo.priority)))
    ) {
      bestTodo = { title: clean, urgencyRank, dueMins, priority };
    }
  };

  for (const t of todos) {
    const priority = Number.isFinite(t.priority) ? t.priority : 3;
    if (t.dueAt) {
      const due = toBeijingDateAndMins(t.dueAt);
      if (!due) continue;
      const isOverdue = due.date < inferredDate;
      const isDueToday = due.date === inferredDate;
      const isTomorrowMorning =
        meal === 'dinner' && due.date === tomorrowDate && due.mins <= 10 * 60 && priority <= 2;

      if (!isOverdue && !isDueToday && !isTomorrowMorning) continue;
      todoCount++;

      if (isDueToday && due.mins >= todoWindowStart && due.mins <= todoWindowEnd) {
        urgentTodoCount++;
        tightByTodo = true;
        considerTodo(t.title, 0, due.mins, priority);
        const base = prevEnd ?? defaultBase;
        if (due.mins >= base) {
          const gap = Math.max(0, due.mins - base);
          if (gap < 45 && (availableMinutes === null || gap < availableMinutes)) {
            availableMinutes = gap;
          }
        }
      } else if (isOverdue) {
        urgentTodoCount++;
        if (priority <= 2) tightByTodo = true;
        considerTodo(t.title, priority <= 2 ? 1 : 2, due.mins, priority);
      } else if (isDueToday && priority === 1) {
        urgentTodoCount++;
        tightByTodo = true;
        considerTodo(t.title, 1, due.mins, priority);
      } else if (isDueToday) {
        considerTodo(t.title, 3, due.mins, priority);
      } else {
        considerTodo(t.title, 4, due.mins + 24 * 60, priority);
      }
    } else if (priority <= 2) {
      todoCount++;
      if (priority === 1) urgentTodoCount++;
      considerTodo(t.title, priority === 1 ? 2 : 4, 24 * 60, priority);
    }
  }

  if (todoCount >= 4 || urgentTodoCount >= 2) {
    tightByTodo = true;
  }

  const nextTodoTitle = bestTodo ? (bestTodo as { title: string }).title : null;
  const examCount = exams.length;
  const hasAnySchedule = sessions.length > 0 || todoCount > 0 || examCount > 0;

  let hint: string | null = null;
  if (nextIsExam && examName) {
    if (availableMinutes !== null && availableMinutes < 60) {
      hint = `待会要考「${truncateLabel(examName)}」，空档约 ${availableMinutes} 分钟，优先近且稳妥的`;
    } else {
      hint = `今天有「${truncateLabel(examName)}」考试，挑顿省心好消化的`;
    }
  } else if (availableMinutes !== null && availableMinutes < 45 && tightByTodo && nextTodoTitle) {
    hint = `空档仅约 ${availableMinutes} 分钟且待办「${truncateLabel(nextTodoTitle)}」临近，优先近且快的`;
  } else if (availableMinutes !== null && availableMinutes < 45) {
    hint = `课间只有约 ${availableMinutes} 分钟，优先近且快的`;
  } else if (tightByTodo) {
    hint = nextTodoTitle
      ? `待办「${truncateLabel(nextTodoTitle)}」较紧，优先近且出餐快的`
      : `今天有 ${todoCount} 项待办要推进，优先省时省心的`;
  } else if (sessions.length > 0 && todoCount > 0) {
    hint = lastClassLocation
      ? `${meal === 'lunch' ? '上午' : '下午'}在 ${lastClassLocation} 下课，另有 ${todoCount} 项待办`
      : `今天 ${sessions.length} 节课 + ${todoCount} 项待办，兼顾省时与口味`;
  } else if (lastClassLocation) {
    hint = `${meal === 'lunch' ? '上午' : '下午'}在 ${lastClassLocation} 下课`;
  } else if (sessions.length >= 4) {
    hint = `今天满课（${sessions.length} 节），吃顿补能量的`;
  } else if (examCount > 0 && examName) {
    hint = `今天考完「${truncateLabel(examName)}」，吃顿好的犒劳一下`;
  } else if (todoCount > 0) {
    hint =
      nextTodoTitle && todoCount === 1
        ? `今天没课，记着处理「${truncateLabel(nextTodoTitle)}」`
        : `今天没课但有 ${todoCount} 项待办，挑顿省心好吃的`;
  } else if (sessions.length > 0) {
    hint = `今天 ${sessions.length} 节课，时间充裕`;
  } else {
    hint = '今天没课也没待办，已按今日随机灵感为你挑口味';
  }

  return {
    availableMinutes,
    lastClassLocation,
    classCount: sessions.length,
    todoCount,
    urgentTodoCount,
    tightByTodo,
    nextTodoTitle,
    examCount,
    examName,
    examUpcoming: nextIsExam,
    hasAnySchedule,
    hint,
  };
}

export interface FeedbackSignal {
  merchantId: string;
  action: MealFeedbackAction;
  /** 距离今天的天数（0 = 今天，1 = 昨天…） */
  daysAgo: number;
  meal: MealType;
}

export interface DailyRandomOptions {
  /** 用户标识，确保不同用户拥有各自独立的每日随机序列 */
  seedKey: string;
  /** 北京日期 'YYYY-MM-DD' */
  date: string;
}

export interface RecommendMealsInput {
  merchants: Merchant[];
  meal: MealType;
  weather: WeatherNow | null;
  schedule: MealScheduleContext;
  mood: MoodType | null;
  preference: Pick<UserPreference, 'tastes' | 'dislikes' | 'budgetMin' | 'budgetMax'> | null;
  feedbacks: FeedbackSignal[];
  /** 就餐即时场景（一人快吃/结伴聚餐、赶时间/不急） */
  context?: DiningContext;
  /** 本次「换一批」要排除的商家 ID */
  excludeIds?: string[];
  /** 返回条数，默认 3 */
  limit?: number;
  /**
   * 每日确定性随机配置。
   * 传入时启用按课表/待办松紧度自适应的 Gumbel-Top-k 随机抽样与连续日错开机制：
   * - 同一天同一餐保持稳定（首页/吃什么页/饭点推送一致）
   * - 每天、每餐随机换新；即使连续两天均无课无待办，也能主动错开前一日首推
   * 省略时按纯规则分确定性排序。
   */
  dailyRandom?: DailyRandomOptions;
}

const WARM_WEATHER_TAGS = new Set(['汤', '面', '热食', '饱腹', '辣']);
const COOL_WEATHER_TAGS = new Set(['凉食', '轻食', '饮品', '甜品', '清淡']);

const MOOD_TAG_MAP: Record<MoodType, Set<string>> = {
  happy: new Set(['聚餐', '辣', '甜品', '饮品', '酸甜']),
  calm: new Set(['清淡', '饭', '面', '实惠', '热食']),
  tired: new Set(['热食', '汤', '饱腹', '饭', '面']),
  anxious: new Set(['清淡', '快手', '饮品', '轻食', '实惠']),
  down: new Set(['甜品', '饮品', '热食', '汤', '辣']),
  treat: new Set(['聚餐', '辣', '甜品', '热食', '饱腹']),
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function merchantTagsSet(m: Merchant): Set<string> {
  const s = new Set<string>(m.tags);
  for (const d of m.dishes) {
    for (const t of d.tags) s.add(t);
  }
  return s;
}

function weatherScoreOf(m: Merchant, tags: Set<string>, weather: WeatherNow | null): { score: number; reason: string | null } {
  if (!weather) return { score: 0.5, reason: null };
  const rainy = weather.scene === 'rain' || weather.scene === 'thunder';
  const cold = weather.feelsLike <= 16 || weather.scene === 'snow';
  const hot = weather.feelsLike >= 28 && !rainy;

  if (rainy || cold) {
    let score = 0.45;
    if (m.category === 'hotpot' || m.category === 'noodle') score += 0.25;
    let hits = 0;
    for (const t of WARM_WEATHER_TAGS) if (tags.has(t)) hits++;
    score += Math.min(0.35, hits * 0.14);
    if (tags.has('凉食')) score -= 0.25;
    if (rainy && m.walkMinutes != null && m.walkMinutes <= 6) score += 0.15;
    const reason =
      score >= 0.72
        ? rainy
          ? m.walkMinutes != null && m.walkMinutes <= 6
            ? `下雨天少走几步，${m.locationText}热乎解馋`
            : '下雨天来口热乎的最舒服'
          : `体感 ${Math.round(weather.feelsLike)}°，吃点热乎暖暖身`
        : null;
    return { score: clamp01(score), reason };
  }

  if (hot) {
    let score = 0.45;
    if (m.category === 'drink' || m.category === 'dessert') score += 0.2;
    let hits = 0;
    for (const t of COOL_WEATHER_TAGS) if (tags.has(t)) hits++;
    score += Math.min(0.35, hits * 0.14);
    if (m.category === 'hotpot') score -= 0.25;
    const reason = score >= 0.7 ? `今天 ${Math.round(weather.feelsLike)}° 偏热，清爽不腻` : null;
    return { score: clamp01(score), reason };
  }

  return { score: 0.6, reason: null };
}

const ZONE_MATCHERS: { classRe: RegExp; merchantRe: RegExp }[] = [
  { classRe: /体育馆|田径|篮球|操场|南亭/, merchantRe: /南亭|二饭|西区/ },
  { classRe: /西区|西苑|三饭|四饭/, merchantRe: /三饭|四饭|西区|贝岗/ },
  { classRe: /东区|东苑|一饭|二饭/, merchantRe: /一饭|二饭|东区/ },
  { classRe: /教[1-6一二三四五六]|教学|大教室|工学|实验|图书馆|行政/, merchantRe: /一饭|二饭|东区|三饭|南亭/ },
];

function isNearLastClass(lastClassLocation: string, merchantLocation: string): boolean {
  for (const rule of ZONE_MATCHERS) {
    if (rule.classRe.test(lastClassLocation)) {
      return rule.merchantRe.test(merchantLocation);
    }
  }
  return false;
}

function hasScheduleOf(schedule: MealScheduleContext): boolean {
  if (schedule.hasAnySchedule !== undefined) return schedule.hasAnySchedule;
  return schedule.classCount > 0 || (schedule.todoCount ?? 0) > 0 || (schedule.examCount ?? 0) > 0;
}

function isTightSchedule(schedule: MealScheduleContext, pace?: DiningPaceMode): boolean {
  if (pace === 'rush') return true;
  if (pace === 'relaxed') return false;
  return (
    (schedule.availableMinutes !== null && schedule.availableMinutes < 45) ||
    Boolean(schedule.tightByTodo) ||
    Boolean(schedule.examUpcoming && schedule.availableMinutes !== null && schedule.availableMinutes < 60)
  );
}

/** FNV-1a 32-bit + Murmur3 fmix32 雪崩混合：将任意种子稳定映射到 (0, 1)，消除相邻日期字符串的尾部相关性 */
function hashToUnit(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) + 0.5) / 0x100000000;
}

/** 截断 Gumbel 噪声（u ∈ [0.02, 0.98]，输出 ∈ [-1.36, +3.90]），避免极端长尾破坏硬约束 */
function gumbelNoise(seed: string, merchantId: string): number {
  const u = 0.02 + hashToUnit(`${seed}|${merchantId}`) * 0.96;
  return -Math.log(-Math.log(u));
}

function distanceScoreOf(
  m: Merchant,
  tags: Set<string>,
  schedule: MealScheduleContext,
  pace?: DiningPaceMode,
): { score: number; reason: string | null } {
  const tightByClass = pace !== 'relaxed' && schedule.availableMinutes !== null && schedule.availableMinutes < 45;
  const tightByTodo = pace !== 'relaxed' && Boolean(schedule.tightByTodo);
  const tightByExam =
    pace !== 'relaxed' &&
    Boolean(schedule.examUpcoming) &&
    schedule.availableMinutes !== null &&
    schedule.availableMinutes < 60;
  const tight = isTightSchedule(schedule, pace);
  const hasSchedule = hasScheduleOf(schedule);
  const walk = m.walkMinutes;
  const nearLastClass = Boolean(
    schedule.lastClassLocation && isNearLastClass(schedule.lastClassLocation, m.locationText),
  );

  if (tight) {
    let score = 0.5;
    if (walk != null) {
      if (walk <= 5) score = 0.95;
      else if (walk <= 8) score = 0.8;
      else if (walk <= 12) score = 0.45;
      else score = 0.15;
    } else if (m.category === 'canteen' || m.category === 'fastfood' || m.category === 'noodle') {
      score = 0.82;
    }
    if (m.category === 'hotpot') score = clamp01(score - 0.3);
    if (tags.has('快手')) score = clamp01(score + 0.12);
    if (nearLastClass && (walk == null || walk <= 8)) score = clamp01(score + 0.05);
    if (schedule.examUpcoming) {
      if (tags.has('辣') || m.category === 'hotpot') score = clamp01(score - 0.14);
      if (tags.has('清淡') || tags.has('热食') || tags.has('饭')) score = clamp01(score + 0.06);
    }

    let reason: string | null = null;
    if (score >= 0.78) {
      if (pace === 'rush') {
        reason = walk != null ? `赶时间，步行约 ${walk} 分钟不耽误事` : '出餐快离得近，赶时间来得及';
      } else if (tightByExam && schedule.examName) {
        reason =
          walk != null
            ? `考前时间紧，步行约 ${walk} 分钟吃得稳妥`
            : `考前优先省心快手，不耽误「${truncateLabel(schedule.examName, 8)}」`;
      } else if (tightByClass) {
        reason = walk != null ? `课间紧，步行约 ${walk} 分钟不耽误事` : '出餐快离得近，课间来得及';
      } else if (tightByTodo) {
        if (walk != null) {
          reason = schedule.nextTodoTitle
            ? `待办「${truncateLabel(schedule.nextTodoTitle, 9)}」要赶，步行约 ${walk} 分钟`
            : `今天待办较紧，步行约 ${walk} 分钟不耽误进度`;
        } else {
          reason = '今天待办较紧，出餐快不耽误进度';
        }
      }
    }
    return { score, reason };
  }

  if (pace === 'relaxed') {
    let score = 0.72;
    if (m.category === 'restaurant' || m.category === 'hotpot' || m.category === 'dessert') score += 0.14;
    return { score: clamp01(score), reason: null };
  }

  const todoCount = schedule.todoCount ?? 0;
  const heavyWorkload = schedule.classCount >= 4 || todoCount >= 3 || (schedule.examCount ?? 0) > 0;

  let score = 0.68;
  if (!hasSchedule) {
    // 无课无待办的空闲日略微拉平距离差，让校外餐厅或稍远的店也能自然轮换
    if (walk != null) {
      if (walk <= 6) score = 0.76;
      else if (walk <= 12) score = 0.72;
      else score = 0.64;
    }
  } else if (walk != null) {
    if (walk <= 6) score = 0.85;
    else if (walk <= 12) score = 0.72;
    else score = 0.55;
  } else {
    score = 0.65;
  }

  if (heavyWorkload) {
    if (tags.has('饱腹') || tags.has('热食') || tags.has('饭') || tags.has('汤')) score += 0.08;
    if (walk != null && walk > 14) score -= 0.1;
  }
  if (schedule.examUpcoming) {
    if (tags.has('辣') || m.category === 'hotpot') score -= 0.14;
    if (tags.has('清淡') || tags.has('热食')) score += 0.08;
  }
  if (nearLastClass && (walk == null || walk <= 7)) {
    score += 0.06;
  }

  score = clamp01(score);
  let reason: string | null = null;
  if (schedule.examUpcoming && score >= 0.78 && !tags.has('辣')) {
    reason = '今天有考试，吃得清爽稳妥更有状态';
  } else if (nearLastClass && schedule.lastClassLocation && walk != null && walk <= 6) {
    reason = `${schedule.lastClassLocation} 下课顺路，步行约 ${walk} 分钟`;
  } else if (heavyWorkload && score >= 0.85) {
    if (todoCount >= 2 && schedule.classCount === 0) {
      reason = `今天有 ${todoCount} 项待办，吃顿省心热食好推进`;
    } else if (schedule.classCount >= 4) {
      reason = '今天课多消耗大，吃顿饱腹热食补补能量';
    }
  }

  return { score, reason };
}

function partyAdjustmentOf(
  m: Merchant,
  tags: Set<string>,
  party?: DiningPartyMode,
): { bonus: number; reason: string | null } {
  if (!party) return { bonus: 0, reason: null };
  if (party === 'solo') {
    let bonus = 0;
    if (m.category === 'canteen' || m.category === 'fastfood' || m.category === 'noodle') bonus += 0.12;
    if (tags.has('快手') || tags.has('实惠')) bonus += 0.06;
    if (m.category === 'hotpot' || (tags.has('聚餐') && m.priceAvg >= 35)) bonus -= 0.2;
    const reason = bonus >= 0.14 ? '一人食省心不尴尬，出餐也快' : null;
    return { bonus, reason };
  }
  let bonus = 0;
  if (m.category === 'hotpot' || m.category === 'restaurant') bonus += 0.18;
  if (tags.has('聚餐')) bonus += 0.12;
  if (m.category === 'canteen' && !tags.has('聚餐')) bonus -= 0.1;
  const reason = bonus >= 0.18 ? '适合宿舍或朋友结伴聚餐' : null;
  return { bonus, reason };
}

function moodScoreOf(m: Merchant, tags: Set<string>, mood: MoodType | null): { score: number; reason: string | null } {
  if (!mood) return { score: 0.55, reason: null };
  const target = MOOD_TAG_MAP[mood];
  let hits = 0;
  for (const t of target) if (tags.has(t)) hits++;

  let score = 0.4 + Math.min(0.45, hits * 0.18);
  if (mood === 'treat') {
    if (m.priceAvg >= 25 || m.category === 'hotpot' || m.category === 'restaurant') score += 0.22;
  } else if (mood === 'tired') {
    if (m.walkMinutes != null && m.walkMinutes <= 6) score += 0.15;
  } else if (mood === 'down') {
    if (m.category === 'dessert' || m.category === 'drink') score += 0.2;
  } else if (mood === 'anxious') {
    if (m.category === 'canteen' || m.category === 'fastfood') score += 0.15;
  }

  score = clamp01(score);
  if (score < 0.72) return { score, reason: null };

  const moodReasons: Record<MoodType, string> = {
    happy: '心情不错，吃点带劲的助助兴',
    calm: '清爽顺口，很配今天的平静心情',
    tired: '累了就吃点热乎饱腹的回回血',
    anxious: '简单快手少费神，吃完继续推进',
    down: '吃点治愈系，给自己充点电',
    treat: `人均 ¥${m.priceAvg}，今天值得犒劳一下自己`,
  };
  return { score, reason: moodReasons[mood] };
}

function preferenceScoreOf(
  m: Merchant,
  tags: Set<string>,
  pref: RecommendMealsInput['preference'],
  acceptedCount: number,
): { score: number; matchedTags: string[]; reason: string | null } {
  const matchedTags: string[] = [];
  let score = 0.5;

  if (pref?.tastes.length) {
    for (const t of pref.tastes) {
      if (tags.has(t)) matchedTags.push(t);
    }
    score = 0.35 + Math.min(0.55, (matchedTags.length / Math.min(3, pref.tastes.length)) * 0.55);
  }

  if (acceptedCount > 0) score += Math.min(0.18, acceptedCount * 0.08);
  if (pref?.budgetMin != null && pref?.budgetMax != null) {
    if (m.priceAvg >= pref.budgetMin && m.priceAvg <= pref.budgetMax) score += 0.1;
  }

  score = clamp01(score);
  const reason = matchedTags.length > 0 ? `命中你的「${matchedTags.slice(0, 2).join('·')}」偏好` : null;
  return { score, matchedTags, reason };
}

function buildReason(
  m: Merchant,
  parts: {
    weather: { score: number; reason: string | null };
    distance: { score: number; reason: string | null };
    mood: { score: number; reason: string | null };
    pref: { score: number; reason: string | null; matchedTags: string[] };
    party?: { bonus: number; reason: string | null };
    freeDaySeed?: string;
  },
): string {
  const ranked: { weight: number; text: string }[] = [];
  if (parts.party?.reason) ranked.push({ weight: 0.85 + parts.party.bonus, text: parts.party.reason });
  if (parts.distance.reason) ranked.push({ weight: parts.distance.score + 0.1, text: parts.distance.reason });
  if (parts.weather.reason) ranked.push({ weight: parts.weather.score + 0.05, text: parts.weather.reason });
  if (parts.mood.reason) ranked.push({ weight: parts.mood.score, text: parts.mood.reason });
  if (parts.pref.reason) ranked.push({ weight: parts.pref.score, text: parts.pref.reason });

  ranked.sort((a, b) => b.weight - a.weight);
  const topDish = m.dishes[0]?.name;
  if (ranked[0]) {
    const base = ranked[0].text;
    if (topDish && base.length + topDish.length <= 28) {
      return `${base}，试试${topDish}`;
    }
    return base;
  }
  if (parts.freeDaySeed) {
    const pick = Math.floor(hashToUnit(`${parts.freeDaySeed}|reason|${m.id}`) * 3);
    if (topDish) {
      if (pick === 0) return `今天时间充裕，随机换换口味试试「${topDish}」`;
      if (pick === 1) return `今日随机灵感选中 ${m.locationText}，尝尝「${topDish}」`;
      return `难得清闲，去 ${m.locationText} 吃口「${topDish}」换换花样`;
    }
    if (pick === 0) return `今天没安排，随机挑了 ${m.locationText} 换换口味`;
    if (pick === 1) return `今日随机推荐 · ${m.locationText}，人均 ¥${m.priceAvg}`;
  }
  if (topDish) return `${m.locationText}的人气之选，推荐尝尝「${topDish}」`;
  if (m.walkMinutes != null) return `${m.locationText}，步行约 ${m.walkMinutes} 分钟，人均 ¥${m.priceAvg}`;
  return `${m.locationText} · ${MERCHANT_CATEGORY_LABELS[m.category]}，人均 ¥${m.priceAvg}`;
}

function pickDiversified(ranked: MealRecommendation[], limit: number, tight: boolean): MealRecommendation[] {
  const pool = ranked.slice(0, Math.max(10, limit));
  const minTightScore = tight && pool[0] ? pool[0].score - 0.25 : -Infinity;
  const picked: MealRecommendation[] = [];
  const usedCats = new Set<MerchantCategory>();
  const usedIds = new Set<string>();

  for (const item of pool) {
    if (picked.length >= limit) break;
    if (usedCats.has(item.merchant.category)) continue;
    if (item.score < minTightScore) continue;
    picked.push(item);
    usedCats.add(item.merchant.category);
    usedIds.add(item.merchant.id);
  }
  for (const item of pool) {
    if (picked.length >= limit) break;
    if (usedIds.has(item.merchant.id)) continue;
    picked.push(item);
    usedIds.add(item.merchant.id);
  }
  return picked;
}

interface DailySamplingParams {
  tau: number;
  prevTop1Pen: number;
  prevRestPen: number;
  olderTop1Pen: number;
  otherMealPen: number;
  tight: boolean;
}

function rankWithSeed(
  items: MealRecommendation[],
  seed: string,
  tau: number,
  cooldowns: Map<string, number>,
): MealRecommendation[] {
  return items
    .map((item) => ({
      item,
      key: item.score + tau * gumbelNoise(seed, item.merchant.id) - (cooldowns.get(item.merchant.id) ?? 0),
    }))
    .sort((a, b) => b.key - a.key || a.item.merchant.id.localeCompare(b.item.merchant.id))
    .map((entry) => entry.item);
}

const DAILY_LOOKBACK_DAYS = 7;

function addCooldown(map: Map<string, number>, id: string, delta: number) {
  if (delta <= 0) return;
  map.set(id, (map.get(id) ?? 0) + delta);
}

function buildDailyRanking(
  scored: MealRecommendation[],
  seedKey: string,
  date: string,
  meal: MealType,
  params: DailySamplingParams,
  avoidSameDayLunch: boolean,
): MealRecommendation[] {
  if (scored.length <= 1) return [...scored];

  // 仅 2 家可选且非赶时间场景：按日历天数与餐次精确交替，保证连续两天及同日午晚饭绝不重复
  if (scored.length === 2 && !params.tight) {
    const base = [...scored].sort((a, b) => b.score - a.score || a.merchant.id.localeCompare(b.merchant.id));
    const epochDay = daysBetween('2026-01-01', date);
    const offset = Math.floor(hashToUnit(`${seedKey}|pair-anchor`) * 2);
    const mealOffset = meal === 'dinner' ? 1 : 0;
    const firstIdx = (((epochDay + offset + mealOffset) % 2) + 2) % 2;
    return firstIdx === 0 ? [base[0]!, base[1]!] : [base[1]!, base[0]!];
  }

  // 回放近 7 天同餐次推荐序列，使昨日/前日首推在无显式反馈时也能自然冷却错开
  const history: MealRecommendation[][] = [];
  for (let delta = -DAILY_LOOKBACK_DAYS; delta <= -1; delta++) {
    const stepDate = addDays(date, delta);
    const stepCooldown = new Map<string, number>();
    const prev = history[history.length - 1];
    const older = history[history.length - 2];
    if (prev?.[0]) addCooldown(stepCooldown, prev[0].merchant.id, params.prevTop1Pen);
    if (prev && scored.length >= 5) {
      for (const item of prev.slice(1)) addCooldown(stepCooldown, item.merchant.id, params.prevRestPen);
    }
    if (older?.[0] && scored.length >= 3) {
      addCooldown(stepCooldown, older[0].merchant.id, params.olderTop1Pen);
    }
    const stepRanked = rankWithSeed(scored, `${seedKey}|${stepDate}|${meal}`, params.tau, stepCooldown);
    history.push(pickDiversified(stepRanked, Math.min(3, scored.length), params.tight));
  }

  const todayCooldown = new Map<string, number>();
  const yesterday = history[history.length - 1];
  const dayBefore = history[history.length - 2];
  if (yesterday?.[0]) addCooldown(todayCooldown, yesterday[0].merchant.id, params.prevTop1Pen);
  if (yesterday && scored.length >= 5) {
    for (const item of yesterday.slice(1)) addCooldown(todayCooldown, item.merchant.id, params.prevRestPen);
  }
  if (dayBefore?.[0] && scored.length >= 3) {
    addCooldown(todayCooldown, dayBefore[0].merchant.id, params.olderTop1Pen);
  }

  if (avoidSameDayLunch && meal === 'dinner') {
    const lunchRanked = buildDailyRanking(scored, seedKey, date, 'lunch', params, false);
    const lunchTop = pickDiversified(lunchRanked, 1, params.tight)[0];
    if (lunchTop) addCooldown(todayCooldown, lunchTop.merchant.id, params.otherMealPen);
  }

  return rankWithSeed(scored, `${seedKey}|${date}|${meal}`, params.tau, todayCooldown);
}

/**
 * 规则打分、每日自适应随机抽样与品类打散（docs/03-backend.md 4.3）：
 * 过滤（状态、忌口、营业餐次、预算）→ 课表/待办/天气/心情/偏好打分
 * → 传入 dailyRandom 时按日程松紧度进行 Gumbel-Top-k 每日随机排序并错开前日首推
 * → 过滤「换一批」excludeIds → 按品类打散取最多 limit 个（不凑数）
 */
export function scoreAndRecommendMeals(input: RecommendMealsInput): MealRecommendation[] {
  const {
    merchants,
    meal,
    weather,
    schedule,
    mood,
    preference,
    feedbacks,
    context,
    excludeIds = [],
    limit = 3,
    dailyRandom,
  } = input;
  const excludeSet = new Set(excludeIds);
  const dislikeTags = new Set(preference?.dislikes ?? []);
  const tight = isTightSchedule(schedule, context?.pace);
  const hasSchedule = hasScheduleOf(schedule);
  const freeDaySeed = dailyRandom && !hasSchedule && !tight ? `${dailyRandom.seedKey}|${dailyRandom.date}|${meal}` : undefined;

  // 统计反馈信号：
  // - 历史上点过 disliked（14 天内）直接跳过
  // - 今天本餐点过 skipped 直接跳过
  // - 近 3 天 accepted 施加重复惩罚
  const dislikedMerchants = new Set<string>();
  const skippedToday = new Set<string>();
  const recentAcceptedDays = new Map<string, number>();
  const acceptedCounts = new Map<string, number>();

  for (const fb of feedbacks) {
    if (fb.action === 'disliked' && fb.daysAgo <= 14) {
      dislikedMerchants.add(fb.merchantId);
    } else if (fb.action === 'skipped' && fb.daysAgo === 0 && fb.meal === meal) {
      skippedToday.add(fb.merchantId);
    } else if (fb.action === 'accepted') {
      acceptedCounts.set(fb.merchantId, (acceptedCounts.get(fb.merchantId) ?? 0) + 1);
      if (fb.daysAgo <= 3) {
        const prev = recentAcceptedDays.get(fb.merchantId);
        if (prev === undefined || fb.daysAgo < prev) recentAcceptedDays.set(fb.merchantId, fb.daysAgo);
      }
    }
  }

  // 先基于全量合规商家计算当日排序（不含 excludeIds），保证点「换一批」时序列稳定不跳动
  const baseEligible = merchants.filter((m) => {
    if (m.status !== 'approved') return false;
    if (dislikedMerchants.has(m.id) || skippedToday.has(m.id)) return false;

    const tags = merchantTagsSet(m);
    for (const d of dislikeTags) {
      if (tags.has(d)) return false;
    }

    if (m.openHours?.meals?.length && !m.openHours.meals.includes(meal)) {
      return false;
    }

    // 预算允许 20% 弹性上限（想犒劳自己或结伴聚餐时再放宽 40%），避免过滤太死
    if (preference?.budgetMax != null) {
      const factor = mood === 'treat' || context?.party === 'group' ? 1.4 : 1.2;
      if (m.priceAvg > Math.ceil(preference.budgetMax * factor)) return false;
    }
    if (preference?.budgetMin != null && m.priceAvg < Math.floor(preference.budgetMin * 0.7)) {
      return false;
    }
    return true;
  });

  const wWeather = tight ? 0.22 : 0.25;
  const wDistance = tight ? 0.28 : 0.2;
  const wMood = tight ? 0.18 : 0.2;
  const wPref = 0.2;
  const wCommunity = tight ? 0.12 : 0.15;

  const scored: MealRecommendation[] = baseEligible.map((m) => {
    const tags = merchantTagsSet(m);
    const w = weatherScoreOf(m, tags, weather);
    const d = distanceScoreOf(m, tags, schedule, context?.pace);
    const mo = moodScoreOf(m, tags, mood);
    const p = preferenceScoreOf(m, tags, preference, acceptedCounts.get(m.id) ?? 0);
    const party = partyAdjustmentOf(m, tags, context?.party);
    const community = m.ratingCount > 0 ? clamp01(m.bayesScore / 5) : 0.6;

    const lastEaten = recentAcceptedDays.get(m.id);
    const repeatPenalty =
      lastEaten === 0 ? 0.45 : lastEaten === 1 ? 0.3 : lastEaten === 2 ? 0.18 : lastEaten === 3 ? 0.1 : 0;

    const total = Math.max(
      0,
      Math.round(
        (wWeather * w.score +
          wDistance * d.score +
          wMood * mo.score +
          wPref * p.score +
          wCommunity * community +
          party.bonus -
          repeatPenalty) *
          1000,
      ) / 1000,
    );

    return {
      merchant: m,
      score: total,
      breakdown: {
        weather: Math.round(w.score * 100) / 100,
        distance: Math.round(d.score * 100) / 100,
        mood: Math.round(mo.score * 100) / 100,
        preference: Math.round(p.score * 100) / 100,
        community: Math.round(community * 100) / 100,
        repeatPenalty,
        total,
      },
      reason: buildReason(m, { weather: w, distance: d, mood: mo, pref: p, party, freeDaySeed }),
      matchedTags: p.matchedTags,
    };
  });

  let ordered: MealRecommendation[];
  if (dailyRandom) {
    // 按日程松紧度自适应探索温度与连续日错开力度：
    // - 课表/待办紧：低温度 + 温和冷却，严守近且快，只在合规快餐/食堂间每日轮换
    // - 常规日程：中等温度，兼顾课表待办/天气/偏好与每日新鲜感
    // - 无课无待办空闲日：高温度 + 强错开冷却，保证连续两天无安排也能随机换新不撞店
    const params: DailySamplingParams = tight
      ? { tau: 0.07, prevTop1Pen: 0.18, prevRestPen: 0.08, olderTop1Pen: 0.06, otherMealPen: 0.14, tight: true }
      : hasSchedule
        ? { tau: 0.14, prevTop1Pen: 0.55, prevRestPen: 0.22, olderTop1Pen: 0.16, otherMealPen: 0.4, tight: false }
        : { tau: 0.25, prevTop1Pen: 1.8, prevRestPen: 0.7, olderTop1Pen: 0.45, otherMealPen: 1.6, tight: false };

    ordered = buildDailyRanking(scored, dailyRandom.seedKey, dailyRandom.date, meal, params, true);
  } else {
    ordered = [...scored].sort((a, b) => b.score - a.score || a.merchant.name.localeCompare(b.merchant.name, 'zh-CN'));
  }

  const visible = excludeSet.size > 0 ? ordered.filter((r) => !excludeSet.has(r.merchant.id)) : ordered;
  return pickDiversified(visible, limit, tight);
}
