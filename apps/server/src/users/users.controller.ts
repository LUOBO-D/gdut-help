import { Body, Controller, Delete, Get, HttpCode, Patch, Res } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Throttle } from '@nestjs/throttler';
import {
  deleteAccountSchema,
  updateProfileSchema,
  type DeleteAccountRequest,
  type UpdateProfileRequest,
  type UserDataExport,
  type UserProfile,
} from '@gduthelp/shared';
import { REFRESH_COOKIE } from '../auth/auth.controller.js';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { UsersService } from './users.service.js';

@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  @Get()
  me(@CurrentUser() user: AuthUser): Promise<UserProfile> {
    return this.users.getProfile(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body({ schema: updateProfileSchema }) body: UpdateProfileRequest): Promise<UserProfile> {
    return this.users.updateProfile(user.id, body);
  }

  @Get('export')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  exportData(@CurrentUser() user: AuthUser): Promise<UserDataExport> {
    return this.users.exportData(user.id);
  }

  @Delete()
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body({ schema: deleteAccountSchema }) body: DeleteAccountRequest,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<null> {
    await this.users.deleteAccount(user.id, body.confirmEmail);
    this.adapterHost.httpAdapter.clearCookie(res, REFRESH_COOKIE, { path: '/api/v1/auth' });
    return null;
  }
}
