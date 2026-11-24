/**
 * App 端的 refresh token 存储（Android Keystore AES-256-GCM 硬件密钥库优先）。
 *
 * 1. 新版正式签名外壳（v7+）优先使用原生 SecureTokenPlugin（AndroidKeyStore AES-256-GCM）加密保存；
 * 2. 首次读取时若发现历史明文 Preferences 中存在旧令牌，自动无感迁移至加密存储并销毁旧明文；
 * 3. 若处于尚未安装原生插件的旧壳或过渡热更环境，平滑回退到 @capacitor/preferences。
 */
import { isNative } from './platform';

const KEY = 'gduthelp-refresh-token';
let cached: string | null | undefined;

interface SecureTokenBridge {
  set(options: { key: string; value: string }): Promise<{ ok: boolean; encrypted: boolean }>;
  get(options: { key: string }): Promise<{ value: string | null; encrypted: boolean }>;
  remove(options: { key: string }): Promise<{ ok: boolean }>;
  status(): Promise<{ available: boolean; hardwareBacked: boolean; algorithm: string }>;
}

export interface TokenStorageStatus {
  available: boolean;
  hardwareBacked: boolean;
  algorithm: string;
}

let securePluginPromise: Promise<SecureTokenBridge | null> | null = null;

async function getSecurePlugin(): Promise<SecureTokenBridge | null> {
  if (!isNative) return null;
  if (!securePluginPromise) {
    securePluginPromise = import('@capacitor/core')
      .then(async ({ Capacitor, registerPlugin }) => {
        if (!Capacitor.isPluginAvailable('SecureToken')) return null;
        return registerPlugin<SecureTokenBridge>('SecureToken');
      })
      .catch(() => null);
  }
  return securePluginPromise;
}

// 注意返回模块而不是 Preferences 本身：Capacitor 插件对象是 Proxy，会把 .then 当成原生方法调用
const prefs = () => import('@capacitor/preferences');

export async function getRefreshToken(): Promise<string | null> {
  if (!isNative) return null;
  if (cached !== undefined) return cached;

  const secure = await getSecurePlugin();
  if (secure) {
    try {
      const res = await secure.get({ key: KEY });
      if (res.value) {
        cached = res.value;
        return cached;
      }
      // 自动迁移旧版 Preferences 中的明文令牌至硬件加密存储，并删除旧明文
      const { Preferences } = await prefs();
      const legacy = (await Preferences.get({ key: KEY })).value;
      if (legacy) {
        await secure.set({ key: KEY, value: legacy });
        await Preferences.remove({ key: KEY }).catch(() => undefined);
        cached = legacy;
        return cached;
      }
      cached = null;
      return null;
    } catch {
      // 回退到 Preferences
    }
  }

  const { Preferences } = await prefs();
  cached = (await Preferences.get({ key: KEY })).value;
  return cached;
}

export async function setRefreshToken(token: string | null | undefined): Promise<void> {
  if (!isNative) return;
  cached = token ?? null;

  const secure = await getSecurePlugin();
  if (secure) {
    try {
      if (token) {
        await secure.set({ key: KEY, value: token });
      } else {
        await secure.remove({ key: KEY });
      }
      // 确保旧明文存储被彻底清理
      const { Preferences } = await prefs();
      await Preferences.remove({ key: KEY }).catch(() => undefined);
      return;
    } catch {
      // 回退到 Preferences
    }
  }

  const { Preferences } = await prefs();
  await (token ? Preferences.set({ key: KEY, value: token }) : Preferences.remove({ key: KEY }));
}

export async function getTokenStorageStatus(): Promise<TokenStorageStatus> {
  if (!isNative) {
    return { available: true, hardwareBacked: false, algorithm: 'HttpOnly + SameSite=Strict Cookie' };
  }
  const secure = await getSecurePlugin();
  if (!secure) {
    return { available: false, hardwareBacked: false, algorithm: '应用私有目录（建议升级至 v0.3.13 正式版启用硬件加密）' };
  }
  try {
    return await secure.status();
  } catch {
    return { available: false, hardwareBacked: false, algorithm: '应用私有目录' };
  }
}
