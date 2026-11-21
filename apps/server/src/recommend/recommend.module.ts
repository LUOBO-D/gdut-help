import { Module } from '@nestjs/common';
import { MerchantModule } from '../merchant/merchant.module.js';
import { NotifyModule } from '../notify/notify.module.js';
import { TimetableModule } from '../timetable/timetable.module.js';
import { WeatherModule } from '../weather/weather.module.js';
import { LlmReasonService } from './llm-reason.service.js';
import { MealNotifyScheduler } from './meal-notify.scheduler.js';
import { RecommendController } from './recommend.controller.js';
import { RecommendService } from './recommend.service.js';

@Module({
  imports: [MerchantModule, WeatherModule, TimetableModule, NotifyModule],
  controllers: [RecommendController],
  providers: [RecommendService, LlmReasonService, MealNotifyScheduler],
})
export class RecommendModule {}
