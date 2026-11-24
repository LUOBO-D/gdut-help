import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AppBundleManifest } from '@gduthelp/shared';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { ENV, type Env } from '../config/env.js';

const BUNDLE_FILE_RE = /^bundle-[a-zA-Z0-9._-]+\.zip$/;
const LATEST_APK_FILENAME = 'gdut-help-latest.apk';

const manifestSchema = z.object({
  version: z.string().trim().min(1).max(40),
  minNativeVersion: z.number().int().min(1).default(1),
  notes: z.string().max(2000).default(''),
  file: z.string().regex(BUNDLE_FILE_RE, '无效的资源包文件名'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  apkUrl: z.string().url().max(500).optional(),
  forceUpgrade: z.boolean().optional(),
  publishedAt: z.string().min(1),
});

/**
 * 自托管安卓 App OTA 热更新与安装包分发服务。
 *
 * 读取 OTA_DIR（默认 apps/server/ota-bundles）下的 manifest.json、zip 资源包以及可选的 gdut-help-latest.apk，
 * 不依赖第三方付费云服务，改完前端后运行 `pnpm ota:cloud <version> "<更新说明>"` 即可生效。
 */
@Injectable()
export class AppUpdateService {
  private readonly logger = new Logger(AppUpdateService.name);
  private readonly otaDir: string;
  private apkShaCache: { mtimeMs: number; size: number; sha256: string } | null = null;

  constructor(@Inject(ENV) env: Env) {
    this.otaDir = resolve(env.OTA_DIR || resolve(process.cwd(), 'ota-bundles'));
  }

  getLatest(): AppBundleManifest | null {
    const manifestPath = join(this.otaDir, 'manifest.json');
    if (!existsSync(manifestPath)) return null;
    try {
      const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as unknown;
      const parsed = manifestSchema.safeParse(raw);
      if (!parsed.success) {
        this.logger.warn(`OTA manifest.json 格式无效：${parsed.error.issues[0]?.message ?? 'unknown'}`);
        return null;
      }
      const bundlePath = join(this.otaDir, parsed.data.file);
      if (!existsSync(bundlePath)) {
        this.logger.warn(`OTA manifest 指向的文件不存在：${parsed.data.file}`);
        return null;
      }
      const sizeBytes = parsed.data.sizeBytes ?? statSync(bundlePath).size;
      return { ...parsed.data, sizeBytes };
    } catch (err) {
      this.logger.warn(`读取 OTA manifest.json 失败：${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** 是否在云端目录托管了最新版 APK 安装包 */
  hasLatestApk(): boolean {
    return existsSync(join(this.otaDir, LATEST_APK_FILENAME));
  }

  /** 计算并缓存最新版正式签名 APK 的 SHA-256 指纹，供客户端与用户核验 */
  getLatestApkSha256(): string | null {
    const filePath = join(this.otaDir, LATEST_APK_FILENAME);
    if (!existsSync(filePath)) return null;
    try {
      const st = statSync(filePath);
      if (this.apkShaCache && this.apkShaCache.mtimeMs === st.mtimeMs && this.apkShaCache.size === st.size) {
        return this.apkShaCache.sha256;
      }
      const sha256 = createHash('sha256').update(readFileSync(filePath)).digest('hex');
      this.apkShaCache = { mtimeMs: st.mtimeMs, size: st.size, sha256 };
      return sha256;
    } catch {
      return null;
    }
  }

  /** 解析服务端托管的最新版 APK 绝对路径 */
  resolveLatestApk(): { filePath: string; filename: string } {
    const filePath = resolve(this.otaDir, LATEST_APK_FILENAME);
    if (!existsSync(filePath)) {
      throw new NotFoundException('暂无可下载的安装包');
    }
    const latest = this.getLatest();
    const safeVersion = latest?.version.replace(/[^a-zA-Z0-9._-]/g, '');
    const filename = safeVersion ? `gdut-help-v${safeVersion}.apk` : 'gdut-help.apk';
    return { filePath, filename };
  }

  /** 严格校验文件名并解析到磁盘绝对路径，防止路径穿越 */
  resolveBundleFile(filename: string): { filePath: string; filename: string } {
    if (!BUNDLE_FILE_RE.test(filename) || filename.includes('..')) {
      throw new BadRequestException('非法的资源包文件名');
    }
    const filePath = resolve(this.otaDir, filename);
    const rootWithSep = this.otaDir.endsWith('\\') || this.otaDir.endsWith('/') ? this.otaDir : `${this.otaDir}${process.platform === 'win32' ? '\\' : '/'}`;
    if (!filePath.startsWith(rootWithSep)) {
      throw new BadRequestException('非法的资源包路径');
    }
    if (!existsSync(filePath)) {
      throw new NotFoundException('资源包不存在');
    }
    return { filePath, filename };
  }
}
