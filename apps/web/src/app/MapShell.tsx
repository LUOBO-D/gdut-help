import { Outlet } from 'react-router';
import { ErrorBoundary, PageErrorFallback } from '../components/ErrorBoundary';
import { useAuth } from '../lib/auth-store';
import { AppShell } from './AppShell';

/**
 * 校园 3D 地图专属外框：
 * - 已登录同学：嵌入完整 5-Tab AppShell（底部导航栏 + 桌面侧边栏），随时无缝切回课表/吃什么/待办；
 * - 未登录新同学：免登录全屏体验纯前端广工大学城 3D 地图与校内导航，不访问任何个人数据接口。
 */
export function MapShell() {
  const status = useAuth((s) => s.status);
  if (status === 'authenticated') {
    return <AppShell />;
  }
  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <ErrorBoundary fallback={<PageErrorFallback />}>
        <Outlet />
      </ErrorBoundary>
    </main>
  );
}
