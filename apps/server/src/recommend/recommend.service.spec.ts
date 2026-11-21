import { describe, expect, it, vi } from 'vitest';
import type { Merchant } from '@gduthelp/shared';
import type { MerchantService } from '../merchant/merchant.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { TimetableService } from '../timetable/timetable.service.js';
import type { WeatherService } from '../weather/weather.service.js';
import { RecommendService } from './recommend.service.js';

function makeMerchant(overrides: Partial<Merchant> & { id: string; name: string }): Merchant {
  return {
    category: 'canteen',
    campusId: 'hemc',
    locationText: '二饭三楼',
    walkMinutes: 5,
    priceAvg: 15,
    tags: ['饭', '热食'],
    openHours: null,
    submittedBy: 'u1',
    confirmCount: 0,
    status: 'approved',
    ratingAvg: 0,
    ratingCount: 0,
    bayesScore: 0,
    dishes: [],
    createdAt: '2026-11-21T00:00:00.000Z',
    updatedAt: '2026-11-21T00:00:00.000Z',
    ...overrides,
  };
}

function makeHarness() {
  const prisma = {
    user: { findUnique: vi.fn() },
    userPreference: { findUnique: vi.fn(), upsert: vi.fn() },
    moodLog: { findUnique: vi.fn(), upsert: vi.fn() },
    mealFeedback: { findMany: vi.fn(), create: vi.fn() },
    merchant: { findUnique: vi.fn() },
  };
  const merchants = { listApprovedForCampus: vi.fn() };
  const weather = { get: vi.fn() };
  const timetable = { data: vi.fn() };

  const service = new RecommendService(
    prisma as unknown as PrismaService,
    merchants as unknown as MerchantService,
    weather as unknown as WeatherService,
    timetable as unknown as TimetableService,
  );
  return { service, prisma, merchants, weather, timetable };
}

describe('RecommendService', () => {
  it('保存口味偏好时，忌口会自动覆盖冲突的喜爱标签', async () => {
    const { service, prisma } = makeHarness();
    const now = new Date('2026-11-21T03:00:00.000Z');
    prisma.userPreference.upsert.mockResolvedValue({
      userId: 'u1',
      tastes: ['清淡'],
      dislikes: ['辣'],
      budgetMin: 10,
      budgetMax: 25,
      updatedAt: now,
    });

    const pref = await service.savePreferences('u1', {
      tastes: ['辣', '清淡'],
      dislikes: ['辣'],
      budgetMin: 10,
      budgetMax: 25,
    });

    expect(pref.tastes).toEqual(['清淡']);
    expect(prisma.userPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ tastes: ['清淡'], dislikes: ['辣'] }),
      }),
    );
  });

  it('天气接口异常时优雅降级，依然正常返回推荐结果', async () => {
    const { service, prisma, merchants, weather, timetable } = makeHarness();
    prisma.user.findUnique.mockResolvedValue({ campusId: 'hemc' });
    prisma.userPreference.findUnique.mockResolvedValue(null);
    prisma.moodLog.findUnique.mockResolvedValue({
      id: 'm1',
      userId: 'u1',
      date: '2026-11-21',
      mood: 'tired',
      note: '写代码累了',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.mealFeedback.findMany.mockResolvedValue([]);
    timetable.data.mockResolvedValue({ semester: null, courses: [] });
    weather.get.mockRejectedValue(new Error('upstream timeout'));
    merchants.listApprovedForCampus.mockResolvedValue([
      makeMerchant({ id: '1', name: '潮汕牛肉汤粉', category: 'noodle', tags: ['汤', '面', '热食'] }),
      makeMerchant({ id: '2', name: '滑蛋盖饭', category: 'canteen', tags: ['饭', '饱腹'] }),
    ]);

    const res = await service.recommendMeals('u1', {
      meal: 'lunch',
      now: new Date('2026-11-21T03:30:00.000Z'), // 北京 11:30
    });

    expect(res.meal).toBe('lunch');
    expect(res.weatherSummary).toBeNull();
    expect(res.totalMerchants).toBe(2);
    expect(res.items).toHaveLength(2);
    expect(res.mood?.mood).toBe('tired');
  });

  it('记录反馈时校验商家存在性', async () => {
    const { service, prisma } = makeHarness();
    prisma.merchant.findUnique.mockResolvedValue(null);

    await expect(
      service.recordFeedback('u1', {
        merchantId: '00000000-0000-0000-0000-000000000099',
        meal: 'dinner',
        action: 'accepted',
      }),
    ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
  });
});
