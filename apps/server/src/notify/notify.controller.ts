import { Body, Controller, Delete, Get, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  markReadSchema,
  pushSubscriptionSchema,
  type DeliveryResult,
  type NotificationPage,
  type PushSubscriptionInput,
} from '@gduthelp/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { clientIp } from '../common/client-ip.js';
import { NotifyService } from './notify.service.js';
import { PushService } from './push.service.js';

@Controller()
export class NotifyController {
  constructor(
    private readonly notify: NotifyService,
    private readonly push: PushService,
  ) {}

  @Get('notifications')
  list(@CurrentUser() user: AuthUser): Promise<NotificationPage> {
    return this.notify.list(user.id);
  }

  @Post('notifications/read')
  @HttpCode(200)
  async read(@CurrentUser() user: AuthUser, @Body({ schema: markReadSchema }) body: z.infer<typeof markReadSchema>): Promise<null> {
    await this.notify.markRead(user.id, body.ids);
    return null;
  }

  /** 发一条测试提醒，用来确认推送和邮件都能收到 */
  @Post('notifications/test')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  test(@CurrentUser() user: AuthUser): Promise<DeliveryResult> {
    return this.notify.notify(user.id, {
      title: '测试提醒',
      body: '能看到这条，说明提醒渠道正常。',
      link: '/todo',
      tag: 'test',
    });
  }

  @Get('push/public-key')
  publicKey(): { publicKey: string | null } {
    return { publicKey: this.push.publicKey };
  }

  @Post('push/subscriptions')
  @HttpCode(200)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  async subscribe(
    @CurrentUser() user: AuthUser,
    @Body({ schema: pushSubscriptionSchema }) body: PushSubscriptionInput,
    @Headers('user-agent') ua: string | undefined,
    @Req() req: Request,
  ): Promise<null> {
    await this.push.subscribe(user.id, body, ua, clientIp(req));
    return null;
  }

  @Delete('push/subscriptions')
  @HttpCode(200)
  async unsubscribe(
    @CurrentUser() user: AuthUser,
    @Body('endpoint', { schema: z.url() }) endpoint: string,
  ): Promise<null> {
    await this.push.unsubscribe(user.id, endpoint);
    return null;
  }
}
