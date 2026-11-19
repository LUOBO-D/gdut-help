import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { detectQuality, lowerQuality, minQuality, type Quality, type QualityPreference } from './quality';

interface QualityState {
  preference: QualityPreference;
  /** 自动检测结果；null 表示还在检测 */
  detected: Quality | null;
  gpu: string | null;
  /** 运行时帧率不足或 WebGL 出错后的上限，只在「自动」下生效，可在设置里重新检测清除 */
  cap: Quality | null;
  showFps: boolean;
  gyro: boolean;
  setPreference: (p: QualityPreference) => void;
  setDetected: (q: Quality, gpu: string) => void;
  downgrade: () => void;
  markWebglFailed: () => void;
  redetect: () => void;
  setShowFps: (v: boolean) => void;
  setGyro: (v: boolean) => void;
}

export const useQualityStore = create<QualityState>()(
  persist(
    (set, get) => ({
      preference: 'auto',
      detected: null,
      gpu: null,
      cap: null,
      showFps: false,
      gyro: false,
      setPreference: (preference) => set({ preference }),
      setDetected: (detected, gpu) => set({ detected, gpu }),
      downgrade: () => {
        const current = effectiveQuality(get());
        if (current && current !== 'low') set({ cap: lowerQuality(current) });
      },
      markWebglFailed: () => set({ cap: 'low' }),
      redetect: () => set({ detected: null, gpu: null, cap: null }),
      setShowFps: (showFps) => set({ showFps }),
      setGyro: (gyro) => set({ gyro }),
    }),
    {
      name: 'gduthelp-quality',
      // 检测结果每次启动重新算（换了浏览器或系统更新后可能不同），降级上限和偏好保留
      partialize: ({ preference, cap, showFps, gyro }) => ({ preference, cap, showFps, gyro }),
    },
  ),
);

/** 实际使用的画质；自动模式下检测完成前返回 null */
export function effectiveQuality(s: Pick<QualityState, 'preference' | 'detected' | 'cap'>): Quality | null {
  if (s.preference !== 'auto') return s.preference;
  if (!s.detected) return null;
  return s.cap ? minQuality(s.detected, s.cap) : s.detected;
}

export const useEffectiveQuality = () => useQualityStore(effectiveQuality);

/** 启动时检测一次 GPU，并把画质写到 <html data-quality>，供 CSS 调整玻璃模糊。 */
export function useQualityDetection() {
  const detected = useQualityStore((s) => s.detected);
  const quality = useEffectiveQuality();

  useEffect(() => {
    if (detected) return;
    let cancelled = false;
    void detectQuality().then(({ quality: q, gpu }) => {
      if (!cancelled) useQualityStore.getState().setDetected(q, gpu);
    });
    return () => {
      cancelled = true;
    };
  }, [detected]);

  useEffect(() => {
    document.documentElement.dataset.quality = quality ?? 'medium';
  }, [quality]);
}
