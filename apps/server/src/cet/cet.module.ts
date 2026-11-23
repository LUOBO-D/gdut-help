import { Module } from '@nestjs/common';
import { CetController } from './cet.controller.js';
import { CetService } from './cet.service.js';

@Module({
  controllers: [CetController],
  providers: [CetService],
})
export class CetModule {}
