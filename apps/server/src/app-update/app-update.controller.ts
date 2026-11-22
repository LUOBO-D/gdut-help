import { Controller, Get, Inject, Param, Req, Res } from '@nestjs/common';
import type { AppUpdateCheckResponse } from '@gduthelp/shared';
import type { Request, Response } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { ENV, type Env } from '../config/env.js';
import { AppUpdateService } from './app-update.service.js';

@Public()
@Controller('app')
export class AppUpdateController {
  constructor(
    private readonly updates: AppUpdateService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('update')
  check(@Req() req: Request): AppUpdateCheckResponse {
    const origin = this.resolvePublicOrigin(req);
    const hasApk = this.updates.hasLatestApk();
    const defaultApkPath = hasApk ? '/api/v1/app/apk/latest' : null;
    const defaultApkUrl = defaultApkPath ? (origin ? `${origin}${defaultApkPath}` : defaultApkPath) : null;

    const latest = this.updates.getLatest();
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
  download(@Param('filename') filename: string, @Res() res: Response) {
    const { filePath, filename: safeName } = this.updates.resolveBundleFile(filename);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(filePath);
  }

  @Get('apk/latest')
  downloadLatestApk(@Res() res: Response) {
    const { filePath, filename } = this.updates.resolveLatestApk();
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(filePath);
  }

  private resolvePublicOrigin(req: Request): string {
    const forwardedHost = req.header('x-forwarded-host')?.split(',')[0]?.trim();
    const host = forwardedHost || req.header('host')?.trim();
    if (host) {
      const forwardedProto = req.header('x-forwarded-proto')?.split(',')[0]?.trim();
      const proto = forwardedProto || (host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https');
      return `${proto}://${host}`;
    }
    return this.env.APP_URL.replace(/\/+$/, '');
  }
}
