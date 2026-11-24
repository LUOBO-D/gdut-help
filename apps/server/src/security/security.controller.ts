import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AdminOnly, CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { clientIp } from '../common/client-ip.js';
import { ActiveDefenseService, type SecuritySummary } from './active-defense.service.js';
import { SecurityAuditService, type AdminAuditLogItem } from './security-audit.service.js';

const unbanSchema = z.object({
  ip: z.string().trim().min(3).max(64),
});

const minNativeVersionSchema = z.object({
  minNativeVersion: z.number().int().min(0).max(999),
});

const revokeLegacySchema = z.object({
  minNativeVersion: z.number().int().min(1).max(999).default(7),
});

@AdminOnly()
@Controller('admin/security')
export class SecurityController {
  constructor(
    private readonly defense: ActiveDefenseService,
    private readonly audit: SecurityAuditService,
  ) {}

  @Get('summary')
  summary(): SecuritySummary {
    return this.defense.getSummary();
  }

  @Get('audit-logs')
  auditLogs(@Query('limit') rawLimit?: string): Promise<AdminAuditLogItem[]> {
    const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : 50;
    const limit = Number.isFinite(parsed) ? parsed : 50;
    return this.audit.getRecentAdminLogs(limit);
  }

  @Post('unban')
  @HttpCode(200)
  unban(
    @CurrentUser() user: AuthUser,
    @Body({ schema: unbanSchema }) body: z.output<typeof unbanSchema>,
  ): { unbanned: boolean } {
    return { unbanned: this.defense.unbanIp(body.ip, user.id) };
  }

  /** 动态调整服务端强制要求的最低原生外壳 versionCode（0=不拦截，>=7 立即拦截旧 Debug 包返回 426） */
  @Post('min-native-version')
  @HttpCode(200)
  setMinNativeVersion(
    @CurrentUser() user: AuthUser,
    @Body({ schema: minNativeVersionSchema }) body: z.output<typeof minNativeVersionSchema>,
    @Req() req: Request,
  ): { minNativeVersion: number } {
    const minNativeVersion = this.defense.setMinNativeVersion(body.minNativeVersion);
    this.audit.log({
      event: 'admin_set_min_native_version',
      severity: 'warn',
      userId: user.id,
      ip: clientIp(req),
      detail: { minNativeVersion },
    });
    return { minNativeVersion };
  }

  /** 一键吊销低于指定原生版本号的旧版测试包刷新令牌，加速淘汰历史 Debug 安装包 */
  @Post('revoke-legacy-native')
  @HttpCode(200)
  async revokeLegacyNative(
    @CurrentUser() user: AuthUser,
    @Body({ schema: revokeLegacySchema }) body: z.output<typeof revokeLegacySchema>,
    @Req() req: Request,
  ): Promise<{ revokedCount: number }> {
    const revokedCount = await this.audit.revokeLegacyNativeSessions(body.minNativeVersion, user.id, clientIp(req));
    return { revokedCount };
  }
}
