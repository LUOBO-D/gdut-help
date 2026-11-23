import { Module } from '@nestjs/common';
import { CourseSelectionController } from './course-selection.controller.js';
import { CourseSelectionService } from './course-selection.service.js';

@Module({
  controllers: [CourseSelectionController],
  providers: [CourseSelectionService],
})
export class CourseSelectionModule {}
