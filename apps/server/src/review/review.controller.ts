import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  MERCHANT_CATEGORIES,
  RANKING_TYPES,
  reviewInputSchema,
  type MerchantReviewsResponse,
  type RankingResponse,
  type Review,
  type ReviewInput,
} from '@gduthelp/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { ReviewService } from './review.service.js';

const idParam = z.uuid();

const rankingQuerySchema = z.object({
  type: z.enum(RANKING_TYPES).default('overall'),
  campusId: z.string().trim().max(32).optional(),
  category: z.enum(MERCHANT_CATEGORIES).optional(),
});

@Controller()
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Get('rankings')
  rankings(@Query({ schema: rankingQuerySchema }) q: z.output<typeof rankingQuerySchema>): Promise<RankingResponse> {
    return this.reviews.getRankings(q);
  }

  @Get('merchants/:id/reviews')
  listForMerchant(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ): Promise<MerchantReviewsResponse> {
    return this.reviews.listForMerchant(id, user.id);
  }

  @Put('merchants/:id/review')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  upsert(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: reviewInputSchema }) body: ReviewInput,
  ): Promise<Review> {
    return this.reviews.upsertReview(user.id, id, body);
  }

  @Delete('merchants/:id/review')
  @HttpCode(200)
  async remove(@CurrentUser() user: AuthUser, @Param('id', { schema: idParam }) id: string): Promise<null> {
    await this.reviews.deleteMyReview(user.id, id);
    return null;
  }

  @Post('reviews/:id/like')
  @HttpCode(200)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  toggleLike(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    return this.reviews.toggleLike(user.id, id);
  }
}
