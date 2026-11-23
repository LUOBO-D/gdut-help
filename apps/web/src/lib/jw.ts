/**
 * 教务系统（jxfw.gdut.edu.cn）业务请求集合。只在安卓 App 里使用。
 *
 * 底层会话、CAS 静默续期、Cookie 持久化与统一登录全部委托给 gdut-auth.ts 统一认证网关，
 * 保证在「我的 → 广工统一认证」登录一次即可在课表、考试、成绩、学分、空教室与公选课目录全局复用。
 */
import type { HttpResponse } from '@capacitor/core';
import { DefaultWebViewOptions, InAppBrowser } from '@capacitor/inappbrowser';
import {
  connectGdutAuth,
  GdutAuthRequired,
  gdutRequest,
  JW_ORIGIN,
  type ConnectGdutOptions,
} from './gdut-auth';
import { isNative } from './platform';

export { JW_ORIGIN };

/** 保持兼容原有导出名：与 GdutAuthRequired 指向同一错误类 */
export const JwLoginRequired = GdutAuthRequired;

export type JwLoginOptions = ConnectGdutOptions;

/** 打开广工统一认证页（与「我的 → 广工统一认证」共用同一网关） */
export function loginToJw(options: JwLoginOptions = {}): Promise<boolean> {
  return connectGdutAuth({ ...options, targetOrigin: JW_ORIGIN });
}

