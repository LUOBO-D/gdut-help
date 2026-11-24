import { ErrorCode, isTrustedPushEndpoint } from '@gduthelp/shared';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ActiveDefenseService } from '../security/active-defense.service.js';
import { SecurityAlertService } from '../security/security-alert.service.js';
import type { Env } from '../config/env.js';
import { clientIp, maskIp, parseDeviceLabel, setTrustCfHeaders } from './client-ip.js';
import { createSecurityMiddleware, type RequestWithId } from './security.middleware.js';

function createMockRes() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    setHeader: vi.fn((k: string, v: string) => headers.set(k.toLowerCase(), v)),
    status: vi.fn((s: number) => {
      statusCode = s;
      return res;
    }),
    json: vi.fn((b: unknown) => {
      body = b;
      return res;
    }),
  } as unknown as Response;
  return { res, headers, getStatus: () => statusCode, getBody: () => body };
}

describe('securityMiddleware', () => {
  const mw = createSecurityMiddleware(true, true);

  it('sets CSP, HSTS, COOP, and no-store headers on API routes', () => {
    const req = {
      method: 'GET',
      originalUrl: '/api/v1/grades',
      header: () => undefined,
      ip: '127.0.0.1',
    } as unknown as RequestWithId;
    const { res, headers } = createMockRes();
    const next = vi.fn();

    mw(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(headers.get('strict-transport-security')).toContain('preload');
    expect(headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(headers.get('cache-control')).toBe('no-store, private');
  });

  it('blocks scanner probes and path traversal before routing', () => {
    for (const badPath of ['/.env', '/.git/config', '/wp-login.php', '/api/v1/../../etc/passwd', '/shell.php']) {
      const req = {
        method: 'GET',
        originalUrl: badPath,
        header: () => undefined,
        ip: '203.0.113.5',
      } as unknown as RequestWithId;
      const { res, getStatus } = createMockRes();
      const next = vi.fn();

      mw(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(getStatus()).toBe(404);
    }
  });

  it('traps attacker hitting honeypot and quarantines subsequent requests with 403', () => {
    const defense = new ActiveDefenseService();
    const activeMw = createSecurityMiddleware(true, true, defense);

    const trapReq = {
      method: 'GET',
      originalUrl: '/api/v1/admin/debug',
      header: () => undefined,
      ip: '203.0.113.77',
    } as unknown as RequestWithId;
    const trapRes = createMockRes();
    const trapNext = vi.fn();
    activeMw(trapReq, trapRes.res, trapNext);
    expect(trapNext).not.toHaveBeenCalled();
    expect(trapRes.getStatus()).toBe(403);

    // Follow-up normal API call from same attacker IP is instantly blocked with 403
    const nextReq = {
      method: 'GET',
      originalUrl: '/api/v1/grades',
      header: () => undefined,
      ip: '203.0.113.77',
    } as unknown as RequestWithId;
    const nextRes = createMockRes();
    const nextFn = vi.fn();
    activeMw(nextReq, nextRes.res, nextFn);
    expect(nextFn).not.toHaveBeenCalled();
    expect(nextRes.getStatus()).toBe(403);
  });

  it('blocks legacy debug native APKs with 426 when minNativeVersion is set, while allowing update/health and newer APKs', () => {
    const defense = new ActiveDefenseService();
    defense.setMinNativeVersion(7);
    const activeMw = createSecurityMiddleware(true, true, defense);

    const makeReq = (url: string, headers: Record<string, string>) =>
      ({
        method: 'GET',
        originalUrl: url,
        header: (name: string) => headers[name.toLowerCase()],
        ip: '203.0.113.10',
      }) as unknown as RequestWithId;

    // 1. Legacy debug APK without x-native-version -> 426 CLIENT_UPGRADE_REQUIRED
    const oldRes = createMockRes();
    const oldNext = vi.fn();
    activeMw(makeReq('/api/v1/grades', { 'x-client': 'native' }), oldRes.res, oldNext);
    expect(oldNext).not.toHaveBeenCalled();
    expect(oldRes.getStatus()).toBe(426);
    expect((oldRes.getBody() as { code?: string })?.code).toBe(ErrorCode.CLIENT_UPGRADE_REQUIRED);

    // 2. Old native APK checking /api/v1/app/update MUST still be allowed
    const updRes = createMockRes();
    const updNext = vi.fn();
    activeMw(makeReq('/api/v1/app/update', { 'x-client': 'native' }), updRes.res, updNext);
    expect(updNext).toHaveBeenCalledOnce();

    // 3. New signed APK with x-native-version: 7 -> allowed
    const newRes = createMockRes();
    const newNext = vi.fn();
    activeMw(makeReq('/api/v1/grades', { 'x-client': 'native', 'x-native-version': '7' }), newRes.res, newNext);
    expect(newNext).toHaveBeenCalledOnce();

    // 4. Web client (no x-client: native) -> allowed
    const webRes = createMockRes();
    const webNext = vi.fn();
    activeMw(makeReq('/api/v1/grades', {}), webRes.res, webNext);
    expect(webNext).toHaveBeenCalledOnce();
  });
});

describe('clientIp helpers and Cloudflare header trust', () => {
  it('only trusts CF-Connecting-IP when explicitly enabled', () => {
    const req = {
      ip: '198.51.100.1',
      header: (k: string) => (k.toLowerCase() === 'cf-connecting-ip' ? '203.0.113.99' : undefined),
    } as unknown as Request;

    setTrustCfHeaders(false);
    expect(clientIp(req)).toBe('198.51.100.1');

    setTrustCfHeaders(true);
    expect(clientIp(req)).toBe('203.0.113.99');

    setTrustCfHeaders(false);
  });

  it('masks IPv4/IPv6 addresses and formats device labels', () => {
    expect(maskIp('120.230.45.67')).toBe('120.230.*.*');
    expect(maskIp('::ffff:10.33.28.131')).toBe('10.33.*.*');
    expect(maskIp('127.0.0.1')).toBe('本机');
    expect(parseDeviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A) AppleWebKit/537.36', 7)).toEqual({
      label: 'Android App · Pixel 8 (v7)',
      platform: 'android',
    });
  });
});

describe('SecurityAlertService', () => {
  it('deduplicates repeated alerts within cooldown and respects configuration', () => {
    const mail = { sendSecurityAlert: vi.fn().mockResolvedValue(undefined) };
    const env = {
      NODE_ENV: 'production',
      SECURITY_ALERT_EMAIL: 'sec@example.com',
      SECURITY_ALERT_WEBHOOK_URL: '',
    } as unknown as Env;
    const alerts = new SecurityAlertService(env, mail as never);

    const t0 = 1_700_000_000_000;
    const payload = {
      dedupeKey: 'honeypot:203.0.113.5',
      title: 'Honeypot Hit',
      severity: 'critical' as const,
      event: 'honeypot_hit',
      ip: '203.0.113.5',
      summary: 'Hit /.env',
    };

    expect(alerts.notify(payload, t0)).toBe(true);
    expect(alerts.notify(payload, t0 + 60_000)).toBe(false);
    expect(alerts.notify(payload, t0 + 16 * 60_000)).toBe(true);
    expect(mail.sendSecurityAlert).toHaveBeenCalledTimes(2);
  });
});

describe('isTrustedPushEndpoint (SSRF defense)', () => {
  it('allows official HTTPS push services only', () => {
    expect(isTrustedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc123')).toBe(true);
    expect(isTrustedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/xyz')).toBe(true);
    expect(isTrustedPushEndpoint('https://web.push.apple.com/token')).toBe(true);
    expect(isTrustedPushEndpoint('https://wns2-sg2p.notify.windows.com/w/?token=abc')).toBe(true);
  });

  it('rejects internal IPs, Alibaba Cloud metadata, HTTP, and untrusted hosts', () => {
    expect(isTrustedPushEndpoint('http://100.100.100.200/latest/meta-data/')).toBe(false);
    expect(isTrustedPushEndpoint('https://127.0.0.1/admin')).toBe(false);
    expect(isTrustedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isTrustedPushEndpoint('https://evil.example.com/hook')).toBe(false);
    expect(isTrustedPushEndpoint('https://fcm.googleapis.com:8443/send')).toBe(false);
    expect(isTrustedPushEndpoint('https://user:pass@fcm.googleapis.com/send')).toBe(false);
  });
});
