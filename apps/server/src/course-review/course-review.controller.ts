import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  catalogImportSchema,
  courseListQuerySchema,
  courseReviewInputSchema,
  createCourseAndReviewSchema,
  type CatalogImportRequest,
  type CatalogImportResult,
  type CourseListQuery,
  type CourseReviewDetailResponse,
  type CourseReviewInput,
  type CourseReviewItem,
  type CourseReviewListResponse,
  type CreateCourseAndReviewInput,
  type SharedCourse,
} from '@gduthelp/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { CourseReviewService } from './course-review.service.js';

const idParam = z.uuid();

@Controller('course-reviews')
export class CourseReviewController {
  constructor(private readonly service: CourseReviewService) {}

  @Get('courses')
  list(@Query({ schema: courseListQuerySchema }) q: CourseListQuery): Promise<CourseReviewListResponse> {
    return this.service.listCourses(q);
  }

  @Post('catalog/import')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  importCatalog(
    @CurrentUser() user: AuthUser,
    @Body({ schema: catalogImportSchema }) body: CatalogImportRequest,
  ): Promise<CatalogImportResult> {
    return this.service.importCatalog(body.items, user.id);
  }

  @Post('courses')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  createWithReview(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createCourseAndReviewSchema }) body: CreateCourseAndReviewInput,
  ): Promise<{ course: SharedCourse; review: CourseReviewItem }> {
    return this.service.createCourseWithReview(user.id, body);
  }

  @Get('courses/:id')
  detail(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ): Promise<CourseReviewDetailResponse> {
    return this.service.getCourseDetail(id, user.id);
  }

  @Put('courses/:id/review')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  upsertReview(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: courseReviewInputSchema }) body: CourseReviewInput,
  ): Promise<{ course: SharedCourse; review: CourseReviewItem }> {
    return this.service.upsertReview(user.id, id, body);
  }

  @Delete('courses/:id/review')
  @HttpCode(200)
  async removeReview(@CurrentUser() user: AuthUser, @Param('id', { schema: idParam }) id: string): Promise<null> {
    await this.service.deleteMyReview(user.id, id);
    return null;
  }

  @Post('reviews/:id/like')
  @HttpCode(200)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  toggleLike(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    return this.service.toggleLike(user.id, id);
  }
}
