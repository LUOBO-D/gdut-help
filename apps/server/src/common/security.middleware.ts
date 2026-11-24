import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { clientIp } from './client-ip.js';

const SAFE_REQ_ID = /^[a-zA-Z0-9._-]{8,64}$/;
const securityLogger = new Logger('Security');

/** 常见自动化漏洞扫描器与敏感文件探测路径（在进入路由或 SPA 回退前直接 404 拦截） */
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
 * 全局安全中间件：
 * 1. 分配合法 X-Request-Id；
 * 2. 拦截路径穿越、空字节与常见自动化漏洞扫描探测；
 * 3. 注入全套浏览器安全响应头（CSP / HSTS / COOP / XFO / nosniff / Permissions-Policy）；
 * 4. 对敏感 API 响应默认禁止代理与浏览器缓存（Cache-Control: no-store, private）。
 */
export function createSecurityMiddleware(isProduction: boolean, allowCrossOrigin = false) {
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

    const rawUrl = req.originalUrl ?? req.url ?? '';
    const pathname = rawUrl.split('?')[0] ?? '';

    if (
      rawUrl.includes('\0') ||
      /%00/i.test(rawUrl) ||
      /(?:^|\/)\.\.(?:\/|$)|%2e%2e/i.test(rawUrl) ||
      SCANNER_PROBE_RE.test(pathname)
    ) {
      securityLogger.warn(`拦截恶意扫描探测 ${req.method} ${pathname.slice(0, 120)} ip=${clientIp(req)}`);
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).json({ code: 4040, data: null, message: '资源不存在' });
      return;
    }

    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/v1/app/bundles/')) {
      res.setHeader('Cache-Control', 'no-store, private');
      res.setHeader('Pragma', 'no-cache');
    }

    next();
  };
}
