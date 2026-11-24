import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { ENV, type Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const env = app.get<Env>(ENV);
  configureApp(app, env);

  // 防御慢连接 / Slowloris 耗尽连接池攻击
  const httpServer = app.getHttpServer() as Server;
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 15_000;
  httpServer.requestTimeout = 30_000;
  httpServer.maxHeadersCount = 64;

  await app.listen(env.PORT, env.HOST);
  Logger.log(`API 已启动：http://${env.HOST}:${env.PORT}/api/v1`, 'Bootstrap');
}
await bootstrap();
