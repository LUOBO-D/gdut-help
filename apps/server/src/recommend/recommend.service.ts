import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import {
  DEFAULT_CAMPUS_ID,
  ErrorCode,
  addDays,
  analyzeMealWindow,
  daysBetween,
  defaultMealForHour,
  findCampus,
  scoreAndRecommendMeals,
  sessionsOn,
  shanghaiDate,
  today,
  type FeedbackSignal,
  type MealFeedback,
  type MealFeedbackInput,
  type MealRecommendationResponse,
  type MealType,
  type MoodInput,
  type MoodLog,
  type UserPreference,
  type UserPreferenceInput,
  type WeatherNow,
} from '@gduthelp/shared';
import { AppException } from '../common/app.exception.js';
import type { MoodLog as MoodLogRow, UserPreference as UserPreferenceRow } from '../generated/prisma/client.js';
import { MerchantService } from '../merchant/merchant.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TimetableService } from '../timetable/timetable.service.js';
import { WeatherService } from '../weather/weather.service.js';
import { LlmReasonService } from './llm-reason.service.js';

function toPreference(row: UserPreferenceRow | null): UserPreference {
  if (!row) {
    return { tastes: [], dislikes: [], budgetMin: null, budgetMax: null, updatedAt: null };
  }
  return {
    tastes: row.tastes,
    dislikes: row.dislikes,
    budgetMin: row.budgetMin,
    budgetMax: row.budgetMax,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMoodLog(row: MoodLogRow): MoodLog {
  return {
    id: row.id,
    date: row.date,
    mood: row.mood,
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class RecommendService {
  private readonly logger = new Logger(RecommendService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MerchantService,
    private readonly weather: WeatherService,
    private readonly timetable: TimetableService,
    @Optional() private readonly llmReason?: LlmReasonService,
  ) {}

  async getPreferences(userId: string): Promise<UserPreference> {
    const row = await this.prisma.userPreference.findUnique({ where: { userId } });
    return toPreference(row);
  }

  async savePreferences(userId: string, input: UserPreferenceInput): Promise<UserPreference> {
    // 忌口优先级高于口味偏好，避免同一标签同时出现在两侧
    const dislikeSet = new Set(input.dislikes);
    const tastes = input.tastes.filter((t) => !dislikeSet.has(t));
    const row = await this.prisma.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        tastes,
        dislikes: input.dislikes,
        budgetMin: input.budgetMin ?? null,
        budgetMax: input.budgetMax ?? null,
      },
      update: {
        tastes,
        dislikes: input.dislikes,
        budgetMin: input.budgetMin ?? null,
        budgetMax: input.budgetMax ?? null,
      },
    });
    return toPreference(row);
  }

  async getTodayMood(userId: string, now: Date = new Date()): Promise<MoodLog | null> {
    const date = today(now);
    const row = await this.prisma.moodLog.findUnique({ where: { userId_date: { userId, date } } });
    return row ? toMoodLog(row) : null;
  }

  async saveTodayMood(userId: string, input: MoodInput, now: Date = new Date()): Promise<MoodLog> {
    const date = today(now);
    const row = await this.prisma.moodLog.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, mood: input.mood, note: input.note ?? null },
      update: { mood: input.mood, note: input.note ?? null },
    });
    return toMoodLog(row);
  }

  async recordFeedback(userId: string, input: MealFeedbackInput, now: Date = new Date()): Promise<MealFeedback> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: input.merchantId },
      select: { id: true, name: true },
    });
    if (!merchant) throw new AppException(ErrorCode.NOT_FOUND, '商家不存在', HttpStatus.NOT_FOUND);
    const date = today(now);
    const row = await this.prisma.mealFeedback.create({
      data: {
        userId,
        merchantId: input.merchantId,
        meal: input.meal,
        action: input.action,
        date,
      },
    });
    return {
      id: row.id,
      merchantId: row.merchantId,
      merchantName: merchant.name,
      meal: row.meal,
      action: row.action,
      date: row.date,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async recentFeedback(userId: string, limit = 14): Promise<MealFeedback[]> {
    const rows = await this.prisma.mealFeedback.findMany({
      where: { userId, action: 'accepted' },
      include: { merchant: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(30, Math.max(1, limit)),
    });
    return rows.map((r) => ({
      id: r.id,
      merchantId: r.merchantId,
      merchantName: r.merchant.name,
      meal: r.meal,
      action: r.action,
      date: r.date,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async recommendMeals(
    userId: string,
    opts: { meal?: MealType; excludeIds?: string[]; now?: Date },
  ): Promise<MealRecommendationResponse> {
    const now = opts.now ?? new Date();
    const date = today(now);
    const shanghaiHour = new Date(now.getTime() + 8 * 60 * 60 * 1000).getUTCHours();
    const meal: MealType = opts.meal ?? defaultMealForHour(shanghaiHour);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { campusId: true },
    });
    const campusId = user?.campusId ?? DEFAULT_CAMPUS_ID;
    const campus = findCampus(campusId) ?? findCampus(DEFAULT_CAMPUS_ID)!;

    const sinceDate = addDays(date, -14);
    const [allMerchants, prefRow, moodRow, feedbackRows, timetableData] = await Promise.all([
      this.merchants.listApprovedForCampus(campusId),
      this.prisma.userPreference.findUnique({ where: { userId } }),
      this.prisma.moodLog.findUnique({ where: { userId_date: { userId, date } } }),
      this.prisma.mealFeedback.findMany({
        where: { userId, date: { gte: sinceDate } },
        orderBy: { createdAt: 'desc' },
      }),
      this.timetable.data(userId),
    ]);

    // 天气服务失败时优雅降级，不影响推荐正常返回
    let weatherNow: WeatherNow | null = null;
    try {
      const report = await this.weather.get(campus.lat, campus.lng, `${campus.area} · ${campus.name}`);
      weatherNow = report.now;
    } catch (err) {
      this.logger.warn(`推荐时获取天气失败，按无天气降级：${err instanceof Error ? err.message : String(err)}`);
    }

    const todaySessions = sessionsOn(timetableData, date, campusId);
    const schedule = analyzeMealWindow(todaySessions, meal);

    const feedbackSignals: FeedbackSignal[] = feedbackRows.map((fb) => ({
      merchantId: fb.merchantId,
      action: fb.action,
      meal: fb.meal,
      daysAgo: Math.max(0, daysBetween(fb.date, date)),
    }));

    const pref = toPreference(prefRow);
    const mood = moodRow ? toMoodLog(moodRow) : null;

    // 计算无 excludeIds 时总可选商家，便于前端判断「换一批」是否已看完
    const allEligible = scoreAndRecommendMeals({
      merchants: allMerchants,
      meal,
      weather: weatherNow,
      schedule,
      mood: mood?.mood ?? null,
      preference: pref,
      feedbacks: feedbackSignals,
      limit: allMerchants.length || 1,
    });

    const rawItems = scoreAndRecommendMeals({
      merchants: allMerchants,
      meal,
      weather: weatherNow,
      schedule,
      mood: mood?.mood ?? null,
      preference: pref,
      feedbacks: feedbackSignals,
      excludeIds: opts.excludeIds,
      limit: 3,
    });

    const weatherSummary = weatherNow
      ? `${Math.round(weatherNow.temp)}° ${weatherNow.text}`
      : null;

    // 配置了 LLM_API_KEY 时用大模型润色推荐理由（3 秒超时并带缓存），否则零开销直接返回规则理由
    const items = this.llmReason
      ? await this.llmReason.polish({
          userId,
          date,
          meal,
          mood: mood?.mood ?? null,
          weatherSummary,
          scheduleHint: schedule.hint,
          items: rawItems,
        })
      : rawItems;

    // 用于调试或日志：保持今天日期按北京时区一致
    void shanghaiDate(now);

    return {
      meal,
      date,
      mood,
      weatherSummary,
      scheduleHint: schedule.hint,
      totalMerchants: allMerchants.length,
      eligibleCount: allEligible.length,
      items,
    };
  }
}
