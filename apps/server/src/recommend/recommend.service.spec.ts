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
    todo: { findMany: vi.fn().mockResolvedValue([]) },
    exam: { findMany: vi.fn().mockResolvedValue([]) },
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

  it('推荐时会读取未完成待办，待办临近截止时提示并优先近且快的店', async () => {
    const { service, prisma, merchants, weather, timetable } = makeHarness();
    prisma.user.findUnique.mockResolvedValue({ campusId: 'hemc' });
    prisma.userPreference.findUnique.mockResolvedValue(null);
    prisma.moodLog.findUnique.mockResolvedValue(null);
    prisma.mealFeedback.findMany.mockResolvedValue([]);
    prisma.todo.findMany.mockResolvedValue([
      {
        title: '提交高数作业',
        priority: 1,
        dueAt: new Date('2026-11-22T04:40:00.000Z'), // 北京 12:40
      },
    ]);
    prisma.exam.findMany.mockResolvedValue([]);
    timetable.data.mockResolvedValue({ semester: null, courses: [] });
    weather.get.mockResolvedValue({
      now: { temp: 22, feelsLike: 22, text: '晴', scene: 'sunny', humidity: 55 },
    });
    merchants.listApprovedForCampus.mockResolvedValue([
      makeMerchant({ id: 'far', name: '校外慢吃火锅', category: 'hotpot', walkMinutes: 20, tags: ['辣', '聚餐'] }),
      makeMerchant({ id: 'near', name: '一饭快餐窗口', category: 'canteen', walkMinutes: 3, tags: ['饭', '快手'] }),
    ]);

    const res = await service.recommendMeals('u1', {
      meal: 'lunch',
      now: new Date('2026-11-22T03:30:00.000Z'), // 北京 11:30
    });

    expect(res.scheduleHint).toContain('提交高数作业');
    expect(res.items[0]!.merchant.id).toBe('near');
  });

  it('连续两天均无课程和待办时，两天的推荐结果会每日随机错开', async () => {
    const { service, prisma, merchants, weather, timetable } = makeHarness();
    prisma.user.findUnique.mockResolvedValue({ campusId: 'hemc' });
    prisma.userPreference.findUnique.mockResolvedValue(null);
    prisma.moodLog.findUnique.mockResolvedValue(null);
    prisma.mealFeedback.findMany.mockResolvedValue([]);
    prisma.todo.findMany.mockResolvedValue([]);
    prisma.exam.findMany.mockResolvedValue([]);
    timetable.data.mockResolvedValue({ semester: null, courses: [] });
    weather.get.mockResolvedValue({
      now: { temp: 23, feelsLike: 23, text: '多云', scene: 'cloudy', humidity: 60 },
    });
    merchants.listApprovedForCampus.mockResolvedValue([
      makeMerchant({ id: 'm1', name: '一饭烧腊饭', category: 'canteen', walkMinutes: 4, tags: ['饭', '热食'] }),
      makeMerchant({ id: 'm2', name: '潮汕牛肉汤粉', category: 'noodle', walkMinutes: 5, tags: ['面', '汤'] }),
      makeMerchant({ id: 'm3', name: '芝士烤盘饭', category: 'fastfood', walkMinutes: 5, tags: ['饭', '饱腹'] }),
      makeMerchant({ id: 'm4', name: '南亭粤菜小炒', category: 'restaurant', walkMinutes: 7, tags: ['清淡', '饭'] }),
      makeMerchant({ id: 'm5', name: '广式糖水铺', category: 'dessert', walkMinutes: 5, tags: ['甜品', '凉食'] }),
    ]);

    const day1First = await service.recommendMeals('u1', {
      meal: 'lunch',
      now: new Date('2026-11-22T03:30:00.000Z'),
    });
    const day1Again = await service.recommendMeals('u1', {
      meal: 'lunch',
      now: new Date('2026-11-22T04:00:00.000Z'),
    });
    const day2 = await service.recommendMeals('u1', {
      meal: 'lunch',
      now: new Date('2026-11-23T03:30:00.000Z'),
    });

    expect(day1First.scheduleHint).toContain('随机');
    // 同一天两次请求稳定一致
    expect(day1Again.items.map((i) => i.merchant.id)).toEqual(day1First.items.map((i) => i.merchant.id));
    // 连续两天无安排时首推不同
    expect(day2.items[0]!.merchant.id).not.toBe(day1First.items[0]!.merchant.id);
  });
});
