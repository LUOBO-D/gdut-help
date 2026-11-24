#!/usr/bin/env bash
# 验证加密/明文备份的 SHA-256 完整性、AES-256 解密与 gzip 结构（不写入生产数据库）
# 用法：./docker/restore-verify.sh /srv/gdut_help/docker/backups/gduthelp-20261124-033000.sql.gz.enc

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASSPHRASE_FILE="${BACKUP_PASSPHRASE_FILE:-${ROOT_DIR}/docker/.backup-passphrase}"
TARGET="${1:-}"

if [[ -z "${TARGET}" ]]; then
  TARGET="$(ls -1t "${ROOT_DIR}/docker/backups"/gduthelp-*.sql.gz* 2>/dev/null | grep -v '\.sha256$' | head -n 1 || true)"
fi

if [[ -z "${TARGET}" || ! -f "${TARGET}" ]]; then
  echo "[verify] 未找到备份文件，请传入备份文件路径" >&2
  exit 1
fi

echo "[verify] 正在核验：${TARGET}"
if [[ -f "${TARGET}.sha256" ]]; then
  sha256sum -c "${TARGET}.sha256"
fi

if [[ "${TARGET}" == *.enc ]]; then
  if [[ ! -f "${PASSPHRASE_FILE}" ]]; then
    echo "[verify] 缺少解密口令文件 ${PASSPHRASE_FILE}" >&2
    exit 1
  fi
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -in "${TARGET}" -pass "file:${PASSPHRASE_FILE}" | gzip -t
  echo "[verify] AES-256 解密 + gzip 完整性校验通过！"
else
  gzip -t "${TARGET}"
  echo "[verify] gzip 完整性校验通过！"
fi
