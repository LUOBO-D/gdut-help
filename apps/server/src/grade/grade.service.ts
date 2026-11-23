import { HttpStatus, Injectable } from '@nestjs/common';
import {
  convertGdutScore,
  courseGradeInputSchema,
  diffGradeSync,
  ErrorCode,
  formatSemesterName,
  gradeSyncSchema,
  normalizeSemesterCode,
  type CourseGrade,
  type GradeData,
  type GradeSyncResult,
  type ImportedCourseGrade,
} from '@gduthelp/shared';
import type { z } from 'zod';
import { AppException } from '../common/app.exception.js';
import type { CourseGrade as CourseGradeRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type CourseGradeInputData = z.output<typeof courseGradeInputSchema>;
type GradeSyncData = z.output<typeof gradeSyncSchema>;

const toCourseGrade = (r: CourseGradeRow): CourseGrade => ({
  id: r.id,
  semesterCode: r.semesterCode,
  semesterName: r.semesterName,
  courseCode: r.courseCode,
  courseName: r.courseName,
  credits: r.credits,
  scoreText: r.scoreText,
  scoreNum: r.scoreNum,
  gradePoint: r.gradePoint,
  courseType: r.courseType,
  examType: r.examType,
  source: r.source,
  importKey: r.importKey,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

function normalizeManualInput(data: CourseGradeInputData) {
  const semesterCode = normalizeSemesterCode(data.semesterCode);
  const semesterName = data.semesterName ?? formatSemesterName(semesterCode);
  const conv = convertGdutScore(data.scoreText, data.gradePoint ?? null);
  return {
    semesterCode,
    semesterName,
    courseCode: data.courseCode,
    courseName: data.courseName,
    credits: Math.round(data.credits * 10) / 10,
    scoreText: data.scoreText,
    scoreNum: conv.scoreNum,
    gradePoint: conv.gradePoint,
    courseType: data.courseType,
    examType: data.examType,
  };
}

@Injectable()
export class GradeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<GradeData> {
    const rows = await this.prisma.courseGrade.findMany({
      where: { userId },
      orderBy: [{ semesterCode: 'desc' }, { credits: 'desc' }, { courseName: 'asc' }],
    });
    const grades = rows.map(toCourseGrade);
    let syncedAt: string | null = null;
    for (const r of rows) {
      const iso = r.updatedAt.toISOString();
      if (!syncedAt || iso > syncedAt) syncedAt = iso;
    }
    return { grades, syncedAt };
  }

  async create(userId: string, data: CourseGradeInputData): Promise<CourseGrade> {
    const row = await this.prisma.courseGrade.create({
      data: {
        userId,
        ...normalizeManualInput(data),
        source: 'manual',
      },
    });
    return toCourseGrade(row);
  }

  async update(userId: string, id: string, data: CourseGradeInputData): Promise<CourseGrade> {
    await this.owned(userId, id);
    const row = await this.prisma.courseGrade.update({
      where: { id },
      data: normalizeManualInput(data),
    });
    return toCourseGrade(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.prisma.courseGrade.delete({ where: { id } });
  }

  /**
   * 幂等同步教务系统课程成绩：
   * 按 importKey 对比新增/变化记录，手动添加的试算课程永远保留不被覆盖或删除。
   */
  async syncGrades(userId: string, data: GradeSyncData): Promise<GradeSyncResult> {
    const dedup = new Map<string, ImportedCourseGrade>();
    for (const item of data.grades) {
      const normalized = normalizeManualInput(item);
      dedup.set(item.importKey, {
        importKey: item.importKey,
        ...normalized,
      });
    }
    const incoming = [...dedup.values()];

    return this.prisma.$transaction(async (tx) => {
      const existingRows = await tx.courseGrade.findMany({ where: { userId } });
      const diff = diffGradeSync(existingRows.map(toCourseGrade), incoming);

      for (const item of diff.added) {
        await tx.courseGrade.create({
          data: {
            userId,
            semesterCode: item.semesterCode,
            semesterName: item.semesterName,
            courseCode: item.courseCode,
            courseName: item.courseName,
            credits: item.credits,
            scoreText: item.scoreText,
            scoreNum: item.scoreNum,
            gradePoint: item.gradePoint,
            courseType: item.courseType,
            examType: item.examType,
            source: 'import',
            importKey: item.importKey,
          },
        });
      }

      for (const { before, after } of diff.changed) {
        await tx.courseGrade.update({
          where: { id: before.id },
          data: {
            semesterCode: after.semesterCode,
            semesterName: after.semesterName,
            courseCode: after.courseCode,
            courseName: after.courseName,
            credits: after.credits,
            scoreText: after.scoreText,
            scoreNum: after.scoreNum,
            gradePoint: after.gradePoint,
            courseType: after.courseType,
            examType: after.examType,
          },
        });
      }

      const removed = data.removeMissing ? diff.removed : [];
      if (removed.length > 0) {
        await tx.courseGrade.deleteMany({
          where: { id: { in: removed.map((r) => r.id) }, userId },
        });
      }

      return {
        added: diff.added.length,
        changed: diff.changed.length,
        removed: removed.length,
        unchanged: diff.unchanged,
        total: incoming.length,
        syncedAt: new Date().toISOString(),
      };
    });
  }

  private async owned(userId: string, id: string): Promise<void> {
    const row = await this.prisma.courseGrade.findFirst({ where: { id, userId }, select: { id: true } });
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, '成绩记录不存在', HttpStatus.NOT_FOUND);
  }
}
