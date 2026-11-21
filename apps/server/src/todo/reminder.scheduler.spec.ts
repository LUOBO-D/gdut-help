import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { NotifyService } from '../notify/notify.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ReminderScheduler } from './reminder.scheduler.js';

describe('ReminderScheduler', () => {
  it('单条提醒发送失败且回滚也失败时，不影响同批次后续提醒正常投递', async () => {
    const now = new Date('2026-11-21T06:00:00.000Z');
    const prisma = {
      reminder: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([
          { id: 'r1', userId: 'u1', todoId: 't1', fireAt: now, todo: { title: '第一条', dueAt: null } },
          { id: 'r2', userId: 'u1', todoId: 't2', fireAt: now, todo: { title: '第二条', dueAt: null } },
        ]),
        update: vi.fn().mockRejectedValue(new Error('transient db glitch')),
      },
    };
    const notify = {
      notify: vi
        .fn()
        .mockRejectedValueOnce(new Error('notify down'))
        .mockResolvedValueOnce({ push: { sent: 0, failed: 0, removed: 0 }, email: 'skipped' }),
    };

    const scheduler = new ReminderScheduler(
      prisma as unknown as PrismaService,
      notify as unknown as NotifyService,
      { NODE_ENV: 'test', REMINDER_POLL_SECONDS: 15 } as Env,
    );

    const sent = await scheduler.tick(now);
    expect(sent).toBe(1);
    expect(notify.notify).toHaveBeenCalledTimes(2);
  });
});
