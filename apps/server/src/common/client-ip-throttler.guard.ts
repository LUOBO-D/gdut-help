import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { clientIp } from './client-ip.js';

/**
 * 统一按受信任代理后的真实客户端 IP 限流，避免容器 NAT 下全站共用单一 IP 计数或被伪造头绕过。
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(clientIp(req as unknown as Request));
  }
}
