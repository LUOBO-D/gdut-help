import { isIP } from 'node:net';
import type { Request } from 'express';

let trustCloudflareHeaders = false;

/** 仅当宿主机 UFW 严格限制 443 仅放行 Cloudflare 回源 IP 时启用，防止攻击者伪造 CF-Connecting-IP */
export function setTrustCfHeaders(enabled: boolean): void {
  trustCloudflareHeaders = enabled;
}

/** 客户端真实 IP。默认依赖 trust proxy loopback；启用 Cloudflare 回源模式时优先取 CF-Connecting-IP。 */
export function clientIp(req: Request): string {
  if (trustCloudflareHeaders) {
    const cfIp = req.header('cf-connecting-ip')?.trim();
    if (cfIp && isIP(cfIp) !== 0) return cfIp;
  }
  const raw = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

/** 对用户展示 IP 时脱敏后两段，保护隐私同时可核验归属网段 */
export function maskIp(raw?: string | null): string | null {
  if (!raw) return null;
  const ip = raw.trim().replace(/^::ffff:/, '');
  if (!ip || ip === 'unknown') return null;
  if (ip === '127.0.0.1' || ip === '::1') return '本机';
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  }
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}:${parts[1]}:*:*`;
  }
  return ip.slice(0, 16);
}

/** 将 User-Agent 提炼为人类可读的设备与平台标签 */
export function parseDeviceLabel(
  ua?: string | null,
  nativeVersion?: number | null,
): { label: string; platform: 'android' | 'ios' | 'desktop' | 'web' } {
  const s = (ua ?? '').trim();
  if (nativeVersion != null && nativeVersion > 0) {
    const model = s.match(/Android\s+[\d.]+;\s*([^;)]+?)(?:\s+Build\/|[;)])/i)?.[1]?.trim();
    return {
      label: model ? `Android App · ${model.slice(0, 24)} (v${nativeVersion})` : `GDUT Help 安卓端 (v${nativeVersion})`,
      platform: 'android',
    };
  }
  if (/Android/i.test(s)) {
    const isWv = /; wv\)|Capacitor/i.test(s);
    const model = s.match(/Android\s+[\d.]+;\s*([^;)]+?)(?:\s+Build\/|[;)])/i)?.[1]?.trim();
    if (isWv) {
      return { label: model ? `Android App · ${model.slice(0, 24)}` : 'Android App', platform: 'android' };
    }
    return { label: model ? `Android 浏览器 · ${model.slice(0, 24)}` : 'Android 浏览器', platform: 'android' };
  }
  if (/iPhone|iPad|iPod/i.test(s)) {
    const dev = /iPad/i.test(s) ? 'iPad' : 'iPhone';
    return { label: `${dev} · Safari`, platform: 'ios' };
  }
  if (/Windows|Macintosh|Linux|CrOS/i.test(s)) {
    const os = /Windows/i.test(s) ? 'Windows' : /Macintosh/i.test(s) ? 'macOS' : 'Linux';
    const browser = /Edg\//i.test(s)
      ? 'Edge'
      : /Chrome\//i.test(s)
        ? 'Chrome'
        : /Firefox\//i.test(s)
          ? 'Firefox'
          : /Safari\//i.test(s)
            ? 'Safari'
            : '浏览器';
    return { label: `${os} · ${browser}`, platform: 'desktop' };
  }
  return { label: s ? s.slice(0, 32) : '未知设备', platform: 'web' };
}
