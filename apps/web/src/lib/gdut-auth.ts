/**
 * 广东工业大学统一身份认证网关与三层长效会话保活引擎（仅安卓端激活，数据全程本机直连学校）。
 *
 * 所有需要访问广工教务/二课/公选课的功能统一走本模块，实现「一次认证、全 App 复用」：
 * 1. 持久 Cookie 写入：拦截学校 Set-Cookie 并写入显式过期时间，防止 Capacitor 启动时 removeSessionCookies() 清空登录态；
 * 2. CAS 静默无感续期：教务子系统 JSESSIONID 闲置过期时，自动在后台复用 authserver.gdut.edu.cn 票据换取新会话并重试原请求，零弹窗打扰；
 * 3. 前台轻量心跳保活：App 处于前台且已连接认证时每 15 分钟保活一次，大幅延长学校会话存活期。
 */
import { CapacitorCookies, CapacitorHttp, type HttpResponse } from '@capacitor/core';
import { DefaultWebViewOptions, InAppBrowser } from '@capacitor/inappbrowser';
import { parseExamImport, parseTimetableImport, type CreditPlan } from '@gduthelp/shared';
import type { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { api } from './api';
import { isNative } from './platform';
import { keys } from './queries';

export const JW_ORIGIN = 'https://jxfw.gdut.edu.cn';
export const AUTH_ORIGIN = 'https://authserver.gdut.edu.cn';
export const EHALL_ORIGIN = 'https://ehall.gdut.edu.cn';

const ALLOWED_HOSTS = [/(^|\.)gdut\.edu\.cn$/, /(^|\.)qq\.com$/];
const STORAGE_KEY = 'gduthelp-gdut-auth-state';
const KEEP_ALIVE_INTERVAL_MS = 15 * 60 * 1000;
const COOKIE_PERSIST_DAYS = 14;

export type GdutAuthStatus = 'disconnected' | 'connected' | 'expired';

interface PersistedAuthState {
  status: GdutAuthStatus;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  lastSyncAllAt: string | null;
  /** 安全隐私模式：全量同步完成后自动清除本机教务 Cookie（用完即焚），默认开启 */
  autoClearAfterSync: boolean;
}

interface GdutAuthStore extends PersistedAuthState {
  markConnected: () => void;
  markVerified: () => void;
  markExpired: () => void;
  markDisconnected: (options?: { keepSyncMeta?: boolean }) => void;
  markSyncAll: () => void;
  setAutoClearAfterSync: (enabled: boolean) => void;
}

function loadState(): PersistedAuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedAuthState>;
      const status: GdutAuthStatus =
        parsed.status === 'connected' || parsed.status === 'expired' ? parsed.status : 'disconnected';
      return {
        status,
        connectedAt: typeof parsed.connectedAt === 'string' ? parsed.connectedAt : null,
        lastVerifiedAt: typeof parsed.lastVerifiedAt === 'string' ? parsed.lastVerifiedAt : null,
        lastSyncAllAt: typeof parsed.lastSyncAllAt === 'string' ? parsed.lastSyncAllAt : null,
        autoClearAfterSync: typeof parsed.autoClearAfterSync === 'boolean' ? parsed.autoClearAfterSync : true,
      };
    }
  } catch {
    // ignore
  }
  return {
    status: 'disconnected',
    connectedAt: null,
    lastVerifiedAt: null,
    lastSyncAllAt: null,
    autoClearAfterSync: true,
  };
}