export function jwRequest(
  path: string,
  init: { method?: 'GET' | 'POST'; data?: Record<string, string> } = {},
): Promise<HttpResponse> {
  return gdutRequest(JW_ORIGIN, path, init);
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
  if (select === undefined) throw new GdutAuthRequired();
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
    throw new GdutAuthRequired();
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

/** 读取教务系统考试安排（乘方教务 xsksap） */
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

/** 读取教务系统全部（或指定学期）课程成绩与绩点（乘方教务 xskccjxx） */
export async function jwGradesPayload(semesterCode = ''): Promise<string> {
  const buildForm = (page: number) => ({
    xnxqdm: semesterCode,
    jhlxdm: '',
    page: String(page),
    rows: '200',
    sort: 'xnxqdm',
    order: 'desc',
  });

  const primary = await jwRequest('/xskccjxx!getDataList.action', { method: 'POST', data: buildForm(1) });
  const primaryJson = tryJsonText(primary.data);
  if (primaryJson) {
    try {
      const parsed = JSON.parse(primaryJson) as { total?: number; rows?: unknown[] };
      if (parsed && Array.isArray(parsed.rows) && typeof parsed.total === 'number' && parsed.total > parsed.rows.length) {
        const allRows = [...parsed.rows];
        const pages = Math.min(5, Math.ceil(parsed.total / 200));
        for (let p = 2; p <= pages; p++) {
          const nextRes = await jwRequest('/xskccjxx!getDataList.action', { method: 'POST', data: buildForm(p) });
          const nextText = tryJsonText(nextRes.data);
          if (!nextText) break;
          const nextParsed = JSON.parse(nextText) as { rows?: unknown[] };
          if (Array.isArray(nextParsed.rows)) allRows.push(...nextParsed.rows);
        }
        return JSON.stringify({ total: allRows.length, rows: allRows });
      }
    } catch {
      // 保留原始 JSON 交由 shared 解析
    }
    return primaryJson;
  }

  const pageRes = await jwRequest('/xskccjxx!xskccjList.action');
  const html = typeof pageRes.data === 'string' ? pageRes.data : JSON.stringify(pageRes.data);
  const pageJson = tryJsonText(html);
  if (pageJson) return pageJson;

  const actionMatch = /['"](\/?[a-zA-Z0-9_/-]*cj[a-zA-Z0-9_-]*![a-zA-Z0-9_]+\.action)['"]/i.exec(html);
  if (actionMatch?.[1]) {
    const discoveredPath = actionMatch[1].startsWith('/') ? actionMatch[1] : `/${actionMatch[1]}`;
    if (discoveredPath !== '/xskccjxx!getDataList.action') {
      const sub = await jwRequest(discoveredPath, { method: 'POST', data: buildForm(1) });
      const subJson = tryJsonText(sub.data);
      if (subJson) return subJson;
    }
  }

  if (/<tr\b/i.test(html)) return html;
  return '{"total":0,"rows":[]}';
}

/** 探测当前已登录教务会话中是否可直接读取体测数据 */
export async function jwFitnessProbe(): Promise<string | null> {
  const candidates = ['/xstzcs!getDataList.action', '/tzcs!getDataList.action', '/xstzcj!getDataList.action'];
  for (const path of candidates) {
    try {
      const res = await jwRequest(path, { method: 'POST', data: { page: '1', rows: '20' } });
      if (res.status >= 400) continue;
      const json = tryJsonText(res.data);
      if (json && /肺活量|50米|体前屈|fhl|sg|tz|height/i.test(json)) return json;
    } catch (err) {
      if (err instanceof GdutAuthRequired) return null;
    }
  }
  return null;
}

export interface JwEmptyClassroomQuery {
  semesterCode: string;
  week: number;
  weekday: number;
  periodCode: string;
  campusCode?: string;
}

export interface JwEmptyClassroomResult {
  raw: string;
  discoveredPageUrl: string | null;
}

/**
 * 实时查询广工乘方教务系统空教室：
 * 1. 先从已登录教务菜单自动探测真实空教室菜单地址（不硬编码猜测路径导致 302 误报掉线）；
 * 2. 所有候选接口均以 allowSilentRenew:false + try/catch 隔离探测，避免不存在的 action 触发假登录过期错误；
 * 3. 返回原始 JSON/HTML 及探测到的教务页面地址（若学校停用学生端 AJAX 查询，可一键打开官方教务页或降级课表推算）。
 */
export async function jwEmptyClassroomsPayload(query: JwEmptyClassroomQuery): Promise<JwEmptyClassroomResult> {
  const form: Record<string, string> = {
    xnxqdm: query.semesterCode,
    zc: String(query.week),
    xq: String(query.weekday),
    jcdm: query.periodCode,
    jcdm2: query.periodCode,
    jc: query.periodCode,
    xqdm: query.campusCode ?? '',
    page: '1',
    rows: '120',
  };

  // 1. 尝试从已登录的教务菜单页动态发现本校真实空教室 URL
  const discoveredPages: string[] = [];
  const discoveredActions: string[] = [];
  const menuPaths = ['/login!welcome.action', '/new/welcome.page', '/xtgl!getMenu.action', '/login!getMenu.action'];
  for (const mp of menuPaths) {
    try {
      const res = await gdutRequest(JW_ORIGIN, mp, { allowSilentRenew: false });
      if (res.status >= 400) continue;
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      for (const m of body.matchAll(
        /['"](\/?[a-zA-Z0-9_/-]*(?:kxjs|kjs|jxcd|cdjy|cdcx|cdxx|jscx|jszy|jsjy|kszy)[a-zA-Z0-9_-]*![a-zA-Z0-9_]+\.action(?:\?[^'"]*)?)['"]/gi,
      )) {
        const p = m[1]!.startsWith('/') ? m[1]! : `/${m[1]!}`;
        if (!discoveredPages.includes(p)) discoveredPages.push(p);
      }
      // 同步按中文菜单标题就近匹配任意空教室/教学场地入口链接
      for (const m of body.matchAll(
        /(?:空教室|空闲教室|教室查询|教学场地|场地查询)[\s\S]{0,180}?['"](\/?[a-zA-Z0-9_/-]+![a-zA-Z0-9_]+\.action(?:\?[^'"]*)?)['"]|['"](\/?[a-zA-Z0-9_/-]+![a-zA-Z0-9_]+\.action(?:\?[^'"]*)?)['"][\s\S]{0,180}?(?:空教室|空闲教室|教室查询|教学场地|场地查询)/gi,
      )) {
        const rawPath = m[1] ?? m[2];
        if (!rawPath) continue;
        const p = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
        if (!discoveredPages.includes(p)) discoveredPages.push(p);
      }
      if (discoveredPages.length > 0) break;
    } catch {
      // 忽略单条菜单探测失败，绝不中断查询流程
    }
  }

  let discoveredPageUrl: string | null = discoveredPages[0] ? `${JW_ORIGIN}${discoveredPages[0]}` : null;

  // 2. 打开探测到的页面，读取其内部真实 AJAX action 或直接渲染的教室表格
  const pageCandidates = [
    ...discoveredPages,
    '/jxcdzy!jxcdzyList.action',
    '/xskxjs!xskxjsList.action',
    '/kxjscx!kxjscxList.action',
    '/cdjyxx!cdjyxxList.action',
    '/jxcdxx!kxjsList.action',
  ];

  for (const pagePath of pageCandidates) {
    try {
      const sep = pagePath.includes('?') ? '&' : '?';
      const pageRes = await gdutRequest(
        JW_ORIGIN,
        `${pagePath}${sep}xnxqdm=${encodeURIComponent(query.semesterCode)}&zc=${query.week}&xq=${query.weekday}&jcdm=${encodeURIComponent(query.periodCode)}`,
        { allowSilentRenew: false },
      );
      if (pageRes.status >= 400) continue;
      const html = typeof pageRes.data === 'string' ? pageRes.data : JSON.stringify(pageRes.data);
      const pageJson = tryJsonText(html);
      if (pageJson && /jxcdmc|cdmc|jsmc|教室|教[1-6]|大教室/i.test(pageJson)) {
        return { raw: pageJson, discoveredPageUrl: `${JW_ORIGIN}${pagePath}` };
      }

      if (/空教室|空闲教室|教学场地|教室查询/.test(html)) {
        discoveredPageUrl = `${JW_ORIGIN}${pagePath}`;
      }

      for (const m of html.matchAll(/['"](\/?[a-zA-Z0-9_/-]*(?:kxjs|jxcd|cdjy|jsjy|kszy)[a-zA-Z0-9_-]*![a-zA-Z0-9_]+\.action)['"]/gi)) {
        const act = m[1]!.startsWith('/') ? m[1]! : `/${m[1]!}`;
        if (!discoveredActions.includes(act)) discoveredActions.push(act);
      }

      if (/<tr\b/i.test(html) && /(?:教[1-6]|大教室|工学)/.test(html)) {
        return { raw: html, discoveredPageUrl: `${JW_ORIGIN}${pagePath}` };
      }
    } catch {
      // 安全跳过不可用页面
    }
  }

  // 3. 安全探测已知与动态发现的 AJAX 数据接口
  const actionCandidates = [
    ...discoveredActions,
    '/jxcdzy!getDataList.action',
    '/xskxjs!getDataList.action',
    '/cdjyxx!getDataList.action',
    '/kxjscx!getDataList.action',
    '/jxcdxx!getKxjsList.action',
    '/cdjycx!getKxjsList.action',
    '/xsjxcdcx!getDataList.action',
    '/jxcd!getKxjsList.action',
  ];

  const tried = new Set<string>();
  for (const path of actionCandidates) {
    if (tried.has(path)) continue;
    tried.add(path);
    try {
      const res = await gdutRequest(JW_ORIGIN, path, { method: 'POST', data: form, allowSilentRenew: false });
      if (res.status >= 400) continue;
      const json = tryJsonText(res.data);
      if (json && /jxcdmc|cdmc|jsmc|教室|教[1-6]|大教室/i.test(json)) {
        return { raw: json, discoveredPageUrl };
      }
    } catch {
      // 单条接口不存在或无权限时静默尝试下一条，不抛出假过期错误
    }
  }

  return { raw: '', discoveredPageUrl };
}

/** 在应用内浏览器（复用已登录 Cookie）直接打开广工教务页面查看官方空教室 */
export async function openJwEmptyRoomPage(url?: string | null): Promise<void> {
  const target = url && url.startsWith(JW_ORIGIN) ? url : `${JW_ORIGIN}/login!welcome.action`;
  await InAppBrowser.openInWebView({
    url: target,
    options: {
      ...DefaultWebViewOptions,
      showURL: true,
      showToolbar: true,
      showNavigationButtons: true,
      closeButtonText: '返回 App',
      android: { ...DefaultWebViewOptions.android, isIsolated: false, hardwareBack: true },
    },
  });
}

/** 探测广工教务系统「培养方案完成情况 / 学分统计」 */
export async function jwCreditAuditPayload(): Promise<string | null> {
  const form = { page: '1', rows: '60' };
  const candidates = [
    '/xsxy!getDataList.action',
    '/xsgrpyfa!getDataList.action',
    '/pyfawc!getDataList.action',
    '/xskccjxx!getXfTj.action',
  ];

  for (const path of candidates) {
    try {
      const res = await jwRequest(path, { method: 'POST', data: form });
      if (res.status >= 400) continue;
      const json = tryJsonText(res.data);
      if (json && /yqxf|yxxf|qxxf|要求学分|已修学分|kcxz/i.test(json)) return json;
    } catch (err) {
      if (err instanceof GdutAuthRequired) throw err;
    }
  }

  const pagePaths = ['/xsxy!xsxyList.action', '/xsgrpyfa!xsgrpyfaList.action'];
  for (const pagePath of pagePaths) {
    try {
      const res = await jwRequest(pagePath);
      if (res.status >= 400) continue;
      const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      if (/<tr\b/i.test(html) && /要求学分|计划学分|最低学分/.test(html)) return html;
    } catch (err) {
      if (err instanceof GdutAuthRequired) throw err;
    }
  }

  return null;
}

/**
 * 直连广工教务抓取全校公共选修课与体育选课开课目录：
 * 自动依次探测「选课列表（公选/体育）」与「常年开放的全校开课/课程库查询」分页接口，
 * 最多拉取 5 页（1000 条）合并返回给 shared/parseElectiveCatalog 过滤入库。
 */
export async function jwElectiveCatalogPayload(semesterCode: string): Promise<{ raw: string; assumeElective: boolean }> {
  const probeEndpoints: { path: string; extra: Record<string, string>; assumeElective: boolean }[] = [
    { path: '/xsxk!getGgxxkList.action', extra: { xnxqdm: semesterCode }, assumeElective: true },
    { path: '/xsxk!getDataList.action', extra: { xnxqdm: semesterCode, kclbdm: 'ggxxk' }, assumeElective: true },
    { path: '/qxkbcx!getDataList.action', extra: { xnxqdm: semesterCode }, assumeElective: false },
    { path: '/jxrwwh!getDataList.action', extra: { xnxqdm: semesterCode }, assumeElective: false },
    { path: '/kckcx!getDataList.action', extra: { xnxqdm: semesterCode }, assumeElective: false },
  ];

  for (const ep of probeEndpoints) {
    try {
      const firstRes = await jwRequest(ep.path, {
        method: 'POST',
        data: { ...ep.extra, page: '1', rows: '200' },
      });
      if (firstRes.status >= 400) continue;
      const firstText = tryJsonText(firstRes.data);
      if (!firstText) continue;
      const parsed = JSON.parse(firstText) as { total?: number; rows?: unknown[] };
      if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) continue;

      const allRows = [...parsed.rows];
      const total = typeof parsed.total === 'number' ? parsed.total : allRows.length;
      const pages = Math.min(5, Math.ceil(total / 200));
      for (let p = 2; p <= pages; p++) {
        const nextRes = await jwRequest(ep.path, {
          method: 'POST',
          data: { ...ep.extra, page: String(p), rows: '200' },
        });
        const nextText = tryJsonText(nextRes.data);
        if (!nextText) break;
        const nextParsed = JSON.parse(nextText) as { rows?: unknown[] };
        if (Array.isArray(nextParsed.rows) && nextParsed.rows.length > 0) {
          allRows.push(...nextParsed.rows);
        } else {
          break;
        }
      }
      return { raw: JSON.stringify({ total: allRows.length, rows: allRows }), assumeElective: ep.assumeElective };
    } catch (err) {
      if (err instanceof GdutAuthRequired) throw err;
    }
  }

  return { raw: '{"total":0,"rows":[]}', assumeElective: false };
}

/**
 * 探测广工教务「等级考试 / 社会考试成绩」记录（含四六级历史成绩）：
 * 所有候选接口均以 allowSilentRenew:false + try/catch 隔离，避免不存在的路径误报登录过期。
 */
export async function jwCetScoresPayload(): Promise<string> {
  const candidates = [
    '/xskjcj!getDataList.action',
    '/xsjdcj!getDataList.action',
    '/djkscj!getDataList.action',
    '/xskccjxx!getDjkscjList.action',
    '/kjcjcx!getDataList.action',
    '/shkscj!getDataList.action',
  ];

  // 从教务菜单动态发现可能存在的考级/等级考试路径
  try {
    const menuRes = await gdutRequest(JW_ORIGIN, '/login!welcome.action', { allowSilentRenew: false });
    if (menuRes.status < 400) {
      const body = typeof menuRes.data === 'string' ? menuRes.data : JSON.stringify(menuRes.data);
      for (const m of body.matchAll(
        /(?:等级考试|社会考试|四六级|考级成绩)[\s\S]{0,180}?['"](\/?[a-zA-Z0-9_/-]+![a-zA-Z0-9_]+\.action)['"]|['"](\/?[a-zA-Z0-9_/-]+![a-zA-Z0-9_]+\.action)['"][\s\S]{0,180}?(?:等级考试|社会考试|四六级|考级成绩)/gi,
      )) {
        const raw = m[1] ?? m[2];
        if (!raw) continue;
        const p = raw.startsWith('/') ? raw : `/${raw}`;
        if (!candidates.includes(p)) candidates.unshift(p);
      }
    }
  } catch {
    // 忽略菜单探测失败
  }

  for (const path of candidates) {
    try {
      const res = await gdutRequest(JW_ORIGIN, path, {
        method: 'POST',
        data: { page: '1', rows: '50' },
        allowSilentRenew: false,
      });
      if (res.status >= 400) continue;
      const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      const json = tryJsonText(text);
      if (json && /四级|六级|cet|英语/i.test(json)) return json;
      if (/<tr\b/i.test(text) && /四级|六级|cet/i.test(text)) return text;
    } catch {
      // 安全尝试下一候选接口
    }
  }

  return '';
}

/**
 * 探测广工教务「选课时间窗口」公告或配置页面，返回可解析的原始文本。
 */
export async function jwSelectionWindowsPayload(): Promise<string> {
  const candidates = [
    '/xsxk!xsxkList.action',
    '/xsxk!getXksj.action',
    '/xskc!getXksj.action',
    '/xsxk!getDataList.action',
    '/login!welcome.action',
  ];

  const chunks: string[] = [];
  for (const path of candidates) {
    try {
      const res = await gdutRequest(JW_ORIGIN, path, { allowSilentRenew: false });
      if (res.status >= 400) continue;
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      if (/选课|正选|补退选|抢课/.test(body) && /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(body)) {
        chunks.push(body);
      }
    } catch {
      // 忽略单条探测失败
    }
  }

  return chunks.join('\n');
}

/** 在应用内浏览器（复用已登录 Cookie）直接打开广工教务选课页 */
export async function openJwSelectionPage(): Promise<void> {
  await InAppBrowser.openInWebView({
    url: `${JW_ORIGIN}/login!welcome.action`,
    options: {
      ...DefaultWebViewOptions,
      showURL: true,
      showToolbar: true,
      showNavigationButtons: true,
      closeButtonText: '返回 App',
      android: { ...DefaultWebViewOptions.android, isIsolated: false, hardwareBack: true },
    },
  });
}

/** 在应用内浏览器打开官方查分/报名网页（如中国教育考试网四六级查分） */
export async function openOfficialWebPage(url: string): Promise<void> {
  if (!isNative) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await InAppBrowser.openInWebView({
    url,
    options: {
      ...DefaultWebViewOptions,
      showURL: true,
      showToolbar: true,
      showNavigationButtons: true,
      closeButtonText: '返回 App',
      android: { ...DefaultWebViewOptions.android, isIsolated: false, hardwareBack: true },
    },
  });
}
