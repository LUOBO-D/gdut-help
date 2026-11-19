import { Body, Controller, Cookies, Headers, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Throttle } from '@nestjs/throttler';
import {
  emailCodeRequestSchema,
  loginRequestSchema,
  type AuthSession,
  type EmailCodeRequest,
  type EmailCodeSent,
  type LoginRequest,
} from '@gduthelp/shared';
import type { Request } from 'express';
import { clientIp } from '../common/client-ip.js';
import { ENV, type Env } from '../config/env.js';
import { Public } from './auth.decorators.js';
import { AuthService, RefreshRaceException, type IssuedSession } from './auth.service.js';

export const REFRESH_COOKIE = 'gdut_rt';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly adapterHost: HttpAdapterHost,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('email-code')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  sendEmailCode(@Body({ schema: emailCodeRequestSchema }) body: EmailCodeRequest, @Req() req: Request): Promise<EmailCodeSent> {
    return this.auth.sendEmailCode(body.email, clientIp(req));
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body({ schema: loginRequestSchema }) body: LoginRequest,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<AuthSession> {
    return this.withCookie(res, await this.auth.loginWithEmailCode(body.email, body.code, userAgent));
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(
    @Cookies(REFRESH_COOKIE) token: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<AuthSession> {
    try {
      return this.withCookie(res, await this.auth.refresh(token, userAgent));
    } catch (err) {
      if (!(err instanceof RefreshRaceException)) {
        this.adapterHost.httpAdapter.clearCookie(res, REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
      }
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Cookies(REFRESH_COOKIE) token: string | undefined, @Res({ passthrough: true }) res: unknown): Promise<null> {
    await this.auth.logout(token);
    this.adapterHost.httpAdapter.clearCookie(res, REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return null;
  }

  private withCookie(res: unknown, issued: IssuedSession): AuthSession {
    this.adapterHost.httpAdapter.setCookie(res, REFRESH_COOKIE, issued.refreshToken, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      expires: issued.refreshExpiresAt,
    });
    return issued.session;
  }
}
