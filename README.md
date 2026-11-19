# GDUT Help · 校园生活小助手

> 个人开源项目，**不是**广东工业大学官方产品，与学校无隶属关系。

面向广东工业大学学生的生活助手，手机优先，电脑端通过 Web 使用，后续发布 Android / iOS App。

## 核心功能

1. **今日天气**：定位获取实时天气、逐小时预报、预警，首页 3D 天气场景展示。
2. **课表接入**：手动录入、文件导入、教务系统导入（可选），今日课程时间线。
3. **吃什么推荐**：综合天气、课表空档、今日心情、历史偏好和评分，推荐午餐和晚餐。
4. **待办与提醒**：待办管理，按截止时间、优先级和课表自动计算提醒时间并推送。
5. **评分榜单**：商家由用户提交、多人确认上架，所有用户可打分、评论，生成公共榜单。

## 快速开始

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # 填好两个密钥和数据库地址
pnpm db:up          # 或者不用 Docker：见 docs/DEVELOPMENT.md
pnpm db:migrate
pnpm dev            # http://localhost:5173
```

完整步骤（不装 Docker 的方案、验证码在哪看、手机通过 Tailscale 访问）见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

当前进度：S0–S2 已完成（基础搭建、3D 天空、天气 / 课表 / 待办提醒），见 [开发路线](docs/05-roadmap.md)。

## 文档目录

| 文档 | 内容 |
| --- | --- |
| [01-overview.md](docs/01-overview.md) | 产品定位、用户场景、功能清单、非功能需求 |
| [02-architecture.md](docs/02-architecture.md) | 总体架构、技术选型、目录结构、部署 |
| [03-backend.md](docs/03-backend.md) | 后端模块设计、数据模型、API、各功能实现方案 |
| [04-frontend.md](docs/04-frontend.md) | 前端工程方案、UI 视觉与动效设计、性能分级 |
| [05-roadmap.md](docs/05-roadmap.md) | 开发阶段、风险与合规、待确认问题 |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | 本地开发环境、常用命令、接口约定 |

## 数据与第三方服务

- 天气数据：未配置和风天气时使用 [Open-Meteo](https://open-meteo.com/)（CC BY 4.0），界面上会显示署名。
- GPU 跑分数据来自 [detect-gpu](https://github.com/pmndrs/detect-gpu)（MIT），随应用打包。
- 课表节次时间目前是通用模板，未与学校官方作息核对，见 `packages/shared/src/gdut.ts`。

## 许可证

[MIT](LICENSE)
