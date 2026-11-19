# 开发指南

## 环境要求

- Node.js 24.15+（`.nvmrc` 写的是 24）
- pnpm 12（`corepack enable` 后会按 `package.json` 的 `packageManager` 自动使用）
- 数据库二选一：
  - **Docker**：用 `docker/docker-compose.yml` 起 PostgreSQL 16 和 Mailpit（开发用邮箱）
  - **不装 Docker**：用 Prisma 自带的 `prisma dev` 起本地 Postgres

## 第一次启动

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
```

编辑 `apps/server/.env`：

1. `JWT_SECRET`、`AUTH_CODE_SECRET` 各填一个随机串：`openssl rand -base64 48`
2. `ADMIN_EMAILS` 填你自己的邮箱，登录后自动成为管理员
3. 选择数据库：

   **用 Docker**

   ```bash
   pnpm db:up
   ```

   `DATABASE_URL` 保持示例值即可。

   **不用 Docker**

   ```bash
   cd apps/server
   pnpm exec prisma dev --name gduthelp --detach
   ```

   默认数据库端口为 51214，把 `.env` 中的地址改为：

   ```
   DATABASE_URL=postgres://postgres:postgres@localhost:51214/template1?sslmode=disable
   ```

   停止：`pnpm exec prisma dev stop gduthelp`。

4. 建表：

   ```bash
   pnpm db:migrate
   ```

5. 启动前后端：

   ```bash
   pnpm dev
   ```

   - 网页：<http://localhost:5173>（Vite 把 `/api` 代理到后端）
   - 接口：<http://127.0.0.1:3000/api/v1/health>

## S2 新增配置（`apps/server/.env`）

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | 用浏览器推送时 | `pnpm --filter @gduthelp/server exec web-push generate-vapid-keys` 生成一次，之后不要再换（换了所有订阅都会失效） |
| `VAPID_SUBJECT` | 否 | `mailto:你的邮箱`，推送服务出问题时用来联系你 |
| `QWEATHER_API_HOST` / `QWEATHER_API_KEY` | 否 | 和风天气控制台「设置」里的 API Host 和项目 API KEY。不填时用 Open-Meteo |
| `APP_URL` | 否 | 提醒邮件里的链接地址，用 Tailscale 时填 `https://<机器名>.<tailnet>.ts.net` |
| `REMINDER_POLL_SECONDS` | 否 | 提醒扫描间隔，默认 15 秒 |

第一次使用课表前，管理员要在「我的 → 学期设置」填写当前学期（第 1 周周一的日期和总周数）。

数据库结构有变化时运行 `pnpm db:migrate`。

## 登录验证码去哪看

| `MAIL_DRIVER` | 验证码在哪里 |
| --- | --- |
| `console`（默认） | 后端终端日志里，形如 `[开发] xxx@qq.com 的验证码：123456` |
| `smtp` + Mailpit | <http://localhost:8025>，`.env` 设 `SMTP_HOST=localhost SMTP_PORT=1025 SMTP_SECURE=false MAIL_FROM=dev@gduthelp.local` |
| `smtp` + QQ 邮箱 | 真实邮件。`SMTP_HOST=smtp.qq.com SMTP_PORT=465 SMTP_USER=你的QQ邮箱 SMTP_PASS=授权码 MAIL_FROM=你的QQ邮箱`，授权码在 QQ 邮箱「设置 → 账号 → POP3/SMTP 服务」生成 |

生产环境（`NODE_ENV=production`）强制要求 `smtp`，启动时会校验。

## 用手机访问（Tailscale）

PWA 安装和浏览器推送都要求 HTTPS。Tailscale 能给你的电脑签发有效证书，而且只有你自己的设备能访问。

1. 电脑和手机都安装 Tailscale 并登录同一账号。
2. 在 Tailscale 管理后台的 DNS 页面开启 **MagicDNS** 和 **HTTPS Certificates**。
3. 电脑上 `pnpm dev` 之后执行：

   ```bash
   tailscale serve --bg 5173
   ```

4. 手机打开 `https://<电脑机器名>.<tailnet 名>.ts.net`。

Vite 已允许 `.ts.net` 域名访问（`apps/web/vite.config.ts`）。关闭：`tailscale serve reset`。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 构建 shared 后并行启动 shared（监听）、server、web |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` | 全部包执行，CI 跑的也是这几步 |
| `pnpm db:migrate` | 根据 `apps/server/prisma/schema.prisma` 生成并执行迁移 |
| `pnpm --filter @gduthelp/web build && pnpm --filter @gduthelp/web preview` | 用生产构建预览（端口 4173），测试离线和 Service Worker 时用这个 |
| `pnpm --filter @gduthelp/server exec prisma studio` | 浏览数据库 |

## 目录速览

```
apps/server   NestJS 12 后端（ESM）
  prisma/           schema 与迁移
  src/config        环境变量校验（Zod）
  src/auth          邮箱验证码登录、JWT、刷新令牌轮换
  src/common        统一响应格式、异常过滤器
apps/web      React 19 + Vite 前端
  src/app           路由、页面框架、登录守卫
  src/components    玻璃卡片、标签栏、天空背景等
  src/lib           API 客户端（自动刷新令牌）、状态、主题场景
  src/motion        动效预设
  src/features      各功能页面
packages/shared   前后端共用的 Zod schema 与类型
```

## 接口约定

- 前缀 `/api/v1`，返回 `{ code, data, message }`，成功时 `code` 为 `0`，失败时为 `ErrorCode` 字符串（见 `packages/shared/src/api.ts`）。
- 除标记了 `@Public()` 的接口，都需要 `Authorization: Bearer <accessToken>`。
- 请求体用 `@Body({ schema })` 绑定 shared 里的 Zod schema 校验。
