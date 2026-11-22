# GDUT Help 7×24 云端自用部署指南

本指南面向低配学生云服务器（如 1 核 2G / 2 核 2G Linux VPS）或家用小主机，采用 **PostgreSQL 16 + 单容器前后端一体** 方案，并通过 **Tailscale Serve** 提供 HTTPS 访问（无需开放公网端口、无需域名与备案）。

---

## 1. 准备服务器

需要安装：
- Docker & Docker Compose v2（`docker compose version`）
- Tailscale（用于个人私网 HTTPS 访问，[tailscale.com](https://tailscale.com)）

拉取代码：

```bash
git clone https://github.com/LUOBO-D/gdut-help.git /srv/gdut_help
cd /srv/gdut_help
```

---

## 2. 填写生产配置

```bash
cp docker/.env.prod.example docker/.env.prod
chmod 600 docker/.env.prod
```

生成强随机密钥并填入 `docker/.env.prod`：

```bash
openssl rand -base64 36   # POSTGRES_PASSWORD
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 48   # AUTH_CODE_SECRET
```

必须填写的字段：
- `POSTGRES_PASSWORD`、`JWT_SECRET`、`AUTH_CODE_SECRET`
- `ADMIN_EMAILS`（管理员邮箱，首次登录自动成为管理员）
- `MAIL_DRIVER=smtp` 与 `SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_FROM`（QQ 邮箱可在设置 → POP3/SMTP 开启后获取授权码）
- `APP_URL`（填 Tailscale 域名，如 `https://gdut-vps.your-tailnet.ts.net`）

---

## 3. 一键构建并启动

```bash
docker compose --env-file docker/.env.prod -f docker/docker-compose.prod.yml up -d --build
```

编排会自动按序执行：
1. 启动 `postgres` 并等待健康检查通过；
2. 启动一次性 `migrator` 容器执行 `prisma migrate deploy`；
3. 启动非 `root` 运行的 `app` 容器（监听 `127.0.0.1:3000`，同时提供 `/api/v1` 与前端 PWA 静态资源）。

验证服务健康：

```bash
curl -s http://127.0.0.1:3000/api/v1/health
```

预期返回 `{"code":0,"message":"ok","data":{"status":"ok","db":"ok",...}}`。

---

## 4. 接入 Tailscale HTTPS（零公网暴露）

```bash
sudo tailscale serve --bg http://127.0.0.1:3000
tailscale serve status
```

打开输出的 `https://<机器名>.<tailnet>.ts.net` 即可直接访问网页版并安装为 PWA，或将其作为安卓 App 的 API 地址。

---

## 5. 每日自动备份（保留 7 天）

```bash
chmod +x docker/backup.sh
./docker/backup.sh   # 先手动试跑一次确认成功
```

写入定时任务（`crontab -e`），每天凌晨 03:30 自动备份：

```cron
30 3 * * * /srv/gdut_help/docker/backup.sh >> /var/log/gduthelp-backup.log 2>&1
```

备份文件保存在 `docker/backups/gduthelp-YYYYMMDD-HHMMSS.sql.gz`。

---

## 6. 升级与回滚 / 数据恢复

### 日常升级

```bash
cd /srv/gdut_help
./docker/backup.sh
git pull --ff-only
docker compose --env-file docker/.env.prod -f docker/docker-compose.prod.yml up -d --build
```

### 从备份恢复数据库

```bash
set -a; source docker/.env.prod; set +a
gunzip -c docker/backups/gduthelp-YYYYMMDD-HHMMSS.sql.gz | \
  docker compose --env-file docker/.env.prod -f docker/docker-compose.prod.yml exec -T postgres \
  psql -U "${POSTGRES_USER:-gduthelp}" -d "${POSTGRES_DB:-gduthelp}"
```

### 常用运维命令

```bash
# 查看应用实时日志
docker compose --env-file docker/.env.prod -f docker/docker-compose.prod.yml logs -f app

# 查看容器健康状态
docker compose --env-file docker/.env.prod -f docker/docker-compose.prod.yml ps
```
