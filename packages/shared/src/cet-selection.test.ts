import { describe, expect, it } from 'vitest';
import { cetScoreTier, parseCetText, parseJwCetScores, summarizeCetRecords, type CetRecord } from './cet.js';
import {
  nextActiveSelection,
  parseJwSelectionWindows,
  selectionCountdownText,
  selectionStatus,
  type CourseSelectionReminder,
} from './course-selection.js';

describe('CET parser and summary', () => {
  it('parses pasted NEEA CET-4/CET-6 score text', () => {
    const parsed = parseCetText(
      '全国大学英语六级考试（2026年6月） 准考证号：440012261201234 总分：548 听力：185 阅读：205 写作和翻译：158 口试等级：B+',
    );
    expect(parsed).toEqual({
      level: 'cet6',
      examSession: '2026年6月',
      ticketNo: '440012261201234',
      totalScore: 548,
      listening: 185,
      reading: 205,
      writing: 158,
      oralGrade: 'B+',
    });
  });

  it('auto-sums total score when only sub-scores are pasted', () => {
    const parsed = parseCetText('英语四级 2025年12月 听力 170 阅读 190 写作翻译 140');
    expect(parsed?.level).toBe('cet4');
    expect(parsed?.totalScore).toBe(500);
    expect(cetScoreTier(500)).toBe('good');
    expect(cetScoreTier(552)).toBe('high');
    expect(cetScoreTier(425)).toBe('pass');
    expect(cetScoreTier(424)).toBe('fail');
  });

  it('parses GDUT jw level exam JSON for CET-4 and CET-6', () => {
    const raw = JSON.stringify({
      rows: [
        { ksmc: '全国大学英语四级', zcj: '512', ksrq: '2025-12-13', tlcj: '175', ydcj: '188', xzcj: '149', zkzh: '440011252100001' },
        { ksmc: '全国计算机等级考试二级', zcj: '90', ksrq: '2025-09-20' },
        { ksmc: '英语六级(CET-6)', cj: '468', xnxqmc: '2026年6月' },
      ],
    });
    const rows = parseJwCetScores(raw);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ level: 'cet4', examSession: '2025年12月', totalScore: 512, listening: 175 });
    expect(rows[1]).toMatchObject({ level: 'cet6', examSession: '2026年6月', totalScore: 468 });
  });

  it('summarizes best CET-4 and CET-6 scores', () => {
    const records: CetRecord[] = [
      {
        id: '1',
        level: 'cet4',
        examSession: '2025年6月',
        totalScore: 418,
        listening: null,
        reading: null,
        writing: null,
        oralGrade: null,
        ticketNo: null,
        source: 'manual',
        note: null,
        createdAt: '2025-08-25T00:00:00Z',
      },
      {
        id: '2',
        level: 'cet4',
        examSession: '2025年12月',
        totalScore: 516,
        listening: 180,
        reading: 190,
        writing: 146,
        oralGrade: null,
        ticketNo: null,
        source: 'manual',
        note: null,
        createdAt: '2026-02-26T00:00:00Z',
      },
    ];
    const summary = summarizeCetRecords(records);
    expect(summary.bestCet4?.totalScore).toBe(516);
    expect(summary.cet4Passed).toBe(true);
    expect(summary.bestCet6).toBeNull();
    expect(summary.cet6Passed).toBe(false);
  });
});

describe('Course selection reminders and parser', () => {
  it('computes status, countdown, and selects next active round', () => {
    const now = new Date('2026-12-20T12:00:00+08:00');
    const items: CourseSelectionReminder[] = [
      {
        id: 'old',
        title: '已结束轮次',
        kind: 'major',
        startAt: '2026-12-10T12:30:00+08:00',
        endAt: '2026-12-11T17:00:00+08:00',
        enabled: true,
        leadMinutes: [30, 5],
        note: null,
        source: 'manual',
        createdAt: '2026-12-01T00:00:00Z',
      },
      {
        id: 'elective',
        title: '公共选修课正选',
        kind: 'elective',
        startAt: '2026-12-21T12:30:00+08:00',
        endAt: '2026-12-23T17:00:00+08:00',
        enabled: true,
        leadMinutes: [1440, 30, 5],
        note: null,
        source: 'jw',
        createdAt: '2026-12-01T00:00:00Z',
      },
    ];
    expect(selectionStatus(items[0]!, now)).toBe('ended');
    expect(selectionStatus(items[1]!, now)).toBe('upcoming');
    expect(nextActiveSelection(items, now)?.id).toBe('elective');
    expect(selectionCountdownText(items[1]!, now)).toContain('1 天');
  });

  it('extracts GDUT jw selection time windows from HTML', () => {
    const html = `
      <div>2026-2027-2 公共选修课正选：2026-12-21 12:30 至 2026-12-23 17:00</div>
      <div>体育选课轮次 2026-12-24 12:30~2026-12-25 17:00</div>
    `;
    const windows = parseJwSelectionWindows(html);
    expect(windows).toHaveLength(2);
    expect(windows[0]?.kind).toBe('elective');
    expect(windows[0]?.startAt).toBe('2026-12-21T12:30:00+08:00');
    expect(windows[1]?.kind).toBe('pe');
  });
});
