import { Module } from '@nestjs/common';
import { NotifyController } from './notify.controller.js';
import { NotifyService } from './notify.service.js';
import { PushService } from './push.service.js';

@Module({
  controllers: [NotifyController],
  providers: [NotifyService, PushService],
  exports: [NotifyService],
})
export class NotifyModule {}
