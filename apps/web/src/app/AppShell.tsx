import { motion } from 'motion/react';
import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { ErrorBoundary, PageErrorFallback } from '../components/ErrorBoundary';
import { SideNav } from '../components/SideNav';
import { TabBar } from '../components/TabBar';
import { initGdutSessionKeepAlive } from '../lib/gdut-auth';
import { useAppShortcuts } from '../lib/use-shortcuts';

/**
 * 登录后的主框架：手机底部标签栏 / 电脑侧边栏。
 *
 * 性能说明：原先使用 AnimatePresence mode="popLayout" 同时叠加两整页带 backdrop-filter 的玻璃卡片位移，
 * 在安卓 WebView（Skia 合成器）上会触发全屏重复模糊重绘导致严重掉帧。
 * 现改为单页轻量淡入（110ms 纯 opacity，零双页重叠模糊）+ 空闲预加载其余主 Tab 分包，切换稳住 60fps。
 */
export function AppShell() {
  useAppShortcuts();
  const { pathname } = useLocation();

  // 安卓端前台轻量心跳保活：已连接广工统一认证时每 15 分钟保活，避免教务会话闲置掉线
  useEffect(() => initGdutSessionKeepAlive(), []);

  // 首屏渲染后空闲预加载其余常用主 Tab 分包，切换学业/校园/吃什么/待办零等待
  useEffect(() => {
    const preload = () => {
      void import('../features/timetable/TimetablePage');
      void import('../features/campus/CampusPage');
      void import('../features/food/FoodPage');
      void import('../features/todo/TodoPage');
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 1200 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(preload, 300);
    return () => window.clearTimeout(id);
  }, []);

  const isMapRoute = pathname.startsWith('/map');

  return (
    <div className="min-h-dvh xl:pl-64">
      <SideNav />
      {isMapRoute ? (
        <main className="relative h-dvh w-full overflow-hidden">
          <ErrorBoundary key={pathname} fallback={<PageErrorFallback />}>
            <Outlet />
          </ErrorBoundary>
        </main>
      ) : (
        <div className="relative mx-auto max-w-5xl overflow-x-clip px-4 pb-32 pt-[max(env(safe-area-inset-top),16px)] xl:px-8 xl:pb-12 xl:pt-8">
          <motion.main
            key={pathname}
            initial={{ opacity: 0.01 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.11, ease: 'easeOut' }}
          >
            <ErrorBoundary key={pathname} fallback={<PageErrorFallback />}>
              <Outlet />
            </ErrorBoundary>
          </motion.main>
        </div>
      )}
      <TabBar />
    </div>
  );
}
