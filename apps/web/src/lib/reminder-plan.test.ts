import type { CourseSelectionReminder, ExamData, TimetableData, Todo } from '@gduthelp/shared';
import { describe, expect, it } from 'vitest';
import {
  notificationId,
  planClassReminders,
  planExamReminders,
  planReminders,
  planSelectionReminders,
  TEST_NOTIFICATION_ID,
} from './reminder-plan';

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

describe('planExamReminders', () => {
  it('plans eve 20:00 and 1h-before exam notifications within 7 days', () => {
    const base = new Date('2027-01-06T12:00:00+08:00');
    const examData: ExamData = {
      semester: { id: 's1', name: '2026秋', startDate: '2026-08-31', totalWeeks: 20 },
      exams: [
        {
          id: 'ex-1',
          courseName: '高等数学A(1)',
          examDate: '2027-01-08',
          startTime: '08:30',
          endTime: '10:30',
          location: '教3-305',
          seatNo: '18',
          examType: '期末考试',
          campus: '大学城校区',
          note: null,
          source: 'import',
          importKey: 'code:math|2027-01-08',
        },
      ],
    };
    const plans = planExamReminders(examData, base);
    expect(plans).toHaveLength(2);
    expect(plans[0]!.title).toBe('明天考试：高等数学A(1)');
    expect(plans[0]!.body).toContain('教3-305');
    expect(plans[0]!.body).toContain('座位 18');
    expect(plans[0]!.link).toBe('/timetable?view=exam');
    expect(plans[1]!.title).toBe('1 小时后开考：高等数学A(1)');
    expect(plans[1]!.at.toISOString()).toBe(new Date('2027-01-08T07:30:00+08:00').toISOString());
  });
});

describe('planSelectionReminders', () => {
  it('plans multi-lead local notifications for enabled upcoming course selection rounds', () => {
    const base = new Date('2026-12-20T10:00:00+08:00');
    const items: CourseSelectionReminder[] = [
      {
        id: 'sel-1',
        title: '公共选修课正选',
        kind: 'elective',
        startAt: '2026-12-21T12:30:00+08:00',
        endAt: '2026-12-23T17:00:00+08:00',
        enabled: true,
        leadMinutes: [1440, 30, 5],
        note: '备好公选课号',
        source: 'manual',
        createdAt: '2026-12-10T00:00:00Z',
      },
      {
        id: 'sel-off',
        title: '已关闭提醒',
        kind: 'pe',
        startAt: '2026-12-21T12:30:00+08:00',
        endAt: null,
        enabled: false,
        leadMinutes: [30],
        note: null,
        source: 'manual',
        createdAt: '2026-12-10T00:00:00Z',
      },
    ];
    const plans = planSelectionReminders(items, base);
    expect(plans).toHaveLength(3);
    expect(plans[0]!.title).toBe('选课提醒（1 天后开始）：公共选修课正选');
    expect(plans[1]!.title).toBe('选课提醒（30 分钟后开始）：公共选修课正选');
    expect(plans[2]!.title).toBe('选课提醒（5 分钟后开始）：公共选修课正选');
    expect(plans[2]!.link).toBe('/study?tab=reviews');
  });
});
