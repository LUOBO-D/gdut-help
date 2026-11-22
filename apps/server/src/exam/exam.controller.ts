import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  examImportSchema,
  examInputSchema,
  type Exam,
  type ExamData,
  type ExamImportResult,
} from '@gduthelp/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { ExamService } from './exam.service.js';

type ExamInputData = z.output<typeof examInputSchema>;
type ExamImportData = z.output<typeof examImportSchema>;
const idParam = z.uuid();

@Controller('exams')
export class ExamController {
  constructor(private readonly exams: ExamService) {}

  @Get()
  data(@CurrentUser() user: AuthUser): Promise<ExamData> {
    return this.exams.data(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body({ schema: examInputSchema }) body: ExamInputData): Promise<Exam> {
    return this.exams.create(user.id, body);
  }

  @Post('import')
  @HttpCode(200)
  importExams(
    @CurrentUser() user: AuthUser,
    @Body({ schema: examImportSchema }) body: ExamImportData,
  ): Promise<ExamImportResult> {
    return this.exams.importExams(user.id, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: examInputSchema }) body: ExamInputData,
  ): Promise<Exam> {
    return this.exams.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@CurrentUser() user: AuthUser, @Param('id', { schema: idParam }) id: string): Promise<null> {
    await this.exams.remove(user.id, id);
    return null;
  }
}
