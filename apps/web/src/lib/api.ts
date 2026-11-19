import { ErrorCode, type ApiResponse, type AuthSession } from '@gduthelp/shared';
import { useAuth } from './auth-store';

const BASE = '/api/v1';
export const NETWORK_ERROR = 'NETWORK_ERROR';
/** access token 剩余不足这么久时，先刷新再发请求 */
const REFRESH_AHEAD_MS = 30_000;

export class ApiError extends Error {
  readonly code: string;
  /** HTTP 状态码；网络错误时为 0 */
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** 默认 true：带上 access token，401 时自动刷新一次后重试 */
  auth?: boolean;
  signal?: AbortSignal;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { auth = true } = opts;
  if (auth) {
    const { accessToken, expiresAt } = useAuth.getState();
    if (accessToken && expiresAt - Date.now() < REFRESH_AHEAD_MS) await refreshSession();
  }

  try {
    return await send<T>(path, opts);
  } catch (err) {
    if (auth && err instanceof ApiError && err.code === ErrorCode.UNAUTHORIZED && (await refreshSession())) {
      return send<T>(path, opts);
    }
    throw err;
  }
}

async function send<T>(path: string, { method = 'GET', body, auth = true, signal }: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = useAuth.getState().accessToken;
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(NETWORK_ERROR, '网络连接失败，请检查网络', 0);
  }

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!json) throw new ApiError(ErrorCode.INTERNAL_ERROR, '服务器返回了无法识别的内容', res.status);
  if (!res.ok || json.code !== 0) throw new ApiError(String(json.code), json.message, res.status);
  return json.data;
}

let inflight: Promise<boolean> | null = null;

/**
 * 用 Cookie 中的刷新令牌换新的 access token。
 * 同一页面内合并并发调用；多个标签页之间用 Web Locks 串行，避免同一个刷新令牌被同时使用。
 */
export function refreshSession(): Promise<boolean> {
  inflight ??= runExclusive(doRefresh).finally(() => {
    inflight = null;
  });
  return inflight;
}

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  return navigator.locks ? navigator.locks.request('gduthelp-auth-refresh', fn) : fn();
}

async function doRefresh(): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const session = await send<AuthSession>('/auth/refresh', { method: 'POST', auth: false });
      useAuth.getState().setSession(session);
      return true;
    } catch (err) {
      // 409：另一个请求刚轮换了令牌，稍等后用新 Cookie 重试
      if (err instanceof ApiError && err.status === 409 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      // 网络不通时不退出登录：用本地保存的资料进入离线模式，恢复联网后再刷新
      if (err instanceof ApiError && err.code === NETWORK_ERROR && useAuth.getState().enterOffline()) return false;
      break;
    }
  }
  useAuth.getState().clear();
  return false;
}

export async function logout(): Promise<void> {
  try {
    await send<null>('/auth/logout', { method: 'POST', auth: false });
  } finally {
    useAuth.getState().clear();
    const { clearQueryCache } = await import('./query-client');
    await clearQueryCache();
  }
}
