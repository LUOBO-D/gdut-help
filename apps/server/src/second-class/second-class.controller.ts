import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  secondClassRecordInputSchema,
  secondClassSyncSchema,
  secondClassTargetsSchema,
  type SecondClassRecord,
  type SecondClassSummaryResponse,
  type SecondClassSyncResult,
} from '@gduthelp/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { SecondClassService } from './second-class.service.js';

const idParam = z.uuid();
const summaryQuerySchema = z.object({
  academicYear: z.string().trim().max(20).optional(),
  semesterCode: z.string().trim().max(20).optional(),
});

@Controller('second-class')
export class SecondClassController {
  constructor(private readonly service: SecondClassService) {}

  @Get('summary')
  summary(
    @CurrentUser() user: AuthUser,
    @Query({ schema: summaryQuerySchema }) q: z.output<typeof summaryQuerySchema>,
  ): Promise<SecondClassSummaryResponse> {
    return this.service.getSummary(user.id, q);
  }

  @Put('targets')
  updateTargets(
    @CurrentUser() user: AuthUser,
    @Body({ schema: secondClassTargetsSchema }) body: z.output<typeof secondClassTargetsSchema>,
  ): Promise<{ semesterTargetHours: number; yearTargetHours: number }> {
    return this.service.updateTargets(user.id, body);
  }

  @Post('sync')
  @HttpCode(200)
  sync(
    @CurrentUser() user: AuthUser,
    @Body({ schema: secondClassSyncSchema }) body: z.output<typeof secondClassSyncSchema>,
  ): Promise<SecondClassSyncResult> {
    return this.service.syncRecords(user.id, body);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: secondClassRecordInputSchema }) body: z.output<typeof secondClassRecordInputSchema>,
  ): Promise<SecondClassRecord> {
    return this.service.create(user.id, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: secondClassRecordInputSchema }) body: z.output<typeof secondClassRecordInputSchema>,
  ): Promise<SecondClassRecord> {
    return this.service.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@CurrentUser() user: AuthUser, @Param('id', { schema: idParam }) id: string): Promise<null> {
    await this.service.remove(user.id, id);
    return null;
  }
}
