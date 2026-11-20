/**
 * 是否运行在安卓 App（Capacitor）里。
 *
 * 原生外壳会在页面脚本运行前注入 window.Capacitor，这里直接读它，
 * 不在首屏导入 @capacitor/core，网页端的首屏体积不受影响。
 */
export const isNative: boolean =
  typeof window !== 'undefined' &&
  Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
/**
 * API 地址。网页和 API 同源，用相对路径；
 * App 的页面来自 https://localhost，要用完整地址，打包时由 VITE_API_ORIGIN 指定（见 apps/web/.env.android.example）
 */
export const API_BASE = `${isNative ? (import.meta.env.VITE_API_ORIGIN ?? '') : ''}/api/v1`;
