import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly } from '../auth/auth.decorators.js';
import { ActiveDefenseService, type SecuritySummary } from './active-defense.service.js';

const unbanSchema = z.object({
  ip: z.string().trim().min(3).max(64),
});

@AdminOnly()
@Controller('admin/security')
export class SecurityController {
  constructor(private readonly defense: ActiveDefenseService) {}

  @Get('summary')
  summary(): SecuritySummary {
    return this.defense.getSummary();
  }

  @Post('unban')
  @HttpCode(200)
  unban(@Body({ schema: unbanSchema }) body: z.output<typeof unbanSchema>): { unbanned: boolean } {
    return { unbanned: this.defense.unbanIp(body.ip) };
  }
}
