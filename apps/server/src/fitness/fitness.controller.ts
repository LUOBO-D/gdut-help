import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  fitnessImportSchema,
  fitnessRecordInputSchema,
  type FitnessData,
  type FitnessImportResult,
  type FitnessRecord,
} from '@gduthelp/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { FitnessService } from './fitness.service.js';

type FitnessRecordInputData = z.output<typeof fitnessRecordInputSchema>;
type FitnessImportData = z.output<typeof fitnessImportSchema>;
const idParam = z.uuid();

@Controller('fitness')
export class FitnessController {
  constructor(private readonly fitness: FitnessService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<FitnessData> {
    return this.fitness.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: fitnessRecordInputSchema }) body: FitnessRecordInputData,
  ): Promise<FitnessRecord> {
    return this.fitness.create(user.id, body);
  }

  @Post('import')
  @HttpCode(200)
  importRecords(
    @CurrentUser() user: AuthUser,
    @Body({ schema: fitnessImportSchema }) body: FitnessImportData,
  ): Promise<FitnessImportResult> {
    return this.fitness.importRecords(user.id, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: fitnessRecordInputSchema }) body: FitnessRecordInputData,
  ): Promise<FitnessRecord> {
    return this.fitness.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@CurrentUser() user: AuthUser, @Param('id', { schema: idParam }) id: string): Promise<null> {
    await this.fitness.remove(user.id, id);
    return null;
  }
}
