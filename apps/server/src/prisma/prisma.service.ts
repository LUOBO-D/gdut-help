import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { ENV, type Env } from '../config/env.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    // prisma dev（PGlite TCP 代理）要求尽快回收空闲连接；生产 PostgreSQL 使用常规连接池配置
    const isPrismaDev = env.DATABASE_URL.includes('localhost:51214') || env.DATABASE_URL.includes('127.0.0.1:51214');
    super({
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: isPrismaDev ? 100 : 30_000,
        connectionTimeoutMillis: isPrismaDev ? 0 : 10_000,
        allowExitOnIdle: true,
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
