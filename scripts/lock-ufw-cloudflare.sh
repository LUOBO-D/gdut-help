#!/usr/bin/env bash
# Cloudflare 源站隐藏与 UFW 回源锁定脚本：
# 仅在将 youhelp.top 接入 Cloudflare 代理（橙色云朵）之后运行！
# 运行后：
#   1. 保留 SSH 22/tcp 放行（不会锁死你自己）；
#   2. 将 80/443 入站规则严格收窄为仅放行 Cloudflare 官方回源 IPv4/IPv6 段；
#   3. 提示在 /srv/gdut_help/docker/.env.prod 设置 TRUST_CF_HEADERS=true。

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "请使用 root 权限执行本脚本" >&2
  exit 1
fi

echo "[cf-lock] 拉取 Cloudflare 官方回源 IP 列表…"
CF_V4="$(curl -fsSL https://www.cloudflare.com/ips-v4)"
CF_V6="$(curl -fsSL https://www.cloudflare.com/ips-v6)"

if [[ -z "${CF_V4}" ]]; then
  echo "[cf-lock] 拉取 Cloudflare IPv4 列表失败，已中止（未改动防火墙）" >&2
  exit 1
fi

echo "[cf-lock] 备份当前 UFW 规则并重设为仅允许 SSH + Cloudflare 回源…"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'

while IFS= read -r cidr; do
  [[ -n "${cidr}" ]] && ufw allow from "${cidr}" to any port 80,443 proto tcp comment 'Cloudflare'
done <<< "${CF_V4}"

while IFS= read -r cidr; do
  [[ -n "${cidr}" ]] && ufw allow from "${cidr}" to any port 80,443 proto tcp comment 'Cloudflare-v6'
done <<< "${CF_V6}"

ufw --force enable
ufw status numbered

echo ""
echo "[cf-lock] 防火墙已锁定仅接受 Cloudflare 回源！"
echo "[cf-lock] 下一步请执行："
echo "  1. 在 /srv/gdut_help/docker/.env.prod 中设置 TRUST_CF_HEADERS=true"
echo "  2. 重启应用容器：cd /srv/gdut_help/docker && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-build --no-deps --force-recreate app"
echo "  3. Cloudflare SSL/TLS 模式设为 Full (strict)，并开启 Bot Fight Mode 与 WAF 托管规则"
