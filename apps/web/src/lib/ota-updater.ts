import type { PluginListenerHandle } from '@capacitor/core';
import { InAppBrowser } from '@capacitor/inappbrowser';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { compareSemver, type AppUpdateCheckResponse } from '@gduthelp/shared';
import { api } from './api';
import {
  clearDismissedOtaVersion,
  getDismissedOtaVersion,
  useOtaStore,
  type PendingOtaUpdate,
} from './ota-store';
import { getApiOrigin, isNative } from './platform';
import { toast } from './toast-store';

/** 当前前端资源包版本（由构建时 VITE_APP_VERSION 注入） */
export const APP_BUNDLE_VERSION = (import.meta.env.VITE_APP_VERSION || '0.3.12').trim();

/** 当前安卓原生外壳 versionCode（与 android/app/build.gradle 保持同步） */
export const NATIVE_APP_VERSION = 6;

const CHECK_INTERVAL_MS = 30 * 60_000;
let initialized = false;
let checking = false;
let lastCheckedAt = 0;

export interface OtaInfo {
  bundleVersion: string;
  nativeVersion: number;
  isOtaActive: boolean;
}

export type OtaCheckResult =
  | { status: 'up-to-date'; currentVersion: string }
  | { status: 'available'; update: PendingOtaUpdate; prompted: boolean }
  | { status: 'error'; message: string };

async function resolveCurrentVersion(): Promise<OtaInfo> {
  try {
    const info = await CapacitorUpdater.current();
    const isOtaActive = info.bundle.id !== 'builtin';
    const bundleVersion = isOtaActive && info.bundle.version ? info.bundle.version : APP_BUNDLE_VERSION;
    return { bundleVersion, nativeVersion: NATIVE_APP_VERSION, isOtaActive };
  } catch {
    return { bundleVersion: APP_BUNDLE_VERSION, nativeVersion: NATIVE_APP_VERSION, isOtaActive: false };
  }
}

function resolveDownloadUrl(res: AppUpdateCheckResponse): string | null {
  if (res.downloadPath) {
    const origin = getApiOrigin();
    if (origin) return `${origin}${res.downloadPath}`;
  }
  return res.downloadUrl;
}

function resolveApkUrl(res: AppUpdateCheckResponse): string | null {
  if (res.latest?.apkUrl) return res.latest.apkUrl;
  if (res.apkPath) {
    const origin = getApiOrigin();
    if (origin) return `${origin}${res.apkPath}`;
  }
  return res.apkUrl ?? null;
}

function errorMessageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return '检查或下载更新失败，请稍后重试';
}

/**
 * 原生 App 启动时立即调用：
 * 1. 首先无条件调用 notifyAppReady() 告知原生层当前资源包健康，防止 10 秒超时回滚；
 * 2. 延迟 2.5 秒后静默检查一次服务端版本清单；若有新版本且用户未对当前版本选择「暂不更新」，
 *    弹出带更新说明的弹窗，由用户自主决定「立即更新」或「暂不更新」（不再静默下载或强制切换）。
 */
export async function initOtaUpdater(): Promise<void> {
  if (!isNative || initialized) return;
  initialized = true;

  try {
    await CapacitorUpdater.notifyAppReady();
  } catch {
    // 非原生环境或插件未就绪时忽略
  }

  window.setTimeout(() => {
    void checkForOtaUpdate({ interactive: false });
  }, 2500);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheckedAt >= CHECK_INTERVAL_MS) {
      void checkForOtaUpdate({ interactive: false });
    }
  });
}

export async function getOtaInfo(): Promise<OtaInfo> {
  if (!isNative) {
    return { bundleVersion: APP_BUNDLE_VERSION, nativeVersion: NATIVE_APP_VERSION, isOtaActive: false };
  }
  return resolveCurrentVersion();
}

/**
 * 检查是否有新版本可用：
 * - `interactive: false`（启动/切回前台自动检查）：仅在未暂缓过该版本时弹出更新说明弹窗，失败不打扰用户；
 * - `interactive: true`（用户手动点击「检查更新」）：忽略暂缓记录，有新版本直接展示更新说明弹窗。
 */
