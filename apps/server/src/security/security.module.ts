import { Global, Module } from '@nestjs/common';
import { ActiveDefenseService } from './active-defense.service.js';
import { SecurityAlertService } from './security-alert.service.js';
import { SecurityAuditService } from './security-audit.service.js';
import { SecurityController } from './security.controller.js';

@Global()
@Module({
  controllers: [SecurityController],
  providers: [SecurityAlertService, SecurityAuditService, ActiveDefenseService],
  exports: [SecurityAlertService, SecurityAuditService, ActiveDefenseService],
})
export class SecurityModule {}