function saveState(state: PersistedAuthState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export const useGdutAuthStore = create<GdutAuthStore>((set, get) => ({
  ...loadState(),
  markConnected: () => {
    const now = new Date().toISOString();
    const prev = get();
    const next: PersistedAuthState = {
      ...prev,
      status: 'connected',
      connectedAt: now,
      lastVerifiedAt: now,
    };
    saveState(next);
    set(next);
  },
  markVerified: () => {
    const now = new Date().toISOString();
    const prev = get();
    const next: PersistedAuthState = {
      status: 'connected',
      connectedAt: prev.connectedAt ?? now,
      lastVerifiedAt: now,
      lastSyncAllAt: prev.lastSyncAllAt,
      autoClearAfterSync: prev.autoClearAfterSync,
    };
    saveState(next);
    set(next);
  },
  markExpired: () => {
    const prev = get();
    if (prev.status === 'disconnected') return;
    const next: PersistedAuthState = { ...prev, status: 'expired' };
    saveState(next);
    set(next);
  },
  markDisconnected: (options) => {
    const prev = get();
    const next: PersistedAuthState = {
      status: 'disconnected',
      connectedAt: null,
      lastVerifiedAt: null,
      lastSyncAllAt: options?.keepSyncMeta ? prev.lastSyncAllAt : null,
      autoClearAfterSync: prev.autoClearAfterSync,
    };
    saveState(next);
    set(next);
  },
  markSyncAll: () => {
    const now = new Date().toISOString();
    const prev = get();
    const next: PersistedAuthState = {
      status: 'connected',
      connectedAt: prev.connectedAt ?? now,
      lastVerifiedAt: now,
      lastSyncAllAt: now,
      autoClearAfterSync: prev.autoClearAfterSync,
    };
    saveState(next);
    set(next);
  },
  setAutoClearAfterSync: (enabled) => {
    const prev = get();
    const next: PersistedAuthState = {
      status: prev.status,
      connectedAt: prev.connectedAt,
      lastVerifiedAt: prev.lastVerifiedAt,
      lastSyncAllAt: prev.lastSyncAllAt,
      autoClearAfterSync: enabled,
    };
    saveState(next);
    set(next);
  },
}));

/** 统一认证失效错误（仅在 CAS 静默续期也失败时抛出） */
export class GdutAuthRequired extends Error {
  constructor(message = '广工统一认证已过期，请前往「我的 → 广工统一认证」重新验证') {
    super(message);
    this.name = 'GdutAuthRequired';
  }
}

const isAllowedUrl = (url: string) => {
  try {
    const { protocol, hostname } = new URL(url);
    return (protocol === 'https:' || protocol === 'http:') && ALLOWED_HOSTS.some((re) => re.test(hostname));
  } catch {
    return false;
  }
};

export function looksLikeSchoolLoginPage(url: string | undefined, body: string): boolean {
  if (url?.includes('authserver.gdut.edu.cn')) return true;
  const head = body.slice(0, 6000);
  return /authserver\/login|id=["']login_form["']|统一身份认证/.test(head);
}

const COOKIE_ATTR_KEYS = new Set(['path', 'domain', 'expires', 'max-age', 'secure', 'httponly', 'samesite', 'priority']);

/**
 * 第一层保活：将学校返回的会话 Cookie 以显式过期时间写入 WebView CookieManager，
 * 避免 Capacitor 冷启动调用 removeSessionCookies() 时将其清空。
 */
async function persistResponseCookies(originUrl: string, headers: Record<string, string> | undefined): Promise<void> {
  if (!isNative || !headers) return;
  // 开启「用完即焚」安全模式时，不把学校会话 Cookie 写入 14 天持久存储
  if (useGdutAuthStore.getState().autoClearAfterSync) return;
  const setCookieKey = Object.keys(headers).find((k) => k.toLowerCase() === 'set-cookie');
  const rawHeader = setCookieKey ? headers[setCookieKey] : undefined;
  if (!rawHeader) return;

  const expires = new Date(Date.now() + COOKIE_PERSIST_DAYS * 24 * 3600 * 1000).toUTCString();
  // Set-Cookie 合并头可能包含逗号（Expires 中的星期逗号需要避开）
  const entries = rawHeader.split(/,(?=\s*[^;=,\s]+=)/);
  for (const entry of entries) {
    const firstPart = entry.split(';')[0]?.trim();
    if (!firstPart) continue;
    const eq = firstPart.indexOf('=');
    if (eq <= 0) continue;
    const key = firstPart.slice(0, eq).trim();
    const value = firstPart.slice(eq + 1).trim();
    if (!key || !value || COOKIE_ATTR_KEYS.has(key.toLowerCase())) continue;
    try {
      await CapacitorCookies.setCookie({
        url: originUrl,
        key,
        value,
        path: '/',
        expires,
      });
    } catch {
      // 忽略单条写入失败
    }
  }
}

const renewFlights = new Map<string, Promise<boolean>>();

/**
 * 第二层保活：CAS 静默无感续期。
 * 当子系统（如 jxfw / ehall）JSESSIONID 闲置过期时，后台用 authserver 的有效 CAS 票据
 * 自动走一次 SSO 跳转签发新会话，用户全程无感、不弹登录页。
 */
export async function trySilentCasRenew(targetOrigin: string = JW_ORIGIN): Promise<boolean> {
  if (!isNative) return false;
  const inflight = renewFlights.get(targetOrigin);
  if (inflight) return inflight;

  const task = (async () => {
    try {
      const serviceUrl =
        targetOrigin === EHALL_ORIGIN ? `${EHALL_ORIGIN}/login` : `${JW_ORIGIN}/new/ssoLogin`;
      const ssoUrl = `${AUTH_ORIGIN}/authserver/login?service=${encodeURIComponent(serviceUrl)}`;
      const res = await CapacitorHttp.get({
        url: ssoUrl,
        headers: { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
        responseType: 'text',
      });
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      await persistResponseCookies(targetOrigin, res.headers);
      await persistResponseCookies(AUTH_ORIGIN, res.headers);

      if (!looksLikeSchoolLoginPage(res.url, body) && (res.url?.startsWith(targetOrigin) || res.status < 400)) {
        useGdutAuthStore.getState().markVerified();
        return true;
      }
      useGdutAuthStore.getState().markExpired();
      return false;
    } catch {
      return false;
    }
  })();

  const wrapped = task.finally(() => {
    renewFlights.delete(targetOrigin);
  });
  renewFlights.set(targetOrigin, wrapped);
  return wrapped;
}

/**
 * 全应用统一的广工学校系统请求网关：
 * - 自动携带本机 WebView 共享 Cookie；
 * - 响应返回新 Cookie 时自动持久化写入；
 * - 遇到登录态过期时先自动尝试一次 CAS 静默无感续期并重试，彻底失效才抛出 GdutAuthRequired。
 */
export async function gdutRequest(
  origin: string,
  path: string,
  init: { method?: 'GET' | 'POST'; data?: Record<string, string>; allowSilentRenew?: boolean } = {},
): Promise<HttpResponse> {
  const { method = 'GET', data, allowSilentRenew = true } = init;
  const fullUrl = path.startsWith('http') ? path : `${origin}${path}`;

  const exec = async () => {
    const res = await CapacitorHttp.request({
      url: fullUrl,
      method,
      headers: {
        Accept: 'application/json, text/javascript, text/html, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {}),
      },
      data: data ? new URLSearchParams(data).toString() : undefined,
      responseType: 'text',
    });
    await persistResponseCookies(origin, res.headers);
    return res;
  };

  let res = await exec();
  let body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

  if (looksLikeSchoolLoginPage(res.url, body)) {
    if (allowSilentRenew) {
      const renewed = await trySilentCasRenew(origin);
      if (renewed) {
        res = await exec();
        body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        if (!looksLikeSchoolLoginPage(res.url, body)) {
          useGdutAuthStore.getState().markVerified();
          return res;
        }
      }
    }
    useGdutAuthStore.getState().markExpired();
    throw new GdutAuthRequired();
  }

  useGdutAuthStore.getState().markVerified();
  return res;
}

export interface ConnectGdutOptions {
  keepOpen?: boolean;
  targetOrigin?: string;
}

/**
 * 打开广工官方统一身份认证页（一次登录同时打通教务、课表、考试、绩点、学分、空教室、公选课与二课）。
 * 登录成功后自动加固会话 Cookie 并更新全局认证状态。
 */
export async function connectGdutAuth({
  keepOpen = false,
  targetOrigin = JW_ORIGIN,
}: ConnectGdutOptions = {}): Promise<boolean> {
  if (!isNative) return false;
  const serviceUrl = targetOrigin === EHALL_ORIGIN ? `${EHALL_ORIGIN}/login` : `${JW_ORIGIN}/new/ssoLogin`;
  const loginUrl = `${AUTH_ORIGIN}/authserver/login?service=${encodeURIComponent(serviceUrl)}`;

  const isSuccessUrl = (url: string) => {
    if (targetOrigin === EHALL_ORIGIN) {
      return url.startsWith(EHALL_ORIGIN) && !/login/i.test(url);
    }
    return url.startsWith(JW_ORIGIN) && !/\/(login|ssoLogin)\b/i.test(url);
  };

  let loggedIn = false;
  await new Promise<void>((resolve, reject) => {
    const handles: Promise<{ remove: () => Promise<void> }>[] = [];
    const finish = () => {
      for (const h of handles) void h.then((x) => x.remove());
      resolve();
    };
    handles.push(
      InAppBrowser.addListener('browserPageNavigationCompleted', ({ url = '' }) => {
        if (!url) return;
        if (!isAllowedUrl(url)) {
          void InAppBrowser.close();
          return;
        }
        if (isSuccessUrl(url)) {
          loggedIn = true;
          if (!keepOpen) void InAppBrowser.close();
        }
      }),
      InAppBrowser.addListener('browserClosed', finish),
    );
    InAppBrowser.openInWebView({
      url: loginUrl,
      options: {
        ...DefaultWebViewOptions,
        showURL: true,
        showToolbar: true,
        showNavigationButtons: true,
        closeButtonText: '关闭',
        android: { ...DefaultWebViewOptions.android, isIsolated: false, hardwareBack: true },
      },
    }).catch((err: unknown) => {
      for (const h of handles) void h.then((x) => x.remove());
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });

  if (loggedIn) {
    useGdutAuthStore.getState().markConnected();
    // 立即用轻量请求触发一次 Cookie 持久化写入，并预热教务会话
    void gdutRequest(JW_ORIGIN, '/xsgrkbcx!getXsgrbkList.action', { allowSilentRenew: true }).catch(() => undefined);
  }
  return loggedIn;
}

/** 主动注销本机保存的广工统一认证与教务会话 */
export async function disconnectGdutAuth(options?: { keepSyncMeta?: boolean }): Promise<void> {
  if (isNative) {
    for (const url of [JW_ORIGIN, AUTH_ORIGIN, EHALL_ORIGIN]) {
      try {
        await CapacitorCookies.clearCookies({ url });
      } catch {
        // ignore
      }
    }
    try {
      await CapacitorCookies.clearAllCookies();
    } catch {
      // ignore
    }
  }
  useGdutAuthStore.getState().markDisconnected(options);
}

let lastKeepAliveAt = 0;

/**
 * 第三层保活：前台轻量心跳（在 AppShell 挂载一次）。
 * 当用户关闭「用完即焚」且已连接广工认证时，每 15 分钟静默保活一次。
 */
export function initGdutSessionKeepAlive(): () => void {
  if (!isNative) return () => undefined;

  const ping = () => {
    const { status, autoClearAfterSync } = useGdutAuthStore.getState();
    if (status === 'disconnected' || autoClearAfterSync) return;
    const now = Date.now();
    if (now - lastKeepAliveAt < KEEP_ALIVE_INTERVAL_MS) return;
    lastKeepAliveAt = now;
    void gdutRequest(JW_ORIGIN, '/xsgrkbcx!getXsgrbkList.action', { allowSilentRenew: true }).catch(() => undefined);
  };

  const timer = window.setTimeout(ping, 2500);
  const interval = window.setInterval(ping, KEEP_ALIVE_INTERVAL_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') ping();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    window.clearTimeout(timer);
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export interface SyncAllResult {
  ok: boolean;
  cancelled?: boolean;
  summary: string;
}

/**
 * 「我的 → 广工统一认证」一键全量同步：
 * 复用同一个统一认证会话，一次拉齐 本学期课表 + 考试安排 + 全部成绩/绩点 + 毕业学分进度。
 */
export async function syncAllFromGdut(queryClient: QueryClient, currentPlan: CreditPlan): Promise<SyncAllResult> {
  if (!isNative) {
    return { ok: false, summary: '网页端受跨域限制，请在安卓 App 中使用一键同步' };
  }

  const jw = await import('./jw');
  const { syncCreditAuditFromSchool } = await import('./scores-sync');

  const ensureSem = async () => {
    try {
      return await jw.jwSemesters();
    } catch (err) {
      if (!(err instanceof GdutAuthRequired)) throw err;
      const ok = await connectGdutAuth();
      if (!ok) return null;
      return jw.jwSemesters();
    }
  };

  try {
    const semInfo = await ensureSem();
    if (!semInfo) return { ok: false, cancelled: true, summary: '已取消广工统一认证' };
    const currentSem = semInfo.current ?? semInfo.list[0];
    const parts: string[] = [];

    if (currentSem) {
      // 1. 课表同步
      try {
        const [kbJson, weekOne] = await Promise.all([
          jw.jwTimetableJson(currentSem.code),
          jw.jwWeekOneMonday(currentSem.code).catch(() => null),
        ]);
        const parsed = parseTimetableImport(kbJson);
        if (parsed.courses.length > 0) {
          await api('/timetable/import', {
            method: 'POST',
            body: {
              courses: parsed.courses,
              removeMissing: true,
              weekOneMonday: weekOne ?? undefined,
              semesterName: currentSem.name,
            },
          });
          await queryClient.invalidateQueries({ queryKey: keys.timetable });
          parts.push(`课表 ${parsed.courses.length} 门`);
        }
      } catch {
        // 单项失败不中断后续同步
      }

      // 2. 考试安排同步
      try {
        const examRaw = await jw.jwExamsPayload(currentSem.code);
        const examParsed = parseExamImport(examRaw);
        if (examParsed.exams.length > 0) {
          await api('/exams/import', {
            method: 'POST',
            body: { exams: examParsed.exams, removeMissing: true },
          });
          await queryClient.invalidateQueries({ queryKey: keys.exams });
          parts.push(`考试 ${examParsed.exams.length} 场`);
        }
      } catch {
        // 忽略考试接口异常
      }
    }

    // 3. 成绩 + 绩点 + 学分进度
    const gradeOutcome = await syncCreditAuditFromSchool({
      interactive: false,
      queryClient,
      currentPlan,
    });
    if (gradeOutcome.status === 'synced') {
      parts.push(`成绩/学分已更新`);
    }

    await queryClient.invalidateQueries({ queryKey: keys.sharedCoursesPrefix });
    useGdutAuthStore.getState().markSyncAll();

    const shouldAutoClear = useGdutAuthStore.getState().autoClearAfterSync;
    if (shouldAutoClear) {
      await disconnectGdutAuth({ keepSyncMeta: true });
    }

    const baseSummary = parts.length > 0 ? `已同步：${parts.join(' · ')}` : '已验证广工认证并完成数据核对';
    return {
      ok: true,
      summary: shouldAutoClear ? `${baseSummary}（已自动清除本机教务 Cookie）` : baseSummary,
    };
  } catch (err) {
    return {
      ok: false,
      summary: err instanceof Error ? err.message : '全量同步失败，请检查校园网连接后重试',
    };
  }
}
