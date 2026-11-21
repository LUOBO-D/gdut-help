import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { findFreeSlotHint } from '@gduthelp/shared';
import { ENV, type Env } from '../config/env.js';
import { NotifyService } from '../notify/notify.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TimetableService } from '../timetable/timetable.service.js';
import { reminderBody } from './reminder-message.js';

const BATCH = 50;
const SHUTDOWN_GRACE_MS = 3000;

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
  private inFlight: Promise<number> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    @Inject(ENV) private readonly env: Env,
    @Optional() private readonly timetable?: TimetableService,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), this.env.REMINDER_POLL_SECONDS * 1000);
    this.timer.unref();
    void this.tick();
  }

  async onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // 停机时等待当前正在投递的提醒批次完成（最多 3 秒），防止中途截断
    if (this.inFlight) {
      await Promise.race([
        this.inFlight.catch(() => 0),
        new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS)),
      ]);
    }
  }

  /** 处理一轮到期提醒，返回发出的数量。上一轮还没结束时跳过 */
  tick(now = new Date()): Promise<number> {
    if (this.inFlight) return Promise.resolve(0);
    const run = this.runTick(now).finally(() => {
      if (this.inFlight === run) this.inFlight = null;
    });
    this.inFlight = run;
    return run;
  }

  private async runTick(now: Date): Promise<number> {
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
        let freeHint: string | null = null;
        if (this.timetable && r.todo.dueAt && r.todo.dueAt > now) {
          try {
            const [tt, u] = await Promise.all([
              this.timetable.data(r.userId),
              this.prisma.user.findUnique({ where: { id: r.userId }, select: { campusId: true } }),
            ]);
            freeHint = findFreeSlotHint(tt, u?.campusId, r.todo.dueAt, now);
          } catch {
            // 空档提示属于增强信息，查询失败不影响核心提醒发送
          }
        }
        const baseBody = reminderBody(r.todo.dueAt, now, late);
        const body = freeHint ? `${baseBody} · ${freeHint}` : baseBody;
        try {
          await this.notify.notify(r.userId, {
            title: r.todo.title,
            body,
            link: '/todo',
            tag: `todo-${r.todoId}`,
          });
          sent++;
        } catch (err) {
          // 站内通知写入失败（数据库问题）时恢复为待发送，下一轮重试；回滚本身也做隔离保护
          try {
            await this.prisma.reminder.update({ where: { id: r.id }, data: { status: 'pending', sentAt: null } });
          } catch (rollbackErr) {
            this.logger.error(
              `提醒 ${r.id} 状态回滚失败：${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`,
            );
          }
          this.logger.error(`提醒 ${r.id} 发送失败，将重试：${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (sent) this.logger.log(`已发送 ${sent} 条提醒`);
    } catch (err) {
      this.logger.error(`提醒扫描出错：${err instanceof Error ? err.message : String(err)}`);
    }
    return sent;
  }
}
