import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import {
  ErrorCode,
  type UpdateProfileRequest,
  type UserDataExport,
  type UserProfile,
} from '@gduthelp/shared';
import { UserGuardCacheService } from '../auth/user-guard-cache.service.js';
import { AppException } from '../common/app.exception.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export function toUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    role: user.role,
    campusId: user.campusId,
    remindByEmail: user.remindByEmail,
    remindMeal: user.remindMeal,
    classRemindMinutes: user.classRemindMinutes,
    hasPassword: Boolean(user.passwordHash),
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly guardCache?: UserGuardCacheService,
  ) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppException(ErrorCode.UNAUTHORIZED, '账号不存在', 401);
    return toUserProfile(user);
  }

  async updateProfile(userId: string, data: UpdateProfileRequest): Promise<UserProfile> {
    return toUserProfile(await this.prisma.user.update({ where: { id: userId }, data }));
  }

  /** 导出当前账号的完整个人数据（JSON 备份） */
  async exportData(userId: string): Promise<UserDataExport> {
    const [user, pref, courses, exams, todos, moodLogs, reviews] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.userPreference.findUnique({ where: { userId } }),
      this.prisma.course.findMany({
        where: { userId },
        include: { slots: true, semester: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.exam.findMany({
        where: { userId },
        include: { semester: { select: { name: true } } },
        orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.todo.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.moodLog.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
      }),
      this.prisma.review.findMany({
        where: { userId },
        include: { merchant: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!user) throw new AppException(ErrorCode.UNAUTHORIZED, '账号不存在', HttpStatus.UNAUTHORIZED);

    return {
      exportedAt: new Date().toISOString(),
      profile: toUserProfile(user),
      preference: pref
        ? {
            tastes: pref.tastes,
            dislikes: pref.dislikes,
            budgetMin: pref.budgetMin,
            budgetMax: pref.budgetMax,
          }
        : null,
      courses: courses.map((c) => ({
        name: c.name,
        semester: c.semester.name,
        teacher: c.teacher,
        location: c.location,
        source: c.source,
        slots: c.slots.map((s) => ({
          weekday: s.weekday,
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
          weeks: s.weeks,
          location: s.location,
        })),
      })),
      exams: exams.map((e) => ({
        courseName: e.courseName,
        semester: e.semester.name,
        examDate: e.examDate,
        startTime: e.startTime,
        endTime: e.endTime,
        location: e.location,
        seatNo: e.seatNo,
        examType: e.examType,
        campus: e.campus,
        note: e.note,
        source: e.source,
      })),
      todos: todos.map((t) => ({
        title: t.title,
        note: t.note,
        dueAt: t.dueAt?.toISOString() ?? null,
        priority: t.priority,
        repeat: t.repeat,
        completedAt: t.completedAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
      moodLogs: moodLogs.map((m) => ({
        date: m.date,
        mood: m.mood,
        note: m.note,
      })),
      reviews: reviews.map((r) => ({
        merchantName: r.merchant.name,
        scoreTaste: r.scoreTaste,
        scoreValue: r.scoreValue,
        scoreEnv: r.scoreEnv,
        scoreSpeed: r.scoreSpeed,
        scoreOverall: r.scoreOverall,
        content: r.content,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /** 注销当前账号：核对确认邮箱后级联删除个人数据，并立即吊销所有有效会话 */
  async deleteAccount(userId: string, confirmEmail: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) throw new AppException(ErrorCode.UNAUTHORIZED, '账号不存在', HttpStatus.UNAUTHORIZED);
    if (user.email.toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '确认邮箱与当前账号不一致', HttpStatus.BAD_REQUEST);
    }
    await this.prisma.user.delete({ where: { id: userId } });
    this.guardCache?.markRevokedNow(userId);
  }
}
