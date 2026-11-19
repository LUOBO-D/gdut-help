import { Logger, StandardSchemaValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { ResponseInterceptor } from './common/response.interceptor.js';
import { ENV, type Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const env = app.get<Env>(ENV);

  // 只信任本机反向代理（Vite 开发代理、Nginx、tailscale serve）提供的 X-Forwarded-For
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter(app.get(HttpAdapterHost)));
  app.enableShutdownHooks();

  await app.listen(env.PORT, env.HOST);
  Logger.log(`API 已启动：http://${env.HOST}:${env.PORT}/api/v1`, 'Bootstrap');
}
await bootstrap();
