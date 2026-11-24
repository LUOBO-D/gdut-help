import { Global, Module } from '@nestjs/common';
import { ActiveDefenseService } from './active-defense.service.js';
import { SecurityController } from './security.controller.js';

@Global()
@Module({
  controllers: [SecurityController],
  providers: [ActiveDefenseService],
  exports: [ActiveDefenseService],
})
export class SecurityModule {}