export async function checkForOtaUpdate(options: { interactive?: boolean } = {}): Promise<OtaCheckResult> {
  const interactive = options.interactive ?? false;
  if (!isNative) {
    return { status: 'up-to-date', currentVersion: APP_BUNDLE_VERSION };
  }
  if (checking) {
    return { status: 'error', message: '正在检查更新，请稍候…' };
  }
  checking = true;
  lastCheckedAt = Date.now();
  try {
    const current = await resolveCurrentVersion();
    const res = await api<AppUpdateCheckResponse>('/app/update');
    const latest = res.latest;
    if (!latest || compareSemver(latest.version, current.bundleVersion) <= 0) {
      useOtaStore.getState().setAvailable(null);
      return { status: 'up-to-date', currentVersion: current.bundleVersion };
    }

    const needsNativeUpgrade = latest.minNativeVersion > NATIVE_APP_VERSION;
    const downloadUrl = resolveDownloadUrl(res);
    const apkUrl = resolveApkUrl(res);

    if (!needsNativeUpgrade) {
      if (!latest.sha256) {
        return { status: 'error', message: '服务端更新清单缺少 SHA-256 校验值' };
      }
      if (!downloadUrl || !downloadUrl.startsWith('https://')) {
        return { status: 'error', message: '热更新下载地址必须是 HTTPS，请检查服务器地址设置' };
      }
    }

    const update: PendingOtaUpdate = {
      latest,
      currentVersion: current.bundleVersion,
      downloadUrl: needsNativeUpgrade ? null : downloadUrl,
      apkUrl,
      needsNativeUpgrade,
    };

    const shouldPrompt = interactive || getDismissedOtaVersion() !== latest.version;
    useOtaStore.getState().setAvailable(update, { openModal: shouldPrompt });
    return { status: 'available', update, prompted: shouldPrompt };
  } catch (err) {
    return { status: 'error', message: errorMessageOf(err) };
  } finally {
    checking = false;
  }
}

/** 用户在更新弹窗点击「立即更新」后执行：热更新带进度下载并切换，或大版本打开云端 APK 下载链接 */
export async function applyPendingOtaUpdate(): Promise<void> {
  const store = useOtaStore.getState();
  const pending = store.available;
  if (!pending) return;
  if (store.phase === 'downloading' || store.phase === 'applying') return;

  if (pending.needsNativeUpgrade) {
    if (!pending.apkUrl || !pending.apkUrl.startsWith('https://')) {
      store.setPhase('error', { error: '此版本包含安全架构升级，请使用 HTTPS 官方地址获取新版安装包' });
      return;
    }
    try {
      await InAppBrowser.openInExternalBrowser({ url: pending.apkUrl });
    } catch {
      window.open(pending.apkUrl, '_blank', 'noopener,noreferrer');
    }
    toast.info('已在系统浏览器打开新版安装包下载');
    useOtaStore.getState().closeModal();
    return;
  }

  if (!isNative) {
    toast.info('网页端刷新即可使用最新版本');
    useOtaStore.getState().closeModal();
    return;
  }

  const { latest, downloadUrl } = pending;
  if (!latest.sha256 || !downloadUrl || !downloadUrl.startsWith('https://')) {
    store.setPhase('error', { error: '更新地址或校验信息不完整，请稍后重试' });
    return;
  }

  store.setPhase('downloading', { progress: 0, error: null });
  let listener: PluginListenerHandle | null = null;
  try {
    listener = await CapacitorUpdater.addListener('updaterEvent', (event) => {
      if (event.type === 'download') {
        const pct = Math.max(0, Math.min(100, Math.round(event.data.percent)));
        useOtaStore.getState().setPhase('downloading', { progress: pct });
      }
    });

    const existing = await CapacitorUpdater.list();
    const already = existing.bundles.find(
      (b) => b.version === latest.version && (b.status === 'success' || b.status === 'pending'),
    );
    let bundle = already;
    if (!bundle) {
      bundle = await CapacitorUpdater.download({
        url: downloadUrl,
        version: latest.version,
        checksum: latest.sha256.toLowerCase(),
      });
    }

    useOtaStore.getState().setPhase('applying', { progress: 100, error: null });
    clearDismissedOtaVersion();
    toast.success(`更新完成，正在切换到 v${latest.version}…`);
    await CapacitorUpdater.set({ id: bundle.id });
  } catch (err) {
    useOtaStore.getState().setPhase('error', { error: errorMessageOf(err) });
  } finally {
    if (listener) {
      await listener.remove().catch(() => undefined);
    }
  }
}
