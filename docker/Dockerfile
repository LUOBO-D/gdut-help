# syntax=docker/dockerfile:1

# ============================================================
# Stage 1: 构建 shared / web / server（含 Prisma Client）
# ============================================================
FROM node:24-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.9.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
COPY apps/web ./apps/web

RUN pnpm --filter @gduthelp/shared build \
  && pnpm --filter @gduthelp/web build \
  && pnpm --filter @gduthelp/server build

# ============================================================
# Stage 2: 独立迁移镜像（保留 Prisma CLI，运行一次即退出）
# ============================================================
FROM builder AS migrator
WORKDIR /app
CMD ["pnpm", "--filter", "@gduthelp/server", "exec", "prisma", "migrate", "deploy"]

# ============================================================
# Stage 3: 精简非 root 生产运行镜像（后端 + 前端静态托管一体化）
# ============================================================
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STATIC_DIR=/app/public \
    TZ=Asia/Shanghai

RUN corepack enable && corepack prepare pnpm@12.9.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

RUN pnpm install --frozen-lockfile --prod --filter @gduthelp/server...

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/web/dist ./public

RUN mkdir -p /app/ota-bundles && chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/server/dist/main.js"]
