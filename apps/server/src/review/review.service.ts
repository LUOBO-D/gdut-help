import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DEFAULT_CAMPUS_ID,
  DEFAULT_GLOBAL_AVG,
  ErrorCode,
  addDays,
  computeBayesScore,
  computeWeeklyHeat,
  today,
  type DimensionAverages,
  type MerchantCategory,
  type MerchantReviewsResponse,
  type RankedMerchant,
  type RankingResponse,
  type RankingType,
  type Review,
  type ReviewInput,
} from '@gduthelp/shared';
import { AppException } from '../common/app.exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import { toMerchant } from '../merchant/merchant.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;

const INCLUDE_DISHES = {
  dishes: {
    where: { status: 'visible' as const },
    orderBy: { createdAt: 'asc' as const },
  },
};

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  /** 榜单：综合榜 / 分类榜（按贝叶斯分） / 本周热门（按 7 天互动热度） */
  async getRankings(opts: {
    type: RankingType;
    campusId?: string;
    category?: MerchantCategory;
    now?: Date;
  }): Promise<RankingResponse> {
    const campusId = opts.campusId || DEFAULT_CAMPUS_ID;
    const category = opts.type === 'category' ? opts.category : undefined;

    const merchants = await this.prisma.merchant.findMany({
      where: {
        campusId,
        status: 'approved',
        ...(category ? { category } : {}),
      },
      include: INCLUDE_DISHES,
      take: 100,
    });

    if (opts.type === 'weekly') {
      const now = opts.now ?? new Date();
      const sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const sinceDayStr = addDays(today(now), -7);
      const ids = merchants.map((m) => m.id);

      const [recentReviews, recentFeedbacks] = ids.length
        ? await Promise.all([
            this.prisma.review.findMany({
              where: { merchantId: { in: ids }, status: 'visible', createdAt: { gte: sinceDate } },
              select: { merchantId: true, likeCount: true },
            }),
            this.prisma.mealFeedback.findMany({
              where: { merchantId: { in: ids }, action: 'accepted', date: { gte: sinceDayStr } },
              select: { merchantId: true },
            }),
          ])
        : [[], []];

      const stats = new Map<string, { reviews: number; likes: number; accepted: number }>();
      const get = (id: string) => {
        let s = stats.get(id);
        if (!s) {
          s = { reviews: 0, likes: 0, accepted: 0 };
          stats.set(id, s);
        }
        return s;
      };
      for (const r of recentReviews) {
        const s = get(r.merchantId);
        s.reviews += 1;
        s.likes += r.likeCount;
      }
      for (const f of recentFeedbacks) {
        get(f.merchantId).accepted += 1;
      }

      const items: RankedMerchant[] = merchants
        .map((m) => ({
          merchant: toMerchant(m),
          weeklyHeat: computeWeeklyHeat(stats.get(m.id) ?? { reviews: 0, likes: 0, accepted: 0 }),
        }))
        .sort(
          (a, b) =>
            (b.weeklyHeat ?? 0) - (a.weeklyHeat ?? 0) ||
            b.merchant.bayesScore - a.merchant.bayesScore ||
            b.merchant.ratingCount - a.merchant.ratingCount,
        )
        .slice(0, 50)
        .map((x, idx) => ({ rank: idx + 1, merchant: x.merchant, weeklyHeat: x.weeklyHeat }));

      return { type: opts.type, items };
    }

    const items: RankedMerchant[] = merchants
      .map((m) => toMerchant(m))
      .sort(
        (a, b) =>
          b.bayesScore - a.bayesScore ||
          b.ratingCount - a.ratingCount ||
          b.ratingAvg - a.ratingAvg ||
          a.name.localeCompare(b.name, 'zh-CN'),
      )
      .slice(0, 50)
      .map((merchant, idx) => ({ rank: idx + 1, merchant }));

    return { type: opts.type, items };
  }

  /** 查看某商家的评价流、四维平均分以及当前用户的评价 */
  async listForMerchant(merchantId: string, viewerId: string): Promise<MerchantReviewsResponse> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { id: true } });
    if (!merchant) throw new AppException(ErrorCode.NOT_FOUND, '商家不存在', HttpStatus.NOT_FOUND);

    const rows = await this.prisma.review.findMany({
      where: { merchantId, status: 'visible' },
      include: {
        user: { select: { nickname: true } },
        likes: { where: { userId: viewerId }, select: { userId: true } },
      },
      orderBy: [{ likeCount: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
    });

    const reviews: Review[] = rows.map((r) => ({
      id: r.id,
      merchantId: r.merchantId,
      // 脱敏隔离：不对其他用户暴露他人内部 userId，防止跨模块用户画像关联
      userId: r.userId === viewerId ? r.userId : '',
      authorNickname: r.user.nickname,
      scoreTaste: r.scoreTaste,
      scoreValue: r.scoreValue,
      scoreEnv: r.scoreEnv,
      scoreSpeed: r.scoreSpeed,
      scoreOverall: r.scoreOverall,
      content: r.content,
      likeCount: r.likeCount,
      likedByMe: r.likes.length > 0,
      isMine: r.userId === viewerId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    let dimensions: DimensionAverages | null = null;
    if (rows.length > 0) {
      const round1 = (sum: number) => Math.round((sum / rows.length) * 10) / 10;
      dimensions = {
        taste: round1(rows.reduce((s, r) => s + r.scoreTaste, 0)),
        value: round1(rows.reduce((s, r) => s + r.scoreValue, 0)),
        env: round1(rows.reduce((s, r) => s + r.scoreEnv, 0)),
        speed: round1(rows.reduce((s, r) => s + r.scoreSpeed, 0)),
      };
    }

    const myReview = reviews.find((r) => r.isMine) ?? null;
    return { reviews, myReview, dimensions };
  }

  /** 写评价或覆盖更新自己的评价，并在事务中原子重算商家均分与贝叶斯排名分 */
  async upsertReview(userId: string, merchantId: string, input: ReviewInput): Promise<Review> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { id: true, status: true } });
    if (!merchant || merchant.status === 'rejected') {
      throw new AppException(ErrorCode.NOT_FOUND, '商家不存在', HttpStatus.NOT_FOUND);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.review.upsert({
        where: { userId_merchantId: { userId, merchantId } },
        create: {
          userId,
          merchantId,
          scoreOverall: input.scoreOverall,
          scoreTaste: input.scoreTaste,
          scoreValue: input.scoreValue,
          scoreEnv: input.scoreEnv,
          scoreSpeed: input.scoreSpeed,
          content: input.content,
        },
        update: {
          scoreOverall: input.scoreOverall,
          scoreTaste: input.scoreTaste,
          scoreValue: input.scoreValue,
          scoreEnv: input.scoreEnv,
          scoreSpeed: input.scoreSpeed,
          content: input.content,
          status: 'visible',
        },
        include: {
          user: { select: { nickname: true } },
          likes: { where: { userId }, select: { userId: true } },
        },
      });
      await this.recalculateMerchantScore(tx, merchantId);
      return saved;
    });

    return {
      id: row.id,
      merchantId: row.merchantId,
      userId: row.userId,
      authorNickname: row.user.nickname,
      scoreTaste: row.scoreTaste,
      scoreValue: row.scoreValue,
      scoreEnv: row.scoreEnv,
      scoreSpeed: row.scoreSpeed,
      scoreOverall: row.scoreOverall,
      content: row.content,
      likeCount: row.likeCount,
      likedByMe: row.likes.length > 0,
      isMine: true,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async deleteMyReview(userId: string, merchantId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.review.findUnique({ where: { userId_merchantId: { userId, merchantId } } });
      if (!existing) throw new AppException(ErrorCode.NOT_FOUND, '你还没有评价过这家店', HttpStatus.NOT_FOUND);
      await tx.review.delete({ where: { id: existing.id } });
      await this.recalculateMerchantScore(tx, merchantId);
    });
  }

  async toggleLike(userId: string, reviewId: string): Promise<{ liked: boolean; likeCount: number }> {
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.review.findUnique({ where: { id: reviewId }, select: { id: true, status: true } });
      if (!review || review.status !== 'visible') {
        throw new AppException(ErrorCode.NOT_FOUND, '评价不存在', HttpStatus.NOT_FOUND);
      }
      const existing = await tx.reviewLike.findUnique({ where: { reviewId_userId: { reviewId, userId } } });
      if (existing) {
        await tx.reviewLike.delete({ where: { reviewId_userId: { reviewId, userId } } });
      } else {
        await tx.reviewLike.create({ data: { reviewId, userId } });
      }
      const likeCount = await tx.reviewLike.count({ where: { reviewId } });
      await tx.review.update({ where: { id: reviewId }, data: { likeCount } });
      return { liked: !existing, likeCount };
    });
  }

  private async recalculateMerchantScore(tx: Tx, merchantId: string) {
    const [merchantAgg, globalAgg] = await Promise.all([
      tx.review.aggregate({
        where: { merchantId, status: 'visible' },
        _count: { _all: true },
        _sum: { scoreOverall: true },
        _avg: { scoreOverall: true },
      }),
      tx.review.aggregate({
        where: { status: 'visible' },
        _avg: { scoreOverall: true },
      }),
    ]);

    const count = merchantAgg._count._all;
    const sum = merchantAgg._sum.scoreOverall ?? 0;
    const avg = count > 0 ? Math.round((merchantAgg._avg.scoreOverall ?? 0) * 100) / 100 : 0;
    const globalAvg = globalAgg._avg.scoreOverall ?? DEFAULT_GLOBAL_AVG;
    const bayes = computeBayesScore(sum, count, globalAvg);

    await tx.merchant.update({
      where: { id: merchantId },
      data: { ratingAvg: avg, ratingCount: count, bayesScore: bayes },
    });
  }
}
