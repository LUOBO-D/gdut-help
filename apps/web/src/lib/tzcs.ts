/**
 * 广东工业大学体质测试查询系统（tzcs.gdut.edu.cn）直连查询。只在安卓 App 内使用。
 *
 * 与教务系统（jw.ts）采用同样的零密码架构：
 * - 首次或在登录态失效时弹出官方页面由本人完成登录（不接触密码或身份证后 6 位）；
 * - 共用 WebView Cookie（isIsolated: false），登录态有效期内可直接静默刷新本学年体测成绩。
 */
import { CapacitorHttp, type HttpResponse } from '@capacitor/core';
import { DefaultWebViewOptions, InAppBrowser } from '@capacitor/inappbrowser';
import { jwFitnessProbe } from './jw';

const TZCS_ORIGINS = ['https://tzcs.gdut.edu.cn', 'http://tzcs.gdut.edu.cn'] as const;
const ALLOWED_TZCS_HOSTS = [/(^|\.)gdut\.edu\.cn$/, /(^|\.)qq\.com$/];

function isAllowedTzcsUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    // 仅放行校园内网体测域名使用 http，其他域名强制 https
    if (protocol === 'http:' && hostname !== 'tzcs.gdut.edu.cn') return false;
    return ALLOWED_TZCS_HOSTS.some((re) => re.test(hostname));
  } catch {
    return false;
  }
}

function isTzcsLoggedInUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname !== 'tzcs.gdut.edu.cn') return false;
    return !/\/(login|signin|auth|cas|sso)\b/i.test(u.pathname) && u.pathname.length > 1;
  } catch {
    return false;
  }
}

export class TzcsLoginRequired extends Error {
  constructor() {
    super('体测系统登录已过期，请重新登录');
    this.name = 'TzcsLoginRequired';
  }
}

export class TzcsNetworkError extends Error {
  constructor(message = '无法连接广工体测系统（tzcs.gdut.edu.cn），请先连接校园网或学校 VPN 后重试') {
    super(message);
    this.name = 'TzcsNetworkError';
  }
}

function looksLikeLoginHtml(url: string | undefined, body: string): boolean {
  if (url?.includes('authserver.gdut.edu.cn')) return true;
  if (/\/login\b/i.test(url ?? '')) return true;
  const head = body.slice(0, 6000);
  return /type=["']password["']|authserver\/login|id=["']login/i.test(head) && !/肺活量|立定跳远|坐位体前屈/.test(body);
}

async function resolveReachableOrigin(): Promise<string> {
  for (const origin of TZCS_ORIGINS) {
    try {
      const res = await CapacitorHttp.request({
        url: origin,
        method: 'GET',
        connectTimeout: 4500,
        readTimeout: 4500,
        responseType: 'text',
      });
      if (res.status > 0 && res.status < 500) return origin;
    } catch {
      // 尝试下一个协议
    }
  }
  throw new TzcsNetworkError();
}

/**
 * 打开广工官方体测查询系统供本人登录；登录跳转进成绩页后自动关闭。
 */
export async function loginToTzcs(): Promise<boolean> {
  const origin = await resolveReachableOrigin();
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
        if (!isAllowedTzcsUrl(url)) {
          void InAppBrowser.close();
          return;
        }
        if (isTzcsLoggedInUrl(url)) {
          loggedIn = true;
          void InAppBrowser.close();
        }
      }),
      InAppBrowser.addListener('browserClosed', finish),
    );

    InAppBrowser.openInWebView({
      url: origin,
      options: {
        ...DefaultWebViewOptions,
        showURL: true,
        showToolbar: true,
        showNavigationButtons: true,
        closeButtonText: '完成/关闭',
        android: { ...DefaultWebViewOptions.android, isIsolated: false, hardwareBack: true },
      },
    }).catch((err: unknown) => {
      for (const h of handles) void h.then((x) => x.remove());
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

function bodyToText(res: HttpResponse): string {
  return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
}

function hasFitnessContent(text: string): boolean {
  return /肺活量|立定跳远|坐位体前屈|50米|1000米|800米|lungCapacity|fhl/i.test(text);
}

/**
 * 静默尝试拉取当前登录态下的广工体测成绩原始数据（JSON 或 HTML 表格）：
 * 1. 先尝试复用已登录的教务会话；
 * 2. 再直连广工体测系统（tzcs.gdut.edu.cn），探测成绩页与异步数据接口。
 */
export async function fetchTzcsFitnessPayload(): Promise<string> {
  const fromJw = await jwFitnessProbe().catch(() => null);
  if (fromJw) return fromJw;

  const origin = await resolveReachableOrigin();
  const candidatePaths = [
    '/Score/MyScore',
    '/Student/Score',
    '/student/score',
    '/api/score/list',
    '/api/student/score',
    '/score/list',
    '/index',
    '/',
  ];

  let sawLoginPage = false;

  for (const path of candidatePaths) {
    try {
      const res = await CapacitorHttp.request({
        url: `${origin}${path}`,
        method: 'GET',
        connectTimeout: 5000,
        readTimeout: 6000,
        headers: { Accept: 'application/json, text/html, */*; q=0.8' },
        responseType: 'text',
      });
      if (res.status >= 400) continue;
      const text = bodyToText(res);
      if (looksLikeLoginHtml(res.url, text)) {
        sawLoginPage = true;
        continue;
      }
      if (hasFitnessContent(text)) return text;

      // 从已登录主页自动探测成绩数据 AJAX 接口
      const apiMatch = /['"](\/?(?:api\/)?[a-zA-Z0-9_/-]*(?:score|cj|test|fitness|tzcs)[a-zA-Z0-9_/-]*(?:\.action|\.ashx|\.php)?)['"]/i.exec(text);
      if (apiMatch?.[1]) {
        const subUrl = apiMatch[1].startsWith('http')
          ? apiMatch[1]
          : `${origin}${apiMatch[1].startsWith('/') ? '' : '/'}${apiMatch[1]}`;
        const sub = await CapacitorHttp.request({
          url: subUrl,
          method: 'GET',
          connectTimeout: 5000,
          readTimeout: 6000,
          headers: { Accept: 'application/json, text/html, */*; q=0.8', 'X-Requested-With': 'XMLHttpRequest' },
          responseType: 'text',
        });
        const subText = bodyToText(sub);
        if (!looksLikeLoginHtml(sub.url, subText) && hasFitnessContent(subText)) return subText;
      }
    } catch {
      // 尝试下一个候选路径
    }
  }

  if (sawLoginPage) throw new TzcsLoginRequired();
  return '';
}
