import { describe, expect, it } from 'vitest';
import {
  buildCalendarWeeks,
  calendarTermProgress,
  findCalendarTermForDate,
  upcomingTermMilestones,
} from './calendar.js';
import { currentPeriodBlock, parseEmptyClassrooms, periodBlocksFor } from './campus-services.js';

describe('广工官方校历引擎', () => {
  it('能按日期准确匹配 2026-2027 秋季学期并计算当前周次与寒假倒计时', () => {
    const term = findCalendarTermForDate('2026-11-23');
    expect(term.code).toBe('202601');

    const progress = calendarTermProgress(term, '2026-11-23');
    expect(progress.status).toBe('in-term');
    expect(progress.currentWeek).toBe(13); // 2026-08-31 第1周 → 12周+1 = 第13周
    expect(progress.daysToVacation).toBe(54); // 2026-11-23 → 2027-01-16

    const weeks = buildCalendarWeeks(term);
    expect(weeks).toHaveLength(20);
    expect(weeks[0]!.monday).toBe('2026-08-31');
    expect(weeks[10]!.events.some((e) => e.title.includes('运动会'))).toBe(true);
    expect(weeks[18]!.isExamWeek).toBe(true);

    const upcoming = upcomingTermMilestones(term, '2026-11-23');
    expect(upcoming[0]!.title).toContain('元旦');
    expect(upcoming[0]!.daysLeft).toBe(39);
  });

  it('在寒假期间能正确识别为假期状态并统计剩余假期天数', () => {
    const term = findCalendarTermForDate('2027-01-20');
    const progress = calendarTermProgress(term, '2027-01-20');
    expect(progress.status).toBe('vacation');
    expect(progress.daysLeftInVacation).toBeGreaterThan(30);
  });
});

describe('空教室解析与节次推算', () => {
  it('能解析乘方教务空教室 JSON 并自动关联 3D 校园地图建筑', () => {
    const raw = JSON.stringify({
      total: 2,
      rows: [
        { jxcdmc: '教3-305', jxlmc: '教3', zws: '90', cdlbmc: '多媒体教室', xqmc: '大学城校区' },
        { jxcdmc: '工学一号馆202', zws: '60', xqmc: '大学城校区' },
      ],
    });

    const rooms = parseEmptyClassrooms(raw);
    expect(rooms).toHaveLength(2);
    const j3 = rooms.find((r) => r.name === '教3-305');
    expect(j3?.seats).toBe(90);
    expect(j3?.mapBuildingId).toBeTruthy();
  });

  it('能按北京时间推算当前所属或即将开始的 2 节连堂节次块', () => {
    const blocks = periodBlocksFor('hemc');
    expect(blocks).toHaveLength(6);

    // 北京 09:00 → 1-2 节 (08:30–10:05)
    expect(currentPeriodBlock(new Date('2026-11-23T01:00:00.000Z'), 'hemc').code).toBe('0102');
    // 北京 14:30 → 5-6 节 (13:50–15:25)
    expect(currentPeriodBlock(new Date('2026-11-23T06:30:00.000Z'), 'hemc').code).toBe('0506');
  });
});
