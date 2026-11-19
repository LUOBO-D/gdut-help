import { Injectable, Logger } from '@nestjs/common';
import type { AppNotification, DeliveryResult, NotificationPage } from '@gduthelp/shared';
import type { Notification } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from './push.service.js';

export interface NotifyInput {
  title: string;
  body: string;
  link?: string;
  /** 同一 tag 的通知在手机上会合并成一条 */
  tag?: string;
}

const toDto = (n: Notification): AppNotification => ({
  id: n.id,
  title: n.title,
  body: n.body,
  link: n.link,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

/**
 * 统一的通知出口：先写站内通知（一定成功），再尝试浏览器推送和邮件。
 * 推送和邮件失败只记录日志，不影响站内通知。
 */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly mail: MailService,
  ) {}

  async notify(userId: string, input: NotifyInput): Promise<DeliveryResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, remindByEmail: true } });
    if (!user) return { push: { sent: 0, failed: 0, removed: 0 }, email: 'skipped' };

    await this.prisma.notification.create({
      data: { userId, title: input.title, body: input.body, link: input.link ?? null },
    });

    const [push, email] = await Promise.all([
      this.push.sendToUser(userId, { title: input.title, body: input.body, link: input.link, tag: input.tag }),
      user.remindByEmail
        ? this.mail
            .sendReminder(user.email, input.title, input.body, input.link ?? null)
            .then(() => 'sent' as const)
            .catch((err: unknown) => {
              this.logger.warn(`提醒邮件发送失败：${err instanceof Error ? err.message : String(err)}`);
              return 'failed' as const;
            })
        : Promise.resolve('skipped' as const),
    ]);
    return { push, email };
  }

  async list(userId: string): Promise<NotificationPage> {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items: items.map(toDto), unread };
  }

  async markRead(userId: string, ids?: string[]): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
  }
}
