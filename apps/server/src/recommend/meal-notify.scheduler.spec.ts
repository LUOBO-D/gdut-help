import { shanghaiTime } from '@gduthelp/shared';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { NotifyService } from '../notify/notify.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { activeMealWindow, MealNotifyScheduler } from './meal-notify.scheduler.js';
import type { RecommendService } from './recommend.service.js';

describe('MealNotifyScheduler', () => {
  it('只在午饭（11:25–11:55）和晚饭（17:15–17:45）窗口触发', () => {
    expect(activeMealWindow(shanghaiTime('2026-11-21', '11:30'))).toBe('lunch');
    expect(activeMealWindow(shanghaiTime('2026-11-21', '14:00'))).toBeNull();
    expect(activeMealWindow(shanghaiTime('2026-11-21', '17:20'))).toBe('dinner');
  });

  it('为开启开关且当天未推送的用户发一条推荐通知并写幂等日志', async () => {
    const prisma = {
      user: { findMany: vi.fn().mockResolvedValue([{ id: 'u1' }]) },
      mealNotifyLog: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'l1' }),
      },
    };
    const recommend = {
      recommendMeals: vi.fn().mockResolvedValue({
        items: [
          {
            merchant: { id: 'm1', name: '二饭煲仔饭', locationText: '二饭三楼', priceAvg: 16 },
            reason: '下雨天来口热乎的',
          },
        ],
      }),
    };
    const notify = { notify: vi.fn().mockResolvedValue({ push: { sent: 0, failed: 0, removed: 0 }, email: 'skipped' }) };

    const scheduler = new MealNotifyScheduler(
      prisma as unknown as PrismaService,
      recommend as unknown as RecommendService,
      notify as unknown as NotifyService,
      { NODE_ENV: 'test' } as Env,
    );

    const sent = await scheduler.tick(shanghaiTime('2026-11-21', '11:30'));
    expect(sent).toBe(1);
    expect(prisma.mealNotifyLog.create).toHaveBeenCalledWith({
      data: { userId: 'u1', date: '2026-11-21', meal: 'lunch', merchantId: 'm1' },
    });
    expect(notify.notify).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ title: '午饭推荐：二饭煲仔饭', link: '/food' }),
    );
  });
});
