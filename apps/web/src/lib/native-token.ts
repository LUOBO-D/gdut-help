/**
 * App 端的 refresh token 存储。
 *
 * 网页端的 refresh token 在 HttpOnly Cookie 里；App 页面和 API 不同源，Cookie 用不了，
 * 只能由 JS 保存。存在 Preferences（安卓 SharedPreferences，应用私有目录，其他应用读不到），
 * 内存里再放一份，避免每次请求都去读存储。
 */
import { isNative } from './platform';
const KEY = 'gduthelp-refresh-token';
let cached: string | null | undefined;
// 注意返回模块而不是 Preferences 本身：Capacitor 插件对象是 Proxy，会把 .then 当成原生方法调用，
// 直接 await 它（或让 Promise 解析成它）会永远等不到结果
const prefs = () => import('@capacitor/preferences');
export async function getRefreshToken(): Promise<string | null> {
  if (!isNative) return null;
  if (cached === undefined) {
    const { Preferences } = await prefs();
    cached = (await Preferences.get({ key: KEY })).value;
  }
  return cached;
}
export async function setRefreshToken(token: string | null | undefined): Promise<void> {
  if (!isNative) return;
  cached = token ?? null;
  const { Preferences } = await prefs();
  await (token ? Preferences.set({ key: KEY, value: token }) : Preferences.remove({ key: KEY }));
}
