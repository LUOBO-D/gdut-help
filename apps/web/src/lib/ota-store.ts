import type { AppBundleManifest } from '@gduthelp/shared';
import { create } from 'zustand';

export const DISMISSED_OTA_VERSION_KEY = 'gduthelp:ota-dismissed-version';

export interface PendingOtaUpdate {
  latest: AppBundleManifest;
  currentVersion: string;
  downloadUrl: string | null;
  apkUrl: string | null;
  needsNativeUpgrade: boolean;
}

export type OtaUpdatePhase = 'idle' | 'downloading' | 'applying' | 'error';

interface OtaStoreState {
  /** 服务端检测到的可用新版本（即使用户点了「暂不更新」也会保留，便于在「我的」页随时点击升级） */
  available: PendingOtaUpdate | null;
  /** 更新说明弹窗是否显示 */
  open: boolean;
  phase: OtaUpdatePhase;
  /** 热更新包下载进度（0-100） */
  progress: number;
  error: string | null;
  setAvailable: (update: PendingOtaUpdate | null, options?: { openModal?: boolean }) => void;
  openModal: () => void;
  closeModal: () => void;
  dismissCurrent: () => void;
  setPhase: (phase: OtaUpdatePhase, options?: { progress?: number; error?: string | null }) => void;
  reset: () => void;
}

export function getDismissedOtaVersion(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_OTA_VERSION_KEY);
  } catch {
    return null;
  }
}

export function setDismissedOtaVersion(version: string): void {
  try {
    window.localStorage.setItem(DISMISSED_OTA_VERSION_KEY, version);
  } catch {
    // 忽略隐私模式或存储受限
  }
}

export function clearDismissedOtaVersion(): void {
  try {
    window.localStorage.removeItem(DISMISSED_OTA_VERSION_KEY);
  } catch {
    // 忽略
  }
}

export const useOtaStore = create<OtaStoreState>((set, get) => ({
  available: null,
  open: false,
  phase: 'idle',
  progress: 0,
  error: null,

  setAvailable: (update, options) => {
    const state = get();
    if (!update) {
      set({ available: null, open: false, phase: 'idle', progress: 0, error: null });
      return;
    }
    const busy = state.phase === 'downloading' || state.phase === 'applying';
    set({
      available: update,
      open: options?.openModal ? true : state.open,
      ...(busy ? {} : { phase: 'idle', progress: 0, error: null }),
    });
  },

  openModal: () => {
    const state = get();
    if (!state.available) return;
    const busy = state.phase === 'downloading' || state.phase === 'applying';
    set({
      open: true,
      ...(busy ? {} : { phase: 'idle', progress: 0, error: null }),
    });
  },

  closeModal: () => {
    const state = get();
    if (state.phase === 'downloading' || state.phase === 'applying') return;
    set({ open: false, phase: 'idle', error: null });
  },

  dismissCurrent: () => {
    const state = get();
    if (state.phase === 'downloading' || state.phase === 'applying') return;
    if (state.available) {
      setDismissedOtaVersion(state.available.latest.version);
    }
    set({ open: false, phase: 'idle', error: null });
  },

  setPhase: (phase, options) => {
    set((state) => ({
      phase,
      progress: options?.progress ?? state.progress,
      error: options && 'error' in options ? (options.error ?? null) : state.error,
    }));
  },

  reset: () => {
    set({ available: null, open: false, phase: 'idle', progress: 0, error: null });
  },
}));
