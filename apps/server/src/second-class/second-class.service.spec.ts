import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { SecondClassService } from './second-class.service.js';

describe('SecondClassService', () => {
  it('returns both current semester and current academic year hour totals', async () => {
    const now = new Date('2026-11-20T08:00:00Z');
    const prisma = {
      userCreditPlan: {
        findUnique: vi.fn().mockResolvedValue({
          secondClassSemesterTarget: 10,
          secondClassYearTarget: 20,
        }),
      },
      secondClassRecord: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'r1',
            userId: 'u1',
            academicYear: '2026-2027',
            semesterCode: '202601',
            title: '图书馆志愿服务',
            category: 'volunteer',
            hours: 4,
            credits: 0.4,
            activityDate: '2026-10-18',
            organizer: '校青协',
            status: 'approved',
            source: 'manual',
            importKey: null,
            note: null,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'r2',
            userId: 'u1',
            academicYear: '2026-2027',
            semesterCode: '202602',
            title: '春季创新创业讲座',
            category: 'innovation',
            hours: 6,
            credits: 0.5,
            activityDate: '2027-03-15',
            organizer: '创新创业学院',
            status: 'approved',
            source: 'import',
            importKey: '202602|2027-03-15|春季创新创业讲座',
            note: null,
            createdAt: now,
            updatedAt: now,
          },
        ]),
      },
    } as unknown as PrismaService;

    const service = new SecondClassService(prisma);
    const summary = await service.getSummary('u1', { academicYear: '2026-2027', semesterCode: '202601' });

    expect(summary.currentSemester.totalHours).toBe(4);
    expect(summary.currentSemester.targetHours).toBe(10);
    expect(summary.currentAcademicYear.totalHours).toBe(10);
    expect(summary.currentAcademicYear.targetHours).toBe(20);
    expect(summary.currentAcademicYear.percent).toBe(50);
  });
});
