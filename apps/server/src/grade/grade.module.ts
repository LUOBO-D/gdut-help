import { Module } from '@nestjs/common';
import { GradeController } from './grade.controller.js';
import { GradeService } from './grade.service.js';

@Module({
  controllers: [GradeController],
  providers: [GradeService],
  exports: [GradeService],
})
export class GradeModule {}
