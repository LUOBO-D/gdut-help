import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, isTrustedPushEndpoint, type PushPayload, type PushSubscriptionInput } from '@gduthelp/shared';
import { sendNotification, WebPushError } from 'web-push';
import { AppException } from '../common/app.exception.js';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

const MAX_SUBSCRIPTIONS_PER_USER = 10;

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get publicKey(): string | null {
    return this.enabled ? this.env.VAPID_PUBLIC_KEY : null;
  }

  private get enabled() {
    return Boolean(this.env.VAPID_PUBLIC_KEY && this.env.VAPID_PRIVATE_KEY);
  }

  async subscribe(userId: string, sub: PushSubscriptionInput, userAgent?: string) {
    if (!isTrustedPushEndpoint(sub.endpoint)) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '不受信任的推送服务地址', HttpStatus.BAD_REQUEST);
    }

    // 同一个浏览器换了账号登录时，订阅归属到新账号
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 255) },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, lastUsedAt: new Date() },
    });

    // 限制单账号最多保留 10 个推送订阅，防止恶意堆积
    const overflow = await this.prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
      skip: MAX_SUBSCRIPTIONS_PER_USER,
      select: { id: true },
    });
    if (overflow.length) {
      await this.prisma.pushSubscription.deleteMany({ where: { id: { in: overflow.map((o) => o.id) } } });
    }
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /** 发到该用户的所有浏览器；推送服务返回 404/410 说明订阅已失效，直接删除 */
  async sendToUser(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number; removed: number }> {
    const result = { sent: 0, failed: 0, removed: 0 };
    if (!this.enabled) return result;
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    const body = JSON.stringify(payload);

    await Promise.all(
      subs.map(async (s) => {
        if (!isTrustedPushEndpoint(s.endpoint)) {
          await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
          result.removed++;
          return;
        }
        try {
          await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            vapidDetails: { subject: this.env.VAPID_SUBJECT, publicKey: this.env.VAPID_PUBLIC_KEY, privateKey: this.env.VAPID_PRIVATE_KEY },
            TTL: 60 * 60,
            urgency: 'high',
            timeout: 10_000,
          });
          result.sent++;
          await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } });
        } catch (err) {
          if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
            await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
            result.removed++;
          } else {
            result.failed++;
            const host = new URL(s.endpoint).host;
            this.logger.warn(`推送到 ${host} 失败：${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }),
    );
    return result;
  }
}
