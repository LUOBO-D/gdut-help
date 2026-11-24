/// <reference lib="webworker" />
import type { PushPayload } from '@gduthelp/shared';
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

// 新版本直接接管页面，下次打开即是新版
void self.skipWaiting();
clientsClaim();

// 预缓存应用外壳（HTML、JS、CSS、图标），离线也能打开。
// 接口数据不在这里缓存：页面用 IndexedDB 保存上次的查询结果。
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

self.addEventListener('push', (event) => {
  let data: PushPayload;
  try {
    data = event.data?.json() as PushPayload;
  } catch {
    data = { title: 'GDUT Help', body: event.data?.text() ?? '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { link: data.link ?? '/' },
    }),
  );
});

// 点击通知：已打开的窗口直接跳转并聚焦，否则新开一个（严格限制仅允许同源路径，防止开放重定向）
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawLink = (event.notification.data as { link?: string } | null)?.link ?? '/';
  let url = self.location.origin + '/';
  try {
    const parsed = new URL(rawLink, self.location.origin);
    if (parsed.origin === self.location.origin) {
      url = parsed.href;
    }
  } catch {
    // 非法 URL 回退首页
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        await existing.focus();
        await existing.navigate(url).catch(() => undefined);
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
