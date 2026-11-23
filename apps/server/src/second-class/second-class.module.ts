import { Module } from '@nestjs/common';
import { SecondClassController } from './second-class.controller.js';
import { SecondClassService } from './second-class.service.js';

@Module({
  controllers: [SecondClassController],
  providers: [SecondClassService],
})
export class SecondClassModule {}
