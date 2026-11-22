import { CanActivate, ExecutionContext, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '@gduthelp/shared';
import type { Request } from 'express';
import { AppException } from '../common/app.exception.js';
import { IS_PUBLIC, REQUIRE_ADMIN, type AuthUser } from './auth.decorators.js';
import type { AccessTokenPayload } from './auth.service.js';
import { UserGuardCacheService } from './user-guard-cache.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Optional() private readonly guardCache?: UserGuardCacheService,
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
    } catch {
      throw unauthorized();
    }

    if (this.guardCache) {
      await this.guardCache.assertAllowed(req.user.id, iatMs);
    }

    const adminOnly = this.reflector.getAllAndOverride<boolean>(REQUIRE_ADMIN, [context.getHandler(), context.getClass()]);
    if (adminOnly && req.user.role !== 'admin') throw new AppException(ErrorCode.FORBIDDEN, '需要管理员权限', 403);
    return true;
  }
}

const unauthorized = () => new AppException(ErrorCode.UNAUTHORIZED, '登录已过期，请重新登录', 401);
