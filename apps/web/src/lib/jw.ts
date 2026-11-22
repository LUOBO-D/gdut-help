/**
 * 教务系统（jxfw.gdut.edu.cn）登录与请求。只在安卓 App 里使用。
 *
 * 用户在应用内浏览器里打开学校统一认证的登录页，自己完成登录（密码、扫码、滑块都由学校页面处理），
 * 我们的代码接触不到密码。应用内浏览器和 App 共用 WebView 的 Cookie（isIsolated: false），
 * 登录完成后，用 CapacitorHttp 在手机上直接请求教务系统：原生请求不受跨域限制，
 * 并且读写的就是同一份 Cookie。数据只在手机上解析，提交给我们服务器的只有整理好的课程。
 */
import { CapacitorHttp, type HttpResponse } from '@capacitor/core';
import { DefaultWebViewOptions, InAppBrowser } from '@capacitor/inappbrowser';

export const JW_ORIGIN = 'https://jxfw.gdut.edu.cn';
const LOGIN_URL = `https://authserver.gdut.edu.cn/authserver/login?service=${encodeURIComponent(`${JW_ORIGIN}/new/ssoLogin`)}`;

/** 应用内浏览器只允许打开这些域名：学校的页面，以及统一认证里 QQ / 微信登录会跳转的页面 */
const ALLOWED_HOSTS = [/(^|\.)gdut\.edu\.cn$/, /(^|\.)qq\.com$/];
const allowed = (url: string) => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && ALLOWED_HOSTS.some((re) => re.test(hostname));
  } catch {
    return false;
  }
};
/** 到了教务系统自己的页面（不再是统一认证），说明登录成功 */
const isLoggedInPage = (url: string) => url.startsWith(JW_ORIGIN) && !/\/(login|ssoLogin)\b/.test(url);

export interface JwLoginOptions {
  /** 登录成功后不自动关闭（调试时用来手动打开课表页） */
  keepOpen?: boolean;
}

/**
 * 打开统一认证登录页，等用户登录。登录成功返回 true；用户直接关掉返回 false。
 * 打开了不在白名单里的网站时自动关闭。
 */
