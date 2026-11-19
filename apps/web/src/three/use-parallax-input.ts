import { useEffect } from 'react';
import { skyInput } from './sky-input';

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * 视差输入：电脑上跟随鼠标；手机上开启陀螺仪后跟随倾斜角度。
 * 触摸滑动不作为输入，否则滚动页面时背景会乱晃。
 */
export function useParallaxInput(gyro: boolean) {
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      skyInput.parallaxX = clamp((e.clientX / window.innerWidth) * 2 - 1);
      skyInput.parallaxY = clamp(-((e.clientY / window.innerHeight) * 2 - 1));
    };
    // gamma：左右倾斜；beta：前后倾斜，手持时一般在 45° 左右
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      skyInput.parallaxX = clamp(e.gamma / 30);
      skyInput.parallaxY = clamp((e.beta - 45) / 30);
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    if (gyro) window.addEventListener('deviceorientation', onTilt);
    return () => {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('deviceorientation', onTilt);
      skyInput.parallaxX = 0;
      skyInput.parallaxY = 0;
    };
  }, [gyro]);
}

type PermissionFn = () => Promise<'granted' | 'denied'>;

export type GyroResult = 'ok' | 'insecure' | 'denied' | 'no-data';

export const GYRO_ERRORS: Record<Exclude<GyroResult, 'ok'>, string> = {
  insecure: '陀螺仪只能在 HTTPS 页面使用。当前是 http:// 地址（局域网访问），请改用 Tailscale 的 https 地址打开',
  denied: '没有获得陀螺仪权限。关闭页面重新打开后再试一次',
  'no-data': '没有收到陀螺仪数据：设备可能没有陀螺仪，或浏览器关闭了动作传感器（Chrome：地址栏左侧图标 → 网站设置 → 动作传感器）',
};

/**
 * 开启陀螺仪视差：检查 HTTPS、申请权限（iOS 必须在点击事件里申请），
 * 再等最多 1.5 秒确认真的收到了倾斜数据，避免开关打开了却没有效果。
 */
export async function enableGyro(): Promise<GyroResult> {
  // 浏览器只在安全上下文（HTTPS 或 localhost）里发送设备方向事件
  if (!window.isSecureContext) return 'insecure';
  if (!('DeviceOrientationEvent' in window)) return 'no-data';

  const request = (DeviceOrientationEvent as unknown as { requestPermission?: PermissionFn }).requestPermission;
  if (request) {
    try {
      if ((await request()) !== 'granted') return 'denied';
    } catch {
      return 'denied';
    }
  }
  return (await waitForOrientation(1500)) ? 'ok' : 'no-data';
}

function waitForOrientation(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      window.clearTimeout(timer);
      window.removeEventListener('deviceorientation', onEvent);
      resolve(ok);
    };
    const onEvent = (e: DeviceOrientationEvent) => {
      if (e.beta !== null || e.gamma !== null) done(true);
    };
    const timer = window.setTimeout(() => done(false), timeoutMs);
    window.addEventListener('deviceorientation', onEvent);
  });
}
