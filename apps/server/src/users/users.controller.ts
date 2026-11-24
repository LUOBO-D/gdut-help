import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Req, Res } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Throttle } from '@nestjs/throttler';
import {
  deleteAccountSchema,
  updateProfileSchema,
  type DeleteAccountRequest,
  type UpdateProfileRequest,
  type UserDataExport,
  type UserProfile,
  type UserSecurityOverview,
} from '@gduthelp/shared';
import type { Request } from 'express';
import { REFRESH_COOKIE } from '../auth/auth.controller.js';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { clientIp } from '../common/client-ip.js';
import { SecurityAuditService } from '../security/security-audit.service.js';
import { UsersService } from './users.service.js';

@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly adapterHost: HttpAdapterHost,
    private readonly audit: SecurityAuditService,
  ) {}

  @Get()
  me(@CurrentUser() user: AuthUser): Promise<UserProfile> {
    return this.users.getProfile(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body({ schema: updateProfileSchema }) body: UpdateProfileRequest): Promise<UserProfile> {
    return this.users.updateProfile(user.id, body);
  }

  /** 账号与安全中心：查看本人活跃设备列表与最近 20 条安全事件 */
  @Get('security')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  securityOverview(@CurrentUser() user: AuthUser): Promise<UserSecurityOverview> {
    return this.audit.getUserSecurityOverview(user.id);
  }

  /** 手动下线单个设备会话 */
  @Delete('sessions/:id')
  @HttpCode(200)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Req() req: Request,
  ): Promise<{ revoked: boolean }> {
    const revoked = await this.audit.revokeUserSession(user.id, sessionId, clientIp(req), userAgent);
    return { revoked };
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
    @Headers('user-agent') userAgent: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<null> {
    await this.users.deleteAccount(user.id, body.confirmEmail, clientIp(req), userAgent);
    this.adapterHost.httpAdapter.clearCookie(res, REFRESH_COOKIE, { path: '/api/v1/auth' });
    return null;
  }
}
