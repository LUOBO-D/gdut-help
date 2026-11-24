import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { MailService } from '../mail/mail.service.js';

export interface SecurityAlertPayload {
  dedupeKey: string;
  title: string;
  severity: 'warn' | 'critical';
  event: string;
  ip?: string;
  path?: string;
  summary: string;
}

const DEDUPE_COOLDOWN_MS = 15 * 60_000;
const GLOBAL_WINDOW_MS = 60 * 60_000;
const MAX_ALERTS_PER_HOUR = 20;
const MAX_DEDUPE_ENTRIES = 500;

const PRIVATE_OR_LOCAL_HOST =
  /^(?:localhost|127\.|10\.|169\.254\.|192\.168\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?fc|\[?fd|\[?fe80)/i;

function isSafeWebhookUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (!u.hostname || PRIVATE_OR_LOCAL_HOST.test(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

/**
 * 安全事件实时告警派发器（邮件 + Webhook 双通道，防告警风暴）：
 * - 同一目标 15 分钟内只告警一次；
 * - 全站每小时最多发送 20 条，避免遭遇大流量扫描时反向刷爆管理员邮箱/群机器人；
 * - 自动兼容飞书、企业微信、钉钉、Discord 与通用 JSON Webhook。
 */
@Injectable()
export class SecurityAlertService {
  private readonly logger = new Logger('SecurityAlert');
  private readonly lastSent = new Map<string, number>();
  private globalWindowStart = 0;
  private globalSentCount = 0;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Optional() private readonly mail?: MailService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.env.SECURITY_ALERT_EMAIL || this.env.SECURITY_ALERT_WEBHOOK_URL);
  }

  /** 异步派发安全告警，内部吞掉异常确保绝不影响主请求链路 */
  notify(payload: SecurityAlertPayload, now = Date.now()): boolean {
    if (this.env.NODE_ENV === 'test' || !this.isConfigured()) return false;

    const prev = this.lastSent.get(payload.dedupeKey);
    if (prev && now - prev < DEDUPE_COOLDOWN_MS) return false;

    if (now - this.globalWindowStart > GLOBAL_WINDOW_MS) {
      this.globalWindowStart = now;
      this.globalSentCount = 0;
    }
    if (this.globalSentCount >= MAX_ALERTS_PER_HOUR) return false;

    this.globalSentCount += 1;
    this.lastSent.delete(payload.dedupeKey);
    this.lastSent.set(payload.dedupeKey, now);
    while (this.lastSent.size > MAX_DEDUPE_ENTRIES) {
      const oldest = this.lastSent.keys().next().value;
      if (oldest === undefined) break;
      this.lastSent.delete(oldest);
    }

    const timestamp = new Date(now).toISOString();
    const textBody = [
      `[GDUT Help 安全告警 · ${payload.severity.toUpperCase()}] ${payload.title}`,
      `时间：${timestamp}`,
      `事件：${payload.event}`,
      payload.ip ? `来源：${payload.ip}` : null,
      payload.path ? `路径：${payload.path}` : null,
      `详情：${payload.summary}`,
      `处置建议：可调用 GET /api/v1/admin/security/summary 查看完整实时态势。`,
    ]
      .filter(Boolean)
      .join('\n');

    if (this.env.SECURITY_ALERT_EMAIL && this.mail) {
      void this.mail
        .sendSecurityAlert(this.env.SECURITY_ALERT_EMAIL, `[GDUT Help 安全告警] ${payload.title}`, textBody)
        .catch((err) => {
          this.logger.warn(`安全邮件告警发送失败：${err instanceof Error ? err.message : String(err)}`);
        });
    }

    if (this.env.SECURITY_ALERT_WEBHOOK_URL) {
      void this.sendWebhook(this.env.SECURITY_ALERT_WEBHOOK_URL, textBody, payload, timestamp).catch((err) => {
        this.logger.warn(`安全 Webhook 告警发送失败：${err instanceof Error ? err.message : String(err)}`);
      });
    }

    return true;
  }

  private async sendWebhook(
    rawUrl: string,
    textBody: string,
    payload: SecurityAlertPayload,
    timestamp: string,
  ): Promise<void> {
    const url = isSafeWebhookUrl(rawUrl);
    if (!url) {
      this.logger.warn('SECURITY_ALERT_WEBHOOK_URL 非法或非 HTTPS 公网地址，已跳过推送');
      return;
    }

    const host = url.hostname.toLowerCase();
    let body: unknown;
    if (host.includes('feishu.cn') || host.includes('larksuite.com')) {
      body = { msg_type: 'text', content: { text: textBody } };
    } else if (host.includes('qyapi.weixin.qq.com') || host.includes('oapi.dingtalk.com')) {
      body = { msgtype: 'text', text: { content: textBody } };
    } else if (host.includes('discord.com') || host.includes('discordapp.com')) {
      body = { content: textBody };
    } else {
      body = {
        text: textBody,
        title: payload.title,
        event: payload.event,
        severity: payload.severity,
        ip: payload.ip ?? null,
        path: payload.path ?? null,
        summary: payload.summary,
        timestamp,
      };
    }

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  }
}
