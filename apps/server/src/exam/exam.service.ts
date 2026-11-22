import { Injectable } from '@nestjs/common';
import {
  diffExamImport,
  ErrorCode,
  examImportSchema,
  examInputSchema,
  type Exam,
  type ExamData,
  type ExamImportResult,
} from '@gduthelp/shared';
import type { z } from 'zod';
import { AppException } from '../common/app.exception.js';
import type { Exam as ExamRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TimetableService } from '../timetable/timetable.service.js';

type ExamInputData = z.output<typeof examInputSchema>;
type ExamImportData = z.output<typeof examImportSchema>;

const toExam = (e: ExamRow): Exam => ({
  id: e.id,
  courseName: e.courseName,
  examDate: e.examDate,
  startTime: e.startTime,
  endTime: e.endTime,
  location: e.location,
  seatNo: e.seatNo,
  examType: e.examType,
  campus: e.campus,
  note: e.note,
  source: e.source,
  importKey: e.importKey,
});

@Injectable()
export class ExamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timetable: TimetableService,
  ) {}

  async data(userId: string): Promise<ExamData> {
    const semester = await this.timetable.ensureCurrentSemester();
    const rows = await this.prisma.exam.findMany({
      where: { userId, semesterId: semester.id },
      orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }, { createdAt: 'asc' }],
    });
    return { semester, exams: rows.map(toExam) };
  }

  async create(userId: string, data: ExamInputData): Promise<Exam> {
    const semester = await this.timetable.ensureCurrentSemester();
    const row = await this.prisma.exam.create({
      data: {
        userId,
        semesterId: semester.id,
        courseName: data.courseName,
        examDate: data.examDate,
        startTime: data.startTime,
        endTime: data.endTime,
        location: data.location || null,
        seatNo: data.seatNo || null,
        examType: data.examType || null,
        campus: data.campus || null,
        note: data.note || null,
        source: 'manual',
      },
    });
    return toExam(row);
  }

  async update(userId: string, id: string, data: ExamInputData): Promise<Exam> {
    await this.owned(userId, id);
    const row = await this.prisma.exam.update({
      where: { id },
      data: {
        courseName: data.courseName,
        examDate: data.examDate,
        startTime: data.startTime,
        endTime: data.endTime,
        location: data.location || null,
        seatNo: data.seatNo || null,
        examType: data.examType || null,
        campus: data.campus || null,
        note: data.note || null,
      },
    });
    return toExam(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.prisma.exam.delete({ where: { id } });
  }

  /**
   * 增量导入教务系统考试安排：
   * 按 importKey 对比变化（如考场/座位/时间调整自动刷新），
   * 手动添加的考试（如四六级、期中测验）永远不会被覆盖或删除。
   */
  async importExams(userId: string, data: ExamImportData): Promise<ExamImportResult> {
    const semester = await this.timetable.ensureCurrentSemester();
    const keys = new Set<string>();
    for (const item of data.exams) {
      if (keys.has(item.importKey)) {
        throw new AppException(ErrorCode.VALIDATION_FAILED, `考试记录重复：${item.courseName}`);
      }
      keys.add(item.importKey);
    }

    return this.prisma.$transaction(async (tx) => {
      const existingRows = await tx.exam.findMany({
        where: { userId, semesterId: semester.id },
      });
      const diff = diffExamImport(
        existingRows.map(toExam),
        data.exams.map((item) => ({
          importKey: item.importKey,
          courseName: item.courseName,
          examDate: item.examDate,
          startTime: item.startTime,
          endTime: item.endTime,
          location: item.location || null,
          seatNo: item.seatNo || null,
          examType: item.examType || null,
          campus: item.campus || null,
          note: item.note || null,
        })),
      );

      for (const item of diff.added) {
        await tx.exam.create({
          data: {
            userId,
            semesterId: semester.id,
            courseName: item.courseName,
            examDate: item.examDate,
            startTime: item.startTime,
            endTime: item.endTime,
            location: item.location,
            seatNo: item.seatNo,
            examType: item.examType,
            campus: item.campus,
            note: item.note,
            source: 'import',
            importKey: item.importKey,
          },
        });
      }

      for (const { before, after } of diff.changed) {
        await tx.exam.update({
          where: { id: before.id },
          data: {
            courseName: after.courseName,
            examDate: after.examDate,
            startTime: after.startTime,
            endTime: after.endTime,
            location: after.location,
            seatNo: after.seatNo,
            examType: after.examType,
            campus: after.campus,
            note: after.note,
          },
        });
      }

      const removed = data.removeMissing ? diff.removed : [];
      if (removed.length) {
        await tx.exam.deleteMany({
          where: { id: { in: removed.map((e) => e.id) }, userId },
        });
      }

      return {
        added: diff.added.length,
        changed: diff.changed.length,
        removed: removed.length,
        unchanged: diff.unchanged,
      };
    });
  }

  private async owned(userId: string, id: string): Promise<void> {
    const row = await this.prisma.exam.findFirst({ where: { id, userId }, select: { id: true } });
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, '考试记录不存在', 404);
  }
}
