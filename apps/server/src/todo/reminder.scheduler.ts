import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { NotifyService } from '../notify/notify.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { reminderBody } from './reminder-message.js';

const BATCH = 50;

/**
 * 提醒调度：每隔 REMINDER_POLL_SECONDS 秒扫描一次到期的提醒并发送。
 *
 * 没有用 Redis + BullMQ 延时队列（原设计）：自用阶段只有一个实例、提醒量很小，
 * 扫数据库更简单，也天然覆盖了「服务停机期间错过的提醒在启动后补发」。
 * 每条提醒先用条件更新「抢占」再发送，多实例部署时也不会重复发送。
 */
@Injectable()
export class ReminderScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ReminderScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), this.env.REMINDER_POLL_SECONDS * 1000);
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** 处理一轮到期提醒，返回发出的数量。上一轮还没结束时跳过 */
  async tick(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let sent = 0;
    try {
      // 待办已完成的提醒直接取消
      await this.prisma.reminder.updateMany({
        where: { status: 'pending', fireAt: { lte: now }, todo: { completedAt: { not: null } } },
        data: { status: 'cancelled' },
      });
      const due = await this.prisma.reminder.findMany({
        where: { status: 'pending', fireAt: { lte: now } },
        include: { todo: true },
        orderBy: { fireAt: 'asc' },
        take: BATCH,
      });
      for (const r of due) {
        const claimed = await this.prisma.reminder.updateMany({
          where: { id: r.id, status: 'pending' },
          data: { status: 'sent', sentAt: now },
        });
        if (claimed.count === 0) continue;
        const late = Math.floor((now.getTime() - r.fireAt.getTime()) / 60_000);
        try {
          await this.notify.notify(r.userId, {
            title: r.todo.title,
            body: reminderBody(r.todo.dueAt, now, late),
            link: '/todo',
            tag: `todo-${r.todoId}`,
          });
          sent++;
        } catch (err) {
          // 站内通知写入失败（数据库问题）时恢复为待发送，下一轮重试
          await this.prisma.reminder.update({ where: { id: r.id }, data: { status: 'pending', sentAt: null } });
          this.logger.error(`提醒 ${r.id} 发送失败，将重试：${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (sent) this.logger.log(`已发送 ${sent} 条提醒`);
    } catch (err) {
      this.logger.error(`提醒扫描出错：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
    return sent;
  }
}
