import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  courseSelectionInputSchema,
  courseSelectionSyncSchema,
  type CourseSelectionInput,
  type CourseSelectionReminder,
  type CourseSelectionSyncRequest,
} from '@gduthelp/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { CourseSelectionService } from './course-selection.service.js';

const idParam = z.uuid();

@Controller('course-selections')
export class CourseSelectionController {
  constructor(private readonly selections: CourseSelectionService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<CourseSelectionReminder[]> {
    return this.selections.list(user.id);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: courseSelectionInputSchema }) body: CourseSelectionInput,
  ): Promise<CourseSelectionReminder> {
    return this.selections.create(user.id, body);
  }

  @Put(':id')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: courseSelectionInputSchema }) body: CourseSelectionInput,
  ): Promise<CourseSelectionReminder> {
    return this.selections.update(user.id, id, body);
  }

  @Post('sync')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  sync(
    @CurrentUser() user: AuthUser,
    @Body({ schema: courseSelectionSyncSchema }) body: CourseSelectionSyncRequest,
  ): Promise<{ added: number; total: number }> {
    return this.selections.sync(user.id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ): Promise<null> {
    await this.selections.remove(user.id, id);
    return null;
  }
}
