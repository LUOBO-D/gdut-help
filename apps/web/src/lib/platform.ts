/**
 * 是否运行在安卓 App（Capacitor）里。
 *
 * 原生外壳会在页面脚本运行前注入 window.Capacitor，这里直接读它，
 * 不在首屏导入 @capacitor/core，网页端的首屏体积不受影响。
 */
export const isNative: boolean =
  typeof window !== 'undefined' &&
  Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

/** 当前安卓原生外壳 versionCode（与 android/app/build.gradle 保持同步） */
export const NATIVE_APP_VERSION = 7;

const API_ORIGIN_KEY = 'gduthelp-api-origin';

/** 打包时写入的默认后端地址（网页端为空，使用同源相对路径） */
export const DEFAULT_API_ORIGIN: string = isNative
  ? (import.meta.env.VITE_API_ORIGIN ?? '').trim().replace(/\/+$/, '')
  : '';

export function normalizeApiOrigin(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/v1$/i, '')
    .replace(/\/api$/i, '');
}

/** 读取当前生效的后端 Origin；App 端支持在登录页动态切换服务器地址，换隧道或迁云服务器无需重打包 */
export function getApiOrigin(): string {
  if (!isNative) return '';
  try {
    const custom = window.localStorage.getItem(API_ORIGIN_KEY);
    if (custom && /^https?:\/\//i.test(custom)) return normalizeApiOrigin(custom);
  } catch {
    // 忽略存储读取异常，回退打包默认地址
  }
  return DEFAULT_API_ORIGIN;
}

export function setApiOriginOverride(raw: string): string {
  const cleaned = normalizeApiOrigin(raw);
  try {
    if (!cleaned || cleaned === DEFAULT_API_ORIGIN) {
      window.localStorage.removeItem(API_ORIGIN_KEY);
      return DEFAULT_API_ORIGIN;
    }
    window.localStorage.setItem(API_ORIGIN_KEY, cleaned);
  } catch {
    // 忽略
  }
  return cleaned;
}

export function getApiBase(): string {
  return `${getApiOrigin()}/api/v1`;
}
