import { existsSync } from 'node:fs';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', ''])
  .optional()
  .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    /** 监听地址。本机开发保持 127.0.0.1，只经由 Vite 代理或 Tailscale 访问；容器里设为 0.0.0.0 */
    HOST: z.string().default('127.0.0.1'),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET 至少 32 个字符'),
    AUTH_CODE_SECRET: z.string().min(32, 'AUTH_CODE_SECRET 至少 32 个字符'),
    ADMIN_EMAILS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ),
    /** 可选：允许注册/登录的邮箱域名白名单，逗号分隔（如 mail2.gdut.edu.cn,gdut.edu.cn）；留空表示不限制 */
    ALLOWED_EMAIL_DOMAINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
          .filter(Boolean),
      ),
    /** 可选：新同学注册邀请码；留空表示自由注册 */
    INVITE_CODE: z.string().trim().default(''),
    MAIL_DRIVER: z.enum(['console', 'smtp']).default('console'),
    SMTP_HOST: z.string().default(''),
    SMTP_PORT: z.coerce.number().int().positive().default(465),
    SMTP_SECURE: bool,
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),
    MAIL_FROM: z.string().default(''),
    COOKIE_SECURE: bool,
    /** 应用的访问地址，用于邮件里的链接，例如 https://pc.tailnet.ts.net */
    APP_URL: z.string().default('http://localhost:5173'),
    /** 和风天气：控制台「设置」里的 API Host 和项目的 API KEY。不填时使用 Open-Meteo（无需注册） */
    QWEATHER_API_HOST: z.string().default(''),
    QWEATHER_API_KEY: z.string().default(''),
    /** Web Push 密钥，用 `pnpm --filter @gduthelp/server exec web-push generate-vapid-keys` 生成。不填时浏览器推送不可用 */
    VAPID_PUBLIC_KEY: z.string().default(''),
    VAPID_PRIVATE_KEY: z.string().default(''),
    VAPID_SUBJECT: z.string().default('mailto:admin@gduthelp.local'),
    /** 允许跨域访问 API 的来源，逗号分隔。安卓 App 的页面来源是 https://localhost */
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    /** 提醒扫描间隔（秒） */
    REMINDER_POLL_SECONDS: z.coerce.number().int().min(5).max(120).default(15),
    /** 自用阶段提交商家直接上架；公开发布时设为 false，进入待审核/待确认队列 */
    MERCHANT_AUTO_APPROVE: bool,
    /** 可选大模型（DeepSeek 等 OpenAI 兼容接口）用于润色餐食推荐理由，留空时纯规则生成 */
    LLM_API_BASE: z.string().default('https://api.deepseek.com/v1'),
    LLM_API_KEY: z.string().default(''),
    LLM_MODEL: z.string().default('deepseek-chat'),
    /** 可选：单容器部署时由后端托管前端构建产物（apps/web/dist）的目录路径 */
    STATIC_DIR: z.string().default(''),
    /** 可选：自托管安卓 App OTA 热更新包目录（包含 manifest.json 与 bundle-*.zip），默认 apps/server/ota-bundles */
    OTA_DIR: z.string().default(''),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.MAIL_DRIVER === 'console') {
      ctx.addIssue({ code: 'custom', path: ['MAIL_DRIVER'], message: '生产环境必须使用 smtp' });
    }
    if (env.MAIL_DRIVER === 'smtp') {
      for (const key of ['SMTP_HOST', 'MAIL_FROM'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `MAIL_DRIVER=smtp 时必须设置 ${key}` });
      }
    }
  })
  .transform((env) => ({
    ...env,
    SMTP_SECURE: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    MERCHANT_AUTO_APPROVE: env.MERCHANT_AUTO_APPROVE ?? true,
  }));

export type Env = z.infer<typeof envSchema>;

/** 读取并校验环境变量。存在 .env 文件时先加载它（不覆盖已存在的变量）。 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (source === process.env && existsSync('.env')) process.loadEnvFile('.env');
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`环境变量配置有误：\n${details}`);
  }
  return result.data;
}

/** 注入令牌：在构造函数里写 `@Inject(ENV) private readonly env: Env` */
export const ENV = Symbol('ENV');
