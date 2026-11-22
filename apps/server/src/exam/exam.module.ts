import { Module } from '@nestjs/common';
import { TimetableModule } from '../timetable/timetable.module.js';
import { ExamController } from './exam.controller.js';
import { ExamService } from './exam.service.js';

@Module({
  imports: [TimetableModule],
  controllers: [ExamController],
  providers: [ExamService],
  exports: [ExamService],
})
export class ExamModule {}
