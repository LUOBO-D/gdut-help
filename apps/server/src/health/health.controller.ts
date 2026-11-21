import { Controller, Get, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ErrorCode } from '@gduthelp/shared';
import { Public } from '../auth/auth.decorators.js';
import { AppException } from '../common/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('db ping timeout')), 3000)),
      ]);
    } catch {
      throw new AppException(ErrorCode.INTERNAL_ERROR, '数据库连接异常', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return {
      status: 'ok',
      db: 'ok',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }
}
