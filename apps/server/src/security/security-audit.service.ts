import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { UserSecurityEvent, UserSecurityOverview, UserSessionInfo } from '@gduthelp/shared';
import { maskIp, parseDeviceLabel } from '../common/client-ip.js';
import { ENV, type Env } from '../config/env.js';
import type { Prisma, SecurityBanKind, SecuritySeverity } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AuditLogInput {
  event: string;
  severity?: SecuritySeverity;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  path?: string | null;
  detail?: Record<string, unknown>;
}

export interface PersistedBanInput {
  target: string;
  kind: SecurityBanKind;
  reason: string;
  score: number;
  banCount: number;
  expiresAt: Date;
}

export interface AdminAuditLogItem {
  id: string;
  event: string;
  severity: SecuritySeverity;
  userId: string | null;
  ip: string | null;
  path: string | null;
  detail: unknown;
  createdAt: string;
}

const AUDIT_RETENTION_DAYS = 90;
const CLEANUP_INTERVAL_MS = 12 * 60 * 60_000;

const USER_EVENT_LABELS: Record<string, string> = {
  login_email: '邮箱验证码登录',
  login_password: '邮箱密码登录',
  login_failed: '密码登录失败',
  register: '注册并设置登录密码',
  password_changed: '修改/设置了登录密码',
  password_reset: '重置密码并吊销全部旧会话',
  logout_all: '主动退出全部设备',
  session_revoked: '手动下线单个设备会话',
  token_reuse_detected: '检测到异常令牌复用，已自动全端下线保护',
  account_deleted: '永久注销账号',
};

const USER_VISIBLE_EVENTS = Object.keys(USER_EVENT_LABELS);

/**
 * 持久化安全审计与封禁仓储：
 * 1. 将高危 IP/网段封禁持久化至 security_bans，确保容器重启后防护不丢失；
 * 2. 将登录、改密、登出、异常令牌复用、蜜罐/封禁与管理员操作写入 security_audit_logs（保留 90 天）；
 * 3. 为用户「账号与安全中心」提供活跃设备会话管理与最近安全活动时间线。
 */
