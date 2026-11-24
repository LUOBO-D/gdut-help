import { CanActivate, ExecutionContext, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '@gduthelp/shared';
import type { Request } from 'express';
import { AppException } from '../common/app.exception.js';
import { clientIp } from '../common/client-ip.js';
import { ActiveDefenseService } from '../security/active-defense.service.js';
import { IS_PUBLIC, REQUIRE_ADMIN, type AuthUser } from './auth.decorators.js';
import type { AccessTokenPayload } from './auth.service.js';
import { UserGuardCacheService } from './user-guard-cache.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Optional() private readonly guardCache?: UserGuardCacheService,
    @Optional() private readonly defense?: ActiveDefenseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw unauthorized();

    let iatMs: number | undefined;
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload & { iat?: number }>(token, {
        algorithms: ['HS256'],
        issuer: 'gduthelp',
      });
      req.user = { id: payload.sub, role: payload.role };
      iatMs = typeof payload.iat === 'number' ? payload.iat * 1000 : undefined;
    } catch (err) {
      // 区分正常过期（TokenExpiredError）与签名篡改/伪造令牌，后者计入高危风险分
      const errName = err instanceof Error ? err.name : '';
      if (errName !== 'TokenExpiredError') {
        const path = (req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';
        this.defense?.recordIncident(clientIp(req), 'jwt_tamper', path);
      }
      throw unauthorized();
    }

    if (this.guardCache) {
      await this.guardCache.assertAllowed(req.user.id, iatMs);
    }

    const adminOnly = this.reflector.getAllAndOverride<boolean>(REQUIRE_ADMIN, [context.getHandler(), context.getClass()]);
    if (adminOnly && req.user.role !== 'admin') {
      const path = (req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';
      this.defense?.recordIncident(clientIp(req), 'admin_probe', path, req.user.id);
      throw new AppException(ErrorCode.FORBIDDEN, '需要管理员权限', 403);
    }
    return true;
  }
}

const unauthorized = () => new AppException(ErrorCode.UNAUTHORIZED, '登录已过期，请重新登录', 401);
