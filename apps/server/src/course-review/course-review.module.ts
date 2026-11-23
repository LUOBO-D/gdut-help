import { Module } from '@nestjs/common';
import { CourseReviewController } from './course-review.controller.js';
import { CourseReviewService } from './course-review.service.js';

@Module({
  controllers: [CourseReviewController],
  providers: [CourseReviewService],
  exports: [CourseReviewService],
})
export class CourseReviewModule {}
