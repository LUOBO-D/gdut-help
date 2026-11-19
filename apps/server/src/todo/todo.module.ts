import { Module } from '@nestjs/common';
import { NotifyModule } from '../notify/notify.module.js';
import { ReminderScheduler } from './reminder.scheduler.js';
import { TodoController } from './todo.controller.js';
import { TodoService } from './todo.service.js';

@Module({
  imports: [NotifyModule],
  controllers: [TodoController],
  providers: [TodoService, ReminderScheduler],
})
export class TodoModule {}
