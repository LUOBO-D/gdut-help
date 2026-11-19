import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode, type AuthSession, type UserProfile, type UserRole } from '@gduthelp/shared';
import { AppException } from '../common/app.exception.js';
import { ENV, type Env } from '../config/env.js';
import type { User } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserProfile } from '../users/users.service.js';
import {
  generateEmailCode,
  generateRefreshToken,
  hashEmailCode,
  hashRefreshToken,
  safeEqualHex,
} from './token.util.js';

export const AUTH_LIMITS = {
  codeTtlMinutes: 10,
  resendCooldownSeconds: 60,
  codesPerEmailPerDay: 10,
  codesPerIpPerDay: 30,
  maxAttemptsPerCode: 5,
  accessTokenSeconds: 15 * 60,
  refreshTokenDays: 30,
  /** 轮换后的旧令牌在这段时间内再次出现，视为并发刷新而不是被盗用 */
  refreshReuseGraceSeconds: 10,
} as const;

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

export interface IssuedSession {
  session: AuthSession;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const invalidCode = () => new AppException(ErrorCode.EMAIL_CODE_INVALID, '验证码错误或已过期');
const invalidRefresh = () =>
  new AppException(ErrorCode.REFRESH_TOKEN_INVALID, '登录已失效，请重新登录', HttpStatus.UNAUTHORIZED);
/** 并发刷新时落后的那个请求：令牌刚被另一个请求轮换。不应清除 Cookie，否则会删掉新令牌。 */
export class RefreshRaceException extends AppException {
  constructor() {
    super(ErrorCode.REFRESH_TOKEN_INVALID, '登录状态已更新，请重试', HttpStatus.CONFLICT);
  }
}
const banned = () => new AppException(ErrorCode.FORBIDDEN, '账号已被封禁', HttpStatus.FORBIDDEN);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async sendEmailCode(email: string, ip: string): Promise<{ cooldownSeconds: number }> {
    const now = Date.now();
    const dayAgo = new Date(now - DAY_MS);

    const last = await this.prisma.emailCode.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } });
    if (last) {
      const elapsed = Math.floor((now - last.createdAt.getTime()) / 1000);
      if (elapsed < AUTH_LIMITS.resendCooldownSeconds) {
        throw new AppException(
          ErrorCode.EMAIL_CODE_COOLDOWN,
          `请 ${AUTH_LIMITS.resendCooldownSeconds - elapsed} 秒后再试`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const [emailCount, ipCount] = await Promise.all([
      this.prisma.emailCode.count({ where: { email, createdAt: { gte: dayAgo } } }),
      this.prisma.emailCode.count({ where: { ip, createdAt: { gte: dayAgo } } }),
    ]);
    if (emailCount >= AUTH_LIMITS.codesPerEmailPerDay || ipCount >= AUTH_LIMITS.codesPerIpPerDay) {
      throw new AppException(ErrorCode.EMAIL_CODE_DAILY_LIMIT, '今天获取验证码的次数太多了，明天再试', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = generateEmailCode();
    const record = await this.prisma.emailCode.create({
      data: {
        email,
        ip,
        codeHash: hashEmailCode(this.env.AUTH_CODE_SECRET, email, code),
        expiresAt: new Date(now + AUTH_LIMITS.codeTtlMinutes * 60 * 1000),
      },
    });

    try {
      await this.mail.sendLoginCode(email, code, AUTH_LIMITS.codeTtlMinutes);
    } catch (err) {
      await this.prisma.emailCode.delete({ where: { id: record.id } });
      this.logger.error(`验证码邮件发送失败：${err instanceof Error ? err.message : String(err)}`);
      throw new AppException(ErrorCode.INTERNAL_ERROR, '验证码发送失败，请稍后再试', HttpStatus.BAD_GATEWAY);
    }
    if (this.env.MAIL_DRIVER === 'console') this.logger.warn(`[开发] ${email} 的验证码：${code}`);

    return { cooldownSeconds: AUTH_LIMITS.resendCooldownSeconds };
  }

  async loginWithEmailCode(email: string, code: string, userAgent?: string): Promise<IssuedSession> {
    const record = await this.prisma.emailCode.findFirst({
      where: { email, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.attempts >= AUTH_LIMITS.maxAttemptsPerCode) throw invalidCode();

    if (!safeEqualHex(record.codeHash, hashEmailCode(this.env.AUTH_CODE_SECRET, email, code))) {
      await this.prisma.emailCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      throw invalidCode();
    }

    // 条件更新保证同一验证码只能使用一次（并发请求中只有一个能成功）
    const consumed = await this.prisma.emailCode.updateMany({
      where: { id: record.id, consumedAt: null, attempts: { lt: AUTH_LIMITS.maxAttemptsPerCode } },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) throw invalidCode();

    const user = await this.findOrCreateUser(email);
    if (user.status === 'banned') throw banned();
    return this.issueSession(user, userAgent);
  }

  async refresh(rawToken: string | undefined, userAgent?: string): Promise<IssuedSession> {
    if (!rawToken) throw invalidRefresh();
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(rawToken) },
      include: { user: true },
    });
    if (!stored) throw invalidRefresh();

    if (stored.revokedAt) {
      const sinceRevoked = (Date.now() - stored.revokedAt.getTime()) / 1000;
      if (sinceRevoked > AUTH_LIMITS.refreshReuseGraceSeconds) {
        // 已轮换的令牌被再次使用，可能已泄露：吊销该用户的全部令牌
        this.logger.warn(`检测到刷新令牌重复使用，吊销用户 ${stored.userId} 的全部会话`);
        await this.revokeAllForUser(stored.userId);
        throw invalidRefresh();
      }
      throw new RefreshRaceException();
    }
    if (stored.expiresAt <= new Date()) throw invalidRefresh();
    if (stored.user.status === 'banned') {
      await this.revokeAllForUser(stored.userId);
      throw banned();
    }

    const rotated = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (rotated.count === 0) throw new RefreshRaceException();

    return this.issueSession(stored.user, userAgent);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeAllForUser(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async findOrCreateUser(email: string): Promise<User> {
    const shouldBeAdmin = this.env.ADMIN_EMAILS.includes(email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (!existing) {
      return this.prisma.user.create({
        data: { email, nickname: email.split('@')[0]!.slice(0, 20), role: shouldBeAdmin ? 'admin' : 'user' },
      });
    }
    // 只做提升，不自动降级：从 ADMIN_EMAILS 移除某人后需在后台手动调整
    if (shouldBeAdmin && existing.role !== 'admin') {
      return this.prisma.user.update({ where: { id: existing.id }, data: { role: 'admin' } });
    }
    return existing;
  }

  private async issueSession(user: User, userAgent?: string): Promise<IssuedSession> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: AUTH_LIMITS.accessTokenSeconds });
    const refreshToken = generateRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + AUTH_LIMITS.refreshTokenDays * DAY_MS);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(refreshToken),
        userAgent: userAgent?.slice(0, 255),
        expiresAt: refreshExpiresAt,
      },
    });

    const profile: UserProfile = toUserProfile(user);
    return {
      session: {
        accessToken,
        expiresAt: new Date(Date.now() + AUTH_LIMITS.accessTokenSeconds * 1000).toISOString(),
        user: profile,
      },
      refreshToken,
      refreshExpiresAt,
    };
  }
}
