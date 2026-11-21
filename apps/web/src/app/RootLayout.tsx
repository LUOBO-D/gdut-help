import { useEffect } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { FpsMeter } from '../components/FpsMeter';
import { OfflineBanner } from '../components/OfflineBanner';
import { SkyBackground } from '../components/SkyBackground';
import { ToastViewport } from '../components/Toast';
import { refreshSession } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useOnline } from '../lib/use-online';
import { useScene } from '../lib/use-scene';
import { useQualityDetection, useQualityStore } from '../three/quality-store';

/** 最外层：天空背景、画质检测，以及启动时用 Cookie 恢复登录状态。 */
export function RootLayout() {
  const scene = useScene();
  const status = useAuth((s) => s.status);
  const showFps = useQualityStore((s) => s.showFps);
  useQualityDetection();

  const offline = useAuth((s) => s.offline);
  const online = useOnline();

  useEffect(() => {
    if (status === 'unknown') void refreshSession();
  }, [status]);

  // 离线进入后恢复联网：换取新的 access token
  useEffect(() => {
    if (offline && online) void refreshSession();
  }, [offline, online]);

  return (
    <>
      <SkyBackground scene={scene} />
      <OfflineBanner />
      {showFps && <FpsMeter />}
      <Outlet />
      <ToastViewport />
      <ScrollRestoration />
    </>
  );
}
