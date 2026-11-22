import { Body, Controller, Cookies, Get, Headers, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Throttle } from '@nestjs/throttler';
import {
  changePasswordSchema,
  emailCodeRequestSchema,
  loginRequestSchema,
  NATIVE_CLIENT_HEADER,
  NATIVE_CLIENT_VALUE,
  nativeRefreshSchema,
  passwordLoginRequestSchema,
  registerWithPasswordSchema,
  resetPasswordSchema,
  type AuthConfig,
  type AuthSession,
  type ChangePasswordRequest,
  type EmailCodeRequest,
  type EmailCodeSent,
  type LoginRequest,
  type LogoutAllResult,
  type NativeRefreshRequest,
  type PasswordLoginRequest,
  type RegisterWithPasswordRequest,
  type ResetPasswordRequest,
  type UserProfile,
} from '@gduthelp/shared';
import type { Request } from 'express';
import { clientIp } from '../common/client-ip.js';
import { ENV, type Env } from '../config/env.js';
import { CurrentUser, Protected, Public, type AuthUser } from './auth.decorators.js';
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

  /** 返回前端登录页需要的公开策略（是否限制校园邮箱域名、是否需要邀请码） */
  @Get('config')
  config(): AuthConfig {
    return this.auth.getAuthConfig();
  }

  @Post('email-code')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  sendEmailCode(@Body({ schema: emailCodeRequestSchema }) body: EmailCodeRequest, @Req() req: Request): Promise<EmailCodeSent> {
    return this.auth.sendEmailCode(body.email, clientIp(req), body.inviteCode);
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
    return this.respond(
      res,
      client,
      await this.auth.loginWithEmailCode(body.email, body.code, userAgent, body.inviteCode),
    );
  }

  /** 邮箱 + 密码登录 */
  @Post('login/password')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async loginWithPassword(
    @Body({ schema: passwordLoginRequestSchema }) body: PasswordLoginRequest,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers(NATIVE_CLIENT_HEADER) client: string | undefined,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<AuthSession> {
    return this.respond(res, client, await this.auth.loginWithPassword(body.email, body.password, userAgent));
  }

  /** 邮箱验证码注册并设置密码（已用验证码登过的老账号也可借此设置密码） */
  @Post('register')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async register(
    @Body({ schema: registerWithPasswordSchema }) body: RegisterWithPasswordRequest,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers(NATIVE_CLIENT_HEADER) client: string | undefined,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<AuthSession> {
    return this.respond(res, client, await this.auth.registerWithPassword(body, userAgent));
  }

  /** 忘记密码：通过邮箱验证码重置密码并吊销所有旧会话 */
  @Post('password/reset')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body({ schema: resetPasswordSchema }) body: ResetPasswordRequest): Promise<null> {
    await this.auth.resetPassword(body);
    return null;
  }

  /** 登录状态下设置或修改登录密码 */
  @Protected()
  @Post('password/change')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body({ schema: changePasswordSchema }) body: ChangePasswordRequest,
  ): Promise<UserProfile> {
    return this.auth.changePassword(user.id, body);
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

  /** 退出当前账号下全部设备：吊销全部刷新令牌并即时令已有 access token 失效 */
  @Protected()
  @Post('logout-all')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Headers(NATIVE_CLIENT_HEADER) client: string | undefined,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<LogoutAllResult> {
    const result = await this.auth.logoutAll(user.id);
    if (!isNative(client)) {
      this.adapterHost.httpAdapter.clearCookie(res, REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    }
    return result;
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
