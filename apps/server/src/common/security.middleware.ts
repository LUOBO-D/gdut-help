import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  ErrorCode,
  NATIVE_CLIENT_HEADER,
  NATIVE_CLIENT_VALUE,
  NATIVE_VERSION_HEADER,
} from '@gduthelp/shared';
import type { NextFunction, Request, Response } from 'express';
import type { ActiveDefenseService } from '../security/active-defense.service.js';
import { clientIp } from './client-ip.js';

const SAFE_REQ_ID = /^[a-zA-Z0-9._-]{8,64}$/;
const securityLogger = new Logger('Security');

/** 主动诱捕蜜罐路径：正常用户绝不会访问，命中即判定为恶意侦察并立即隔离封禁 */
const HONEYPOT_PROBE_RE =
  /(?:^|\/)(?:\.env(?:\.|$)|\.git\/config|wp-login\.php|phpinfo\.php|backup\.sql|dump\.sql|db\.sql|api\/v1\/(?:admin\/debug|internal\/dump|debug\/vars|graphql))$/i;

/** 常见自动化漏洞扫描器与敏感文件探测路径 */
const SCANNER_PROBE_RE =
  /(?:^|\/)(?:\.env(?:\.|$)|\.git(?:\/|$)|\.svn(?:\/|$)|\.htaccess|\.htpasswd|wp-admin|wp-login|wp-content|wp-includes|xmlrpc\.php|phpmyadmin|pma|adminer|cgi-bin|actuator|server-status|boaform)|\.(?:php|asp|aspx|jsp|cgi|sql|bak|old|swp|dist)$/i;

const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * 全局主动安全防御中间件：
 * 1. 分配合法 X-Request-Id 并注入全套浏览器安全响应头（CSP / HSTS / COOP / XFO / nosniff / Permissions-Policy）；
 * 2. 查询 ActiveDefenseService：处于隔离期的高危 IP / 网段零 DB 开销直接 403 阻断；
 * 3. 蜜罐诱捕（Honeypot）：命中伪装敏感路径立即拉黑隔离并触发宿主机 fail2ban 联动；
 * 4. 焦油坑（Tarpit）：中高风险来源自动注入受控延迟，大幅拖垮自动化扫描效率；
 * 5. 敏感 API 响应默认禁止代理与浏览器缓存（Cache-Control: no-store, private）。
 */
export function createSecurityMiddleware(
  isProduction: boolean,
  allowCrossOrigin = false,
  defense?: ActiveDefenseService,
) {
  return function securityMiddleware(req: RequestWithId, res: Response, next: NextFunction) {
    const incoming = req.header('x-request-id');
    const requestId = incoming && SAFE_REQ_ID.test(incoming) ? incoming : randomUUID();
    req.requestId = requestId;

    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', allowCrossOrigin ? 'cross-origin' : 'same-site');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Content-Security-Policy', CSP_POLICY);
    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    const ip = clientIp(req);
    const rawUrl = req.originalUrl ?? req.url ?? '';
    const pathname = rawUrl.split('?')[0] ?? '';

    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/v1/app/bundles/')) {
      res.setHeader('Cache-Control', 'no-store, private');
      res.setHeader('Pragma', 'no-cache');
    }

    // 1. 隔离期高危来源直接拦截（不消耗后端业务/数据库资源）
    if (defense && !pathname.endsWith('/health')) {
      const decision = defense.evaluate(ip);
      if (decision.blocked) {
        if (decision.retryAfterSeconds) {
          res.setHeader('Retry-After', String(decision.retryAfterSeconds));
        }
        res.setHeader('Cache-Control', 'no-store');
        res.status(403).json({ code: 4030, data: null, message: '请求触发安全防护，已暂时拦截' });
        return;
      }

      // 2. 蜜罐诱捕：命中高价值诱饵直接 403 + 立即隔离 + 联动 fail2ban
      if (HONEYPOT_PROBE_RE.test(pathname)) {
        defense.recordIncident(ip, 'honeypot_hit', pathname);
        securityLogger.warn(`[HONEYPOT_TRAP] 命中蜜罐诱饵 ${req.method} ${pathname.slice(0, 120)} ip=${ip}`);
        res.setHeader('Cache-Control', 'no-store');
        res.status(403).json({ code: 4030, data: null, message: '访问被安全策略拒绝' });
        return;
      }
    } else if (HONEYPOT_PROBE_RE.test(pathname)) {
      securityLogger.warn(`拦截敏感路径探测 ${req.method} ${pathname.slice(0, 120)} ip=${ip}`);
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).json({ code: 4040, data: null, message: '资源不存在' });
      return;
    }

    // 3. 路径穿越、空字节与常规漏洞扫描探测
    if (
      rawUrl.includes('\0') ||
      /%00/i.test(rawUrl) ||
      /(?:^|\/)\.\.(?:\/|$)|%2e%2e/i.test(rawUrl) ||
      SCANNER_PROBE_RE.test(pathname)
    ) {
      defense?.recordIncident(ip, 'scanner_probe', pathname);
      securityLogger.warn(`拦截恶意扫描探测 ${req.method} ${pathname.slice(0, 120)} ip=${ip}`);
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).json({ code: 4040, data: null, message: '资源不存在' });
      return;
    }

    // 4. 旧版不安全原生外壳强制淘汰门禁（永远放行 /health 与 /app/* 保证旧包可检查并下载新版 APK）
    const minNative = defense?.getMinNativeVersion() ?? 0;
    if (
      minNative > 0 &&
      req.header(NATIVE_CLIENT_HEADER) === NATIVE_CLIENT_VALUE &&
      pathname.startsWith('/api/v1/') &&
      !pathname.startsWith('/api/v1/app/') &&
      pathname !== '/api/v1/health'
    ) {
      const rawVer = req.header(NATIVE_VERSION_HEADER);
      const clientVer = rawVer ? Number.parseInt(rawVer, 10) : 0;
      if (!Number.isFinite(clientVer) || clientVer < minNative) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(426).json({
          code: ErrorCode.CLIENT_UPGRADE_REQUIRED,
          data: { minNativeVersion: minNative, apkPath: '/api/v1/app/apk/latest' },
          message: '当前旧版安装包已停止服务，请先卸载旧版再安装最新正式安全版',
        });
        return;
      }
    }

    // 5. 焦油坑受控减速
    if (defense && !pathname.endsWith('/health')) {
      const decision = defense.evaluate(ip);
      if (decision.tarpitMs > 0) {
        void defense.applyTarpit(decision.tarpitMs).then(() => next());
        return;
      }
    }

    next();
  };
}
