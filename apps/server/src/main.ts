import { Logger, StandardSchemaValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor.js';
import { ResponseInterceptor } from './common/response.interceptor.js';
import { createSecurityMiddleware } from './common/security.middleware.js';
import { ENV, type Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const env = app.get<Env>(ENV);

  // 限制 JSON 请求体上限（256KB 足以覆盖整学期教务课表 JSON 导入，同时防止大包内存攻击）
  app.useBodyParser('json', { limit: '256kb' });
  app.useBodyParser('urlencoded', { limit: '64kb', extended: false });

  // 只信任本机反向代理（Vite 开发代理、Nginx、tailscale serve）提供的 X-Forwarded-For
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.use(createSecurityMiddleware(env.NODE_ENV === 'production'));
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

  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalInterceptors(new RequestLoggingInterceptor(), new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter(app.get(HttpAdapterHost)));
  app.enableShutdownHooks();

  await app.listen(env.PORT, env.HOST);
  Logger.log(`API 已启动：http://${env.HOST}:${env.PORT}/api/v1`, 'Bootstrap');
}
await bootstrap();
