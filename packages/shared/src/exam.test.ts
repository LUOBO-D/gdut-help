import { describe, expect, it } from 'vitest';
import { diffExamImport, parseExamDateAndTimes, parseExamImport } from './exam-import.js';
import { examInputSchema } from './exam-schema.js';
import { examCountdownText, examStatus, nextUpcomingExam, sortExams, type Exam } from './exam.js';

describe('exam logic & countdown', () => {
  const baseExam: Exam = {
    id: 'e1',
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
    importKey: 'code:math1|2027-01-08|期末考试',
  };

  it('computes status and countdown text accurately in Beijing time', () => {
    expect(examStatus(baseExam, new Date('2027-01-03T04:00:00Z'))).toBe('upcoming');
    expect(examCountdownText(baseExam, new Date('2027-01-03T04:00:00Z'))).toBe('还剩 5 天');
    expect(examCountdownText(baseExam, new Date('2027-01-07T04:00:00Z'))).toBe('明天 08:30');
    expect(examStatus(baseExam, new Date('2027-01-08T00:00:00Z'))).toBe('today'); // 08:00 CST
    expect(examCountdownText(baseExam, new Date('2027-01-08T00:00:00Z'))).toBe('30 分钟后开考');
    expect(examStatus(baseExam, new Date('2027-01-08T01:00:00Z'))).toBe('ongoing'); // 09:00 CST
    expect(examStatus(baseExam, new Date('2027-01-08T03:00:00Z'))).toBe('finished'); // 11:00 CST
  });

  it('sorts active exams ascending and finished exams descending at the end', () => {
    const past: Exam = { ...baseExam, id: 'p', examDate: '2027-01-02' };
    const soon: Exam = { ...baseExam, id: 's', examDate: '2027-01-06' };
    const later: Exam = { ...baseExam, id: 'l', examDate: '2027-01-10' };
    const now = new Date('2027-01-05T04:00:00Z');
    expect(sortExams([later, past, soon], now).map((e) => e.id)).toEqual(['s', 'l', 'p']);
    expect(nextUpcomingExam([later, past, soon], now)?.id).toBe('s');
  });

  it('validates examInputSchema endTime > startTime', () => {
    expect(
      examInputSchema.safeParse({
        courseName: '数据结构',
        examDate: '2027-01-09',
        startTime: '14:00',
        endTime: '16:00',
      }).success,
    ).toBe(true);
    expect(
      examInputSchema.safeParse({
        courseName: '数据结构',
        examDate: '2027-01-09',
        startTime: '16:00',
        endTime: '14:00',
      }).success,
    ).toBe(false);
  });
});

describe('parseExamImport & diffExamImport', () => {
  it('parses GDUT Chengfang JW getDataList JSON rows', () => {
    const raw = JSON.stringify({
      total: 2,
      rows: [
        {
          kcdm: '00123',
          kcmc: '高等数学A(1)',
          ksrq: '2027-01-08',
          kssj: '08:30-10:30',
          kscdmc: '教3-305',
          zwh: '18',
          ksaplxmc: '期末考试',
          xqmc: '大学城校区',
        },
        {
          kcdm: '00456',
          kcmc: '大学英语(3)',
          kssj: '2027-01-10(14:30-16:30)',
          kscdmc: '教2-201(座位号:09)',
          ksfsmc: '闭卷',
        },
      ],
    });

    const res = parseExamImport(raw);
    expect(res.warnings).toEqual([]);
    expect(res.exams).toHaveLength(2);
    expect(res.exams[0]).toMatchObject({
      courseName: '高等数学A(1)',
      examDate: '2027-01-08',
      startTime: '08:30',
      endTime: '10:30',
      location: '教3-305',
      seatNo: '18',
      examType: '期末考试',
      campus: '大学城校区',
    });
    expect(res.exams[1]).toMatchObject({
      courseName: '大学英语(3)',
      examDate: '2027-01-10',
      startTime: '14:30',
      endTime: '16:30',
      location: '教2-201',
      seatNo: '09',
      examType: '闭卷',
    });
  });

  it('parses browser-copied TSV and HTML tables', () => {
    const tsv = '课程名称\t考试时间\t考场地点\t座位号\n离散数学\t2027年1月12日 09:00~11:00\t教1-105\t24号';
    const r1 = parseExamImport(tsv);
    expect(r1.exams).toHaveLength(1);
    expect(r1.exams[0]).toMatchObject({
      courseName: '离散数学',
      examDate: '2027-01-12',
      startTime: '09:00',
      endTime: '11:00',
      location: '教1-105',
      seatNo: '24',
    });

    const html = '<table><tr><th>课程名称</th><th>考试日期</th><th>考试时间</th><th>考场</th></tr><tr><td>线性代数</td><td>2027-01-14</td><td>14:00-16:00</td><td>教4-402</td></tr></table>';
    const r2 = parseExamImport(html);
    expect(r2.exams).toHaveLength(1);
    expect(r2.exams[0]?.location).toBe('教4-402');
  });

  it('handles single start time gracefully by defaulting +2h', () => {
    expect(parseExamDateAndTimes({ examDate: '2027-01-08', startTime: '09:00' })).toEqual({
      examDate: '2027-01-08',
      startTime: '09:00',
      endTime: '11:00',
    });
  });

  it('diffs imported exams cleanly while ignoring manual exams', () => {
    const existing: Exam[] = [
      {
        id: 'manual-1',
        courseName: '英语六级 CET-6',
        examDate: '2026-12-12',
        startTime: '15:00',
        endTime: '17:25',
        location: '教1-201',
        seatNo: '5',
        examType: '等级考试',
        campus: '大学城校区',
        note: '带听力耳机',
        source: 'manual',
        importKey: null,
      },
      {
        id: 'imp-1',
        courseName: '高等数学',
        examDate: '2027-01-08',
        startTime: '08:30',
        endTime: '10:30',
        location: '教3-305',
        seatNo: '18',
        examType: '期末考试',
        campus: null,
        note: null,
        source: 'import',
        importKey: 'code:math|2027-01-08|期末考试',
      },
      {
        id: 'imp-2',
        courseName: '旧考试',
        examDate: '2027-01-09',
        startTime: '08:30',
        endTime: '10:30',
        location: null,
        seatNo: null,
        examType: null,
        campus: null,
        note: null,
        source: 'import',
        importKey: 'code:old|2027-01-09',
      },
    ];

    const diff = diffExamImport(existing, [
      {
        importKey: 'code:math|2027-01-08|期末考试',
        courseName: '高等数学',
        examDate: '2027-01-08',
        startTime: '08:30',
        endTime: '10:30',
        location: '教3-306', // 考场变动
        seatNo: '18',
        examType: '期末考试',
        campus: null,
        note: null,
      },
      {
        importKey: 'code:cs|2027-01-11|期末考试',
        courseName: '数据结构',
        examDate: '2027-01-11',
        startTime: '14:00',
        endTime: '16:00',
        location: '教2-102',
        seatNo: '12',
        examType: '期末考试',
        campus: null,
        note: null,
      },
    ]);

    expect(diff.added.map((e) => e.courseName)).toEqual(['数据结构']);
    expect(diff.changed.map((c) => c.after.location)).toEqual(['教3-306']);
    expect(diff.removed.map((e) => e.id)).toEqual(['imp-2']); // manual-1 不在 removed 里！
    expect(diff.unchanged).toBe(0);
  });
});
