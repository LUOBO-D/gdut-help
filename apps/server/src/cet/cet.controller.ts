import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  cetRecordInputSchema,
  cetSyncSchema,
  type CetRecord,
  type CetRecordInput,
  type CetSyncRequest,
  type CetSyncResult,
} from '@gduthelp/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { CetService } from './cet.service.js';

const idParam = z.uuid();

@Controller('cet')
export class CetController {
  constructor(private readonly cet: CetService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<CetRecord[]> {
    return this.cet.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: cetRecordInputSchema }) body: CetRecordInput,
  ): Promise<CetRecord> {
    return this.cet.upsert(user.id, body, 'manual');
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: cetRecordInputSchema }) body: CetRecordInput,
  ): Promise<CetRecord> {
    return this.cet.update(user.id, id, body);
  }

  @Post('sync')
  @HttpCode(200)
  sync(
    @CurrentUser() user: AuthUser,
    @Body({ schema: cetSyncSchema }) body: CetSyncRequest,
  ): Promise<CetSyncResult> {
    return this.cet.sync(user.id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
  ): Promise<null> {
    await this.cet.remove(user.id, id);
    return null;
  }
}
