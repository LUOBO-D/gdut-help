import { isTrustedPushEndpoint } from '@gduthelp/shared';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ActiveDefenseService } from '../security/active-defense.service.js';
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
