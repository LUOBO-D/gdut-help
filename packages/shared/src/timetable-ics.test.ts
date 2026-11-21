import { describe, expect, it } from 'vitest';
import { parseTimetableImport } from './timetable-import.js';

describe('标准 ICS 课表导入', () => {
  it('能解析 VEVENT 与 WEEKLY RRULE 并换算为广工节次与周次', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'SUMMARY:数据结构',
      'LOCATION:教1-302',
      'DESCRIPTION:老师：李教授',
      'DTSTART:20260907T083000',
      'DTEND:20260907T100500',
      'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=4',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const res = parseTimetableImport(ics, { semesterStartDate: '2026-09-07', totalWeeks: 20, campusId: 'hemc' });
    expect(res.courses).toHaveLength(1);
    expect(res.courses[0]!.name).toBe('数据结构');
    expect(res.courses[0]!.teacher).toBe('李教授');
    expect(res.courses[0]!.location).toBe('教1-302');
    expect(res.courses[0]!.slots[0]).toMatchObject({
      weekday: 1,
      periodStart: 1,
      periodEnd: 2,
      weeks: [1, 2, 3, 4],
    });
  });
});
