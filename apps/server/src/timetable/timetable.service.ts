import { Injectable } from '@nestjs/common';
import {
  courseInputSchema,
  ErrorCode,
  formatDate,
  type Course,
  type Semester,
  type SemesterInput,
  type TimetableData,
} from '@gduthelp/shared';
import type { z } from 'zod';
import { AppException } from '../common/app.exception.js';
import type { Course as CourseRow, CourseSlot, Semester as SemesterRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type CourseData = z.output<typeof courseInputSchema>;

const toSemester = (s: SemesterRow): Semester => ({
  id: s.id,
  name: s.name,
  // DATE 列读出来是当天 UTC 零点
  startDate: formatDate({ year: s.startDate.getUTCFullYear(), month: s.startDate.getUTCMonth() + 1, day: s.startDate.getUTCDate() }),
  totalWeeks: s.totalWeeks,
});

const toCourse = (c: CourseRow & { slots: CourseSlot[] }): Course => ({
  id: c.id,
  name: c.name,
  teacher: c.teacher,
  location: c.location,
  color: c.color,
  slots: c.slots
    .map((s) => ({ id: s.id, weekday: s.weekday, periodStart: s.periodStart, periodEnd: s.periodEnd, weeks: s.weeks, location: s.location }))
    .sort((a, b) => a.weekday - b.weekday || a.periodStart - b.periodStart),
});

const slotRows = (data: CourseData) =>
  data.slots.map((s) => ({ weekday: s.weekday, periodStart: s.periodStart, periodEnd: s.periodEnd, weeks: s.weeks, location: s.location ?? null }));

@Injectable()
export class TimetableService {
  constructor(private readonly prisma: PrismaService) {}

  async currentSemester(): Promise<Semester | null> {
    const s = await this.prisma.semester.findFirst({ where: { isCurrent: true } });
    return s ? toSemester(s) : null;
  }

  /** 设置当前学期：同名学期存在则更新，否则新建；其他学期取消 current */
  async setCurrentSemester(input: SemesterInput): Promise<Semester> {
    const startDate = new Date(`${input.startDate}T00:00:00Z`);
    return this.prisma.$transaction(async (tx) => {
      await tx.semester.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      const existing = await tx.semester.findFirst({ where: { name: input.name } });
      const row = existing
        ? await tx.semester.update({ where: { id: existing.id }, data: { startDate, totalWeeks: input.totalWeeks, isCurrent: true } })
        : await tx.semester.create({ data: { name: input.name, startDate, totalWeeks: input.totalWeeks, isCurrent: true } });
      return toSemester(row);
    });
  }

  async data(userId: string): Promise<TimetableData> {
    const semester = await this.currentSemester();
    if (!semester) return { semester: null, courses: [] };
    const courses = await this.prisma.course.findMany({
      where: { userId, semesterId: semester.id },
      include: { slots: true },
      orderBy: { createdAt: 'asc' },
    });
    return { semester, courses: courses.map(toCourse) };
  }

  async create(userId: string, data: CourseData): Promise<Course> {
    const semester = await this.currentSemester();
    if (!semester) throw new AppException(ErrorCode.VALIDATION_FAILED, '管理员还没有设置当前学期');
    const row = await this.prisma.course.create({
      data: {
        userId,
        semesterId: semester.id,
        name: data.name,
        teacher: data.teacher ?? null,
        location: data.location ?? null,
        color: data.color,
        slots: { create: slotRows(data) },
      },
      include: { slots: true },
    });
    return toCourse(row);
  }

  async update(userId: string, id: string, data: CourseData): Promise<Course> {
    await this.owned(userId, id);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.courseSlot.deleteMany({ where: { courseId: id } });
      return tx.course.update({
        where: { id },
        data: {
          name: data.name,
          teacher: data.teacher ?? null,
          location: data.location ?? null,
          color: data.color,
          slots: { create: slotRows(data) },
        },
        include: { slots: true },
      });
    });
    return toCourse(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.prisma.course.delete({ where: { id } });
  }

  private async owned(userId: string, id: string) {
    const c = await this.prisma.course.findFirst({ where: { id, userId }, select: { id: true } });
    if (!c) throw new AppException(ErrorCode.NOT_FOUND, '课程不存在', 404);
  }
}