@Injectable()
export class SecurityAuditService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('SecurityAudit');
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    this.cleanupTimer = setInterval(() => void this.pruneExpired(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  /** 安全异步写入审计日志（吞掉 DB 瞬断异常，绝不阻塞或弄崩用户业务请求） */
  log(input: AuditLogInput): void {
    if (this.env.NODE_ENV === 'test') return;
    void this.prisma.securityAuditLog
      .create({
        data: {
          event: input.event.slice(0, 64),
          severity: input.severity ?? 'info',
          userId: input.userId ?? null,
          ip: input.ip ? input.ip.slice(0, 64) : null,
          userAgent: input.userAgent ? input.userAgent.slice(0, 255) : null,
          path: input.path ? input.path.slice(0, 160) : null,
          detail: input.detail ? (input.detail as Prisma.InputJsonValue) : undefined,
        },
      })
      .catch((err) => {
        this.logger.warn(`写入安全审计日志失败：${err instanceof Error ? err.message : String(err)}`);
      });
  }

  /** 持久化长期 IP / 网段封禁 */
  persistBan(input: PersistedBanInput): void {
    if (this.env.NODE_ENV === 'test') return;
    void this.prisma.securityBan
      .upsert({
        where: { target: input.target },
        create: {
          target: input.target,
          kind: input.kind,
          reason: input.reason.slice(0, 64),
          score: input.score,
          banCount: Math.min(32000, input.banCount),
          expiresAt: input.expiresAt,
        },
        update: {
          reason: input.reason.slice(0, 64),
          score: input.score,
          banCount: Math.min(32000, input.banCount),
          expiresAt: input.expiresAt,
        },
      })
      .catch((err) => {
        this.logger.warn(`持久化安全封禁失败：${err instanceof Error ? err.message : String(err)}`);
      });
  }

  /** 管理员解封时同步清理持久化封禁记录 */
  removePersistedBans(targets: string[]): void {
    if (this.env.NODE_ENV === 'test' || targets.length === 0) return;
    void this.prisma.securityBan
      .deleteMany({ where: { target: { in: targets } } })
      .catch((err) => {
        this.logger.warn(`移除持久化封禁失败：${err instanceof Error ? err.message : String(err)}`);
      });
  }

  /** 容器启动时加载未过期封禁名单回填内存 */
  async loadActiveBans(): Promise<
    { target: string; kind: SecurityBanKind; reason: string; score: number; banCount: number; expiresAt: Date }[]
  > {
    if (this.env.NODE_ENV === 'test') return [];
    try {
      return await this.prisma.securityBan.findMany({
        where: { expiresAt: { gt: new Date() } },
        orderBy: { expiresAt: 'desc' },
        take: 2000,
        select: { target: true, kind: true, reason: true, score: true, banCount: true, expiresAt: true },
      });
    } catch (err) {
      this.logger.warn(`启动加载持久化封禁失败（若首次迁移尚未执行可忽略）：${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /** 用户「账号与安全中心」：返回活跃设备列表与最近 20 条安全事件 */
  async getUserSecurityOverview(userId: string): Promise<UserSecurityOverview> {
    const now = new Date();
    const [tokens, logs] = await Promise.all([
      this.prisma.refreshToken.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, userAgent: true, ip: true, nativeVersion: true, createdAt: true, expiresAt: true },
      }),
      this.prisma.securityAuditLog.findMany({
        where: { userId, event: { in: USER_VISIBLE_EVENTS } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, event: true, severity: true, ip: true, userAgent: true, createdAt: true },
      }),
    ]);

    const activeSessions: UserSessionInfo[] = tokens.map((t) => {
      const parsed = parseDeviceLabel(t.userAgent, t.nativeVersion);
      return {
        id: t.id,
        deviceLabel: parsed.label,
        platform: parsed.platform,
        ipMasked: maskIp(t.ip),
        nativeVersion: t.nativeVersion,
        createdAt: t.createdAt.toISOString(),
        expiresAt: t.expiresAt.toISOString(),
      };
    });

    const recentEvents: UserSecurityEvent[] = logs.map((l) => ({
      id: l.id,
      event: l.event,
      label: USER_EVENT_LABELS[l.event] ?? l.event,
      severity: l.severity,
      ipMasked: maskIp(l.ip),
      deviceLabel: l.userAgent ? parseDeviceLabel(l.userAgent).label : null,
      createdAt: l.createdAt.toISOString(),
    }));

    return { activeSessions, recentEvents };
  }

  /** 下线用户的单个设备会话 */
  async revokeUserSession(userId: string, sessionId: string, ip?: string, userAgent?: string): Promise<boolean> {
    const res = await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count > 0) {
      this.log({
        event: 'session_revoked',
        severity: 'info',
        userId,
        ip,
        userAgent,
        detail: { sessionId },
      });
    }
    return res.count > 0;
  }

  /** 管理员一键吊销低于指定原生版本号的旧版安卓测试包会话 */
  async revokeLegacyNativeSessions(minNativeVersion: number, adminUserId: string, ip?: string): Promise<number> {
    const now = new Date();
    const res = await this.prisma.refreshToken.updateMany({
      where: {
        revokedAt: null,
        expiresAt: { gt: now },
        OR: [
          { nativeVersion: { lt: minNativeVersion } },
          {
            nativeVersion: null,
            userAgent: { contains: 'Android', mode: 'insensitive' },
          },
        ],
      },
      data: { revokedAt: now },
    });
    this.log({
      event: 'admin_revoke_legacy_native',
      severity: 'warn',
      userId: adminUserId,
      ip,
      detail: { minNativeVersion, revokedCount: res.count },
    });
    return res.count;
  }

  /** 管理员查看最近持久化审计日志 */
  async getRecentAdminLogs(limit = 50): Promise<AdminAuditLogItem[]> {
    try {
      const rows = await this.prisma.securityAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: Math.min(100, Math.max(1, limit)),
        select: { id: true, event: true, severity: true, userId: true, ip: true, path: true, detail: true, createdAt: true },
      });
      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    } catch {
      return [];
    }
  }

  async pruneExpired(now = Date.now()): Promise<void> {
    try {
      const logCutoff = new Date(now - AUDIT_RETENTION_DAYS * 24 * 60 * 60_000);
      const [logs, bans] = await Promise.all([
        this.prisma.securityAuditLog.deleteMany({ where: { createdAt: { lt: logCutoff } } }),
        this.prisma.securityBan.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }),
      ]);
      if (logs.count || bans.count) {
        this.logger.log(`已清理过期安全记录：审计日志 ${logs.count} 条，过期封禁 ${bans.count} 条`);
      }
    } catch (err) {
      this.logger.warn(`清理过期安全记录失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
