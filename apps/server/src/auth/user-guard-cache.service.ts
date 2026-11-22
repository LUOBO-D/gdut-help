import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@gduthelp/shared';
import { AppException } from '../common/app.exception.js';
import type { UserStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

interface StatusEntry {
  status: UserStatus | 'missing';
  expiresAt: number;
}

const STATUS_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 2000;

/**
 * 轻量进程内账户安全状态缓存（无 Redis 依赖）：
 * 1) 缓存用户 status（normal / banned / missing）60 秒，并支持管理操作主动失效，消除 15 分钟 JWT 封禁窗口；
 * 2) 记录每个用户「退出全部设备 / 注销 / 令牌盗用吊销」时间点，使旧 access token 即刻失效。
 */
@Injectable()
export class UserGuardCacheService {
  private readonly statusCache = new Map<string, StatusEntry>();
  private readonly revokedBefore = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  /** 校验用户是否被封禁、注销或已在当前 token 签发后执行过全部退出 */
  async assertAllowed(userId: string, tokenIatMs?: number): Promise<void> {
    const revokedAt = this.revokedBefore.get(userId);
    if (revokedAt !== undefined && (tokenIatMs === undefined || tokenIatMs <= revokedAt)) {
      throw new AppException(ErrorCode.UNAUTHORIZED, '登录状态已失效，请重新登录', HttpStatus.UNAUTHORIZED);
    }

    const now = Date.now();
    let entry = this.statusCache.get(userId);
    if (!entry || entry.expiresAt <= now) {
      const row = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
      entry = { status: row ? row.status : 'missing', expiresAt: now + STATUS_TTL_MS };
      this.setBounded(this.statusCache, userId, entry);
    }

    if (entry.status === 'banned') {
      throw new AppException(ErrorCode.FORBIDDEN, '账号已被封禁', HttpStatus.FORBIDDEN);
    }
    if (entry.status === 'missing') {
      throw new AppException(ErrorCode.UNAUTHORIZED, '账号不存在或已注销', HttpStatus.UNAUTHORIZED);
    }
  }

  /** 退出全部设备 / 令牌重放吊销 / 注销账号后立即使此前签发的全部 access token 失效 */
  markRevokedNow(userId: string): void {
    // JWT iat 精确到秒（Math.floor(Date.now()/1000)*1000），取当前整秒即可精确拦截此前签发的所有令牌，同时允许紧随其后新签发的令牌
    const cutoffMs = Math.floor(Date.now() / 1000) * 1000;
    this.setBounded(this.revokedBefore, userId, cutoffMs);
    this.statusCache.delete(userId);
  }

  /** 管理后台封禁/解封用户后主动清缓存，立即生效 */
  invalidateStatus(userId: string): void {
    this.statusCache.delete(userId);
  }

  private setBounded<V>(map: Map<string, V>, key: string, value: V): void {
    if (map.size >= MAX_CACHE_ENTRIES && !map.has(key)) {
      const firstKey = map.keys().next().value;
      if (firstKey !== undefined) map.delete(firstKey);
    }
    map.set(key, value);
  }
}
