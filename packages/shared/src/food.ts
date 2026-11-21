import { z } from 'zod';
import { CAMPUSES } from './gdut.js';
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
// 纯逻辑：课表空档分析与规则打分推荐（docs/03-backend.md 4.3）
// ============================================================

export function defaultMealForHour(beijingHour: number): MealType {
  return beijingHour < 14 ? 'lunch' : 'dinner';
}

export interface MealScheduleContext {
  /** 本餐窗口内的可用吃饭时长（分钟）；无课或无下节限制时为 null */
  availableMinutes: number | null;
  /** 餐前最后一节课的上课地点 */
  lastClassLocation: string | null;
  /** 今天总课节块数 */
  classCount: number;
  /** 给人看的简短提示 */
  hint: string | null;
}

/**
 * 分析某餐前后的课表空档：
 * - 午饭关注 10:00–12:30 结束的课与 12:30–15:00 开始的课
 * - 晚饭关注 15:30–18:20 结束的课与 18:00–20:30 开始的课
 */
export function analyzeMealWindow(sessions: ClassSession[], meal: MealType): MealScheduleContext {
  if (sessions.length === 0) {
    return { availableMinutes: null, lastClassLocation: null, classCount: 0, hint: '今天没课，可以慢慢挑' };
  }

  const toMinutes = (iso: string) => {
    const d = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  };

  const mealStart = meal === 'lunch' ? 11 * 60 + 30 : 17 * 60;
  const mealEnd = meal === 'lunch' ? 14 * 60 + 30 : 20 * 60;

  let prevEnd: number | null = null;
  let lastClassLocation: string | null = null;
  let nextStart: number | null = null;

  for (const s of sessions) {
    const start = toMinutes(s.start);
    const end = toMinutes(s.end);
    if (end <= mealStart + 60 && end >= mealStart - 120) {
      if (prevEnd === null || end > prevEnd) {
        prevEnd = end;
        lastClassLocation = s.location;
      }
    }
    if (start >= mealStart && start <= mealEnd) {
      if (nextStart === null || start < nextStart) {
        nextStart = start;
      }
    }
  }

  let availableMinutes: number | null = null;
  if (prevEnd !== null && nextStart !== null) {
    availableMinutes = Math.max(0, nextStart - prevEnd);
  } else if (nextStart !== null) {
    const base = meal === 'lunch' ? 11 * 60 + 30 : 17 * 60 + 15;
    availableMinutes = Math.max(0, nextStart - base);
  }

  let hint: string | null = null;
  if (availableMinutes !== null && availableMinutes < 45) {
    hint = `课间只有约 ${availableMinutes} 分钟，优先近且快的`;
  } else if (lastClassLocation) {
    hint = `${meal === 'lunch' ? '上午' : '下午'}在 ${lastClassLocation} 下课`;
  } else if (sessions.length >= 4) {
    hint = `今天满课（${sessions.length} 节），吃顿补能量的`;
  } else {
    hint = `今天 ${sessions.length} 节课，时间充裕`;
  }

  return { availableMinutes, lastClassLocation, classCount: sessions.length, hint };
}

export interface FeedbackSignal {
  merchantId: string;
  action: MealFeedbackAction;
  /** 距离今天的天数（0 = 今天，1 = 昨天…） */
  daysAgo: number;
  meal: MealType;
}

