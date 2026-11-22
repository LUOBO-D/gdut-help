import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { UserGuardCacheService } from '../src/auth/user-guard-cache.service.js';
import { ENV, type Env } from '../src/config/env.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const EMAIL_A = `e2e-a-${RUN_ID}@gduthelp.test`;
const EMAIL_B = `e2e-b-${RUN_ID}@gduthelp.test`;
const EMAIL_BAN = `e2e-ban-${RUN_ID}@gduthelp.test`;

describe('GDUT Help Real-DB HTTP E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let guardCache: UserGuardCacheService;
  const capturedCodes = new Map<string, string>();
  let createdTempSemesterId: string | null = null;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({
        sendLoginCode: async (email: string, code: string) => {
          capturedCodes.set(email.toLowerCase(), code);
        },
        sendReminder: async () => true,
      })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    const env = app.get<Env>(ENV);
    configureApp(app, env);
    await app.init();

    prisma = app.get(PrismaService);
    guardCache = app.get(UserGuardCacheService);

    // 若数据库里尚无当前学期，仅在 E2E 期间创建临时学期，结束后清理
    const existingSemester = await prisma.semester.findFirst({ where: { isCurrent: true } });
    if (!existingSemester) {
      const sem = await prisma.semester.create({
        data: {
          name: `E2E临时学期-${RUN_ID}`,
          startDate: new Date('2026-09-07T00:00:00Z'),
          totalWeeks: 18,
          isCurrent: true,
        },
      });
      createdTempSemesterId = sem.id;
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B, EMAIL_BAN] } } });
      await prisma.emailCode.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B, EMAIL_BAN] } } });
      if (createdTempSemesterId) {
        await prisma.semester.delete({ where: { id: createdTempSemesterId } }).catch(() => {});
      }
    }
    if (app) await app.close();
  });

  async function loginNative(email: string): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
    const codeRes = await request(app.getHttpServer())
      .post('/api/v1/auth/email-code')
      .send({ email })
      .expect(200);
    expect(codeRes.body.code).toBe(0);

    const code = capturedCodes.get(email.toLowerCase());
    expect(code).toMatch(/^\d{6}$/);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Client', 'native')
      .send({ email, code })
      .expect(200);

    expect(loginRes.body.code).toBe(0);
    return {
      accessToken: loginRes.body.data.accessToken as string,
      refreshToken: loginRes.body.data.refreshToken as string,
      userId: loginRes.body.data.user.id as string,
    };
  }

  it('健康检查正常且响应携带安全头与 X-Request-Id', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.db).toBe('ok');
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('完整闭环：登录轮换 → 课表分享码 → 重复待办滚动 → 商家评价重算榜 → 导出与注销', async () => {
    // 1. 学生 A 登录并轮换 refresh token
    const sessionA = await loginNative(EMAIL_A);
    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('X-Client', 'native')
      .send({ refreshToken: sessionA.refreshToken })
      .expect(200);
    const tokenA = refreshRes.body.data.accessToken as string;
    const rotatedRt = refreshRes.body.data.refreshToken as string;
    expect(rotatedRt).not.toBe(sessionA.refreshToken);

    // 2. 设置课前提醒并验证 /me 持久化
    const profileRes = await request(app.getHttpServer())
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ campusId: 'hemc', classRemindMinutes: 15 })
      .expect(200);
    expect(profileRes.body.data.classRemindMinutes).toBe(15);

    // 3. 添加课程并生成 6 位分享码，学生 B 读取并一键导入
    await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: `软件工程-${RUN_ID.slice(0, 4)}`,
        teacher: '陈老师',
        location: '教3-305',
        color: '#64b5f6',
        slots: [{ weekday: 2, periodStart: 1, periodEnd: 2, weeks: [1, 2, 3] }],
      })
      .expect(201);

    const shareRes = await request(app.getHttpServer())
      .post('/api/v1/timetable/share')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    const shareCode = shareRes.body.data.code as string;
    expect(shareCode).toMatch(/^[A-Z2-9]{6}$/);

    const sessionB = await loginNative(EMAIL_B);
    const fetchedShare = await request(app.getHttpServer())
      .get(`/api/v1/timetable/share/${shareCode}`)
      .set('Authorization', `Bearer ${sessionB.accessToken}`)
      .expect(200);
    expect(fetchedShare.body.data.courses).toHaveLength(1);

    const importRes = await request(app.getHttpServer())
      .post('/api/v1/timetable/import')
      .set('Authorization', `Bearer ${sessionB.accessToken}`)
      .send({ courses: fetchedShare.body.data.courses, removeMissing: true })
      .expect(200);
    expect(importRes.body.data.added).toBe(1);

    // 4. 创建每周重复待办，完成后自动在数据库生成下周实例
    const futureDue = new Date(Date.now() + 2 * 24 * 3600_000).toISOString();
    const todoRes = await request(app.getHttpServer())
      .post('/api/v1/todos')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        title: '提交每周实验报告',
        dueAt: futureDue,
        priority: 2,
        repeat: 'weekly',
        reminders: [{ offsetMinutes: 60 }],
      })
      .expect(201);
    const todoId = todoRes.body.data.id as string;

    const completeRes = await request(app.getHttpServer())
      .post(`/api/v1/todos/${todoId}/complete`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(completeRes.body.data.completedAt).toBeTruthy();
    expect(completeRes.body.data.nextTodo).toBeTruthy();
    expect(completeRes.body.data.nextTodo.repeat).toBe('weekly');

    // 5. 商家提交 + 实时查重 + 提交 4 维评价触发贝叶斯分与榜单重算
    const merchantRes = await request(app.getHttpServer())
      .post('/api/v1/merchants')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: `E2E测试煲仔饭-${RUN_ID.slice(0, 5)}`,
        category: 'canteen',
        campusId: 'hemc',
        locationText: '二饭一楼',
        walkMinutes: 4,
        priceAvg: 16,
        tags: ['饭', '热食', '快手'],
      })
      .expect(201);
    const merchantId = merchantRes.body.data.id as string;

    const simRes = await request(app.getHttpServer())
      .get(`/api/v1/merchants/similar?campusId=hemc&name=${encodeURIComponent(`E2E测试煲仔饭-${RUN_ID.slice(0, 5)}`)}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(simRes.body.data.some((m: { id: string }) => m.id === merchantId)).toBe(true);

    const reviewRes = await request(app.getHttpServer())
      .put(`/api/v1/merchants/${merchantId}/review`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        scoreTaste: 5,
        scoreValue: 5,
        scoreEnv: 4,
        scoreSpeed: 5,
        scoreOverall: 5,
        content: '锅巴很香，出餐飞快',
      })
      .expect(200);
    expect(reviewRes.body.data.scoreOverall).toBe(5);

    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/merchants/${merchantId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(detailRes.body.data.ratingCount).toBe(1);
    expect(detailRes.body.data.bayesScore).toBeGreaterThan(0);

    const rankRes = await request(app.getHttpServer())
      .get('/api/v1/rankings?type=weekly&campusId=hemc')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(rankRes.body.data.items.some((i: { merchant: { id: string } }) => i.merchant.id === merchantId)).toBe(true);

    // 6. 个人数据 JSON 导出
    const exportRes = await request(app.getHttpServer())
      .get('/api/v1/me/export')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(exportRes.body.data.profile.email).toBe(EMAIL_A);
    expect(exportRes.body.data.courses.length).toBeGreaterThanOrEqual(1);
    expect(exportRes.body.data.todos.length).toBeGreaterThanOrEqual(2);
    expect(exportRes.body.data.reviews.length).toBeGreaterThanOrEqual(1);

    // 7. 退出全部设备立即使旧 access token 失效
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(401);

    // 8. 学生 B 用错误确认邮箱注销被拒，用正确邮箱永久注销并使令牌立刻失效
    await request(app.getHttpServer())
      .delete('/api/v1/me')
      .set('Authorization', `Bearer ${sessionB.accessToken}`)
      .send({ confirmEmail: 'wrong@gduthelp.test' })
      .expect(400);

    await request(app.getHttpServer())
      .delete('/api/v1/me')
      .set('Authorization', `Bearer ${sessionB.accessToken}`)
      .send({ confirmEmail: EMAIL_B })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${sessionB.accessToken}`)
      .expect(401);
  });

  it('封禁用户在缓存失效后立即被 AuthGuard 拦截（无需等 15 分钟 JWT 过期）', async () => {
    const sessionBan = await loginNative(EMAIL_BAN);

    // 正常时允许访问
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${sessionBan.accessToken}`)
      .expect(200);

    // 封禁账号并主动清缓存 → 立刻返回 403
    await prisma.user.update({ where: { id: sessionBan.userId }, data: { status: 'banned' } });
    guardCache.invalidateStatus(sessionBan.userId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${sessionBan.accessToken}`)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('多用户邮箱密码闭环：注册设密 → 密码登录 → 修改密码 → 验证码重置密码并吊销旧令牌', async () => {
    const emailPwd = `e2e-pwd-${RUN_ID}@gduthelp.test`;
    try {
      const cfg = await request(app.getHttpServer()).get('/api/v1/auth/config').expect(200);
      expect(cfg.body.code).toBe(0);

      // 1. 发送验证码并注册设密码
      await request(app.getHttpServer())
        .post('/api/v1/auth/email-code')
        .send({ email: emailPwd })
        .expect(200);
      const regCode = capturedCodes.get(emailPwd)!;

      const regRes = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('X-Client', 'native')
        .send({ email: emailPwd, code: regCode, password: 'gdut-init-password', nickname: '密码测试同学' })
        .expect(200);
      expect(regRes.body.data.user.hasPassword).toBe(true);
      expect(regRes.body.data.user.nickname).toBe('密码测试同学');

      // 2. 用邮箱+密码直接登录（无需再收验证码）
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login/password')
        .set('X-Client', 'native')
        .send({ email: emailPwd, password: 'gdut-init-password' })
        .expect(200);
      const oldToken = loginRes.body.data.accessToken as string;

      // 3. 登录态修改密码
      await request(app.getHttpServer())
        .post('/api/v1/auth/password/change')
        .set('Authorization', `Bearer ${oldToken}`)
        .send({ currentPassword: 'gdut-init-password', newPassword: 'gdut-second-password' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login/password')
        .set('X-Client', 'native')
        .send({ email: emailPwd, password: 'gdut-second-password' })
        .expect(200);

      // 4. 清理冷却时间后发重置码，重置密码并验证旧 accessToken 立刻失效
      await prisma.emailCode.deleteMany({ where: { email: emailPwd } });
      await request(app.getHttpServer())
        .post('/api/v1/auth/email-code')
        .send({ email: emailPwd })
        .expect(200);
      const resetCode = capturedCodes.get(emailPwd)!;

      await request(app.getHttpServer())
        .post('/api/v1/auth/password/reset')
        .send({ email: emailPwd, code: resetCode, newPassword: 'gdut-reset-password' })
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${oldToken}`)
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login/password')
        .set('X-Client', 'native')
        .send({ email: emailPwd, password: 'gdut-reset-password' })
        .expect(200);
    } finally {
      await prisma.user.deleteMany({ where: { email: emailPwd } });
      await prisma.emailCode.deleteMany({ where: { email: emailPwd } });
    }
  });
});
