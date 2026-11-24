import { HttpStatus, Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ErrorCode,
  type AuthConfig,
  type AuthSession,
  type LogoutAllResult,
  type UserProfile,
  type UserRole,
} from '@gduthelp/shared';
import { AppException } from '../common/app.exception.js';
import { ENV, type Env } from '../config/env.js';
import type { User } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserProfile } from '../users/users.service.js';
import {
  DUMMY_PASSWORD_HASH,
  generateEmailCode,
  generateRefreshToken,
  hashEmailCode,
  hashPassword,
  hashRefreshToken,
  safeEqualHex,
  safeEqualText,
  verifyPassword,
} from './token.util.js';
import { UserGuardCacheService } from './user-guard-cache.service.js';
import { ActiveDefenseService } from '../security/active-defense.service.js';

export const JWT_ISSUER = 'gduthelp';

export const AUTH_LIMITS = {
  codeTtlMinutes: 10,
  resendCooldownSeconds: 60,
  codesPerEmailPerDay: 10,
  codesPerIpPerDay: 30,
  /** 全站每小时/每日验证码发信熔断上限，防止僵尸网络分布式邮件轰炸刷爆 SMTP 配额 */
  globalCodesPerHour: 150,
  globalCodesPerDay: 600,
  maxAttemptsPerCode: 5,
  maxPasswordFailures: 5,
  maxPasswordFailuresPerIp: 20,
  passwordLockMinutes: 15,
  accessTokenSeconds: 15 * 60,
  refreshTokenDays: 30,
  /** 单账号最多同时保留的活跃登录设备数，超出后自动吊销最早的会话 */
  maxActiveSessions: 10,
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

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_LOCK_ENTRIES = 2000;
const PASSWORD_LOCK_MS = AUTH_LIMITS.passwordLockMinutes * 60_000;
const invalidPassword = () =>
  new AppException(
    ErrorCode.UNAUTHORIZED,
    '邮箱或密码错误（若未设置过密码，请先用邮箱验证码登录）',
    HttpStatus.UNAUTHORIZED,
  );

@Injectable()
export class AuthService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;
  private initialCleanupTimer: NodeJS.Timeout | null = null;
  /** 按邮箱记录连续密码失败次数与锁定截止时间（内存有界，避免针对单账号暴力撞库） */
  private readonly passwordFailures = new Map<string, { count: number; lockUntil: number }>();
  /** 按客户端 IP 记录连续密码失败次数（防御跨账号密码喷洒攻击） */
  private readonly ipPasswordFailures = new Map<string, { count: number; lockUntil: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
    @Optional() private readonly guardCache?: UserGuardCacheService,
    @Optional() private readonly defense?: ActiveDefenseService,
  ) {}

  getAuthConfig(): AuthConfig {
    return {
      allowedEmailDomains: this.env.ALLOWED_EMAIL_DOMAINS,
      inviteRequired: Boolean(this.env.INVITE_CODE),
      mailDriver: this.env.MAIL_DRIVER,
    };
  }

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    this.cleanupTimer = setInterval(() => void this.cleanupExpiredRecords(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
    // 启动后延后 15 秒再执行首次清理，避免与提醒扫描并发抢占开发库连接
    this.initialCleanupTimer = setTimeout(() => void this.cleanupExpiredRecords(), 15_000);
    this.initialCleanupTimer.unref();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.initialCleanupTimer) clearTimeout(this.initialCleanupTimer);
  }

  /** 定期清理已过期验证码与失效刷新令牌，防止认证表无限增长 */
  async cleanupExpiredRecords(now = Date.now()): Promise<void> {
    try {
      const codeCutoff = new Date(now - DAY_MS);
      const tokenCutoff = new Date(now - 7 * DAY_MS);
      const [codes, tokens] = await Promise.all([
        this.prisma.emailCode.deleteMany({ where: { createdAt: { lt: codeCutoff } } }),
        this.prisma.refreshToken.deleteMany({
          where: { OR: [{ expiresAt: { lt: new Date(now) } }, { revokedAt: { lt: tokenCutoff } }] },
        }),
      ]);
      if (codes.count || tokens.count) {
        this.logger.log(`已清理历史认证记录：验证码 ${codes.count} 条，令牌 ${tokens.count} 条`);
      }
    } catch (err) {
      this.logger.warn(`清理历史认证记录失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async sendEmailCode(rawEmail: string, ip: string, inviteCode?: string): Promise<{ cooldownSeconds: number }> {
    const email = rawEmail.trim().toLowerCase();
    this.assertEmailDomainAllowed(email);
    await this.assertInviteCodeIfNew(email, inviteCode);

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

    const hourAgo = new Date(now - 60 * 60 * 1000);
    const [emailCount, ipCount, globalHourCount, globalDayCount] = await Promise.all([
      this.prisma.emailCode.count({ where: { email, createdAt: { gte: dayAgo } } }),
      this.prisma.emailCode.count({ where: { ip, createdAt: { gte: dayAgo } } }),
      this.prisma.emailCode.count({ where: { createdAt: { gte: hourAgo } } }),
      this.prisma.emailCode.count({ where: { createdAt: { gte: dayAgo } } }),
    ]);
    if (emailCount >= AUTH_LIMITS.codesPerEmailPerDay || ipCount >= AUTH_LIMITS.codesPerIpPerDay) {
      this.defense?.recordIncident(ip, 'quota_abuse', '/api/v1/auth/email-code');
      throw new AppException(ErrorCode.EMAIL_CODE_DAILY_LIMIT, '今天获取验证码的次数太多了，明天再试', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (globalHourCount >= AUTH_LIMITS.globalCodesPerHour || globalDayCount >= AUTH_LIMITS.globalCodesPerDay) {
      this.logger.warn(`触发全站验证码发信熔断：近1小时=${globalHourCount}，近24小时=${globalDayCount}`);
      throw new AppException(ErrorCode.TOO_MANY_REQUESTS, '当前验证码发送繁忙，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
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

  async loginWithEmailCode(rawEmail: string, code: string, userAgent?: string, inviteCode?: string): Promise<IssuedSession> {
    const email = rawEmail.trim().toLowerCase();
    this.assertEmailDomainAllowed(email);
    await this.assertInviteCodeIfNew(email, inviteCode);
    await this.verifyAndConsumeEmailCode(email, code);

    const user = await this.findOrCreateUser(email);
    if (user.status === 'banned') throw banned();
    this.passwordFailures.delete(email);
    return this.issueSession(user, userAgent);
  }

  async loginWithPassword(rawEmail: string, password: string, userAgent?: string, ip?: string): Promise<IssuedSession> {
    const email = rawEmail.trim().toLowerCase();
    this.assertEmailDomainAllowed(email);

    const now = Date.now();
    this.assertNotPasswordLocked(this.passwordFailures, email, now);
    if (ip && ip !== 'unknown') {
      this.assertNotPasswordLocked(this.ipPasswordFailures, ip, now);
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !user.passwordHash || !ok) {
      this.recordFailure(this.passwordFailures, email, AUTH_LIMITS.maxPasswordFailures, now);
      if (ip && ip !== 'unknown') {
        this.recordFailure(this.ipPasswordFailures, ip, AUTH_LIMITS.maxPasswordFailuresPerIp, now);
        this.defense?.recordIncident(ip, 'auth_failure', '/api/v1/auth/login/password');
      }
      throw invalidPassword();
    }
    if (user.status === 'banned') throw banned();

    this.passwordFailures.delete(email);
    // 管理员列表提升兼容
    const promoted =
      this.env.ADMIN_EMAILS.includes(email) && user.role !== 'admin'
        ? await this.prisma.user.update({ where: { id: user.id }, data: { role: 'admin' } })
        : user;
    return this.issueSession(promoted, userAgent);
  }

  async registerWithPassword(
    input: { email: string; code: string; password: string; nickname?: string; inviteCode?: string },
    userAgent?: string,
  ): Promise<IssuedSession> {
    const email = input.email.trim().toLowerCase();
    this.assertEmailDomainAllowed(email);
    await this.assertInviteCodeIfNew(email, input.inviteCode);
    await this.verifyAndConsumeEmailCode(email, input.code);

    const passwordHash = await hashPassword(input.password);
    const now = new Date();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    let user: User;
    if (existing) {
      if (existing.status === 'banned') throw banned();
      user = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          passwordUpdatedAt: now,
          ...(input.nickname ? { nickname: input.nickname } : {}),
          ...(this.env.ADMIN_EMAILS.includes(email) && existing.role !== 'admin' ? { role: 'admin' } : {}),
        },
      });
    } else {
      const shouldBeAdmin = this.env.ADMIN_EMAILS.includes(email);
      user = await this.prisma.user.create({
        data: {
          email,
          nickname: input.nickname || email.split('@')[0]!.slice(0, 20),
          role: shouldBeAdmin ? 'admin' : 'user',
          passwordHash,
          passwordUpdatedAt: now,
        },
      });
    }

    this.passwordFailures.delete(email);
    return this.issueSession(user, userAgent);
  }

  async resetPassword(input: { email: string; code: string; newPassword: string }): Promise<void> {
    const email = input.email.trim().toLowerCase();
    this.assertEmailDomainAllowed(email);
    await this.verifyAndConsumeEmailCode(email, input.code);

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppException(ErrorCode.NOT_FOUND, '该邮箱尚未注册', HttpStatus.NOT_FOUND);
    if (user.status === 'banned') throw banned();

    const passwordHash = await hashPassword(input.newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordUpdatedAt: new Date() },
    });
    this.passwordFailures.delete(email);
    // 重置密码后立即吊销该账号所有旧设备会话
    await this.revokeAllForUser(user.id);
  }

  async changePassword(
    userId: string,
    input: { currentPassword?: string; newPassword: string },
  ): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppException(ErrorCode.UNAUTHORIZED, '账号不存在', HttpStatus.UNAUTHORIZED);
    if (user.status === 'banned') throw banned();

    const now = Date.now();
    this.assertNotPasswordLocked(this.passwordFailures, user.email, now);

    if (user.passwordHash) {
      if (!input.currentPassword) {
        throw new AppException(ErrorCode.VALIDATION_FAILED, '请输入当前登录密码', HttpStatus.BAD_REQUEST);
      }
      const ok = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!ok) {
        this.recordFailure(this.passwordFailures, user.email, AUTH_LIMITS.maxPasswordFailures, now);
        throw new AppException(ErrorCode.UNAUTHORIZED, '当前密码不正确', HttpStatus.UNAUTHORIZED);
      }
    }

    this.passwordFailures.delete(user.email);
    const passwordHash = await hashPassword(input.newPassword);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, passwordUpdatedAt: new Date() },
    });
    // 改密后吊销已有长期刷新令牌，防止已泄露的旧设备继续静默续期
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return toUserProfile(updated);
  }

  private assertEmailDomainAllowed(email: string): void {
    const domains = this.env.ALLOWED_EMAIL_DOMAINS;
    if (!domains.length || this.env.ADMIN_EMAILS.includes(email)) return;
    const domain = email.split('@')[1]?.toLowerCase() ?? '';
    if (!domains.includes(domain)) {
      const hint = domains.map((d) => `@${d}`).join(' / ');
      throw new AppException(
        ErrorCode.FORBIDDEN,
        `当前仅开放校园邮箱（${hint}）登录`,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async assertInviteCodeIfNew(email: string, inviteCode?: string): Promise<void> {
    if (!this.env.INVITE_CODE || this.env.ADMIN_EMAILS.includes(email)) return;
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return;
    if (!inviteCode || !safeEqualText(inviteCode.trim().toLowerCase(), this.env.INVITE_CODE.toLowerCase())) {
      throw new AppException(ErrorCode.FORBIDDEN, '新用户注册需要填写正确的校园邀请码', HttpStatus.FORBIDDEN);
    }
  }

  private async verifyAndConsumeEmailCode(email: string, code: string): Promise<void> {
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
  }

  private assertNotPasswordLocked(
    map: Map<string, { count: number; lockUntil: number }>,
    key: string,
    now: number,
  ): void {
    const fail = map.get(key);
    if (fail && fail.lockUntil > now) {
      const remainMin = Math.max(1, Math.ceil((fail.lockUntil - now) / 60_000));
      throw new AppException(
        ErrorCode.TOO_MANY_REQUESTS,
        `密码错误次数过多，请 ${remainMin} 分钟后再试或改用邮箱验证码登录`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailure(
    map: Map<string, { count: number; lockUntil: number }>,
    key: string,
    limit: number,
    now: number,
  ): void {
    const prev = map.get(key);
    const nextCount = prev && prev.lockUntil <= now ? (prev.count >= limit ? 1 : prev.count + 1) : (prev?.count ?? 0) + 1;
    const lockUntil = nextCount >= limit ? now + PASSWORD_LOCK_MS : 0;
    if (map.size >= MAX_LOCK_ENTRIES && !map.has(key)) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
    map.set(key, { count: nextCount, lockUntil });
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

  /** 退出该账号在全部设备上的登录，并立即令已有 access token 失效 */
  async logoutAll(userId: string): Promise<LogoutAllResult> {
    const res = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.guardCache?.markRevokedNow(userId);
    return { revokedCount: res.count };
  }

  private async revokeAllForUser(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    this.guardCache?.markRevokedNow(userId);
  }

  private async findOrCreateUser(email: string): Promise<User> {
    const shouldBeAdmin = this.env.ADMIN_EMAILS.includes(email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (!existing) {
      try {
        return await this.prisma.user.create({
          data: { email, nickname: email.split('@')[0]!.slice(0, 20), role: shouldBeAdmin ? 'admin' : 'user' },
        });
      } catch (err) {
        // 并发首次登录命中唯一约束时回查已创建的账号
        if (err && typeof err === 'object' && (err as { code?: string }).code === 'P2002') {
          const raced = await this.prisma.user.findUnique({ where: { email } });
          if (raced) return raced;
        }
        throw err;
      }
    }
    // 只做提升，不自动降级：从 ADMIN_EMAILS 移除某人后需在后台手动调整
    if (shouldBeAdmin && existing.role !== 'admin') {
      return this.prisma.user.update({ where: { id: existing.id }, data: { role: 'admin' } });
    }
    return existing;
  }

  private async issueSession(user: User, userAgent?: string): Promise<IssuedSession> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: AUTH_LIMITS.accessTokenSeconds,
      issuer: JWT_ISSUER,
    });
    const refreshToken = generateRefreshToken();
    const now = new Date();
    const refreshExpiresAt = new Date(now.getTime() + AUTH_LIMITS.refreshTokenDays * DAY_MS);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(refreshToken),
        userAgent: userAgent?.slice(0, 255),
        expiresAt: refreshExpiresAt,
      },
    });

    // 控制单账号活跃设备上限，超出 maxActiveSessions 的最早会话自动吊销
    const overflow = await this.prisma.refreshToken.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      skip: AUTH_LIMITS.maxActiveSessions,
      select: { id: true },
    });
    if (overflow.length) {
      await this.prisma.refreshToken.updateMany({
        where: { id: { in: overflow.map((r) => r.id) }, revokedAt: null },
        data: { revokedAt: now },
      });
    }

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
