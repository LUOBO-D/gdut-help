import { Controller, Get, Inject, Param, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AppBundleManifest, AppUpdateCheckResponse } from '@gduthelp/shared';
import type { Request, Response } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { ENV, type Env } from '../config/env.js';
import { AppUpdateService } from './app-update.service.js';

const SAFE_DEV_HOST = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$/i;

@Public()
@Controller('app')
export class AppUpdateController {
  constructor(
    private readonly updates: AppUpdateService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('update')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  check(@Req() req: Request): AppUpdateCheckResponse {
    const origin = this.resolvePublicOrigin(req);
    const hasApk = this.updates.hasLatestApk();
    const defaultApkPath = hasApk ? '/api/v1/app/apk/latest' : null;
    const defaultApkUrl = defaultApkPath ? (origin ? `${origin}${defaultApkPath}` : defaultApkPath) : null;

    const latest: AppBundleManifest | null = this.updates.getLatest();
    if (!latest) {
      return {
        latest: null,
        downloadPath: null,
        downloadUrl: null,
        apkPath: defaultApkPath,
        apkUrl: defaultApkUrl,
      };
    }
    const downloadPath = `/api/v1/app/bundles/${encodeURIComponent(latest.file)}`;
    return {
      latest,
      downloadPath,
      downloadUrl: origin ? `${origin}${downloadPath}` : downloadPath,
      apkPath: latest.apkUrl ? null : defaultApkPath,
      apkUrl: latest.apkUrl ?? defaultApkUrl,
    };
  }

  @Get('bundles/:filename')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  download(@Param('filename') filename: string, @Res() res: Response) {
    const { filePath, filename: safeName } = this.updates.resolveBundleFile(filename);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(filePath);
  }

  @Get('apk/latest')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  downloadLatestApk(@Res() res: Response) {
    const { filePath, filename } = this.updates.resolveLatestApk();
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(filePath);
  }

  /**
   * 生产环境严格以受信任环境变量 APP_URL 为准，防止攻击者伪造 Host / X-Forwarded-Host 投毒更新下载地址；
   * 仅本地开发环境放行局域网/本机 Host 方便真机调试。
   */
  private resolvePublicOrigin(req: Request): string {
    const configured = this.env.APP_URL.replace(/\/+$/, '');
    if (this.env.NODE_ENV === 'production' && configured) {
      return configured;
    }
    const host = req.header('host')?.trim();
    if (host && SAFE_DEV_HOST.test(host)) {
      return `http://${host}`;
    }
    return configured;
  }
}
