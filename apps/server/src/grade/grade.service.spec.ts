import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { GradeService } from './grade.service.js';

function makeRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-11-22T00:00:00.000Z');
  return {
    id: '00000000-0000-0000-0000-000000000101',
    userId: 'u1',
    semesterCode: '202501',
    semesterName: '2025-2026 秋季',
    courseCode: 'CS101',
    courseName: '高等数学A(1)',
    credits: 5,
    scoreText: '88',
    scoreNum: 88,
    gradePoint: 3.8,
    courseType: '必修',
    examType: '正常考试',
    source: 'import',
    importKey: '202501|code:cs101',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeHarness() {
  const courseGrade = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  };
  const prisma = {
    courseGrade,
    $transaction: vi.fn(async (fn: (tx: { courseGrade: typeof courseGrade }) => Promise<unknown>) =>
      fn({ courseGrade }),
    ),
  };
  return { service: new GradeService(prisma as unknown as PrismaService), courseGrade };
}

describe('GradeService', () => {
  it('手动新增课程时自动按广工 5.0 制核算绩点并规范化学期', async () => {
    const { service, courseGrade } = makeHarness();
    courseGrade.create.mockResolvedValue(
      makeRow({
        semesterCode: '202502',
        semesterName: '2025-2026 春季',
        courseName: '数据结构',
        scoreText: '92',
        scoreNum: 92,
        gradePoint: 4.2,
        source: 'manual',
      }),
    );

    const res = await service.create('u1', {
      semesterCode: '2025-2026-2',
      semesterName: null,
      courseCode: null,
      courseName: '数据结构',
      credits: 4,
      scoreText: '92',
      courseType: '必修',
      examType: null,
    });

    expect(res.gradePoint).toBe(4.2);
    expect(courseGrade.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          semesterCode: '202502',
          semesterName: '2025-2026 春季',
          gradePoint: 4.2,
          source: 'manual',
        }),
      }),
    );
  });

  it('增量同步教务成绩时自动新增/更新变更项，且不误删手动添加的试算课程', async () => {
    const { service, courseGrade } = makeHarness();
    courseGrade.findMany.mockResolvedValue([
      makeRow({ id: 'old-1', scoreText: '88', scoreNum: 88, gradePoint: 3.8 }),
      makeRow({ id: 'manual-1', source: 'manual', importKey: null, courseName: '手动试算课' }),
    ]);
    courseGrade.create.mockResolvedValue(makeRow({ id: 'new-2' }));
    courseGrade.update.mockResolvedValue(makeRow({ id: 'old-1', scoreText: '91', gradePoint: 4.1 }));

    const result = await service.syncGrades('u1', {
      removeMissing: true,
      grades: [
        {
          importKey: '202501|code:cs101',
          semesterCode: '202501',
          semesterName: '2025-2026 秋季',
          courseCode: 'CS101',
          courseName: '高等数学A(1)',
          credits: 5,
          scoreText: '91',
          courseType: '必修',
          examType: '正常考试',
        },
        {
          importKey: '202502|code:cs201',
          semesterCode: '202502',
          semesterName: '2025-2026 春季',
          courseCode: 'CS201',
          courseName: '计算机组成原理',
          credits: 4,
          scoreText: '85',
          courseType: '必修',
          examType: '正常考试',
        },
      ],
    });

    expect(result.added).toBe(1);
    expect(result.changed).toBe(1);
    expect(result.removed).toBe(0);
    expect(courseGrade.deleteMany).not.toHaveBeenCalled();
  });

  it('删除他人或不存在的成绩时抛出 NOT_FOUND', async () => {
    const { service, courseGrade } = makeHarness();
    courseGrade.findFirst.mockResolvedValue(null);

    await expect(service.remove('u1', '00000000-0000-0000-0000-000000000099')).rejects.toMatchObject({
      errorCode: 'NOT_FOUND',
    });
  });
});
