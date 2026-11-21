import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ReviewService } from './review.service.js';

describe('ReviewService', () => {
  it('提交评价后在事务内重算商家均分与贝叶斯排名分', async () => {
    const now = new Date('2026-11-21T06:00:00.000Z');
    const tx = {
      review: {
        upsert: vi.fn().mockResolvedValue({
          id: 'r1',
          merchantId: 'm1',
          userId: 'u1',
          scoreTaste: 5,
          scoreValue: 4,
          scoreEnv: 4,
          scoreSpeed: 5,
          scoreOverall: 5,
          content: '锅巴很脆',
          likeCount: 0,
          createdAt: now,
          updatedAt: now,
          user: { nickname: '小明' },
          likes: [],
        }),
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({ _count: { _all: 2 }, _sum: { scoreOverall: 9 }, _avg: { scoreOverall: 4.5 } })
          .mockResolvedValueOnce({ _avg: { scoreOverall: 4.0 } }),
      },
      merchant: {
        update: vi.fn(),
      },
    };
    const prisma = {
      merchant: { findUnique: vi.fn().mockResolvedValue({ id: 'm1', status: 'approved' }) },
      $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    const service = new ReviewService(prisma as unknown as PrismaService);
    const res = await service.upsertReview('u1', 'm1', {
      scoreOverall: 5,
      scoreTaste: 5,
      scoreValue: 4,
      scoreEnv: 4,
      scoreSpeed: 5,
      content: '锅巴很脆',
    });

    expect(res.scoreOverall).toBe(5);
    expect(tx.merchant.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { ratingAvg: 4.5, ratingCount: 2, bayesScore: 4.083 },
    });
  });

  it('本周热门榜按 评价*3 + 点赞 + 推荐接受*2 排序', async () => {
    const now = new Date('2026-11-21T06:00:00.000Z');
    const baseMerchant = (id: string, name: string) => ({
      id,
      name,
      category: 'canteen',
      campusId: 'hemc',
      locationText: '二饭',
      walkMinutes: 5,
      lat: null,
      lng: null,
      priceAvg: 15,
      tags: ['饭'],
      openHours: null,
      submittedBy: 'u1',
      confirmCount: 0,
      status: 'approved',
      ratingAvg: 4.2,
      ratingCount: 3,
      bayesScore: 4.05,
      dishes: [],
      createdAt: now,
      updatedAt: now,
    });
    const prisma = {
      merchant: { findMany: vi.fn().mockResolvedValue([baseMerchant('m1', 'A店'), baseMerchant('m2', 'B店')]) },
      review: { findMany: vi.fn().mockResolvedValue([{ merchantId: 'm2', likeCount: 4 }]) },
      mealFeedback: { findMany: vi.fn().mockResolvedValue([{ merchantId: 'm1' }]) },
    };

    const service = new ReviewService(prisma as unknown as PrismaService);
    const res = await service.getRankings({ type: 'weekly', campusId: 'hemc', now });

    expect(res.items[0]!.merchant.id).toBe('m2'); // 1*3 + 4 = 7
    expect(res.items[0]!.weeklyHeat).toBe(7);
    expect(res.items[1]!.merchant.id).toBe('m1'); // 1*2 = 2
    expect(res.items[1]!.weeklyHeat).toBe(2);
  });
});
