import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { ENV, type Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const env = app.get<Env>(ENV);
  configureApp(app, env);

  await app.listen(env.PORT, env.HOST);
  Logger.log(`API 已启动：http://${env.HOST}:${env.PORT}/api/v1`, 'Bootstrap');
}
await bootstrap();
