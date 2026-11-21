import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  MEAL_TYPES,
  mealFeedbackInputSchema,
  moodInputSchema,
  userPreferenceInputSchema,
  type MealFeedback,
  type MealFeedbackInput,
  type MealRecommendationResponse,
  type MoodInput,
  type MoodLog,
  type UserPreference,
  type UserPreferenceInput,
} from '@gduthelp/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { RecommendService } from './recommend.service.js';

const recommendQuerySchema = z.object({
  meal: z.enum(MEAL_TYPES).optional(),
  exclude: z
    .string()
    .max(2000)
    .optional()
    .transform((raw) =>
      raw
        ? raw
            .split(',')
            .map((id) => id.trim())
            .filter((id) => z.uuid().safeParse(id).success)
            .slice(0, 50)
        : [],
    ),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(14),
});

@Controller()
export class RecommendController {
  constructor(private readonly recommend: RecommendService) {}

  @Get('me/preferences')
  getPreferences(@CurrentUser() user: AuthUser): Promise<UserPreference> {
    return this.recommend.getPreferences(user.id);
  }

  @Put('me/preferences')
  savePreferences(
    @CurrentUser() user: AuthUser,
    @Body({ schema: userPreferenceInputSchema }) body: UserPreferenceInput,
  ): Promise<UserPreference> {
    return this.recommend.savePreferences(user.id, body);
  }

  @Get('mood/today')
  getTodayMood(@CurrentUser() user: AuthUser): Promise<MoodLog | null> {
    return this.recommend.getTodayMood(user.id);
  }

  @Put('mood/today')
  saveTodayMood(
    @CurrentUser() user: AuthUser,
    @Body({ schema: moodInputSchema }) body: MoodInput,
  ): Promise<MoodLog> {
    return this.recommend.saveTodayMood(user.id, body);
  }

  @Get('recommend/meals')
  recommendMeals(
    @CurrentUser() user: AuthUser,
    @Query({ schema: recommendQuerySchema }) q: z.output<typeof recommendQuerySchema>,
  ): Promise<MealRecommendationResponse> {
    return this.recommend.recommendMeals(user.id, { meal: q.meal, excludeIds: q.exclude });
  }

  @Post('recommend/feedback')
  @HttpCode(200)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  feedback(
    @CurrentUser() user: AuthUser,
    @Body({ schema: mealFeedbackInputSchema }) body: MealFeedbackInput,
  ): Promise<MealFeedback> {
    return this.recommend.recordFeedback(user.id, body);
  }

  @Get('recommend/history')
  history(
    @CurrentUser() user: AuthUser,
    @Query({ schema: historyQuerySchema }) q: z.output<typeof historyQuerySchema>,
  ): Promise<MealFeedback[]> {
    return this.recommend.recentFeedback(user.id, q.limit);
  }
}
