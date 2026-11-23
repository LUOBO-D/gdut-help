import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  courseGradeInputSchema,
  creditPlanInputSchema,
  gradeSyncSchema,
  type CourseGrade,
  type CreditPlan,
  type GradeData,
  type GradeSyncResult,
} from '@gduthelp/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { GradeService } from './grade.service.js';

type CourseGradeInputData = z.output<typeof courseGradeInputSchema>;
type GradeSyncData = z.output<typeof gradeSyncSchema>;
type CreditPlanInputData = z.output<typeof creditPlanInputSchema>;
const idParam = z.uuid();

@Controller('grades')
export class GradeController {
  constructor(private readonly grades: GradeService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<GradeData> {
    return this.grades.list(user.id);
  }

  @Get('credit-plan')
  getCreditPlan(@CurrentUser() user: AuthUser): Promise<CreditPlan> {
    return this.grades.getCreditPlan(user.id);
  }

  @Put('credit-plan')
  upsertCreditPlan(
    @CurrentUser() user: AuthUser,
    @Body({ schema: creditPlanInputSchema }) body: CreditPlanInputData,
  ): Promise<CreditPlan> {
    return this.grades.upsertCreditPlan(user.id, body);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: courseGradeInputSchema }) body: CourseGradeInputData,
  ): Promise<CourseGrade> {
    return this.grades.create(user.id, body);
  }

  @Post('sync')
  @HttpCode(200)
  sync(
    @CurrentUser() user: AuthUser,
    @Body({ schema: gradeSyncSchema }) body: GradeSyncData,
  ): Promise<GradeSyncResult> {
    return this.grades.syncGrades(user.id, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: courseGradeInputSchema }) body: CourseGradeInputData,
  ): Promise<CourseGrade> {
    return this.grades.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@CurrentUser() user: AuthUser, @Param('id', { schema: idParam }) id: string): Promise<null> {
    await this.grades.remove(user.id, id);
    return null;
  }
}
