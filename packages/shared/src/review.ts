import { z } from 'zod';
import type { Merchant } from './food.js';

export const BAYES_C = 10;
export const DEFAULT_GLOBAL_AVG = 4.0;

export const RANKING_TYPES = ['overall', 'category', 'weekly'] as const;
export type RankingType = (typeof RANKING_TYPES)[number];

export const RANKING_TYPE_LABELS: Record<RankingType, string> = {
  overall: '综合榜',
  category: '分类榜',
  weekly: '本周热门',
};

export const REVIEW_DIMENSIONS = [
  { key: 'scoreTaste', label: '口味' },
  { key: 'scoreValue', label: '性价比' },
  { key: 'scoreEnv', label: '环境' },
  { key: 'scoreSpeed', label: '出餐速度' },
] as const;

const starScore = z.number().int().min(1, '评分在 1–5 星之间').max(5, '评分在 1–5 星之间');

export const reviewInputSchema = z.object({
  scoreOverall: starScore,
  scoreTaste: starScore,
  scoreValue: starScore,
  scoreEnv: starScore,
  scoreSpeed: starScore,
  content: z
    .string()
    .trim()
    .max(500, '评价最多 500 字')
    .default(''),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export interface Review {
  id: string;
  merchantId: string;
  userId: string;
  authorNickname: string;
  scoreTaste: number;
  scoreValue: number;
  scoreEnv: number;
  scoreSpeed: number;
  scoreOverall: number;
  content: string;
  likeCount: number;
  likedByMe: boolean;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DimensionAverages {
  taste: number;
  value: number;
  env: number;
  speed: number;
}

export interface MerchantReviewsResponse {
  reviews: Review[];
  myReview: Review | null;
  dimensions: DimensionAverages | null;
}

export interface RankedMerchant {
  rank: number;
  merchant: Merchant;
  weeklyHeat?: number;
}

export interface RankingResponse {
  type: RankingType;
  items: RankedMerchant[];
}

/**
 * 贝叶斯平均排名分（docs/03-backend.md 4.6）：
 * bayes_score = (C * m + Σscore) / (C + n)
 * 防止 1 条 5 星评价直接登顶，评分数达到 C 后自身评分权重过半。
 */
export function computeBayesScore(
  sumScore: number,
  count: number,
  globalAvg: number = DEFAULT_GLOBAL_AVG,
  c: number = BAYES_C,
): number {
  if (count <= 0) return 0;
  const m = globalAvg > 0 ? globalAvg : DEFAULT_GLOBAL_AVG;
  return Math.round(((c * m + sumScore) / (c + count)) * 1000) / 1000;
}

/** 本周热度（docs/03-backend.md 4.6）：本周评价数 * 3 + 本周点赞数 + 本周推荐被接受次数 * 2 */
export function computeWeeklyHeat(stats: { reviews: number; likes: number; accepted: number }): number {
  return Math.max(0, stats.reviews * 3 + stats.likes + stats.accepted * 2);
}
