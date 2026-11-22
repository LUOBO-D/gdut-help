import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import { router } from './app/router';
import { initNativeUx } from './lib/native-ux';
import { isNative } from './lib/platform';
import { CACHE_BUSTER, persister, queryClient } from './lib/query-client';
import './styles/index.css';

if (isNative) {
  // App 的页面文件已经打包在安装包里，不需要 Service Worker；先确认热更新包健康，再初始化本地通知
  void import('./lib/ota-updater').then((m) => m.initOtaUpdater());
  void import('./lib/local-reminders').then((m) => m.initLocalReminders(queryClient, router));
} else {
  // 注册 Service Worker：离线打开、接收推送
  registerSW({ immediate: true });
}
initNativeUx(queryClient, router);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 7 * 24 * 3600_000, buster: CACHE_BUSTER }}
    >
      {/* 跟随系统「减少动态效果」设置 */}
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
      </MotionConfig>
    </PersistQueryClientProvider>
  </StrictMode>,
);
