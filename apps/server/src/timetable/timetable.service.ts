import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { CourseReviewService } from '../course-review/course-review.service.js';
import {
  alignToMonday,
  COURSE_COLORS,
  courseInputSchema,
  defaultGdutSemester,
  diffImport,
  ErrorCode,
  formatDate,
  importKeyOf,
  inferBuildingGroup,
  matchCampusBuilding,
  timetableImportSchema,
  type Course,
  type EmptyClassroom,
  type EmptyRoomsInferenceResponse,
  type ImportedCourse,
  type Semester,
  type SemesterInput,
  type TimetableData,
  type TimetableImportResult,
  type TimetableShareCreated,
  type TimetableSharePayload,
} from '@gduthelp/shared';
import type { z } from 'zod';
import { AppException } from '../common/app.exception.js';
import type { Course as CourseRow, CourseSlot, Prisma, Semester as SemesterRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const SHARE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SHARE_TTL_MS = 7 * 24 * 3600_000;

function randomShareCode(): string {
  const bytes = randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += SHARE_ALPHABET[bytes[i]! % SHARE_ALPHABET.length]!;
  }
  return out;
}

type CourseData = z.output<typeof courseInputSchema>;
type ImportData = z.output<typeof timetableImportSchema>;

const toSemester = (s: SemesterRow): Semester => ({
  id: s.id,
  name: s.name,
  // DATE 列读出来是当天 UTC 零点；再做一次周一兜底对齐，防止手工改库或迁移造成整周星期偏移 1 天
  startDate: alignToMonday(
    formatDate({ year: s.startDate.getUTCFullYear(), month: s.startDate.getUTCMonth() + 1, day: s.startDate.getUTCDate() }),
  ),
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
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly courseReviews?: CourseReviewService,
  ) {}

  async currentSemester(): Promise<Semester | null> {
    const s = await this.prisma.semester.findFirst({ where: { isCurrent: true } });
    return s ? toSemester(s) : null;
  }

  /**
   * 获取当前学期；如果数据库里尚无学期，自动按当前北京时间创建广工默认学期（20 周），
   * 让任何同学首次打开课表就能立刻自助导入/添加课程，不再卡在「等管理员设置学期」。
   */
  async ensureCurrentSemester(): Promise<Semester> {
    const existing = await this.currentSemester();
    if (existing) return existing;
    const def = defaultGdutSemester();
    return this.setCurrentSemester(def);
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
    const semester = await this.ensureCurrentSemester();
    const courses = await this.prisma.course.findMany({
      where: { userId, semesterId: semester.id },
      include: { slots: true },
      orderBy: { createdAt: 'asc' },
    });
    return { semester, courses: courses.map(toCourse) };
  }

  async create(userId: string, data: CourseData): Promise<Course> {
    const semester = await this.ensureCurrentSemester();
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
    let semester = await this.ensureCurrentSemester();
    // 首次从教务系统导入时，若本学期尚未有任何课程且教务返回了真实开学周一日期，自动校准全校当前学期，无需等管理员手工设置
    if (data.weekOneMonday && data.weekOneMonday !== semester.startDate) {
      const totalCoursesInSemester = await this.prisma.course.count({ where: { semesterId: semester.id } });
      if (totalCoursesInSemester === 0) {
        const maxWeek = Math.max(semester.totalWeeks, ...data.courses.flatMap((c) => c.slots.flatMap((s) => s.weeks)));
        semester = await this.setCurrentSemester({
          name: data.semesterName || semester.name,
          startDate: data.weekOneMonday,
          totalWeeks: Math.min(30, maxWeek),
        });
      }
    }
    const keys = new Set<string>();
    for (const c of data.courses) {
      if (keys.has(c.importKey)) throw new AppException(ErrorCode.VALIDATION_FAILED, `课程重复：${c.name}`);
      keys.add(c.importKey);
    }
    const result = await this.prisma.$transaction(async (tx) => {
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

    // 脱敏扩充全校公选/体育课目录（仅提取课程名与教师名，不含任何个人隐私）
    if (this.courseReviews && data.courses.length > 0) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { campusId: true } });
      void this.courseReviews.absorbElectivesFromStudentSync(
        data.courses.map((c) => ({
          courseName: c.name,
          teacherName: c.teacher,
          campusId: user?.campusId ?? null,
        })),
      );
    }

    return result;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.prisma.course.delete({ where: { id } });
  }

  /** 生成 6 位分享码（7 天有效），把当前学期课表快照脱敏后供同班同学一键复制 */
  async createShare(userId: string): Promise<TimetableShareCreated> {
    const tt = await this.data(userId);
    if (!tt.semester) throw new AppException(ErrorCode.VALIDATION_FAILED, '管理员还没有设置当前学期');
    if (!tt.courses.length) throw new AppException(ErrorCode.VALIDATION_FAILED, '当前学期还没有课程可分享');

    const snapshot: ImportedCourse[] = tt.courses.map((c) => ({
      importKey: c.importKey || importKeyOf(c.name, c.teacher),
      name: c.name,
      teacher: c.teacher,
      location: c.location,
      slots: c.slots.map((s) => ({
        weekday: s.weekday,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        weeks: s.weeks,
        location: s.location ?? null,
      })),
    }));

    const now = new Date();
    const expiresAt = new Date(now.getTime() + SHARE_TTL_MS);

    // 顺手清理过期分享码，保持表精简
    await this.prisma.timetableShare.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {});

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomShareCode();
      try {
        await this.prisma.timetableShare.create({
          data: {
            code,
            createdBy: userId,
            semesterId: tt.semester.id,
            courses: snapshot as unknown as Prisma.InputJsonValue,
            expiresAt,
          },
        });
        return {
          code,
          courseCount: snapshot.length,
          semesterName: tt.semester.name,
          expiresAt: expiresAt.toISOString(),
        };
      } catch {
        // 极低概率撞码，重试
      }
    }
    throw new AppException(ErrorCode.INTERNAL_ERROR, '生成分享码失败，请重试', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  async getShare(code: string): Promise<TimetableSharePayload> {
    const row = await this.prisma.timetableShare.findUnique({
      where: { code: code.toUpperCase() },
      include: { semester: { select: { name: true } } },
    });
    if (!row || row.expiresAt.getTime() < Date.now()) {
      throw new AppException(ErrorCode.NOT_FOUND, '分享码不存在或已过期', HttpStatus.NOT_FOUND);
    }
    const courses = Array.isArray(row.courses) ? (row.courses as unknown as TimetableSharePayload['courses']) : [];
    return {
      code: row.code,
      semesterName: row.semester.name,
      courses,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  /**
   * 基于全校当前学期已同步的脱敏课程地点，推算指定周次/星期/节次的空闲教室。
   * 仅聚合教室名称与占用时段，不暴露任何用户或课程隐私。
   */
  async findEmptyRooms(opts: {
    week: number;
    weekday: number;
    periodStart: number;
    periodEnd: number;
  }): Promise<EmptyRoomsInferenceResponse> {
    const semester = await this.currentSemester();
    if (!semester) {
      return { source: 'timetable', rooms: [], occupiedCount: 0, totalKnownRooms: 0 };
    }

    const start = Math.min(opts.periodStart, opts.periodEnd);
    const end = Math.max(opts.periodStart, opts.periodEnd);

    const slots = await this.prisma.courseSlot.findMany({
      where: { course: { semesterId: semester.id } },
      select: {
        weekday: true,
        periodStart: true,
        periodEnd: true,
        weeks: true,
        location: true,
        course: { select: { location: true } },
      },
    });

    const knownRooms = new Set<string>();
    const occupiedRooms = new Set<string>();

    for (const slot of slots) {
      const names = extractClassroomNames(slot.location ?? slot.course.location);
      if (names.length === 0) continue;
      const busy =
        slot.weekday === opts.weekday &&
        slot.periodStart <= end &&
        slot.periodEnd >= start &&
        slot.weeks.includes(opts.week);

      for (const name of names) {
        knownRooms.add(name);
        if (busy) occupiedRooms.add(name);
      }
    }

    const rooms: EmptyClassroom[] = [];
    for (const name of knownRooms) {
      if (occupiedRooms.has(name)) continue;
      const building = inferBuildingGroup(name);
      const matched = matchCampusBuilding(name) ?? matchCampusBuilding(building);
      rooms.push({
        name,
        building,
        seats: null,
        roomType: '校内课表推算',
        campus: null,
        mapBuildingId: matched?.id ?? null,
      });
    }

    rooms.sort((a, b) => a.building.localeCompare(b.building, 'zh-CN') || a.name.localeCompare(b.name, 'zh-CN'));

    return {
      source: 'timetable',
      rooms,
      occupiedCount: occupiedRooms.size,
      totalKnownRooms: knownRooms.size,
    };
  }

  private async owned(userId: string, id: string) {
    const c = await this.prisma.course.findFirst({ where: { id, userId }, select: { id: true } });
    if (!c) throw new AppException(ErrorCode.NOT_FOUND, '课程不存在', 404);
  }
}

const EXCLUDED_ROOM_RE = /线上|网课|腾讯会议|待定|田径|体育场|体育馆|操场|足球|篮球|排球|网球|羽毛球|游泳|乒乓|健身|校外|实习/;
const CLASSROOM_LIKE_RE =
  /(?:教[1-6一二三四五六]|大教室|工学|实验|教学楼|综合楼|阶梯|课室|多媒体|图书馆|行政楼|经管楼|艺术楼|机电|电信|计算机|材料|轻工|土木|外语|[A-Za-z]-?\d{3})/;

function extractClassroomNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const parts = raw
    .split(/[,，;；/、]+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (part.length < 2 || part.length > 32) continue;
    if (EXCLUDED_ROOM_RE.test(part)) continue;
    if (!CLASSROOM_LIKE_RE.test(part)) continue;
    out.push(part);
  }
  return out;
}
