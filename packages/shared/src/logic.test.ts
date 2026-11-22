import { describe, expect, it } from 'vitest';
import { compareSemver } from './app-update.js';
import { addDays, daysBetween, parseDate, shanghaiDate, shanghaiTime, today } from './time.js';
import { semesterInputSchema } from './timetable-schema.js';
import { alignToMonday, dateOf, defaultGdutSemester, sessionsOn, weekOf, type TimetableData } from './timetable.js';
import { reminderFireAt, todoInputSchema } from './todo.js';

describe('北京时间', () => {
  it('UTC 16:30 已经是北京时间第二天', () => {
    const at = new Date('2026-09-06T16:30:00Z');
    expect(today(at)).toBe('2026-09-07');
    expect(shanghaiDate(at).weekday).toBe(1);
  });

  it('把北京时间换算成绝对时间', () => {
    expect(shanghaiTime('2026-09-07', '08:30').toISOString()).toBe('2026-09-07T00:30:00.000Z');
  });

  it('日期加减与相差天数，跨月跨年正确', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(daysBetween('2026-02-27', '2026-03-02')).toBe(3);
    expect(parseDate('2026-11-22').weekday).toBe(7);
  });
});

const semester = { id: 's', name: '2026秋', startDate: '2026-09-07', totalWeeks: 18 };

describe('学期周次', () => {
  it('开学当天为第 1 周，第 8 天为第 2 周', () => {
    expect(weekOf(semester, '2026-09-07')).toBe(1);
    expect(weekOf(semester, '2026-09-13')).toBe(1);
    expect(weekOf(semester, '2026-09-14')).toBe(2);
  });

  it('开学前和学期结束后返回 null', () => {
    expect(weekOf(semester, '2026-09-06')).toBeNull();
    expect(weekOf(semester, addDays('2026-09-07', 18 * 7))).toBeNull();
  });

  it('dateOf 是 weekOf 的反函数', () => {
    expect(dateOf(semester, 3, 5)).toBe('2026-09-25');
    expect(weekOf(semester, dateOf(semester, 3, 5))).toBe(3);
  });

  it('开学日期必须是周一', () => {
    expect(semesterInputSchema.safeParse({ name: 'x', startDate: '2026-09-08', totalWeeks: 18 }).success).toBe(false);
    expect(semesterInputSchema.safeParse({ name: 'x', startDate: '2026-09-07', totalWeeks: 18 }).success).toBe(true);
  });

  it('若数据库开学日期意外偏到周日，自动兜底对齐到周一避免整周错位', () => {
    const shifted = { startDate: '2026-08-30', totalWeeks: 20 }; // 周日
    expect(alignToMonday('2026-08-30')).toBe('2026-08-31'); // 对齐到周一
    expect(weekOf(shifted, '2026-11-22')).toBe(12); // 11月22日（周日）属于第 12 周
    expect(dateOf(shifted, 12, 1)).toBe('2026-11-16'); // 第 12 周周一
    expect(dateOf(shifted, 12, 7)).toBe('2026-11-22'); // 第 12 周周日正好是今天
  });
});

describe('某天的课', () => {
  const data: TimetableData = {
    semester,
    courses: [
      {
        id: 'math',
        name: '高等数学',
        teacher: null,
        location: '教3-305',
        color: '#64b5f6',
        slots: [
          { id: 'a', weekday: 1, periodStart: 3, periodEnd: 4, weeks: [1, 3, 5], location: null },
          { id: 'b', weekday: 1, periodStart: 1, periodEnd: 2, weeks: [1], location: '教1-101' },
        ],
      },
    ],
  };

  it('按周次过滤、按开始时间排序，时间段的教室优先于课程的教室', () => {
    const s = sessionsOn(data, '2026-09-07', 'hemc');
    expect(s.map((x) => x.periodStart)).toEqual([1, 3]);
    expect(s[0]!.location).toBe('教1-101');
    expect(s[1]!.location).toBe('教3-305');
    expect(s[1]!.start).toBe(shanghaiTime('2026-09-07', '10:25').toISOString());
  });

  it('不在上课周没有课', () => {
    expect(sessionsOn(data, '2026-09-14', 'hemc')).toEqual([]);
  });
});

describe('待办提醒', () => {
  it('截止前 N 分钟', () => {
    expect(reminderFireAt({ offsetMinutes: 60 }, '2026-09-07T10:00:00.000Z')?.toISOString()).toBe('2026-09-07T09:00:00.000Z');
    expect(reminderFireAt({ offsetMinutes: 60 }, null)).toBeNull();
  });

  it('没有截止时间时不能用「截止前提醒」', () => {
    expect(todoInputSchema.safeParse({ title: 'x', reminders: [{ offsetMinutes: 10 }] }).success).toBe(false);
    expect(todoInputSchema.safeParse({ title: 'x', reminders: [{ at: '2026-09-07T10:00:00+08:00' }] }).success).toBe(true);
  });
});

describe('默认学期与热更新版本比较', () => {
  it('defaultGdutSemester 生成合法的周一开学默认学期', () => {
    const autumn = defaultGdutSemester(new Date('2026-11-21T08:00:00+08:00'));
    expect(autumn.name).toBe('2026秋季学期');
    expect(parseDate(autumn.startDate).weekday).toBe(1);
    expect(autumn.totalWeeks).toBe(20);

    const spring = defaultGdutSemester(new Date('2027-03-10T08:00:00+08:00'));
    expect(spring.name).toBe('2027春季学期');
    expect(parseDate(spring.startDate).weekday).toBe(1);
  });

  it('compareSemver 正确比较主次修订号', () => {
    expect(compareSemver('0.2.1', '0.2.0')).toBeGreaterThan(0);
    expect(compareSemver('v1.0.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareSemver('0.2.0', '0.2.0')).toBe(0);
    expect(compareSemver('0.1.9', '0.2.0')).toBeLessThan(0);
  });
});