export interface RecommendMealsInput {
  merchants: Merchant[];
  meal: MealType;
  weather: WeatherNow | null;
  schedule: MealScheduleContext;
  mood: MoodType | null;
  preference: Pick<UserPreference, 'tastes' | 'dislikes' | 'budgetMin' | 'budgetMax'> | null;
  feedbacks: FeedbackSignal[];
  /** 本次「换一批」要排除的商家 ID */
  excludeIds?: string[];
  /** 返回条数，默认 3 */
  limit?: number;
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

function distanceScoreOf(m: Merchant, tags: Set<string>, schedule: MealScheduleContext): { score: number; reason: string | null } {
  const tight = schedule.availableMinutes !== null && schedule.availableMinutes < 45;
  const walk = m.walkMinutes;

  if (tight) {
    let score = 0.5;
    if (walk != null) {
      if (walk <= 5) score = 0.95;
      else if (walk <= 8) score = 0.8;
      else if (walk <= 12) score = 0.45;
      else score = 0.15;
    } else if (m.category === 'canteen' || m.category === 'fastfood') {
      score = 0.82;
    }
    if (tags.has('快手')) score = clamp01(score + 0.12);
    const reason =
      score >= 0.78
        ? walk != null
          ? `课间紧，步行约 ${walk} 分钟不耽误下节课`
          : '出餐快离得近，赶课来得及'
        : null;
    return { score, reason };
  }

  let score = 0.65;
  if (walk != null) {
    if (walk <= 6) score = 0.85;
    else if (walk <= 12) score = 0.72;
    else score = 0.55;
  }
  return { score, reason: null };
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
  },
): string {
  const ranked: { weight: number; text: string }[] = [];
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
  if (topDish) return `${m.locationText}的人气之选，推荐尝尝「${topDish}」`;
  if (m.walkMinutes != null) return `${m.locationText}，步行约 ${m.walkMinutes} 分钟，人均 ¥${m.priceAvg}`;
  return `${m.locationText} · ${MERCHANT_CATEGORY_LABELS[m.category]}，人均 ¥${m.priceAvg}`;
}

/**
 * 规则打分与品类打散（docs/03-backend.md 4.3）：
 * 过滤（状态、忌口、营业餐次、预算、已排除）→ 权重打分 → 取前 10 → 按品类打散取最多 limit 个（不凑数）
 */
export function scoreAndRecommendMeals(input: RecommendMealsInput): MealRecommendation[] {
  const { merchants, meal, weather, schedule, mood, preference, feedbacks, excludeIds = [], limit = 3 } = input;
  const excludeSet = new Set(excludeIds);
  const dislikeTags = new Set(preference?.dislikes ?? []);

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

  const eligible = merchants.filter((m) => {
    if (m.status !== 'approved') return false;
    if (excludeSet.has(m.id) || dislikedMerchants.has(m.id) || skippedToday.has(m.id)) return false;

    const tags = merchantTagsSet(m);
    for (const d of dislikeTags) {
      if (tags.has(d)) return false;
    }

    if (m.openHours?.meals?.length && !m.openHours.meals.includes(meal)) {
      return false;
    }

    // 预算允许 20% 弹性上限（想犒劳自己时再放宽 40%），避免过滤太死
    if (preference?.budgetMax != null) {
      const factor = mood === 'treat' ? 1.4 : 1.2;
      if (m.priceAvg > Math.ceil(preference.budgetMax * factor)) return false;
    }
    if (preference?.budgetMin != null && m.priceAvg < Math.floor(preference.budgetMin * 0.7)) {
      return false;
    }
    return true;
  });

  const scored: MealRecommendation[] = eligible.map((m) => {
    const tags = merchantTagsSet(m);
    const w = weatherScoreOf(m, tags, weather);
    const d = distanceScoreOf(m, tags, schedule);
    const mo = moodScoreOf(m, tags, mood);
    const p = preferenceScoreOf(m, tags, preference, acceptedCounts.get(m.id) ?? 0);
    const community = m.ratingCount > 0 ? clamp01(m.bayesScore / 5) : 0.6;

    const lastEaten = recentAcceptedDays.get(m.id);
    const repeatPenalty =
      lastEaten === 0 ? 0.45 : lastEaten === 1 ? 0.3 : lastEaten === 2 ? 0.18 : lastEaten === 3 ? 0.1 : 0;

    const total = Math.max(
      0,
      Math.round(
        (0.25 * w.score + 0.2 * d.score + 0.2 * mo.score + 0.2 * p.score + 0.15 * community - repeatPenalty) * 1000,
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
      reason: buildReason(m, { weather: w, distance: d, mood: mo, pref: p }),
      matchedTags: p.matchedTags,
    };
  });

  scored.sort((a, b) => b.score - a.score || a.merchant.name.localeCompare(b.merchant.name, 'zh-CN'));
  const pool = scored.slice(0, 10);

  // 按品类打散：第一轮优先不同品类，不足 limit 时再按分补齐
  const picked: MealRecommendation[] = [];
  const usedCats = new Set<MerchantCategory>();
  const usedIds = new Set<string>();

  for (const item of pool) {
    if (picked.length >= limit) break;
    if (usedCats.has(item.merchant.category)) continue;
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
