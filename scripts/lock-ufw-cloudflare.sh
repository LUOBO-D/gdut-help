#!/usr/bin/env bash
# Cloudflare 源站隐藏 + 抗超大流量 DDoS 一键锁定脚本
# ⚠️ 务必在 youhelp.top 已成功接入 Cloudflare（DNS 开启橙色代理、SSL 设为 Full (strict)）且外网可正常访问后再执行！
#
# 执行内容：
#   1. 保留 SSH 22/tcp 放行（防止锁死管理入口）；
#   2. 将 80/443 入站防火墙严格收窄为仅放行 Cloudflare 官方回源 IPv4/IPv6 段（公网直连源站全部内核静默丢弃）；
#   3. 关闭 fail2ban 的 caddy-* 监狱（仅保留 sshd），防止误封 Cloudflare 回源代理 IP；
#      应用层封禁自动交由 Cloudflare WAF + 后端 ActiveDefenseService（按 CF-Connecting-IP 识别真实攻击者）处理；
#   4. 自动在 /srv/gdut_help/docker/.env.prod 启用 TRUST_CF_HEADERS=true 并重启 app 容器生效。

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "请使用 root 权限执行本脚本" >&2
  exit 1
fi

echo "[cf-lock] 1/4 拉取 Cloudflare 官方回源 IP 列表…"
CF_V4="$(curl -fsSL --max-time 15 https://www.cloudflare.com/ips-v4)"
CF_V6="$(curl -fsSL --max-time 15 https://www.cloudflare.com/ips-v6)"

if [[ -z "${CF_V4}" ]]; then
  echo "[cf-lock] 拉取 Cloudflare IPv4 列表失败，已中止（未改动防火墙）" >&2
  exit 1
fi

echo "[cf-lock] 2/4 锁定 UFW：仅放行 SSH + Cloudflare 官方回源 IP（80/443）…"
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

echo "[cf-lock] 3/4 调整 fail2ban 仅保留 sshd 监狱（避免误封 Cloudflare 边缘节点 IP）…"
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 24h
findtime = 10m
maxretry = 5
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port = ssh
maxretry = 5
findtime = 10m
bantime = 24h
EOF
fail2ban-client reload
fail2ban-client status

echo "[cf-lock] 4/4 开启后端 TRUST_CF_HEADERS=true 并重启容器…"
ENV_FILE="/srv/gdut_help/docker/.env.prod"
if grep -q '^TRUST_CF_HEADERS=' "${ENV_FILE}"; then
  sed -i 's/^TRUST_CF_HEADERS=.*/TRUST_CF_HEADERS=true/' "${ENV_FILE}"
else
  printf '\nTRUST_CF_HEADERS=true\n' >> "${ENV_FILE}"
fi
chmod 600 "${ENV_FILE}"

cd /srv/gdut_help/docker
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-build --no-deps --force-recreate app

echo ""
echo "[cf-lock] 完成！源站现已彻底隐藏在 Cloudflare 后方，公网无法绕过 CDN 直连 80/443。"
ufw status | head -n 25
