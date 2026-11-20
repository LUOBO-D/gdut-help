import { describe, expect, it } from 'vitest';
import {
  diffImport,
  importKeyOf,
  parsePeriods,
  parseTimetableImport,
  parseWeekday,
  parseWeeks,
  type ExistingCourse,
} from './timetable-import.js';

describe('field parsers', () => {
  it('reads weekdays in numbers and Chinese', () => {
    expect(parseWeekday('3')).toBe(3);
    expect(parseWeekday(7)).toBe(7);
    expect(parseWeekday('星期日')).toBe(7);
    expect(parseWeekday('周二')).toBe(2);
    expect(parseWeekday('8')).toBeNull();
  });

  it('reads period codes', () => {
    expect(parsePeriods('0102')).toEqual([1, 2]);
    expect(parsePeriods('030405')).toEqual([3, 5]);
    expect(parsePeriods('01,02')).toEqual([1, 2]);
    expect(parsePeriods('第3-4节')).toEqual([3, 4]);
    expect(parsePeriods('10')).toEqual([10, 10]);
    expect(parsePeriods('')).toBeNull();
  });

  it('reads week lists with ranges and odd/even', () => {
    expect(parseWeeks('1-4')).toEqual([1, 2, 3, 4]);
    expect(parseWeeks('1,3,5-7')).toEqual([1, 3, 5, 6, 7]);
    expect(parseWeeks('1-8单')).toEqual([1, 3, 5, 7]);
    expect(parseWeeks('2-8(双)周')).toEqual([2, 4, 6, 8]);
    expect(parseWeeks([3, 1, 1])).toEqual([1, 3]);
  });
});

describe('parseTimetableImport', () => {
  it('parses pinyin-keyed records nested in a response and merges per-week rows', () => {
    const raw = JSON.stringify({
      code: 0,
      data: [
        { kcmc: '高等数学A', teaxms: '张三', jxcdmc: '教1-101', xq: '1', jcdm: '0102', zcs: '1,2,3' },
        { kcmc: '高等数学A', teaxms: '张三', jxcdmc: '教1-101', xq: '1', jcdm: '0102', zcs: '4' },
        { kcmc: '高等数学A', teaxms: '张三', jxcdmc: '教1-101', xq: '3', jcdm: '0304', zcs: '1-4' },
        { kcmc: '大学英语', teaxms: '李四', jxcdmc: '外语楼201', xq: '2', jcdm: '0506', zcs: '1-8单' },
        { kcmc: '大学英语', teaxms: '李四', jxcdmc: '外语楼305', xq: '4', jcdm: '0102', zcs: '1-8' },
      ],
    });
    const { courses, warnings, records } = parseTimetableImport(raw);
    expect(records).toBe(5);
    expect(warnings).toEqual([]);
    expect(courses).toHaveLength(2);
    const math = courses[0]!;
    expect(math).toMatchObject({ name: '高等数学A', teacher: '张三', location: '教1-101', importKey: importKeyOf('高等数学A', '张三') });
    expect(math.slots).toEqual([
      { weekday: 1, periodStart: 1, periodEnd: 2, weeks: [1, 2, 3, 4], location: null },
      { weekday: 3, periodStart: 3, periodEnd: 4, weeks: [1, 2, 3, 4], location: null },
    ]);
    // 两个时间段在不同教室：教室留在时间段上
    const english = courses[1]!;
    expect(english.location).toBeNull();
    expect(english.slots.map((s) => [s.location, s.weeks])).toEqual([
      ['外语楼201', [1, 3, 5, 7]],
      ['外语楼305', [1, 2, 3, 4, 5, 6, 7, 8]],
    ]);
  });

  it('parses Chinese-keyed rows with separate start/end periods', () => {
    const raw = JSON.stringify([{ 课程名称: '数据结构', 教师: '王五', 星期: '星期五', 开始节次: 6, 结束节次: 7, 周次: '1-16', 教室: '实验楼3' }]);
    const { courses } = parseTimetableImport(raw);
    expect(courses[0]).toMatchObject({ name: '数据结构', location: '实验楼3' });
    expect(courses[0]!.slots[0]).toMatchObject({ weekday: 5, periodStart: 6, periodEnd: 7 });
    expect(courses[0]!.slots[0]!.weeks).toHaveLength(16);
  });

  it('explains bad input instead of throwing', () => {
    expect(parseTimetableImport('课程表 第一节').warnings[0]).toMatch(/不是有效的 JSON/);
    expect(parseTimetableImport('{"a":1}').warnings[0]).toMatch(/没有找到上课记录/);
    const partial = parseTimetableImport(JSON.stringify([{ kcmc: '体育', xq: '2', zcs: '1-16' }]));
    expect(partial.courses).toHaveLength(0);
    expect(partial.warnings[0]).toMatch(/体育.*节次/);
  });
});

