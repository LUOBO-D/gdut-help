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
3. 电脑上 `pnpm dev` 之后执行（`/api` 直接转给后端，安卓 App 不依赖 Vite 也能用）：
   ```bash
   tailscale serve --bg --set-path=/api http://127.0.0.1:3000/api
   tailscale serve --bg http://127.0.0.1:5173
   ```

4. 手机打开 `https://<电脑机器名>.<tailnet 名>.ts.net`。

Vite 已允许 `.ts.net` 域名访问（`apps/web/vite.config.ts`）。查看：`tailscale serve status`；关闭：`tailscale serve reset`。

## 安卓 App（自用）

安卓浏览器的推送要经过谷歌 FCM，国内收不到。App 用 Capacitor 打包同一份前端，提醒改成**手机本地通知**：
打开 App 时把未来 7 天的待办提醒写进系统，到点由系统弹出，电脑关机、手机断网也照常提醒。

### 和网页版的区别

- 页面文件打包在安装包里，从 `https://localhost` 加载；API 通过 Tailscale 访问电脑上的服务端。
- 登录状态：页面和 API 不同源，用不了 Cookie。请求头带 `X-Client: native` 时，服务端在响应体里返回 refresh token，App 存进安卓应用私有存储（`@capacitor/preferences`）。
- 服务端要允许 App 跨域：`apps/server/.env` 里设 `CORS_ORIGINS=https://localhost`。
- 不注册 Service Worker，不用浏览器推送。「我的 → 提醒设置」改为检查通知权限、写入了几条提醒、发测试通知。
- 准点提醒用 `USE_EXACT_ALARM`（安卓 13 起安装即授予）。以后要上架 Google Play 需按商店政策重新评估。

### 环境

- JDK 21（`JAVA_HOME`）和 Android SDK（`ANDROID_HOME`，需要 `platforms;android-36`、`build-tools;36.0.0`、`platform-tools`）。不需要装 Android Studio。
- Gradle 不读终端里的 `http_proxy`。需要代理时写进 `~/.gradle/gradle.properties`（`systemProp.https.proxyHost` 等）。
- 复制 `apps/web/.env.android.example` 为 `apps/web/.env.android.local`，填 `tailscale serve status` 里的地址。

### 从教务系统读取课表

课表 → 导入 → 「从教务系统读取课表」（只在 App 里有）：

1. 用应用内浏览器（`@capacitor/inappbrowser`，`isIsolated: false`）打开学校统一认证页，用户自己登录。只允许打开 `gdut.edu.cn` 和 QQ / 微信登录的页面。
2. 登录后用 `CapacitorHttp` 在手机上请求 `jxfw.gdut.edu.cn`（共用 WebView 的 Cookie，没有跨域限制）：
   - `xsgrkbcx!getXsgrbkList.action`：学期下拉框，取默认选中的学期代码（如 `202601` = 2026 秋季）
   - `xsgrkbcx!getKbRq.action?xnxqdm=<学期代码>`：整学期课表，`[每周一条的记录, []]`
   - 同一接口加 `&zc=1`：第二个数组是第 1 周每天的日期，用来核对开学日期
3. 在手机上解析（`packages/shared/src/timetable-import.ts`），预览差异，确认后提交 `POST /timetable/import`。服务端只收到整理好的课程。

App 每次启动会清掉会话 Cookie，教务系统的登录状态随之失效；失效时接口返回登录页，代码会重新弹出登录页。代码在 `apps/web/src/lib/jw.ts`。

### 打包和安装

手机开启 USB 调试并连上电脑（`adb devices` 显示 `device`）：

```bash
cd apps/web
pnpm build:android                      # 构建前端（android 模式）并同步到 android/
cd android && ./gradlew assembleDebug   # 生成 app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

改了前端代码要重新执行这三步。调试：电脑 Chrome 打开 `chrome://inspect` 可以看到 App 里的页面。

`adb devices` 显示 `unauthorized` 时，在手机上点「允许 USB 调试」；ColorOS 过一段时间会撤销授权，可以在开发者选项里关闭「撤销 USB 调试授权」的自动超时。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 构建 shared 后并行启动 shared（监听）、server、web |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` | 全部包执行，CI 跑的也是这几步 |
| `pnpm db:migrate` | 根据 `apps/server/prisma/schema.prisma` 生成并执行迁移 |
| `pnpm --filter @gduthelp/web build && pnpm --filter @gduthelp/web preview` | 用生产构建预览（端口 4173），测试离线和 Service Worker 时用这个 |
| `pnpm --filter @gduthelp/server exec prisma studio` | 浏览数据库 |
| `pnpm --filter @gduthelp/web build:android` | 构建安卓 App 的前端并同步到 `apps/web/android`（见上一节） |

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
  android/          Capacitor 生成的安卓工程（图标、权限在这里改）
packages/shared   前后端共用的 Zod schema 与类型
```

## 接口约定

- 前缀 `/api/v1`，返回 `{ code, data, message }`，成功时 `code` 为 `0`，失败时为 `ErrorCode` 字符串（见 `packages/shared/src/api.ts`）。
- 除标记了 `@Public()` 的接口，都需要 `Authorization: Bearer <accessToken>`。
- 请求体用 `@Body({ schema })` 绑定 shared 里的 Zod schema 校验。
