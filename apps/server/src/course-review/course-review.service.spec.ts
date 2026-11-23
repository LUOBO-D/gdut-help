import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CourseReviewService } from './course-review.service.js';

describe('CourseReviewService', () => {
  it('masks anonymous author nickname while preserving isMine flag', async () => {
    const now = new Date('2026-11-20T08:00:00Z');
    const prisma = {
      sharedCourse: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'c1',
          courseCode: 'GG001',
          courseName: '电影赏析',
          teacherName: '陈老师',
          campusId: 'hemc',
          category: 'general_elective',
          subCategory: '美育艺术',
          department: '通识教育中心',
          credits: 2,
          submittedBy: 'u1',
          ratingOverall: 4.8,
          ratingGrading: 4.9,
          ratingWorkload: 5,
          ratingQuality: 4.7,
          reviewCount: 1,
          bayesScore: 4.2,
          topTags: ['给分高', '不点名'],
          createdAt: now,
          updatedAt: now,
        }),
      },
      courseReview: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'rev1',
            courseId: 'c1',
            userId: 'u2',
            scoreOverall: 5,
            scoreGrading: 5,
            scoreWorkload: 5,
            scoreQuality: 5,
            attendance: 'none',
            examFormat: 'paper',
            semesterTaken: '2025-2026 春',
            tags: ['给分高', '不点名'],
            content: '写一篇影评就能拿 90+，老师人超好',
            anonymous: true,
            likeCount: 3,
            status: 'visible',
            createdAt: now,
            updatedAt: now,
            user: { nickname: '小明' },
            likes: [],
          },
        ]),
      },
    } as unknown as PrismaService;

    const service = new CourseReviewService(prisma);
    const detail = await service.getCourseDetail('c1', 'u1');

    expect(detail.reviews).toHaveLength(1);
    expect(detail.reviews[0]?.authorNickname).toBe('广工同学');
    expect(detail.reviews[0]?.isMine).toBe(false);
    expect(detail.attendanceStats.none).toBe(1);
    expect(detail.examFormatStats.paper).toBe(1);
  });

  it('imports catalog idempotently without overwriting existing review stats', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      sharedCourse: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'c-existing',
            courseName: '岭南衣裳',
            teacherName: '李老师',
            campusId: 'hemc',
            courseCode: null,
            subCategory: '美育艺术',
            department: null,
            credits: null,
          },
        ]),
        createMany,
        update,
      },
    } as unknown as PrismaService;

    const service = new CourseReviewService(prisma);
    const res = await service.importCatalog(
      [
        {
          courseCode: 'GG101',
          courseName: '岭南衣裳',
          teacherName: '李老师',
          campusId: 'hemc',
          category: 'general_elective',
          subCategory: '美育艺术',
          department: '通识教育中心',
          credits: 2,
        },
        {
          courseCode: 'TY201',
          courseName: '体育（羽毛球）',
          teacherName: '王教练',
          campusId: 'hemc',
          category: 'pe',
          subCategory: '球类项目',
          department: '体育学院',
          credits: 1,
        },
      ],
      'u1',
    );

    expect(res.added).toBe(1);
    expect(res.updated).toBe(1);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'c-existing' },
      data: { courseCode: 'GG101', department: '通识教育中心', credits: 2 },
    });
  });
});
