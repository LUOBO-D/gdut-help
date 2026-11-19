import { ErrorCode } from '@gduthelp/shared';
import { JwtService } from '@nestjs/jwt';
import { vi, type Mock } from 'vitest';
import { AppException } from '../common/app.exception.js';
import { loadEnv } from '../config/env.js';
import type { MailService } from '../mail/mail.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AUTH_LIMITS, AuthService, RefreshRaceException } from './auth.service.js';
import { hashEmailCode, hashRefreshToken } from './token.util.js';

const env = loadEnv({
  DATABASE_URL: 'postgres://unused',
  JWT_SECRET: 'j'.repeat(32),
  AUTH_CODE_SECRET: 'c'.repeat(32),
  ADMIN_EMAILS: 'boss@example.com',
});

const user = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  email: 'a@example.com',
  phone: null,
  nickname: 'a',
  avatarUrl: null,
  role: 'user',
  trustLevel: 0,
  status: 'normal',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

function setup() {
  const prisma = {
    emailCode: {
      findFirst: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: 'c1' }),
      delete: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }) => user(data)),
      update: vi.fn(async ({ data }) => user(data)),
    },
    refreshToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const mail = { sendLoginCode: vi.fn() };
  const jwt = new JwtService({ secret: env.JWT_SECRET });
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt,
    mail as unknown as MailService,
    env,
  );
  return { prisma, mail, service };
}

async function expectCode(promise: Promise<unknown>, code: ErrorCode) {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AppException);
  expect((err as AppException).errorCode).toBe(code);
  return err as AppException;
}

describe('AuthService.sendEmailCode', () => {
  it('rejects a resend inside the cooldown window', async () => {
    const { prisma, service } = setup();
    prisma.emailCode.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 10_000) });
    await expectCode(service.sendEmailCode('a@example.com', '1.1.1.1'), ErrorCode.EMAIL_CODE_COOLDOWN);
    expect(prisma.emailCode.create).not.toHaveBeenCalled();
  });

  it('stores only a hash and mails the plain code', async () => {
    const { prisma, mail, service } = setup();
    prisma.emailCode.findFirst.mockResolvedValue(null);
    await service.sendEmailCode('a@example.com', '1.1.1.1');
    const code = (mail.sendLoginCode as Mock).mock.calls[0]![1] as string;
    expect(code).toMatch(/^\d{6}$/);
    const stored = prisma.emailCode.create.mock.calls[0]![0].data;
    expect(stored.codeHash).toBe(hashEmailCode(env.AUTH_CODE_SECRET, 'a@example.com', code));
    expect(JSON.stringify(stored)).not.toContain(`"${code}"`);
  });

  it('removes the code record when mail delivery fails', async () => {
    const { prisma, mail, service } = setup();
    prisma.emailCode.findFirst.mockResolvedValue(null);
    mail.sendLoginCode.mockRejectedValue(new Error('smtp down'));
    await expect(service.sendEmailCode('a@example.com', '1.1.1.1')).rejects.toBeInstanceOf(AppException);
    expect(prisma.emailCode.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });
});

describe('AuthService.loginWithEmailCode', () => {
  const record = (code: string, over: Record<string, unknown> = {}) => ({
    id: 'c1',
    codeHash: hashEmailCode(env.AUTH_CODE_SECRET, 'boss@example.com', code),
    attempts: 0,
    ...over,
  });

  it('counts a wrong attempt', async () => {
    const { prisma, service } = setup();
    prisma.emailCode.findFirst.mockResolvedValue(record('123456'));
    await expectCode(service.loginWithEmailCode('boss@example.com', '654321'), ErrorCode.EMAIL_CODE_INVALID);
    expect(prisma.emailCode.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { attempts: { increment: 1 } } });
  });

  it('rejects a code that reached the attempt limit even if correct', async () => {
    const { prisma, service } = setup();
    prisma.emailCode.findFirst.mockResolvedValue(record('123456', { attempts: AUTH_LIMITS.maxAttemptsPerCode }));
    await expectCode(service.loginWithEmailCode('boss@example.com', '123456'), ErrorCode.EMAIL_CODE_INVALID);
  });

  it('rejects when another request consumed the code first', async () => {
    const { prisma, service } = setup();
    prisma.emailCode.findFirst.mockResolvedValue(record('123456'));
    prisma.emailCode.updateMany.mockResolvedValue({ count: 0 });
    await expectCode(service.loginWithEmailCode('boss@example.com', '123456'), ErrorCode.EMAIL_CODE_INVALID);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates an admin for ADMIN_EMAILS and stores a hashed refresh token', async () => {
    const { prisma, service } = setup();
    prisma.emailCode.findFirst.mockResolvedValue(record('123456'));
    const issued = await service.loginWithEmailCode('boss@example.com', '123456');
    expect(issued.session.user.role).toBe('admin');
    expect(issued.session.user.nickname).toBe('boss');
    const saved = prisma.refreshToken.create.mock.calls[0]![0].data;
    expect(saved.tokenHash).toBe(hashRefreshToken(issued.refreshToken));
  });

  it('refuses banned users', async () => {
    const { prisma, service } = setup();
    prisma.emailCode.findFirst.mockResolvedValue(record('123456'));
    prisma.user.findUnique.mockResolvedValue(user({ email: 'boss@example.com', role: 'admin', status: 'banned' }));
    await expectCode(service.loginWithEmailCode('boss@example.com', '123456'), ErrorCode.FORBIDDEN);
  });
});

describe('AuthService.refresh', () => {
  const stored = (over: Record<string, unknown> = {}) => ({
    id: 't1',
    userId: 'u1',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: user(),
    ...over,
  });

  it('rotates a valid token', async () => {
    const { prisma, service } = setup();
    prisma.refreshToken.findUnique.mockResolvedValue(stored());
    const issued = await service.refresh('raw');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(issued.refreshToken).not.toBe('raw');
  });

  it('treats reuse right after rotation as a race, without revoking other sessions', async () => {
    const { prisma, service } = setup();
    prisma.refreshToken.findUnique.mockResolvedValue(stored({ revokedAt: new Date(Date.now() - 2_000) }));
    await expect(service.refresh('raw')).rejects.toBeInstanceOf(RefreshRaceException);
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('revokes every session when an old token is replayed later', async () => {
    const { prisma, service } = setup();
    prisma.refreshToken.findUnique.mockResolvedValue(stored({ revokedAt: new Date(Date.now() - 60_000) }));
    const err = await expectCode(service.refresh('raw'), ErrorCode.REFRESH_TOKEN_INVALID);
    expect(err).not.toBeInstanceOf(RefreshRaceException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rejects expired and unknown tokens', async () => {
    const { prisma, service } = setup();
    prisma.refreshToken.findUnique.mockResolvedValue(stored({ expiresAt: new Date(Date.now() - 1) }));
    await expectCode(service.refresh('raw'), ErrorCode.REFRESH_TOKEN_INVALID);
    prisma.refreshToken.findUnique.mockResolvedValue(null);
    await expectCode(service.refresh('raw'), ErrorCode.REFRESH_TOKEN_INVALID);
    await expectCode(service.refresh(undefined), ErrorCode.REFRESH_TOKEN_INVALID);
  });
});
