import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppUpdateModule } from './app-update/app-update.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AppConfigModule } from './config/config.module.js';
import { HealthController } from './health/health.controller.js';
import { MailModule } from './mail/mail.module.js';
import { MerchantModule } from './merchant/merchant.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { NotifyModule } from './notify/notify.module.js';
import { RecommendModule } from './recommend/recommend.module.js';
import { ReviewModule } from './review/review.module.js';
import { TimetableModule } from './timetable/timetable.module.js';
import { TodoModule } from './todo/todo.module.js';
import { UsersModule } from './users/users.module.js';
import { WeatherModule } from './weather/weather.module.js';

@Module({
  imports: [
    AppConfigModule,
    // 全局限流：每个 IP 每分钟 120 次，个别接口用 @Throttle 收紧
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    MailModule,
    AppUpdateModule,
    AuthModule,
    UsersModule,
    WeatherModule,
    TimetableModule,
    NotifyModule,
    TodoModule,
    MerchantModule,
    RecommendModule,
    ReviewModule,
  ],
  controllers: [HealthController],
  // 限流守卫先于登录守卫执行，未登录的暴力请求也会被拦住
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
