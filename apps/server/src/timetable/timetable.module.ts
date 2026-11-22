import { Module } from '@nestjs/common';
import { NotifyModule } from '../notify/notify.module.js';
import { ClassReminderScheduler } from './class-reminder.scheduler.js';
import { TimetableController } from './timetable.controller.js';
import { TimetableService } from './timetable.service.js';

@Module({
  imports: [NotifyModule],
  controllers: [TimetableController],
  providers: [TimetableService, ClassReminderScheduler],
  exports: [TimetableService],
})
export class TimetableModule {}
