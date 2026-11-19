import { api } from './api';

export type PushState =
  | 'enabled'
  | 'disabled'
  | 'denied'
  /** 不是 HTTPS（局域网 http 地址） */
  | 'insecure'
  /** iPhone 需要先「添加到主屏幕」，从主屏幕打开才支持推送 */
  | 'ios-install'
  | 'unsupported'
  /** 服务端没有配置 VAPID 密钥 */
  | 'server-off';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export async function pushState(): Promise<PushState> {
  if (!window.isSecureContext) return 'insecure';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'enabled' : 'disabled';
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** 申请通知权限 → 订阅推送 → 把订阅交给服务端 */
export async function enablePush(): Promise<PushState> {
  const { publicKey } = await api<{ publicKey: string | null }>('/push/public-key');
  if (!publicKey) return 'server-off';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'disabled';
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(publicKey) }));
  await api<null>('/push/subscriptions', { method: 'POST', body: sub.toJSON() });
  return 'enabled';
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api<null>('/push/subscriptions', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => undefined);
    await sub.unsubscribe();
  }
  return 'disabled';
}

export const PUSH_STATE_TEXT: Record<PushState, string> = {
  enabled: '已开启',
  disabled: '未开启',
  denied: '通知权限被拒绝，需要在浏览器的网站设置里允许通知',
  insecure: '需要通过 HTTPS 地址访问才能使用（局域网 http 地址不支持）',
  'ios-install': 'iPhone 需要先用 Safari「分享 → 添加到主屏幕」，再从主屏幕打开',
  unsupported: '当前浏览器不支持推送，提醒会通过邮件和站内通知发出',
  'server-off': '服务端未配置推送密钥（VAPID），暂不可用',
};
