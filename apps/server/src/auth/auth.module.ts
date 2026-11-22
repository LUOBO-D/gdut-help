import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ENV, type Env } from '../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { UserGuardCacheService } from './user-guard-cache.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_SECRET,
        signOptions: { algorithm: 'HS256', issuer: 'gduthelp' },
        verifyOptions: { algorithms: ['HS256'], issuer: 'gduthelp' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, UserGuardCacheService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [UserGuardCacheService],
})
export class AuthModule {}
