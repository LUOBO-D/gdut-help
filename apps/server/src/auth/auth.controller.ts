import { Body, Controller, Cookies, Headers, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Throttle } from '@nestjs/throttler';
import {
  emailCodeRequestSchema,
  loginRequestSchema,
  NATIVE_CLIENT_HEADER,
  NATIVE_CLIENT_VALUE,
  nativeRefreshSchema,
  type AuthSession,
  type EmailCodeRequest,
  type EmailCodeSent,
  type LoginRequest,
  type NativeRefreshRequest,
} from '@gduthelp/shared';
import type { Request } from 'express';
import { clientIp } from '../common/client-ip.js';
import { ENV, type Env } from '../config/env.js';
import { Public } from './auth.decorators.js';
import { AuthService, RefreshRaceException, type IssuedSession } from './auth.service.js';
export const REFRESH_COOKIE = 'gdut_rt';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const isNative = (header: string | undefined) => header === NATIVE_CLIENT_VALUE;
/**
 * 网页端：refresh token 放在 HttpOnly Cookie 里，JS 读不到。
 * App 端（请求头 X-Client: native）：页面来自 https://localhost，和 API 不同源，Cookie 带不过去，
 * 所以 refresh token 放在响应体里返回，App 存进系统的应用私有存储，刷新和退出时放在请求体里传回来。
 */
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
    @Headers(NATIVE_CLIENT_HEADER) client: string | undefined,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<AuthSession> {
    return this.respond(res, client, await this.auth.loginWithEmailCode(body.email, body.code, userAgent));
  }
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(
    @Cookies(REFRESH_COOKIE) cookie: string | undefined,
    @Body({ schema: nativeRefreshSchema }) body: NativeRefreshRequest,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers(NATIVE_CLIENT_HEADER) client: string | undefined,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<AuthSession> {
    const token = isNative(client) ? body?.refreshToken : cookie;
    try {
      return this.respond(res, client, await this.auth.refresh(token, userAgent));
    } catch (err) {
      if (!isNative(client) && !(err instanceof RefreshRaceException)) {
        this.adapterHost.httpAdapter.clearCookie(res, REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
      }
      throw err;
    }
  }
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Cookies(REFRESH_COOKIE) cookie: string | undefined,
    @Body({ schema: nativeRefreshSchema }) body: NativeRefreshRequest,
    @Headers(NATIVE_CLIENT_HEADER) client: string | undefined,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<null> {
    if (isNative(client)) {
      await this.auth.logout(body?.refreshToken);
      return null;
    }
    await this.auth.logout(cookie);
    this.adapterHost.httpAdapter.clearCookie(res, REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return null;
  }
  private respond(res: unknown, client: string | undefined, issued: IssuedSession): AuthSession {
    if (isNative(client)) return { ...issued.session, refreshToken: issued.refreshToken };
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
