import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { formatHm, sessionsOn, today } from '@gduthelp/shared';
import { ENV, type Env } from '../config/env.js';
import { NotifyService } from '../notify/notify.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TimetableService } from './timetable.service.js';

const POLL_MS = 60_000;
const SHUTDOWN_GRACE_MS = 3000;

/**
 * 课前自动提醒调度（Web / 邮件 / 站内通知通道）：
 * 每分钟检查一次开启了「课前提醒」的用户，在课程开始前 classRemindMinutes 分钟内发出提醒。
 * 通过 class_notify_logs(user_id, date, course_id, period_start) 联合唯一约束保证严格幂等。
 */
@Injectable()
export class ClassReminderScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ClassReminderScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<number> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly timetable: TimetableService,
    private readonly notify: NotifyService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.timer.unref();
  }

  async onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.inFlight) {
      await Promise.race([
        this.inFlight.catch(() => 0),
        new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS)),
      ]);
    }
  }

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
    const date = today(now);
    const nowMs = now.getTime();

    try {
      const users = await this.prisma.user.findMany({
        where: { classRemindMinutes: { gt: 0 }, status: 'normal' },
        select: { id: true, campusId: true, classRemindMinutes: true },
        take: 200,
      });

      for (const u of users) {
        const tt = await this.timetable.data(u.id);
        if (!tt.semester || !tt.courses.length) continue;
        const sessions = sessionsOn(tt, date, u.campusId);

        for (const s of sessions) {
          const start = new Date(s.start);
          const end = new Date(s.end);
          const remindAtMs = start.getTime() - u.classRemindMinutes * 60_000;
          if (nowMs < remindAtMs || nowMs >= start.getTime()) continue;

          // 先写唯一幂等日志再发送，避免并发或重启动重复提醒
          try {
            await this.prisma.classNotifyLog.create({
              data: { userId: u.id, date, courseId: s.courseId, periodStart: s.periodStart },
            });
          } catch {
            continue;
          }

          const minsLeft = Math.max(1, Math.round((start.getTime() - nowMs) / 60_000));
          const loc = s.location ? ` · ${s.location}` : '';
          await this.notify.notify(u.id, {
            title: `${minsLeft} 分钟后上课：${s.name}`,
            body: `${formatHm(start)}–${formatHm(end)}${loc}`,
            link: '/timetable',
            tag: `class-${date}-${s.courseId}-${s.periodStart}`,
          });
          sent++;
        }
      }

      if (sent) this.logger.log(`已发出 ${sent} 条课前提醒`);
    } catch (err) {
      this.logger.warn(`课前提醒扫描出错：${err instanceof Error ? err.message : String(err)}`);
    }

    return sent;
  }
}
