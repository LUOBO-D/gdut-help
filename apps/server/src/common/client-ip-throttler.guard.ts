import { ExecutionContext, Inject, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerStorage, type ThrottlerLimitDetail, type ThrottlerModuleOptions } from '@nestjs/throttler';
import type { Request } from 'express';
import { ActiveDefenseService } from '../security/active-defense.service.js';
import { clientIp } from './client-ip.js';

/**
 * 统一按受信任代理后的真实客户端 IP 限流，并将频繁撞墙（429）的来源同步喂给主动防御引擎升级风控。
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject('THROTTLER:MODULE_OPTIONS') options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    @Optional() private readonly defense?: ActiveDefenseService,
  ) {
    super(options, storageService, reflector);
  }

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(clientIp(req as unknown as Request));
  }

  protected override throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest<Request>();
      const path = (req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';
      this.defense?.recordIncident(clientIp(req), 'rate_limit_exceeded', path);
    }
    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
