/**
 * 绩点与当前学年体测的直连查询与自动静默刷新引擎。
 *
 * 自动更新机制：
 * - 在安卓端启用「自动同步」（默认开启）时，进入「成绩」页或切回前台且距上次同步超过 30 分钟，
 *   会复用已有学校会话 Cookie 静默拉取最新成绩与本学年体测并增量落库；
 * - 若学校登录态已过期，静默刷新不强弹浏览器打扰，仅在页面状态条温和提示「登录已过期，点此一键查询」；
 * - 用户点击「立即查询 / 刷新」时才按需弹出官方认证页，登录完成后全自动抓取、解析并保存，无需手动导入。
 */
import {
  defaultAcademicYear,
  parseCreditAudit,
  parseFitnessImport,
  parseGradeImport,
  parseSecondClassImport,
  type CreditPlan,
  type FitnessGender,
  type FitnessGradeYear,
  type FitnessRecord,
  type GradeSyncResult,
  type SecondClassSyncResult,
} from '@gduthelp/shared';
import type { QueryClient } from '@tanstack/react-query';
import { api } from './api';
import { isNative } from './platform';
import { keys } from './queries';

const AUTO_SYNC_KEY = 'gduthelp-scores-auto-sync';
const LAST_GRADE_SYNC_KEY = 'gduthelp-last-grade-sync-at';
const LAST_FITNESS_SYNC_KEY = 'gduthelp-last-fitness-sync-at';

/** 自动静默刷新的最小冷却间隔（30 分钟），避免频繁请求学校服务器 */
export const AUTO_SYNC_COOLDOWN_MS = 30 * 60 * 1000;

export function getAutoSyncEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_SYNC_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setAutoSyncEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_SYNC_KEY, enabled ? '1' : '0');
  } catch {
    // 忽略隐私模式存储限制
  }
}

