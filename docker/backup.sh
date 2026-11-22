#!/usr/bin/env bash
# GDUT Help PostgreSQL 自动备份脚本（默认保留最近 7 天，可直接挂载到 crontab）
# 用法：chmod +x docker/backup.sh && ./docker/backup.sh
# 示例 crontab（每天凌晨 03:30 备份）：
#   30 3 * * * cd /srv/gdut_help && ./docker/backup.sh >> /var/log/gduthelp-backup.log 2>&1

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/docker/.env.prod"
COMPOSE_FILE="${ROOT_DIR}/docker/docker-compose.prod.yml"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/docker/backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[backup] 未找到 ${ENV_FILE}，请先基于 docker/.env.prod.example 创建" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

PG_USER="${POSTGRES_USER:-gduthelp}"
PG_DB="${POSTGRES_DB:-gduthelp}"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
OUT_FILE="${BACKUP_DIR}/gduthelp-${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[backup] 开始备份数据库 ${PG_DB} → ${OUT_FILE}"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  pg_dump -U "${PG_USER}" --clean --if-exists "${PG_DB}" | gzip -9 > "${OUT_FILE}"

if [[ ! -s "${OUT_FILE}" ]]; then
  echo "[backup] 备份文件为空，已中止并删除无效文件" >&2
  rm -f "${OUT_FILE}"
  exit 1
fi

SIZE="$(du -h "${OUT_FILE}" | cut -f1)"
echo "[backup] 备份完成（${SIZE}），清理 ${KEEP_DAYS} 天前的旧备份…"
find "${BACKUP_DIR}" -type f -name 'gduthelp-*.sql.gz' -mtime "+${KEEP_DAYS}" -delete
echo "[backup] 全部完成"
