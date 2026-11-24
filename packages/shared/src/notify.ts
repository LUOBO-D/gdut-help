import { z } from 'zod';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: AppNotification[];
  unread: number;
}

const TRUSTED_PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/i,
  /^android\.googleapis\.com$/i,
  /^updates\.push\.services\.mozilla\.com$/i,
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/i,
  /^[a-z0-9.-]+\.push\.apple\.com$/i,
  /^[a-z0-9.-]+\.notify\.windows\.com$/i,
];

/**
 * 严格校验 Web Push 订阅地址仅允许官方 HTTPS 推送网关，彻底阻断借由推送端点触发的 SSRF（内网/云元数据探测）。
 */
export function isTrustedPushEndpoint(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    if (u.port && u.port !== '443') return false;
    const host = u.hostname.toLowerCase();
    return TRUSTED_PUSH_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

export const pushSubscriptionSchema = z.object({
  endpoint: z
    .url()
    .max(2048)
    .refine(isTrustedPushEndpoint, { error: '仅允许受信任的浏览器官方 HTTPS 推送服务地址' }),
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(64) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const markReadSchema = z.object({ ids: z.array(z.uuid()).max(100).optional() });

/** 推送消息体（Service Worker 收到后显示通知） */
export interface PushPayload {
  title: string;
  body: string;
  link?: string;
  tag?: string;
}

export interface DeliveryResult {
  push: { sent: number; failed: number; removed: number };
  email: 'sent' | 'skipped' | 'failed';
}
