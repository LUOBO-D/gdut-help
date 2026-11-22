import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor.js';
import { ResponseInterceptor } from './common/response.interceptor.js';
import { createSecurityMiddleware } from './common/security.middleware.js';
import type { Env } from './config/env.js';

/** 统一装配 Express 安全中间件、全局管道、响应包装器与异常过滤器，供生产入口与 E2E 测试共用 */
export function configureApp(app: NestExpressApplication, env: Env) {
  // 限制 JSON 请求体上限（256KB 足以覆盖整学期教务课表 JSON 导入，同时防止大包内存攻击）
  app.useBodyParser('json', { limit: '256kb' });
  app.useBodyParser('urlencoded', { limit: '64kb', extended: false });

  // 只信任本机反向代理（Vite 开发代理、Nginx、tailscale serve）提供的 X-Forwarded-For
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.use(createSecurityMiddleware(env.NODE_ENV === 'production', env.CORS_ORIGINS.length > 0));
  app.setGlobalPrefix('api/v1');

  // 网页和 API 同源，不需要跨域。只有安卓 App（页面来自 https://localhost）需要。
  // App 用 Authorization 头和请求体里的 refresh token，不用 Cookie，所以不开 credentials
  if (env.CORS_ORIGINS.length) {
    app.enableCors({
      origin: env.CORS_ORIGINS,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'X-Client', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    });
  }

  // 单容器生产部署：若配置了 STATIC_DIR 且存在 index.html，则直接托管前端静态资源与 SPA 回退
  if (env.STATIC_DIR) {
    const staticRoot = resolve(env.STATIC_DIR);
    const indexHtml = join(staticRoot, 'index.html');
    if (existsSync(indexHtml)) {
      app.useStaticAssets(staticRoot, {
        index: false,
        maxAge: '7d',
        setHeaders(res: Response, filePath: string) {
          if (filePath.endsWith('sw.js') || filePath.endsWith('index.html') || filePath.endsWith('manifest.webmanifest')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      });
      app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(indexHtml);
      });
    }
  }

  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalInterceptors(new RequestLoggingInterceptor(), new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter(app.get(HttpAdapterHost)));
  app.enableShutdownHooks();
}