describe('diffImport', () => {
  const slot = { weekday: 1, periodStart: 1, periodEnd: 2, weeks: [1, 2, 3], location: null };
  const existing = (over: Partial<ExistingCourse>): ExistingCourse => ({
    id: 'c',
    name: '高等数学A',
    teacher: '张三',
    location: '教1-101',
    source: 'import',
    importKey: importKeyOf('高等数学A', '张三'),
    slots: [slot],
    ...over,
  });

  it('classifies added, changed, removed and unchanged; ignores manual courses', () => {
    const before = [
      existing({ id: 'same' }),
      existing({ id: 'moved', name: '线性代数', teacher: null, importKey: importKeyOf('线性代数', null) }),
      existing({ id: 'gone', name: '体育', teacher: null, importKey: importKeyOf('体育', null) }),
      existing({ id: 'mine', name: '自习', source: 'manual', importKey: null }),
    ];
    const diff = diffImport(before, [
      { importKey: importKeyOf('高等数学A', '张三'), name: '高等数学A', teacher: '张三', location: '教1-101', slots: [slot] },
      { importKey: importKeyOf('线性代数', null), name: '线性代数', teacher: null, location: '教1-101', slots: [{ ...slot, weekday: 2 }] },
      { importKey: importKeyOf('大学物理', '赵六'), name: '大学物理', teacher: '赵六', location: null, slots: [slot] },
    ]);
    expect(diff.unchanged).toBe(1);
    expect(diff.changed.map((c) => c.before.id)).toEqual(['moved']);
    expect(diff.added.map((c) => c.name)).toEqual(['大学物理']);
    expect(diff.removed.map((c) => c.id)).toEqual(['gone']);
  });
});

describe('GDUT jxfw format', () => {
  // xsgrkbcx!getKbRq.action 的返回结构：[每周一条的记录, []]。人名和内容是编的
  const row = (over: Record<string, string>) => ({
    kcdm: '01115', kcmc: '电机控制', teaxms: '甲老师', zc: '1', jcdm: '0102', jcdm2: '01,02', xq: '2',
    jxcdmc: '教2-219', jxbmc: '开班', jxhjmc: '理论教学', tkbz: '1', sknrjj: '', ...over,
  });

  it('groups by course code, merges weekly rows and cleans teacher tags', () => {
    const raw = JSON.stringify([
      [
        row({ zc: '1' }),
        row({ zc: '2' }),
        row({ zc: '3', teaxms: '乙老师,甲老师[主讲]' }),
        row({ zc: '12', jcdm: '01020304', xq: '2', jxcdmc: '实2-209', teaxms: '丙老师', jxhjmc: '实验教学' }),
        row({ kcdm: '00920', kcmc: '大学物理(2)', teaxms: '丁老师', jcdm: '101112', xq: '1', jxcdmc: '教3-110', zc: '2' }),
      ],
      [],
    ]);
    const { courses, warnings, records } = parseTimetableImport(raw);
    expect(warnings).toEqual([]);
    expect(records).toBe(5);
    const motor = courses.find((c) => c.name === '电机控制')!;
    expect(motor.importKey).toBe('code:01115');
    expect(motor.teacher).toBe('甲老师、乙老师、丙老师');
    expect(motor.slots).toEqual([
      { weekday: 2, periodStart: 1, periodEnd: 2, weeks: [1, 2, 3], location: '教2-219' },
      { weekday: 2, periodStart: 1, periodEnd: 4, weeks: [12], location: '实2-209' },
    ]);
    const physics = courses.find((c) => c.name === '大学物理(2)')!;
    expect(physics).toMatchObject({ location: '教3-110', teacher: '丁老师' });
    expect(physics.slots[0]).toMatchObject({ weekday: 1, periodStart: 10, periodEnd: 12, weeks: [2] });
  });
});
