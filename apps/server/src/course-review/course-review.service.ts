import { HttpStatus, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  computeCourseReviewAggregation,
  COURSE_ATTENDANCE_LEVELS,
  COURSE_EXAM_FORMATS,
  DEFAULT_CAMPUS_ID,
  DEFAULT_GLOBAL_AVG,
  detectElectiveCategory,
  ErrorCode,
  GDUT_PUBLIC_ELECTIVE_SEED,
  normalizeCourseIdentity,
  type CatalogImportItem,
  type CatalogImportResult,
  type CourseAttendanceLevel,
  type CourseExamFormat,
  type CourseListQuery,
  type CourseReviewDetailResponse,
  type CourseReviewInput,
  type CourseReviewItem,
  type CourseReviewListResponse,
  type CreateCourseAndReviewInput,
  type SharedCourse,
  type SharedCourseCategory,
} from '@gduthelp/shared';
import { AppException } from '../common/app.exception.js';
import type { Prisma, SharedCourse as SharedCourseRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;

const ALLOWED_CATEGORIES: SharedCourseCategory[] = ['general_elective', 'pe'];

const normalizeCategory = (raw: SharedCourseRow['category']): SharedCourseCategory =>
  raw === 'pe' ? 'pe' : 'general_elective';

const toSharedCourse = (c: SharedCourseRow): SharedCourse => ({
  id: c.id,
  courseCode: c.courseCode,
  courseName: c.courseName,
  teacherName: c.teacherName,
  campusId: c.campusId,
  category: normalizeCategory(c.category),
  subCategory: c.subCategory,
  department: c.department,
  credits: c.credits,
  ratingOverall: c.ratingOverall,
  ratingGrading: c.ratingGrading,
  ratingWorkload: c.ratingWorkload,
  ratingQuality: c.ratingQuality,
  reviewCount: c.reviewCount,
  bayesScore: c.bayesScore,
  topTags: c.topTags,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

@Injectable()
export class CourseReviewService implements OnModuleInit {
  private readonly logger = new Logger(CourseReviewService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.seedBaselineCatalog();
    } catch (err) {
      this.logger.warn(`初始化广工公选/体育基础目录跳过：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** 启动时幂等写入广工公开的 21 项体育选课与通识教育中心经典公选课基础目录（不覆盖已有记录） */
  async seedBaselineCatalog(): Promise<void> {
    await this.prisma.sharedCourse.createMany({
      data: GDUT_PUBLIC_ELECTIVE_SEED.map((item) => ({
        courseCode: item.courseCode,
        courseName: item.courseName,
        teacherName: item.teacherName,
        campusId: item.campusId,
        category: item.category,
        subCategory: item.subCategory,
        department: item.department,
        credits: item.credits,
        submittedBy: null,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * 全校共享选修课列表（仅含「公共选修课」与「体育选课」）：
   * 支持分页加载、关键词检索、分类/子模块/标签筛选，默认同时展示暂无评价的课程以便同学们首评。
   */
  async listCourses(query: CourseListQuery): Promise<CourseReviewListResponse> {
    const q = query.q?.trim();
    const tag = query.tag?.trim();
    const subCategory = query.subCategory?.trim();
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(60, Math.max(10, query.pageSize ?? 30));
    const skip = (page - 1) * pageSize;

    const where: Prisma.SharedCourseWhereInput = {
      category: query.category ? query.category : { in: ALLOWED_CATEGORIES },
      ...(query.onlyReviewed ? { reviewCount: { gt: 0 } } : {}),
      ...(subCategory ? { subCategory } : {}),
      ...(query.campusId && query.campusId !== 'all' ? { campusId: query.campusId } : {}),
      ...(tag ? { topTags: { has: tag } } : {}),
      ...(q
        ? {
            OR: [
              { courseName: { contains: q, mode: 'insensitive' } },
              { teacherName: { contains: q, mode: 'insensitive' } },
              { courseCode: { contains: q, mode: 'insensitive' } },
              { department: { contains: q, mode: 'insensitive' } },
              { subCategory: { contains: q, mode: 'insensitive' } },
              { topTags: { has: q } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.SharedCourseOrderByWithRelationInput[] =
      query.sort === 'grading'
        ? [{ ratingGrading: 'desc' }, { reviewCount: 'desc' }, { courseName: 'asc' }]
        : query.sort === 'workload'
          ? [{ ratingWorkload: 'desc' }, { reviewCount: 'desc' }, { courseName: 'asc' }]
          : query.sort === 'reviews'
            ? [{ reviewCount: 'desc' }, { bayesScore: 'desc' }, { courseName: 'asc' }]
            : query.sort === 'latest'
              ? [{ updatedAt: 'desc' }]
              : [{ bayesScore: 'desc' }, { reviewCount: 'desc' }, { courseName: 'asc' }];

    const [rows, total] = await Promise.all([
      this.prisma.sharedCourse.findMany({ where, orderBy, skip, take: pageSize }),
      this.prisma.sharedCourse.count({ where }),
    ]);

    return {
      items: rows.map(toSharedCourse),
      total,
      page,
      pageSize,
      hasMore: skip + rows.length < total,
    };
  }

  /**
   * 批量幂等导入广工公共选修课与体育选课目录（供教务一键同步或网页表格导入）。
   * 绝不覆盖已有评价、均分与口碑标签，仅新增课程或补全缺失的课程代码/学院/学分/模块信息。
   */
  async importCatalog(items: CatalogImportItem[], submittedBy: string | null): Promise<CatalogImportResult> {
    const dedup = new Map<string, CatalogImportItem>();
    for (const raw of items) {
      const courseName = normalizeCourseIdentity(raw.courseName).slice(0, 80);
      const teacherName = normalizeCourseIdentity(raw.teacherName).slice(0, 40);
      if (!courseName || !teacherName) continue;
      const campusId = raw.campusId.trim() || DEFAULT_CAMPUS_ID;
      const key = `${courseName.toLowerCase()}|${teacherName.toLowerCase()}|${campusId}`;
      dedup.set(key, {
        ...raw,
        courseName,
        teacherName,
        campusId,
        category: raw.category === 'pe' ? 'pe' : 'general_elective',
      });
    }

    const list = [...dedup.values()];
    if (list.length === 0) return { added: 0, updated: 0, skipped: 0, total: 0 };

    const names = [...new Set(list.map((i) => i.courseName))];
    const existingRows = await this.prisma.sharedCourse.findMany({
      where: { courseName: { in: names } },
      select: {
        id: true,
        courseName: true,
        teacherName: true,
        campusId: true,
        courseCode: true,
        subCategory: true,
        department: true,
        credits: true,
      },
    });

    const existingMap = new Map<string, (typeof existingRows)[number]>();
    for (const r of existingRows) {
      existingMap.set(`${r.courseName.toLowerCase()}|${r.teacherName.toLowerCase()}|${r.campusId}`, r);
    }

    const toCreate: Prisma.SharedCourseCreateManyInput[] = [];
    const toUpdate: { id: string; data: Prisma.SharedCourseUpdateInput }[] = [];
    let skipped = 0;

    for (const item of list) {
      const key = `${item.courseName.toLowerCase()}|${item.teacherName.toLowerCase()}|${item.campusId}`;
      const existing = existingMap.get(key);
      if (!existing) {
        toCreate.push({
          courseCode: item.courseCode ?? null,
          courseName: item.courseName,
          teacherName: item.teacherName,
          campusId: item.campusId,
          category: item.category,
          subCategory: item.subCategory ?? null,
          department: item.department ?? null,
          credits: item.credits ?? null,
          submittedBy,
        });
      } else {
        const patch: Prisma.SharedCourseUpdateInput = {};
        if (!existing.courseCode && item.courseCode) patch.courseCode = item.courseCode;
        if (!existing.subCategory && item.subCategory) patch.subCategory = item.subCategory;
        if (!existing.department && item.department) patch.department = item.department;
        if (existing.credits == null && item.credits != null) patch.credits = item.credits;

        if (Object.keys(patch).length > 0) {
          toUpdate.push({ id: existing.id, data: patch });
        } else {
          skipped += 1;
        }
      }
    }

    let added = 0;
    if (toCreate.length > 0) {
      const created = await this.prisma.sharedCourse.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
      added = created.count;
    }

    for (const u of toUpdate) {
      await this.prisma.sharedCourse.update({ where: { id: u.id }, data: u.data });
    }

    return {
      added,
      updated: toUpdate.length,
      skipped,
      total: list.length,
    };
  }

  /**
   * 脱敏自动扩充目录：当同学同步个人课表或成绩时，仅提取其中公共选修课/体育选课的公共元数据
   * （课程名、老师、学分、校区，不含任何个人隐私与成绩），幂等补充到全校共享库。
   */
  async absorbElectivesFromStudentSync(
    entries: {
      courseCode?: string | null;
      courseName: string;
      teacherName?: string | null;
      courseType?: string | null;
      credits?: number | null;
      campusId?: string | null;
    }[],
  ): Promise<void> {
    const items: CatalogImportItem[] = [];
    for (const e of entries) {
      const detected = detectElectiveCategory({
        courseName: e.courseName,
        courseType: e.courseType,
      });
      if (!detected) continue;
      const teacher = e.teacherName?.trim();
      // 仅收集有明确教师名或明确为公选/体育课且无重复占位的数据
      if (!teacher) continue;
      items.push({
        courseCode: e.courseCode ?? null,
        courseName: e.courseName,
        teacherName: teacher,
        campusId: e.campusId?.trim() || DEFAULT_CAMPUS_ID,
        category: detected.category,
        subCategory: detected.subCategory,
        department: null,
        credits: e.credits ?? null,
      });
    }
    if (items.length === 0) return;
    try {
      await this.importCatalog(items, null);
    } catch (err) {
      this.logger.warn(`脱敏扩充公选/体育目录跳过：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** 查看某门「课程+老师」的详细评价流、考勤与考核统计以及当前用户自己的评价 */
  async getCourseDetail(courseId: string, viewerId: string): Promise<CourseReviewDetailResponse> {
    const courseRow = await this.prisma.sharedCourse.findUnique({ where: { id: courseId } });
    if (!courseRow) {
      throw new AppException(ErrorCode.NOT_FOUND, '课程不存在', HttpStatus.NOT_FOUND);
    }

    const rows = await this.prisma.courseReview.findMany({
      where: { courseId, status: 'visible' },
      include: {
        user: { select: { nickname: true } },
        likes: { where: { userId: viewerId }, select: { userId: true } },
      },
      orderBy: [{ likeCount: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
    });

    const attendanceStats: Record<CourseAttendanceLevel, number> = { none: 0, occasional: 0, strict: 0 };
    const examFormatStats: Record<CourseExamFormat, number> = {
      open_book: 0,
      closed_book: 0,
      paper: 0,
      project: 0,
      mixed: 0,
    };

    const reviews: CourseReviewItem[] = rows.map((r) => {
      if (COURSE_ATTENDANCE_LEVELS.includes(r.attendance)) attendanceStats[r.attendance] += 1;
      if (COURSE_EXAM_FORMATS.includes(r.examFormat)) examFormatStats[r.examFormat] += 1;
      return {
        id: r.id,
        courseId: r.courseId,
        userId: r.userId,
        authorNickname: r.anonymous ? '广工同学' : r.user.nickname,
        anonymous: r.anonymous,
        scoreOverall: r.scoreOverall,
        scoreGrading: r.scoreGrading,
        scoreWorkload: r.scoreWorkload,
        scoreQuality: r.scoreQuality,
        attendance: r.attendance,
        examFormat: r.examFormat,
        semesterTaken: r.semesterTaken,
        tags: r.tags,
        content: r.content,
        likeCount: r.likeCount,
        likedByMe: r.likes.length > 0,
        isMine: r.userId === viewerId,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });

    const myReview = reviews.find((r) => r.isMine) ?? null;
    return {
      course: toSharedCourse(courseRow),
      reviews,
      myReview,
      attendanceStats,
      examFormatStats,
    };
  }

  /** 一体化提交选修课与评价：仅限公共选修课/体育选课，同校区同课程同教师自动合并 */
  async createCourseWithReview(
    userId: string,
    input: CreateCourseAndReviewInput,
  ): Promise<{ course: SharedCourse; review: CourseReviewItem }> {
    const courseName = normalizeCourseIdentity(input.courseName);
    const teacherName = normalizeCourseIdentity(input.teacherName);
    const campusId = input.campusId.trim() || DEFAULT_CAMPUS_ID;
    const category: SharedCourseCategory = input.category === 'pe' ? 'pe' : 'general_elective';
    const dedupTags = [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 6);

    return this.prisma.$transaction(async (tx) => {
      const course = await tx.sharedCourse.upsert({
        where: {
          courseName_teacherName_campusId: { courseName, teacherName, campusId },
        },
        create: {
          courseCode: input.courseCode ?? null,
          courseName,
          teacherName,
          campusId,
          category,
          subCategory: input.subCategory ?? null,
          department: input.department ?? null,
          credits: input.credits ?? null,
          submittedBy: userId,
        },
        update: {
          ...(input.courseCode ? { courseCode: input.courseCode } : {}),
          ...(input.subCategory ? { subCategory: input.subCategory } : {}),
          ...(input.department ? { department: input.department } : {}),
          ...(input.credits != null ? { credits: input.credits } : {}),
        },
      });

      const savedReview = await tx.courseReview.upsert({
        where: { userId_courseId: { userId, courseId: course.id } },
        create: {
          courseId: course.id,
          userId,
          scoreOverall: input.scoreOverall,
          scoreGrading: input.scoreGrading,
          scoreWorkload: input.scoreWorkload,
          scoreQuality: input.scoreQuality,
          attendance: input.attendance,
          examFormat: input.examFormat,
          semesterTaken: input.semesterTaken ?? null,
          tags: dedupTags,
          content: input.content,
          anonymous: input.anonymous,
        },
        update: {
          scoreOverall: input.scoreOverall,
          scoreGrading: input.scoreGrading,
          scoreWorkload: input.scoreWorkload,
          scoreQuality: input.scoreQuality,
          attendance: input.attendance,
          examFormat: input.examFormat,
          semesterTaken: input.semesterTaken ?? null,
          tags: dedupTags,
          content: input.content,
          anonymous: input.anonymous,
          status: 'visible',
        },
        include: {
          user: { select: { nickname: true } },
          likes: { where: { userId }, select: { userId: true } },
        },
      });

      const updatedCourse = await this.recalculateCourseStats(tx, course.id);
      return {
        course: toSharedCourse(updatedCourse),
        review: {
          id: savedReview.id,
          courseId: savedReview.courseId,
          userId: savedReview.userId,
          authorNickname: savedReview.anonymous ? '广工同学' : savedReview.user.nickname,
          anonymous: savedReview.anonymous,
          scoreOverall: savedReview.scoreOverall,
          scoreGrading: savedReview.scoreGrading,
          scoreWorkload: savedReview.scoreWorkload,
          scoreQuality: savedReview.scoreQuality,
          attendance: savedReview.attendance,
          examFormat: savedReview.examFormat,
          semesterTaken: savedReview.semesterTaken,
          tags: savedReview.tags,
          content: savedReview.content,
          likeCount: savedReview.likeCount,
          likedByMe: savedReview.likes.length > 0,
          isMine: true,
          createdAt: savedReview.createdAt.toISOString(),
          updatedAt: savedReview.updatedAt.toISOString(),
        },
      };
    });
  }

  /** 对已存在的共享课程提交或修改自己的评价 */
  async upsertReview(
    userId: string,
    courseId: string,
    input: CourseReviewInput,
  ): Promise<{ course: SharedCourse; review: CourseReviewItem }> {
    const exists = await this.prisma.sharedCourse.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!exists) throw new AppException(ErrorCode.NOT_FOUND, '课程不存在', HttpStatus.NOT_FOUND);

    const dedupTags = [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 6);

    return this.prisma.$transaction(async (tx) => {
      const savedReview = await tx.courseReview.upsert({
        where: { userId_courseId: { userId, courseId } },
        create: {
          courseId,
          userId,
          scoreOverall: input.scoreOverall,
          scoreGrading: input.scoreGrading,
          scoreWorkload: input.scoreWorkload,
          scoreQuality: input.scoreQuality,
          attendance: input.attendance,
          examFormat: input.examFormat,
          semesterTaken: input.semesterTaken ?? null,
          tags: dedupTags,
          content: input.content,
          anonymous: input.anonymous,
        },
        update: {
          scoreOverall: input.scoreOverall,
          scoreGrading: input.scoreGrading,
          scoreWorkload: input.scoreWorkload,
          scoreQuality: input.scoreQuality,
          attendance: input.attendance,
          examFormat: input.examFormat,
          semesterTaken: input.semesterTaken ?? null,
          tags: dedupTags,
          content: input.content,
          anonymous: input.anonymous,
          status: 'visible',
        },
        include: {
          user: { select: { nickname: true } },
          likes: { where: { userId }, select: { userId: true } },
        },
      });

      const updatedCourse = await this.recalculateCourseStats(tx, courseId);
      return {
        course: toSharedCourse(updatedCourse),
        review: {
          id: savedReview.id,
          courseId: savedReview.courseId,
          userId: savedReview.userId,
          authorNickname: savedReview.anonymous ? '广工同学' : savedReview.user.nickname,
          anonymous: savedReview.anonymous,
          scoreOverall: savedReview.scoreOverall,
          scoreGrading: savedReview.scoreGrading,
          scoreWorkload: savedReview.scoreWorkload,
          scoreQuality: savedReview.scoreQuality,
          attendance: savedReview.attendance,
          examFormat: savedReview.examFormat,
          semesterTaken: savedReview.semesterTaken,
          tags: savedReview.tags,
          content: savedReview.content,
          likeCount: savedReview.likeCount,
          likedByMe: savedReview.likes.length > 0,
          isMine: true,
          createdAt: savedReview.createdAt.toISOString(),
          updatedAt: savedReview.updatedAt.toISOString(),
        },
      };
    });
  }

  async deleteMyReview(userId: string, courseId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.courseReview.findUnique({ where: { userId_courseId: { userId, courseId } } });
      if (!existing) throw new AppException(ErrorCode.NOT_FOUND, '你还没有评价过这门课', HttpStatus.NOT_FOUND);
      await tx.courseReview.delete({ where: { id: existing.id } });
      await this.recalculateCourseStats(tx, courseId);
    });
  }

  async toggleLike(userId: string, reviewId: string): Promise<{ liked: boolean; likeCount: number }> {
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.courseReview.findUnique({ where: { id: reviewId }, select: { id: true, status: true } });
      if (!review || review.status !== 'visible') {
        throw new AppException(ErrorCode.NOT_FOUND, '评价不存在', HttpStatus.NOT_FOUND);
      }
      const existing = await tx.courseReviewLike.findUnique({ where: { reviewId_userId: { reviewId, userId } } });
      if (existing) {
        await tx.courseReviewLike.delete({ where: { reviewId_userId: { reviewId, userId } } });
      } else {
        await tx.courseReviewLike.create({ data: { reviewId, userId } });
      }
      const likeCount = await tx.courseReviewLike.count({ where: { reviewId } });
      await tx.courseReview.update({ where: { id: reviewId }, data: { likeCount } });
      return { liked: !existing, likeCount };
    });
  }

  private async recalculateCourseStats(tx: Tx, courseId: string): Promise<SharedCourseRow> {
    const [visibleReviews, globalAgg] = await Promise.all([
      tx.courseReview.findMany({
        where: { courseId, status: 'visible' },
        select: {
          scoreOverall: true,
          scoreGrading: true,
          scoreWorkload: true,
          scoreQuality: true,
          tags: true,
        },
      }),
      tx.courseReview.aggregate({
        where: { status: 'visible' },
        _avg: { scoreOverall: true },
      }),
    ]);

    const agg = computeCourseReviewAggregation(visibleReviews, globalAgg._avg.scoreOverall ?? DEFAULT_GLOBAL_AVG);
    return tx.sharedCourse.update({
      where: { id: courseId },
      data: {
        ratingOverall: agg.ratingOverall,
        ratingGrading: agg.ratingGrading,
        ratingWorkload: agg.ratingWorkload,
        ratingQuality: agg.ratingQuality,
        reviewCount: agg.reviewCount,
        bayesScore: agg.bayesScore,
        topTags: agg.topTags,
      },
    });
  }
}