export async function loginToJw({ keepOpen = false }: JwLoginOptions = {}): Promise<boolean> {
  let loggedIn = false;
  return new Promise<boolean>((resolve, reject) => {
    const handles: Promise<{ remove: () => Promise<void> }>[] = [];
    const finish = () => {
      for (const h of handles) void h.then((x) => x.remove());
      resolve(loggedIn);
    };
    handles.push(
      InAppBrowser.addListener('browserPageNavigationCompleted', ({ url = '' }) => {
        if (!url) return;
        if (!allowed(url)) {
          void InAppBrowser.close();
          return;
        }
        if (isLoggedInPage(url)) {
          loggedIn = true;
          if (!keepOpen) void InAppBrowser.close();
        }
      }),
      InAppBrowser.addListener('browserClosed', finish),
    );
    InAppBrowser.openInWebView({
      url: LOGIN_URL,
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
}

/** 请求教务系统。登录状态失效时，教务系统会跳回统一认证页，这里抛出 JwLoginRequired */
export class JwLoginRequired extends Error {
  constructor() {
    super('教务系统登录已过期，请重新登录');
    this.name = 'JwLoginRequired';
  }
}

/**
 * 登录失效时，教务系统不返回 401，而是返回登录页（状态码 200）：
 * 可能是统一认证页，也可能是教务系统自己的登录页（id="login_form"，带「/new/ssoLogin」链接）。
 * 注意：App 每次启动时 Capacitor 会清掉会话 Cookie，教务系统的登录状态也随之失效。
 */
function looksLikeLoginPage(url: string | undefined, body: string): boolean {
  if (url?.includes('authserver.gdut.edu.cn')) return true;
  const head = body.slice(0, 6000);
  return /authserver\/login|id=["']login_form["']/.test(head);
}

export async function jwRequest(path: string, init: { method?: 'GET' | 'POST'; data?: Record<string, string> } = {}): Promise<HttpResponse> {
  const { method = 'GET', data } = init;
  const res = await CapacitorHttp.request({
    url: `${JW_ORIGIN}${path}`,
    method,
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {}),
    },
    data: data ? new URLSearchParams(data).toString() : undefined,
    responseType: 'text',
  });
  const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  if (looksLikeLoginPage(res.url, body)) throw new JwLoginRequired();
  return res;
}

export interface JwSemester {
  /** 学期代码，例如 202601 表示 2026 秋季 */
  code: string;
  name: string;
}

/** 教务系统里可选的学期，以及默认选中的（当前学期） */
export async function jwSemesters(): Promise<{ list: JwSemester[]; current: JwSemester | null }> {
  const res = await jwRequest('/xsgrkbcx!getXsgrbkList.action');
  const html = String(res.data).replace(/\s+/g, ' ');
  const select = /<select[^>]*id=['"]xnxqdm['"][^>]*>(.*?)<\/select>/i.exec(html)?.[1];
  // 不是课表页（多半是登录状态失效后的其他页面），按需要重新登录处理
  if (select === undefined) throw new JwLoginRequired();
  const list: JwSemester[] = [];
  let current: JwSemester | null = null;
  for (const m of select.matchAll(/<option([^>]*)>([^<]*)/g)) {
    const code = /value=['"](\d{6})['"]/.exec(m[1]!)?.[1];
    if (!code) continue;
    const s = { code, name: m[2]!.trim() };
    list.push(s);
    if (/selected/.test(m[1]!)) current = s;
  }
  return { list, current: current ?? list[0] ?? null };
}

/** 整学期的课表原始数据（JSON 文本），交给 shared 里的 parseTimetableImport 解析 */
export async function jwTimetableJson(semesterCode: string): Promise<string> {
  const res = await jwRequest(`/xsgrkbcx!getKbRq.action?xnxqdm=${encodeURIComponent(semesterCode)}`);
  const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  try {
    JSON.parse(text);
  } catch {
    throw new JwLoginRequired();
  }
  return text;
}

/** 第 1 周星期一的日期（YYYY-MM-DD）。getKbRq 按周查询时，第二个数组是这一周每天的日期 */
export async function jwWeekOneMonday(semesterCode: string): Promise<string | null> {
  const res = await jwRequest(`/xsgrkbcx!getKbRq.action?xnxqdm=${encodeURIComponent(semesterCode)}&zc=1`);
  try {
    const json = JSON.parse(typeof res.data === 'string' ? res.data : JSON.stringify(res.data)) as unknown[];
    const days = (json[1] ?? []) as { xqmc?: string; rq?: string }[];
    const monday = days.find((d) => String(d.xqmc) === '1')?.rq;
    return monday && /^\d{4}-\d{2}-\d{2}$/.test(monday) ? monday : null;
  } catch {
    return null;
  }
}

function tryJsonText(raw: unknown): string | null {
  const text = (typeof raw === 'string' ? raw : JSON.stringify(raw)).trim();
  if (!text.startsWith('{') && !text.startsWith('[')) return null;
  try {
    JSON.parse(text);
    return text;
  } catch {
    return null;
  }
}

/**
 * 读取教务系统考试安排（乘方教务 xsksap）。
 * 1. 优先请求 /xsksap!getDataList.action（POST xnxqdm + 分页参数），返回 `{ total, rows: [...] }`；
 * 2. 若页面接口路径有定制差异，回退读取 /xsksap!xsksapList.action 探测真实 action 或直接提取表格 HTML。
 */
export async function jwExamsPayload(semesterCode: string): Promise<string> {
  const form = {
    xnxqdm: semesterCode,
    page: '1',
    rows: '100',
    sort: 'ksrq',
    order: 'asc',
  };

  const primary = await jwRequest('/xsksap!getDataList.action', { method: 'POST', data: form });
  const primaryJson = tryJsonText(primary.data);
  if (primaryJson) return primaryJson;

  // 回退读取考试安排列表页，探测页面内真实 AJAX 地址或服务端渲染表格
  const pageRes = await jwRequest(`/xsksap!xsksapList.action?xnxqdm=${encodeURIComponent(semesterCode)}`);
  const html = typeof pageRes.data === 'string' ? pageRes.data : JSON.stringify(pageRes.data);
  const pageJson = tryJsonText(html);
  if (pageJson) return pageJson;

  const actionMatch = /['"](\/?[a-zA-Z0-9_/-]*ks[a-zA-Z0-9_-]*![a-zA-Z0-9_]+\.action)['"]/i.exec(html);
  if (actionMatch?.[1]) {
    const discoveredPath = actionMatch[1].startsWith('/') ? actionMatch[1] : `/${actionMatch[1]}`;
    if (discoveredPath !== '/xsksap!getDataList.action') {
      const sub = await jwRequest(discoveredPath, { method: 'POST', data: form });
      const subJson = tryJsonText(sub.data);
      if (subJson) return subJson;
    }
  }

  if (/<tr\b/i.test(html)) return html;
  return '{"total":0,"rows":[]}';
}
