/**
 * 原生交互与生命周期适配层：
 * - 监听页面/App 回到前台（visibilitychange + Capacitor App.appStateChange），重排未来 7 天本地通知并回放离线队列
 * - 在安卓 App 中接管硬件返回键：优先关闭弹层 Sheet → 路由回退 → 首页 2 秒内双击退出
 * - 网页端零额外插件依赖，不拖慢首屏体积
 */
import type { QueryClient } from '@tanstack/react-query';
import { useAuth } from './auth-store';
import { replayOfflineQueue } from './offline-queue';
import { isNative } from './platform';
import { closeTopSheet } from './sheet-stack';
import { toast } from './toast-store';

interface CapacitorAppPlugin {
  addListener(event: 'backButton', cb: (info: { canGoBack?: boolean }) => void): Promise<unknown>;
  addListener(event: 'appStateChange', cb: (state: { isActive: boolean }) => void): Promise<unknown>;
  exitApp?: () => Promise<void> | void;
}

interface GlobalWithCapacitor {
  Capacitor?: {
    Plugins?: {
      App?: CapacitorAppPlugin;
    };
  };
}

export function hapticLight() {
  try {
    navigator.vibrate?.(10);
  } catch {
    // 部分浏览器禁止或不支持震动，安全忽略
  }
}

export function initNativeUx(
  queryClient: QueryClient,
  router: { navigate: (delta: number) => unknown; state: { location: { pathname: string } } },
) {
  const onResume = () => {
    if (isNative) {
      void import('./local-reminders').then((m) => m.resyncLocalReminders(queryClient));
    }
    if (useAuth.getState().status === 'authenticated') {
      void replayOfflineQueue(queryClient);
    }
  };

  // Web & 安卓 WebView 通用：从后台切回前台时重同步通知与离线队列
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onResume();
  });

  if (!isNative) return;

  const appPlugin = (globalThis as unknown as GlobalWithCapacitor).Capacitor?.Plugins?.App;
  if (!appPlugin) return;

  void appPlugin.addListener('appStateChange', ({ isActive }) => {
    if (isActive) onResume();
  });

  let lastBackAt = 0;
  void appPlugin.addListener('backButton', ({ canGoBack }) => {
    if (closeTopSheet()) return;
    const path = router.state.location.pathname;
    if (path !== '/' && path !== '/login' && canGoBack !== false) {
      void Promise.resolve(router.navigate(-1));
      return;
    }
    const now = Date.now();
    if (now - lastBackAt < 2000) {
      void appPlugin.exitApp?.();
    } else {
      lastBackAt = now;
      toast.info('再按一次返回键退出应用');
    }
  });
}
