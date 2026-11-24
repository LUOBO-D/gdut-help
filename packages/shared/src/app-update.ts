export interface AppBundleManifest {
  /** 前端热更新资源包版本（语义化版本，例如 0.3.2） */
  version: string;
  /** 要求的最低原生外壳 versionCode；新增原生插件时递增以提示下载新版 APK */
  minNativeVersion: number;
  /** 本次更新说明（支持换行分条展示） */
  notes: string;
  /** 服务端托管的 zip 文件名，例如 bundle-0.3.2.zip */
  file: string;
  /** 压缩包 SHA-256 十六进制摘要（用于核对完整性） */
  sha256?: string;
  /** 压缩包体积（字节），用于在更新弹窗展示下载大小 */
  sizeBytes?: number;
  /** 可选：自定义最新版 APK 下载地址（未填时自动使用服务端托管的 /api/v1/app/apk/latest） */
  apkUrl?: string;
  /** 可选：安全紧急更新标志；为 true 且需要原生升级时，客户端不允许点击「暂不更新」 */
  forceUpgrade?: boolean;
  /** 发布时间（ISO 8601） */
  publishedAt: string;
}

export interface AppUpdateCheckResponse {
  latest: AppBundleManifest | null;
  /** 相对 API 根路径的下载地址（如 /api/v1/app/bundles/bundle-0.3.2.zip） */
  downloadPath: string | null;
  /** 服务端推导的完整下载地址；客户端优先用当前生效的 API Origin + downloadPath */
  downloadUrl: string | null;
  /** 相对 API 根路径的最新版 APK 下载路径（若服务端已托管 APK） */
  apkPath?: string | null;
  /** 最新版 APK 的完整下载链接（优先取 manifest.apkUrl，其次取服务端托管 APK） */
  apkUrl?: string | null;
  /** 最新版正式签名 APK 的 SHA-256 校验指纹（便于用户在安全中心公开核验） */
  apkSha256?: string | null;
  /** 服务端当前强制要求的最低原生外壳 versionCode（0 表示暂不强制拦截） */
  minSupportedNativeVersion?: number;
}

/** 比较语义化版本（仅主/次/修订号）：a > b 返回正数，相等返回 0，a < b 返回负数 */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** 将多行或字面量 `\n` 分隔的更新说明拆成干净的条目列表，去除重复的序号/项目符号前缀 */
export function parseReleaseNotes(notes?: string | null): string[] {
  if (!notes) return [];
  return notes
    .replace(/\\n/g, '\n')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*•·]\s+|\d+[.、)）]\s*)/, '').trim())
    .filter(Boolean);
}

/** 将字节数格式化为易读的文件大小（如 830 KB / 1.25 MB） */
export function formatBundleSize(bytes?: number | null): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
