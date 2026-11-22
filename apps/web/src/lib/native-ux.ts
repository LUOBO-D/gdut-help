/**
 * 原生交互与生命周期适配层：
 * - 监听页面/App 回到前台（visibilitychange + Capacitor App.appStateChange），重排未来 7 天本地通知并回放离线队列
 * - 在安卓 App 中通过 @capacitor/app 接管系统返回键 / 侧滑返回手势：
 *   优先关闭弹层 Sheet → 游客在 /map 一律退回 /login → 其他非首页路由回退 → 仅首页/登录页 2 秒内双击退出
 * - 网页端按需动态导入，零额外首屏体积
 */
import type { QueryClient } from '@tanstack/react-query';
import { useAuth } from './auth-store';
import { replayOfflineQueue } from './offline-queue';
import { isNative } from './platform';
import { closeTopSheet } from './sheet-stack';
import { toast } from './toast-store';

export type NativeBackAction =
  | { kind: 'back' }
  | { kind: 'replace'; to: string }
  | { kind: 'exit-prompt' };

export interface NativeBackContext {
  pathname: string;
  isAuthenticated: boolean;
  fromLogin?: boolean;
  canGoBack?: boolean;
  historyIdx?: number;
}

/** 根据当前路由与登录态决定安卓系统返回键行为（纯函数，便于单测） */
export function resolveNativeBackAction(ctx: NativeBackContext): NativeBackAction {
  const hasHistory = ctx.canGoBack !== false && (ctx.historyIdx === undefined || ctx.historyIdx > 0);

  // 未登录游客从登录页进入 3D 地图：按返回键始终退回登录页，绝不直接退出 App
  if (ctx.pathname === '/map' && !ctx.isAuthenticated) {
    if (ctx.fromLogin && hasHistory) return { kind: 'back' };
    return { kind: 'replace', to: '/login' };
  }

  // 根页面（已登录首页 / 登录页）：走 2 秒双击退出提示
  if (ctx.pathname === '/' || ctx.pathname === '/login') {
    return { kind: 'exit-prompt' };
  }

  // 其他页面（课表、吃什么、待办、我的、已登录地图、管理后台等）：优先回退历史，无历史则回到对应根页
  if (hasHistory) return { kind: 'back' };
  return { kind: 'replace', to: ctx.isAuthenticated ? '/' : '/login' };
}

interface NativeRouterLike {
  navigate(delta: number): unknown;
  navigate(to: string, opts?: { replace?: boolean }): unknown;
  state: {
    location: {
      pathname: string;
      state?: unknown;
    };
  };
}

function readHistoryIdx(): number | undefined {
  try {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    return typeof idx === 'number' ? idx : undefined;
  } catch {
    return undefined;
  }
}

export function hapticLight() {
  try {
    navigator.vibrate?.(10);
  } catch {
    // 部分浏览器禁止或不支持震动，安全忽略
  }
}

export function initNativeUx(queryClient: QueryClient, router: NativeRouterLike) {
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

  void import('@capacitor/app')
    .then(({ App }) => {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) onResume();
      }).catch(() => undefined);

      let lastBackAt = 0;
      void App.addListener('backButton', ({ canGoBack }) => {
        if (closeTopSheet()) return;

        const location = router.state.location;
        const locState = location.state as { fromLogin?: boolean } | null | undefined;
        const action = resolveNativeBackAction({
          pathname: location.pathname,
          isAuthenticated: useAuth.getState().status === 'authenticated',
          fromLogin: Boolean(locState?.fromLogin),
          canGoBack,
          historyIdx: readHistoryIdx(),
        });

        if (action.kind === 'back') {
          void Promise.resolve(router.navigate(-1));
          return;
        }
        if (action.kind === 'replace') {
          void Promise.resolve(router.navigate(action.to, { replace: true }));
          return;
        }

        const now = Date.now();
        if (now - lastBackAt < 2000) {
          void App.exitApp().catch(() => undefined);
        } else {
          lastBackAt = now;
          toast.info('再按一次返回键退出应用');
        }
      }).catch(() => undefined);
    })
    .catch(() => undefined);
}
