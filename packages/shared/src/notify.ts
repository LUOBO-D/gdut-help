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

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2048),
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
