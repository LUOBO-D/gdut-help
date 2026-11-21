import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { MEAL_LABELS, today, type MealType } from '@gduthelp/shared';
import { ENV, type Env } from '../config/env.js';
import { NotifyService } from '../notify/notify.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RecommendService } from './recommend.service.js';

const POLL_MS = 5 * 60 * 1000;

/** 北京时间饭点推送窗口：午饭 11:25–11:55，晚饭 17:15–17:45 */
export function activeMealWindow(now: Date): MealType | null {
  const bj = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const mins = bj.getUTCHours() * 60 + bj.getUTCMinutes();
  if (mins >= 11 * 60 + 25 && mins <= 11 * 60 + 55) return 'lunch';
  if (mins >= 17 * 60 + 15 && mins <= 17 * 60 + 45) return 'dinner';
  return null;
}

/**
 * 饭点推荐推送调度：为开启「饭点推荐推送」的用户，在午饭/晚饭前推送一条个性化推荐。
 * 通过 meal_notify_logs(user_id, date, meal) 联合唯一约束保证严格幂等，不重复打扰。
 */
@Injectable()
export class MealNotifyScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MealNotifyScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly recommend: RecommendService,
    private readonly notify: NotifyService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<number> {
    const meal = activeMealWindow(now);
    if (!meal || this.running) return 0;
    this.running = true;
    const date = today(now);
    let sent = 0;

    try {
      const users = await this.prisma.user.findMany({
        where: { remindMeal: true, status: 'normal' },
        select: { id: true },
        take: 200,
      });

      for (const u of users) {
        const already = await this.prisma.mealNotifyLog.findUnique({
          where: { userId_date_meal: { userId: u.id, date, meal } },
          select: { id: true },
        });
        if (already) continue;

        const rec = await this.recommend.recommendMeals(u.id, { meal, now });
        const top = rec.items[0];
        if (!top) continue;

        // 先写幂等日志再通知，防止服务重启或并发重复推送
        try {
          await this.prisma.mealNotifyLog.create({
            data: { userId: u.id, date, meal, merchantId: top.merchant.id },
          });
        } catch {
          continue;
        }

        await this.notify.notify(u.id, {
          title: `${MEAL_LABELS[meal]}推荐：${top.merchant.name}`,
          body: `${top.reason}（${top.merchant.locationText} · 人均 ¥${top.merchant.priceAvg}）`,
          link: '/food',
          tag: `meal-${date}-${meal}`,
        });
        sent++;
      }
      if (sent) this.logger.log(`已发出 ${sent} 条${MEAL_LABELS[meal]}推荐推送`);
    } catch (err) {
      this.logger.warn(`饭点推送扫描出错：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }

    return sent;
  }
}
