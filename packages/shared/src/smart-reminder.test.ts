import { describe, expect, it } from 'vitest';
import { avoidQuietHours, computeSmartReminders, findFreeSlotHint } from './smart-reminder.js';
import { shanghaiTime } from './time.js';
import type { TimetableData } from './timetable.js';

const timetable: TimetableData = {
  semester: { id: 's1', name: '2026秋', startDate: '2026-09-07', totalWeeks: 20 },
  courses: [
    {
      id: 'c1',
      name: '高等数学',
      teacher: '张老师',
      location: '教3-201',
      color: '#4D9FFF',
      source: 'manual',
      importKey: null,
      slots: [
        // 第 11 周周六（2026-11-21）第 3–4 节（10:25–12:00）
        { id: 'sl1', weekday: 6, periodStart: 3, periodEnd: 4, weeks: [11], location: null },
        // 第 11 周周六第 5–6 节（13:50–15:25）
        { id: 'sl2', weekday: 6, periodStart: 5, periodEnd: 6, weeks: [11], location: null },
      ],
    },
  ],
};

describe('智能提醒计算', () => {
  it('落在深夜免打扰时段（23:30–07:30）会挪到前一天 22:00', () => {
    const late = shanghaiTime('2026-11-21', '01:30');
    const shifted = avoidQuietHours(late);
    expect(shifted.shifted).toBe(true);
    expect(shifted.time.toISOString()).toBe(shanghaiTime('2026-11-20', '22:00').toISOString());

    const day = shanghaiTime('2026-11-21', '14:00');
    expect(avoidQuietHours(day).shifted).toBe(false);
  });

  it('落在上课时间内时自动挪到课前 10 分钟', () => {
    // 截止 14:00，P3 提前 3 小时是 11:00，正好撞上 10:25–12:00 的高等数学 → 应挪到 10:15
    const plan = computeSmartReminders({
      dueAt: shanghaiTime('2026-11-21', '14:00').toISOString(),
      priority: 3,
      timetable,
      campusId: 'hemc',
      now: shanghaiTime('2026-11-21', '08:00'),
    });
    expect(plan.reminders).toHaveLength(1);
    expect(plan.reminders[0]!.at).toBe(shanghaiTime('2026-11-21', '10:15').toISOString());
    expect(plan.reminders[0]!.reason).toContain('高等数学');
  });

  it('能找出截止前 24 小时内 ≥ 2 小时的空闲时段', () => {
    const hint = findFreeSlotHint(
      timetable,
      'hemc',
      shanghaiTime('2026-11-21', '22:00'),
      shanghaiTime('2026-11-21', '15:00'),
    );
    expect(hint).toContain('今天');
    expect(hint).toContain('没课');
  });
});