function readTimestamp(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeTimestamp(key: string, ts: number): void {
  try {
    localStorage.setItem(key, String(ts));
  } catch {
    // ignore
  }
}

export function shouldAutoSyncGrades(now = Date.now()): boolean {
  return isNative && getAutoSyncEnabled() && now - readTimestamp(LAST_GRADE_SYNC_KEY) >= AUTO_SYNC_COOLDOWN_MS;
}

export function shouldAutoSyncFitness(now = Date.now()): boolean {
  return isNative && getAutoSyncEnabled() && now - readTimestamp(LAST_FITNESS_SYNC_KEY) >= AUTO_SYNC_COOLDOWN_MS;
}

export type SyncOutcome =
  | { status: 'synced'; added: number; changed: number; total: number; message: string }
  | { status: 'login-required'; message: string }
  | { status: 'empty'; message: string }
  | { status: 'cancelled'; message: string }
  | { status: 'error'; message: string };

let gradeSyncInFlight: Promise<SyncOutcome> | null = null;
let fitnessSyncInFlight: Promise<SyncOutcome> | null = null;

/**
 * 直连广工教务系统拉取课程成绩并自动同步到后端。
 * - interactive = false：静默后台更新，登录失效不弹窗
 * - interactive = true：登录失效时自动打开广工官方统一认证，登录后一站式拉取并保存
 */
export function syncGradesFromSchool(opts: {
  interactive: boolean;
  queryClient: QueryClient;
}): Promise<SyncOutcome> {
  if (gradeSyncInFlight) return gradeSyncInFlight;

  const task = (async (): Promise<SyncOutcome> => {
    if (!isNative) {
      return { status: 'error', message: '网页端受跨域限制，请使用安卓 App 直连教务或点击手动导入' };
    }

    const jw = await import('./jw');
    const fetchWithAuth = async (): Promise<string | null> => {
      try {
        return await jw.jwGradesPayload('');
      } catch (err) {
        if (!(err instanceof jw.JwLoginRequired)) throw err;
        if (!opts.interactive) return null;
        const ok = await jw.loginToJw();
        if (!ok) return '__CANCELLED__';
        return jw.jwGradesPayload('');
      }
    };

    try {
      const raw = await fetchWithAuth();
      if (raw === '__CANCELLED__') {
        return { status: 'cancelled', message: '已取消教务登录' };
      }
      if (raw === null) {
        return { status: 'login-required', message: '教务会话已过期，点击「同步成绩」重新认证后即可自动更新' };
      }

      const parsed = parseGradeImport(raw);
      if (parsed.grades.length === 0) {
        writeTimestamp(LAST_GRADE_SYNC_KEY, Date.now());
        return { status: 'empty', message: '教务系统当前暂无已出分课程' };
      }

      const res = await api<GradeSyncResult>('/grades/sync', {
        method: 'POST',
        body: {
          grades: parsed.grades,
          removeMissing: false,
        },
      });
      writeTimestamp(LAST_GRADE_SYNC_KEY, Date.now());
      await opts.queryClient.invalidateQueries({ queryKey: keys.grades });

      const deltaMsg =
        res.added > 0 || res.changed > 0
          ? `已同步 ${res.total} 门成绩（新增 ${res.added}，更新 ${res.changed}）`
          : `已是最新成绩（共 ${res.total} 门）`;
      return {
        status: 'synced',
        added: res.added,
        changed: res.changed,
        total: res.total,
        message: deltaMsg,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : '同步教务成绩失败，请稍后重试';
      return { status: 'error', message: msg };
    }
  })();

  gradeSyncInFlight = task.finally(() => {
    gradeSyncInFlight = null;
  });
  return gradeSyncInFlight;
}

/**
 * 直连广工体测系统查询「当前学年」体测成绩并自动同步到后端。
 * 仅保留当前学年，避免拉取历史多年造成冗余。
 */
export function syncCurrentFitnessFromSchool(opts: {
  interactive: boolean;
  queryClient: QueryClient;
  academicYear?: string;
  defaultGender?: FitnessGender;
  defaultGradeYear?: FitnessGradeYear;
}): Promise<SyncOutcome> {
  if (fitnessSyncInFlight) return fitnessSyncInFlight;

  const academicYear = opts.academicYear ?? defaultAcademicYear();

  const task = (async (): Promise<SyncOutcome> => {
    if (!isNative) {
      return { status: 'error', message: '网页端受校园网与跨域限制，请使用安卓 App 直连查询或手动录入' };
    }

    const tzcs = await import('./tzcs');
    const fetchWithAuth = async (): Promise<string | null> => {
      try {
        return await tzcs.fetchTzcsFitnessPayload();
      } catch (err) {
        if (!(err instanceof tzcs.TzcsLoginRequired)) throw err;
        if (!opts.interactive) return null;
        const ok = await tzcs.loginToTzcs();
        if (!ok) return '__CANCELLED__';
        return tzcs.fetchTzcsFitnessPayload();
      }
    };

    try {
      const raw = await fetchWithAuth();
      if (raw === '__CANCELLED__') {
        return { status: 'cancelled', message: '已取消体测系统登录' };
      }
      if (raw === null) {
        return { status: 'login-required', message: '体测系统登录已过期，点击「直接查询」登录后自动拉取本学年成绩' };
      }
      if (!raw.trim()) {
        return {
          status: 'empty',
          message: `暂未在体测系统查到 ${academicYear} 学年成绩（通常在体测结束约 3 天后上传）`,
        };
      }

      const parsed = parseFitnessImport(raw, {
        academicYear,
        gender: opts.defaultGender ?? 'male',
        gradeYear: opts.defaultGradeYear ?? 1,
      });

      // 只取当前学年记录；若系统尚未上传本学年但存在最新一年，则仅提示而不混入往年
      const currentYearRec = parsed.records.find((r) => r.academicYear === academicYear);
      if (!currentYearRec) {
        writeTimestamp(LAST_FITNESS_SYNC_KEY, Date.now());
        return {
          status: 'empty',
          message: `体测系统暂未发布 ${academicYear} 学年成绩，待学校上传后会自动更新`,
        };
      }

      await api<FitnessRecord>('/fitness/current', {
        method: 'PUT',
        body: { ...currentYearRec, source: 'import' },
      });
      writeTimestamp(LAST_FITNESS_SYNC_KEY, Date.now());
      await opts.queryClient.invalidateQueries({ queryKey: keys.fitnessCurrent(academicYear) });
      await opts.queryClient.invalidateQueries({ queryKey: keys.fitness });

      return {
        status: 'synced',
        added: 0,
        changed: 1,
        total: 1,
        message: `已更新 ${academicYear} 学年体测成绩`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : '查询体测成绩失败，请确认已连校园网或 VPN';
      return { status: 'error', message: msg };
    }
  })();

  fitnessSyncInFlight = task.finally(() => {
    fitnessSyncInFlight = null;
  });
  return fitnessSyncInFlight;
}

/**
 * 同步学分进度：优先同时拉取教务成绩与培养方案学分完成情况，
 * 即便学校暂未开放培养方案审核接口，也会基于已同步成绩自动完成五大模块学分核算。
 */
export async function syncCreditAuditFromSchool(opts: {
  interactive: boolean;
  queryClient: QueryClient;
  currentPlan: CreditPlan;
}): Promise<SyncOutcome> {
  const gradeRes = await syncGradesFromSchool({ interactive: opts.interactive, queryClient: opts.queryClient });
  if (gradeRes.status === 'cancelled' || gradeRes.status === 'login-required' || gradeRes.status === 'error') {
    return gradeRes;
  }

  if (isNative) {
    try {
      const jw = await import('./jw');
      const rawAudit = await jw.jwCreditAuditPayload();
      if (rawAudit) {
        const modules = parseCreditAudit(rawAudit);
        if (modules.length > 0) {
          await api<CreditPlan>('/grades/credit-plan', {
            method: 'PUT',
            body: {
              totalTarget: opts.currentPlan.totalTarget,
              generalRequiredTarget: opts.currentPlan.generalRequiredTarget,
              majorRequiredTarget: opts.currentPlan.majorRequiredTarget,
              majorElectiveTarget: opts.currentPlan.majorElectiveTarget,
              generalElectiveTarget: opts.currentPlan.generalElectiveTarget,
              practiceTarget: opts.currentPlan.practiceTarget,
              majorName: opts.currentPlan.majorName,
              officialModules: modules,
            },
          });
          await opts.queryClient.invalidateQueries({ queryKey: keys.creditPlan });
          return {
            status: 'synced',
            added: gradeRes.status === 'synced' ? gradeRes.added : 0,
            changed: modules.length,
            total: modules.length,
            message: `已同步最新成绩与教务培养方案（${modules.length} 个学分模块）`,
          };
        }
      }
    } catch {
      // 教务未开放培养方案直连时静默回退为成绩核算结果
    }
  }

  return gradeRes;
}

/** 直连广工第二课堂 / 网上办事大厅拉取当前学年与学期时长记录 */
export async function syncSecondClassFromSchool(opts: {
  interactive: boolean;
  queryClient: QueryClient;
}): Promise<SyncOutcome> {
  if (!isNative) {
    return { status: 'error', message: '网页端受跨域限制，请使用安卓 App 直连查询或点击「粘贴导入」' };
  }

  try {
    const sc = await import('./second-class');
    let raw: string;
    try {
      raw = await sc.fetchSecondClassRawPayload();
    } catch (err) {
      if (!(err instanceof sc.SecondClassLoginRequired)) throw err;
      if (!opts.interactive) {
        return { status: 'login-required', message: '二课系统登录已过期，点击「查询同步」重新认证' };
      }
      const ok = await sc.loginToSecondClass();
      if (!ok) return { status: 'cancelled', message: '已取消第二课堂登录' };
      raw = await sc.fetchSecondClassRawPayload();
    }

    const parsed = parseSecondClassImport(raw);
    if (parsed.length === 0) {
      return {
        status: 'empty',
        message: '学校二课系统暂未返回可解析的活动列表，可直接点击「粘贴导入」或「记录活动」',
      };
    }

    const res = await api<SecondClassSyncResult>('/second-class/sync', {
      method: 'POST',
      body: { records: parsed },
    });
    await opts.queryClient.invalidateQueries({ queryKey: keys.secondClassPrefix });

    const msg =
      res.added > 0 || res.updated > 0
        ? `已同步第二课堂：新增 ${res.added} 条、更新 ${res.updated} 条`
        : `已是最新第二课堂时长（共 ${res.total} 条记录）`;
    return { status: 'synced', added: res.added, changed: res.updated, total: res.total, message: msg };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '查询第二课堂失败，请确认校园网连接或改用粘贴导入';
    return { status: 'error', message: msg };
  }
}

export function formatRelativeSyncTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '尚未同步';
  const diffSec = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return '刚刚更新';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} 分钟前更新`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前更新`;
  const days = Math.floor(hr / 24);
  return `${days} 天前更新`;
}
