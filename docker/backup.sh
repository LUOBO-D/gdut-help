#!/usr/bin/env bash
# GDUT Help PostgreSQL 自动安全备份脚本（支持 AES-256 加密、SHA-256 校验与 rclone 异地同步）
# 用法：chmod +x docker/backup.sh && ./docker/backup.sh
# 示例 crontab（每天凌晨 03:30 备份）：
#   30 3 * * * cd /srv/gdut_help && ./docker/backup.sh >> /var/log/gduthelp-backup.log 2>&1
#
# 启用加密备份（强烈推荐）：
#   openssl rand -base64 48 > /srv/gdut_help/docker/.backup-passphrase && chmod 600 /srv/gdut_help/docker/.backup-passphrase
# 启用异地备份（阿里云 OSS / Cloudflare R2）：
#   在 docker/.env.prod 中配置 BACKUP_RCLONE_REMOTE=r2:gduthelp-backups

set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/docker/.env.prod"
COMPOSE_FILE="${ROOT_DIR}/docker/docker-compose.prod.yml"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/docker/backups}"
PASSPHRASE_FILE="${BACKUP_PASSPHRASE_FILE:-${ROOT_DIR}/docker/.backup-passphrase}"
KEEP_DAYS="${KEEP_DAYS:-14}"

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
RAW_FILE="${BACKUP_DIR}/gduthelp-${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

echo "[backup] 开始导出数据库 ${PG_DB}…"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  pg_dump -U "${PG_USER}" --clean --if-exists "${PG_DB}" | gzip -9 > "${RAW_FILE}"

if [[ ! -s "${RAW_FILE}" ]]; then
  echo "[backup] 备份文件为空，已中止并删除无效文件" >&2
  rm -f "${RAW_FILE}"
  exit 1
fi

FINAL_FILE="${RAW_FILE}"
if [[ -f "${PASSPHRASE_FILE}" ]]; then
  ENC_FILE="${RAW_FILE}.enc"
  echo "[backup] 检测到加密口令文件，正在执行 AES-256-CBC + PBKDF2 加密…"
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
    -in "${RAW_FILE}" -out "${ENC_FILE}" -pass "file:${PASSPHRASE_FILE}"
  rm -f "${RAW_FILE}"
  FINAL_FILE="${ENC_FILE}"
fi

sha256sum "${FINAL_FILE}" > "${FINAL_FILE}.sha256"
chmod 600 "${FINAL_FILE}" "${FINAL_FILE}.sha256"

SIZE="$(du -h "${FINAL_FILE}" | cut -f1)"
echo "[backup] 本地备份完成：${FINAL_FILE}（${SIZE}）"

if [[ -n "${BACKUP_RCLONE_REMOTE:-}" ]]; then
  if command -v rclone >/dev/null 2>&1; then
    echo "[backup] 正在同步加密备份到异地存储 ${BACKUP_RCLONE_REMOTE}…"
    rclone copy "${FINAL_FILE}" "${BACKUP_RCLONE_REMOTE}"
    rclone copy "${FINAL_FILE}.sha256" "${BACKUP_RCLONE_REMOTE}"
    echo "[backup] 异地同步完成"
  else
    echo "[backup] 警告：已配置 BACKUP_RCLONE_REMOTE 但未安装 rclone，已跳过异地同步" >&2
  fi
fi

echo "[backup] 清理 ${KEEP_DAYS} 天前的旧备份…"
find "${BACKUP_DIR}" -type f \( -name 'gduthelp-*.sql.gz' -o -name 'gduthelp-*.sql.gz.enc' -o -name 'gduthelp-*.sha256' \) -mtime "+${KEEP_DAYS}" -delete
echo "[backup] 全部完成"
