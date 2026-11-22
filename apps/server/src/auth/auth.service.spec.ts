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
      findMany: vi.fn().mockResolvedValue([]),
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

  it('revokes overflow sessions when exceeding active device cap', async () => {
    const { prisma, service } = setup();
    prisma.emailCode.findFirst.mockResolvedValue({
      id: 'c1',
      codeHash: hashEmailCode(env.AUTH_CODE_SECRET, 'boss@example.com', '123456'),
      attempts: 0,
    });
    prisma.refreshToken.findMany.mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }]);

    await service.loginWithEmailCode('boss@example.com', '123456');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-1', 'old-2'] }, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('revokes every refresh token on logoutAll', async () => {
    const { prisma, service } = setup();
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

    const res = await service.logoutAll('u1');
    expect(res).toEqual({ revokedCount: 3 });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('supports password registration, password login, lockout on 5 failures, and domain/invite gates', async () => {
    const restrictedEnv = loadEnv({
      DATABASE_URL: 'postgres://unused',
      JWT_SECRET: 'j'.repeat(32),
      AUTH_CODE_SECRET: 'c'.repeat(32),
      ADMIN_EMAILS: 'boss@example.com',
      ALLOWED_EMAIL_DOMAINS: 'mail2.gdut.edu.cn',
      INVITE_CODE: 'GDUT2026',
    });

    const { prisma, mail } = setup();
    const jwt = new JwtService({ secret: restrictedEnv.JWT_SECRET });
    const service = new AuthService(
      prisma as unknown as PrismaService,
      jwt,
      mail as unknown as MailService,
      restrictedEnv,
    );

    // 拦截非白名单邮箱
    await expectCode(service.sendEmailCode('outsider@qq.com', '1.1.1.1', 'GDUT2026'), ErrorCode.FORBIDDEN);
    // 拦截缺少正确邀请码的新同学
    await expectCode(service.sendEmailCode('stu@mail2.gdut.edu.cn', '1.1.1.1', 'WRONG'), ErrorCode.FORBIDDEN);

    // 校验验证码注册并设置密码
    prisma.emailCode.findFirst.mockResolvedValue({
      id: 'c2',
      codeHash: hashEmailCode(restrictedEnv.AUTH_CODE_SECRET, 'stu@mail2.gdut.edu.cn', '654321'),
      attempts: 0,
    });
    let savedHash = '';
    prisma.user.create.mockImplementation(async ({ data }) => {
      savedHash = data.passwordHash as string;
      return user({ ...data, id: 'u-stu' });
    });

    const reg = await service.registerWithPassword({
      email: 'stu@mail2.gdut.edu.cn',
      code: '654321',
      password: 'gdut-password-123',
      nickname: '广工同学',
      inviteCode: 'GDUT2026',
    });
    expect(reg.session.user.hasPassword).toBe(true);
    expect(savedHash.startsWith('scrypt$')).toBe(true);

    // 正确密码登录成功
    prisma.user.findUnique.mockResolvedValue(
      user({ id: 'u-stu', email: 'stu@mail2.gdut.edu.cn', passwordHash: savedHash }),
    );
    const logged = await service.loginWithPassword('stu@mail2.gdut.edu.cn', 'gdut-password-123');
    expect(logged.session.user.id).toBe('u-stu');

    // 连续 5 次错误密码后触发锁定
    for (let i = 0; i < AUTH_LIMITS.maxPasswordFailures; i++) {
      await expectCode(service.loginWithPassword('stu@mail2.gdut.edu.cn', 'wrong-pwd'), ErrorCode.UNAUTHORIZED);
    }
    await expectCode(service.loginWithPassword('stu@mail2.gdut.edu.cn', 'gdut-password-123'), ErrorCode.TOO_MANY_REQUESTS);
  });
});
