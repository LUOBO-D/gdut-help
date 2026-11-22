import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { NotifyService } from '../notify/notify.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { TimetableService } from './timetable.service.js';
import { ClassReminderScheduler } from './class-reminder.scheduler.js';

describe('ClassReminderScheduler', () => {
  it('在课前提醒窗口内发送一次提醒并保证幂等不重复', async () => {
    // 2026-09-07（周一）第 1 节大学城 08:30 开始；08:15 刚好在提前 15 分钟窗口内
    const now = new Date('2026-09-07T08:15:00+08:00');
    const createdKeys = new Set<string>();
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([{ id: 'u1', campusId: 'hemc', classRemindMinutes: 15 }]),
      },
      classNotifyLog: {
        create: vi.fn().mockImplementation(({ data }: { data: { userId: string; date: string; courseId: string; periodStart: number } }) => {
          const k = `${data.userId}:${data.date}:${data.courseId}:${data.periodStart}`;
          if (createdKeys.has(k)) throw new Error('Unique constraint failed');
          createdKeys.add(k);
          return Promise.resolve({ id: 'log-1' });
        }),
      },
    } as unknown as PrismaService;

    const timetable = {
      data: vi.fn().mockResolvedValue({
        semester: { id: 's1', name: '2026秋', startDate: '2026-09-07', totalWeeks: 18 },
        courses: [
          {
            id: 'c1',
            name: '高等数学',
            teacher: '张老师',
            location: '教3-305',
            color: '#64b5f6',
            source: 'manual',
            importKey: null,
            slots: [{ id: 'sl1', weekday: 1, periodStart: 1, periodEnd: 2, weeks: [1, 2], location: null }],
          },
        ],
      }),
    } as unknown as TimetableService;

    const notifyFn = vi.fn().mockResolvedValue(undefined);
    const notify = { notify: notifyFn } as unknown as NotifyService;
    const scheduler = new ClassReminderScheduler(prisma, timetable, notify, { NODE_ENV: 'test' } as Env);

    const first = await scheduler.tick(now);
    const second = await scheduler.tick(new Date('2026-09-07T08:18:00+08:00'));

    expect(first).toBe(1);
    expect(second).toBe(0);
    expect(notifyFn).toHaveBeenCalledTimes(1);
    expect(notifyFn).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        title: '15 分钟后上课：高等数学',
        link: '/timetable',
      }),
    );
  });

  it('未到课前窗口或已开课后不发送提醒', async () => {
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([{ id: 'u1', campusId: 'hemc', classRemindMinutes: 15 }]),
      },
      classNotifyLog: { create: vi.fn() },
    } as unknown as PrismaService;
    const timetable = {
      data: vi.fn().mockResolvedValue({
        semester: { id: 's1', name: '2026秋', startDate: '2026-09-07', totalWeeks: 18 },
        courses: [
          {
            id: 'c1',
            name: '高等数学',
            teacher: null,
            location: '教3-305',
            color: '#64b5f6',
            source: 'manual',
            importKey: null,
            slots: [{ id: 'sl1', weekday: 1, periodStart: 1, periodEnd: 2, weeks: [1], location: null }],
          },
        ],
      }),
    } as unknown as TimetableService;
    const notifyFn = vi.fn();
    const notify = { notify: notifyFn } as unknown as NotifyService;
    const scheduler = new ClassReminderScheduler(prisma, timetable, notify, { NODE_ENV: 'test' } as Env);

    // 08:00 距离 08:30 还有 30 分钟，未到 15 分钟窗口
    expect(await scheduler.tick(new Date('2026-09-07T08:00:00+08:00'))).toBe(0);
    // 08:31 已经开课
    expect(await scheduler.tick(new Date('2026-09-07T08:31:00+08:00'))).toBe(0);
    expect(notifyFn).not.toHaveBeenCalled();
  });
});
