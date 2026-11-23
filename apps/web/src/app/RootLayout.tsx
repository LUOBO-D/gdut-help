import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { AppUpdateModal } from '../components/AppUpdateModal';
import { FpsMeter } from '../components/FpsMeter';
import { OfflineBanner } from '../components/OfflineBanner';
import { SkyBackground } from '../components/SkyBackground';
import { ToastViewport } from '../components/Toast';
import { refreshSession } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { hydrateOfflineQueue, replayOfflineQueue } from '../lib/offline-queue';
import { useOnline } from '../lib/use-online';
import { useScene } from '../lib/use-scene';
import { useQualityDetection, useQualityStore } from '../three/quality-store';

/** 最外层：天空背景、画质检测，以及启动时用 Cookie 恢复登录状态与离线队列同步。 */
export function RootLayout() {
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const isMapRoute = pathname.startsWith('/map');
  const { scene, timePhase } = useScene();
  const status = useAuth((s) => s.status);
  const showFps = useQualityStore((s) => s.showFps);
  useQualityDetection();

  const offline = useAuth((s) => s.offline);
  const online = useOnline();

  useEffect(() => {
    void hydrateOfflineQueue();
  }, []);

  useEffect(() => {
    if (status === 'unknown') void refreshSession();
  }, [status]);

  // 离线进入后恢复联网：换取新的 access token 并回放离线待办操作
  useEffect(() => {
    if (!online) return;
    if (offline) {
      void refreshSession().then(() => {
        if (useAuth.getState().status === 'authenticated') {
          void replayOfflineQueue(queryClient);
        }
      });
    } else if (status === 'authenticated') {
      void replayOfflineQueue(queryClient);
    }
  }, [offline, online, status, queryClient]);

  return (
    <>
      {/* 校园 3D 地图拥有独立昼夜天空与 WebGL 上下文，进入 /map 时暂停全局天空背景避免双 WebGL 争抢移动端显存 */}
      {!isMapRoute && <SkyBackground scene={scene} timePhase={timePhase} />}
      <OfflineBanner />
      {showFps && <FpsMeter />}
      <Outlet />
      <AppUpdateModal />
      <ToastViewport />
      <ScrollRestoration />
    </>
  );
}
