import { describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/app.exception.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { TimetableService } from '../timetable/timetable.service.js';
import { ExamService } from './exam.service.js';

const semester = { id: 'sem-1', name: '2026秋季学期', startDate: '2026-08-31', totalWeeks: 20 };

function createMocks(initialRows: Record<string, unknown>[] = []) {
  const rows = [...initialRows];
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const row = { id: `exam-${rows.length + 1}`, ...data };
    rows.push(row);
    return row;
  });
  const update = vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const idx = rows.findIndex((r) => r.id === where.id);
    rows[idx] = { ...rows[idx], ...data };
    return rows[idx];
  });
  const deleteMany = vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
    for (const id of where.id.in) {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx >= 0) rows.splice(idx, 1);
    }
    return { count: where.id.in.length };
  });
  const findMany = vi.fn(async () => rows);
  const findFirst = vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
    rows.find((r) => r.id === where.id && r.userId === where.userId) ?? null,
  );
  const del = vi.fn(async ({ where }: { where: { id: string } }) => {
    const idx = rows.findIndex((r) => r.id === where.id);
    if (idx >= 0) rows.splice(idx, 1);
  });

  const tx = { exam: { findMany, create, update, deleteMany } };
  const prisma = {
    exam: { findMany, findFirst, create, update, delete: del },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const timetable = {
    ensureCurrentSemester: vi.fn(async () => semester),
  } as unknown as TimetableService;

  return { service: new ExamService(prisma, timetable), rows, create, update, deleteMany };
}

describe('ExamService', () => {
  it('imports JW exams idempotently while preserving manual exams', async () => {
    const { service, rows } = createMocks([
      {
        id: 'manual-1',
        userId: 'u1',
        semesterId: 'sem-1',
        courseName: '大学英语六级',
        examDate: '2026-12-12',
        startTime: '15:00',
        endTime: '17:25',
        location: '教1-101',
        seatNo: '05',
        examType: '等级考试',
        campus: '大学城校区',
        note: null,
        source: 'manual',
        importKey: null,
      },
      {
        id: 'imp-1',
        userId: 'u1',
        semesterId: 'sem-1',
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
        importKey: 'code:math|2027-01-08',
      },
      {
        id: 'imp-old',
        userId: 'u1',
        semesterId: 'sem-1',
        courseName: '已取消考试',
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
    ]);

    const res = await service.importExams('u1', {
      removeMissing: true,
      exams: [
        {
          importKey: 'code:math|2027-01-08',
          courseName: '高等数学',
          examDate: '2027-01-08',
          startTime: '08:30',
          endTime: '10:30',
          location: '教3-308',
          seatNo: '20',
          examType: '期末考试',
        },
        {
          importKey: 'code:ds|2027-01-11',
          courseName: '数据结构',
          examDate: '2027-01-11',
          startTime: '14:00',
          endTime: '16:00',
          location: '教2-204',
          seatNo: '11',
        },
      ],
    });

    expect(res).toEqual({ added: 1, changed: 1, removed: 1, unchanged: 0 });
    expect(rows.map((r) => r.courseName)).toEqual(['大学英语六级', '高等数学', '数据结构']);
    expect(rows.find((r) => r.id === 'imp-1')?.location).toBe('教3-308');
  });

  it('rejects updating or deleting exams owned by another user', async () => {
    const { service } = createMocks([
      {
        id: 'e1',
        userId: 'other',
        semesterId: 'sem-1',
        courseName: '线代',
        examDate: '2027-01-10',
        startTime: '09:00',
        endTime: '11:00',
        location: null,
        seatNo: null,
        examType: null,
        campus: null,
        note: null,
        source: 'manual',
        importKey: null,
      },
    ]);

    await expect(service.remove('u1', 'e1')).rejects.toBeInstanceOf(AppException);
  });
});
