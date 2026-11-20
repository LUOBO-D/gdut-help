import { Injectable } from '@nestjs/common';
import {
  COURSE_COLORS,
  courseInputSchema,
  diffImport,
  ErrorCode,
  formatDate,
  timetableImportSchema,
  type TimetableImportResult,
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
type ImportData = z.output<typeof timetableImportSchema>;

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
  source: c.source,
  importKey: c.importKey,
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

  /**
   * 导入教务系统课表。按 importKey（课程名 + 老师）和以前导入的课对上：
   * 新课新建，有变化的整体替换时间段，教务系统里没有了的删除（removeMissing）。
   * 手动添加的课不会被改动。颜色只在新建时分配，之后保留用户改过的颜色。
   */
  async importCourses(userId: string, data: ImportData): Promise<TimetableImportResult> {
    const semester = await this.currentSemester();
    if (!semester) throw new AppException(ErrorCode.VALIDATION_FAILED, '管理员还没有设置当前学期');
    const keys = new Set<string>();
    for (const c of data.courses) {
      if (keys.has(c.importKey)) throw new AppException(ErrorCode.VALIDATION_FAILED, `课程重复：${c.name}`);
      keys.add(c.importKey);
    }
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.course.findMany({ where: { userId, semesterId: semester.id }, include: { slots: true } });
      const existing = rows.map(toCourse);
      const diff = diffImport(existing, data.courses);
      const used = new Set(existing.map((c) => c.color));
      let next = 0;
      const pickColor = () => {
        const free = COURSE_COLORS.filter((c) => !used.has(c));
        const color = free[0] ?? COURSE_COLORS[next++ % COURSE_COLORS.length]!;
        used.add(color);
        return color;
      };
      for (const c of diff.added) {
        await tx.course.create({
          data: {
            userId,
            semesterId: semester.id,
            name: c.name,
            teacher: c.teacher,
            location: c.location,
            color: pickColor(),
            source: 'import',
            importKey: c.importKey,
            slots: { create: c.slots.map((s) => ({ ...s, location: s.location ?? null })) },
          },
        });
      }
      for (const { before, after } of diff.changed) {
        await tx.courseSlot.deleteMany({ where: { courseId: before.id } });
        await tx.course.update({
          where: { id: before.id },
          data: {
            name: after.name,
            teacher: after.teacher,
            location: after.location,
            slots: { create: after.slots.map((s) => ({ ...s, location: s.location ?? null })) },
          },
        });
      }
      const removed = data.removeMissing ? diff.removed : [];
      if (removed.length) await tx.course.deleteMany({ where: { id: { in: removed.map((c) => c.id) }, userId } });
      return { added: diff.added.length, changed: diff.changed.length, removed: removed.length, unchanged: diff.unchanged };
    });
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
