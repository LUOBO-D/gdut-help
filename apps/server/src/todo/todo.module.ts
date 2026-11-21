import { Module } from '@nestjs/common';
import { NotifyModule } from '../notify/notify.module.js';
import { TimetableModule } from '../timetable/timetable.module.js';
import { ReminderScheduler } from './reminder.scheduler.js';
import { TodoController } from './todo.controller.js';
import { TodoService } from './todo.service.js';

@Module({
  imports: [NotifyModule, TimetableModule],
  controllers: [TodoController],
  providers: [TodoService, ReminderScheduler],
})
export class TodoModule {}
