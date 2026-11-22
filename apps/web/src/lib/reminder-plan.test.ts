import type { TimetableData, Todo } from '@gduthelp/shared';
import { describe, expect, it } from 'vitest';
import { notificationId, planClassReminders, planReminders, TEST_NOTIFICATION_ID } from './reminder-plan';

const now = new Date('2026-11-20T02:00:00Z'); // 北京时间 10:00
const iso = (minutesFromNow: number) => new Date(now.getTime() + minutesFromNow * 60_000).toISOString();

function todo(over: Partial<Todo> = {}): Todo {
  return {
    id: 't1',
    title: '交实验报告',
    note: null,
    dueAt: iso(120),
    priority: 3,
    repeat: 'none',
    completedAt: null,
    createdAt: iso(-60),
    reminders: [{ id: 'r1', offsetMinutes: 30, fireAt: iso(90), status: 'pending' }],
    ...over,
  };
}

describe('planReminders', () => {
  it('schedules pending future reminders with the server wording', () => {
    const [p, ...rest] = planReminders([todo()], now);
    expect(rest).toHaveLength(0);
    expect(p).toMatchObject({ todoId: 't1', title: '交实验报告', id: notificationId('r1') });
    expect(p!.at.toISOString()).toBe(iso(90));
    // 文案按触发时刻计算：触发时离截止还有 30 分钟
    expect(p!.body).toBe('截止 今天 12:00，还有 30 分钟');
  });

  it('skips completed todos, sent/cancelled/past reminders and ones beyond 7 days', () => {
    const plans = planReminders(
      [
        todo({ id: 'done', completedAt: iso(-1) }),
        todo({
          id: 't2',
          reminders: [
            { id: 'sent', offsetMinutes: null, fireAt: iso(10), status: 'sent' },
            { id: 'cancel', offsetMinutes: null, fireAt: iso(10), status: 'cancelled' },
            { id: 'past', offsetMinutes: null, fireAt: iso(-5), status: 'pending' },
            { id: 'far', offsetMinutes: null, fireAt: iso(8 * 24 * 60), status: 'pending' },
            { id: 'ok', offsetMinutes: null, fireAt: iso(5), status: 'pending' },
          ],
        }),
      ],
      now,
    );
    expect(plans.map((p) => p.id)).toEqual([notificationId('ok')]);
  });

  it('orders by time and caps the count', () => {
    const reminders = Array.from({ length: 80 }, (_, i) => ({
      id: `r${i}`,
      offsetMinutes: null,
      fireAt: iso(80 - i),
      status: 'pending' as const,
    }));
    const plans = planReminders([todo({ dueAt: null, reminders })], now);
    expect(plans).toHaveLength(64);
    expect(plans[0]!.at.toISOString()).toBe(iso(1));
    expect(plans[0]!.body).toBe('提醒时间到了');
  });
});

describe('notificationId', () => {
  it('is stable, positive 32-bit and never the test id', () => {
    const id = notificationId('3f2c1d4e-0000-4000-8000-000000000000');
    expect(id).toBe(notificationId('3f2c1d4e-0000-4000-8000-000000000000'));
    expect(id).toBeGreaterThan(TEST_NOTIFICATION_ID);
    expect(id).toBeLessThanOrEqual(0x7fffffff);
    expect(notificationId('a')).not.toBe(notificationId('b'));
  });
});

describe('planClassReminders', () => {
  it('plans upcoming class reminders within 7 days', () => {
    // 2026-09-07 为周一 08:00，第 1 节 08:30 开始，提前 15 分钟 = 08:15
    const base = new Date('2026-09-07T08:00:00+08:00');
    const tt: TimetableData = {
      semester: { id: 's1', name: '2026秋', startDate: '2026-09-07', totalWeeks: 18 },
      courses: [
        {
          id: 'c1',
          name: '大学物理',
          teacher: '李老师',
          location: '教2-101',
          color: '#64b5f6',
          source: 'manual',
          importKey: null,
          slots: [{ id: 'sl1', weekday: 1, periodStart: 1, periodEnd: 2, weeks: [1, 2], location: null }],
        },
      ],
    };
    const plans = planClassReminders(tt, 'hemc', 15, base);
    expect(plans.length).toBeGreaterThanOrEqual(1);
    expect(plans[0]!.title).toBe('15 分钟后上课：大学物理');
    expect(plans[0]!.body).toContain('08:30');
    expect(plans[0]!.body).toContain('教2-101');
    expect(plans[0]!.link).toBe('/timetable');
  });
});
