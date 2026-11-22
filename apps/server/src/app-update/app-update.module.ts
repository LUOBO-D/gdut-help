import { Module } from '@nestjs/common';
import { AppUpdateController } from './app-update.controller.js';
import { AppUpdateService } from './app-update.service.js';

@Module({
  controllers: [AppUpdateController],
  providers: [AppUpdateService],
})
export class AppUpdateModule {}
