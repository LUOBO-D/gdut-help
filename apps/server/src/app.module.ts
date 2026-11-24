import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppUpdateModule } from './app-update/app-update.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ClientIpThrottlerGuard } from './common/client-ip-throttler.guard.js';
import { AppConfigModule } from './config/config.module.js';
import { CetModule } from './cet/cet.module.js';
import { CourseReviewModule } from './course-review/course-review.module.js';
import { CourseSelectionModule } from './course-selection/course-selection.module.js';
import { ExamModule } from './exam/exam.module.js';
import { FitnessModule } from './fitness/fitness.module.js';
import { GradeModule } from './grade/grade.module.js';
import { HealthController } from './health/health.controller.js';
import { MailModule } from './mail/mail.module.js';
import { MerchantModule } from './merchant/merchant.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { NotifyModule } from './notify/notify.module.js';
import { RecommendModule } from './recommend/recommend.module.js';
import { ReviewModule } from './review/review.module.js';
import { SecondClassModule } from './second-class/second-class.module.js';
import { SecurityModule } from './security/security.module.js';
import { TimetableModule } from './timetable/timetable.module.js';
import { TodoModule } from './todo/todo.module.js';
import { UsersModule } from './users/users.module.js';
import { WeatherModule } from './weather/weather.module.js';

@Module({
  imports: [
    AppConfigModule,
    // 两级全局限流：突发每秒上限 20 次 + 每分钟上限 120 次，敏感接口额外用 @Throttle 收紧
    ThrottlerModule.forRoot([
      { name: 'burst', ttl: 1_000, limit: 20 },
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    PrismaModule,
    SecurityModule,
    MailModule,
    AppUpdateModule,
    AuthModule,
    UsersModule,
    WeatherModule,
    TimetableModule,
    ExamModule,
    FitnessModule,
    GradeModule,
    CetModule,
    SecondClassModule,
    CourseReviewModule,
    CourseSelectionModule,
    NotifyModule,
    TodoModule,
    MerchantModule,
    RecommendModule,
    ReviewModule,
  ],
  controllers: [HealthController],
  // 限流守卫先于登录守卫执行，未登录的暴力请求也会被按真实客户端 IP 拦住
  providers: [{ provide: APP_GUARD, useClass: ClientIpThrottlerGuard }],
})
export class AppModule {}
