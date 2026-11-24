import {
  changePasswordSchema,
  deleteAccountSchema,
  today,
  type AppUpdateCheckResponse,
  type UserDataExport,
  type UserProfile,
  type UserSecurityOverview,
} from '@gduthelp/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { GlassCard } from '../../components/GlassCard';
import { Sheet } from '../../components/Sheet';
import { api, ApiError, deleteAccount, logoutAll } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';
import { getTokenStorageStatus, type TokenStorageStatus } from '../../lib/native-token';
import { useOtaStore } from '../../lib/ota-store';
import { isNative } from '../../lib/platform';
import { toast } from '../../lib/toast-store';

function formatShortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${m}-${day} ${h}:${min}`;
}

/**
 * 账号与安全中心：
 * - 登录密码管理、个人数据 JSON 导出、永久注销账号；
 * - 活跃设备管理（查看已登录设备/脱敏 IP，支持单设备下线与一键退出全部设备）与最近安全事件时间线；
 * - 透明可核验的《隐私与安全说明》（含 Android 硬件密钥库状态与官方 APK SHA-256 指纹）。
 */
export function AccountSecurityCard({
  email,
  hasPassword,
  onLoggedOut,
}: {
  email: string;
  hasPassword: boolean;
  onLoggedOut: () => void;
}) {
  const setUser = useAuth((s) => s.setUser);
  const storeApkSha = useOtaStore((s) => s.latestApkSha256);
  const setStoreApkSha = useOtaStore((s) => s.setLatestApkSha256);

  const [exporting, setExporting] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [storageStatus, setStorageStatus] = useState<TokenStorageStatus | null>(null);

  // 密码弹窗
  const [pwdOpen, setPwdOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  // 活跃设备与安全记录弹窗
  const [activityOpen, setActivityOpen] = useState(false);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overview, setOverview] = useState<UserSecurityOverview | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // 隐私与安全白皮书弹窗
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [apkSha256, setApkSha256] = useState<string | null>(storeApkSha);

  // 注销弹窗
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    void getTokenStorageStatus().then(setStorageStatus);
  }, []);

  const loadSecurityOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const data = await api<UserSecurityOverview>('/me/security');
      setOverview(data);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '加载安全记录失败');
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const openActivitySheet = () => {
    setActivityOpen(true);
    void loadSecurityOverview();
  };

  const openPrivacySheet = () => {
    setPrivacyOpen(true);
    if (!apkSha256) {
      void api<AppUpdateCheckResponse>('/app/update', { auth: false })
        .then((res) => {
          if (res.apkSha256) {
            setApkSha256(res.apkSha256);
            setStoreApkSha(res.apkSha256);
          }
        })
        .catch(() => undefined);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingId(sessionId);
    try {
      await api<{ revoked: boolean }>(`/me/sessions/${sessionId}`, { method: 'DELETE' });
      toast.success('已下线该设备');
      await loadSecurityOverview();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '下线设备失败');
    } finally {
      setRevokingId(null);
    }
  };

  const handleSavePassword = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = changePasswordSchema.safeParse({
      currentPassword: hasPassword ? currentPassword : undefined,
      newPassword,
    });
    if (!parsed.success) {
      setPwdError(parsed.error.issues[0]?.message ?? '请检查输入的密码');
      return;
    }
    if (hasPassword && !currentPassword) {
      setPwdError('请输入当前登录密码');
      return;
    }
    setSavingPwd(true);
    setPwdError(null);
    try {
      const updated = await api<UserProfile>('/auth/password/change', { method: 'POST', body: parsed.data });
      setUser(updated);
      toast.success(hasPassword ? '登录密码已修改，其他旧设备会话已自动失效' : '已设置登录密码，下次可直接用密码登录');
      setPwdOpen(false);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPwdError(err instanceof ApiError ? err.message : '保存密码失败');
    } finally {
      setSavingPwd(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await api<UserDataExport>('/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gduthelp-export-${today()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('已导出个人数据备份');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '导出数据失败');
    } finally {
      setExporting(false);
    }
  };

  const handleLogoutAll = async () => {
    setLoggingOutAll(true);
    try {
      const res = await logoutAll();
      toast.success(`已退出全部设备（吊销 ${res.revokedCount} 个会话）`);
      onLoggedOut();
    } catch {
      onLoggedOut();
    } finally {
      setLoggingOutAll(false);
    }
  };

  const handleDelete = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = deleteAccountSchema.safeParse({ confirmEmail });
    if (!parsed.success) {
      setDeleteError(parsed.error.issues[0]?.message ?? '请输入有效的邮箱');
      return;
    }
    if (parsed.data.confirmEmail !== email.toLowerCase()) {
      setDeleteError('输入的邮箱与当前账号不一致');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount(parsed.data.confirmEmail);
      toast.info('账号已永久注销');
      setDeleteOpen(false);
      onLoggedOut();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : '注销失败，请稍后重试');
    } finally {
      setDeleting(false);
    }
  };

  const copySha256 = async () => {
    if (!apkSha256) return;
    try {
      await navigator.clipboard.writeText(apkSha256);
      toast.success('已复制官方安装包 SHA-256 指纹');
    } catch {
      toast.info('请长按上方指纹文本复制');
    }
  };

  const storageBadge = storageStatus
    ? isNative
      ? storageStatus.hardwareBacked
        ? 'AndroidKeyStore 硬件加密已启用'
        : storageStatus.available
          ? 'AES-256-GCM 密钥库保护中'
          : '应用私有存储'
      : 'HttpOnly Cookie + TLS 1.3'
    : '安全加密保护中';

  return (
    <>
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">账号与安全中心</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
            {storageBadge}
          </span>
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          管理登录设备、核查安全记录、导出个人数据，或查阅隐私保护架构说明
        </p>

        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <Button variant="ghost" className="h-10 text-sm" onClick={openActivitySheet}>
            设备与安全记录
          </Button>
          <Button variant="ghost" className="h-10 text-sm" onClick={openPrivacySheet}>
            隐私与安全说明
          </Button>
          <Button
            variant="ghost"
            className="h-10 text-sm"
            onClick={() => {
              setCurrentPassword('');
              setNewPassword('');
              setPwdError(null);
              setPwdOpen(true);
            }}
          >
            {hasPassword ? '修改登录密码' : '设置登录密码'}
          </Button>
          <Button variant="ghost" className="h-10 text-sm" loading={exporting} onClick={() => void handleExport()}>
            导出数据 (JSON)
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-current/10 pt-3">
          <button
            type="button"
            disabled={loggingOutAll}
            onClick={() => void handleLogoutAll()}
            className="text-xs font-medium text-fg-muted hover:text-fg hover:underline"
          >
            {loggingOutAll ? '正在退出全部设备…' : '一键退出全部设备'}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmEmail('');
              setDeleteError(null);
              setDeleteOpen(true);
            }}
            className="text-xs font-medium text-danger hover:underline"
          >
            永久注销账号…
          </button>
        </div>
      </GlassCard>

      {/* 活跃设备与安全审计时间线 */}
      <Sheet open={activityOpen} onClose={() => setActivityOpen(false)} title="活跃设备与安全记录">
        <div className="space-y-5 pb-3">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold tracking-wide text-fg-muted">
                当前活跃设备（{overview?.activeSessions.length ?? 0}）
              </h3>
              <button
                type="button"
                disabled={loggingOutAll}
                onClick={() => void handleLogoutAll()}
                className="text-xs font-medium text-danger hover:underline"
              >
                全部下线
              </button>
            </div>
            {loadingOverview && !overview ? (
              <p className="mt-2.5 text-xs text-fg-muted">正在加载设备列表…</p>
            ) : overview && overview.activeSessions.length > 0 ? (
              <ul className="mt-2.5 space-y-2">
                {overview.activeSessions.map((s) => (
                  <li
                    key={s.id}
                    className="surface-subtle flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.deviceLabel}</p>
                      <p className="mt-0.5 text-[11px] text-fg-muted">
                        登录 {formatShortTime(s.createdAt)}
                        {s.ipMasked ? ` · IP ${s.ipMasked}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      className="h-8 shrink-0 px-2.5 text-xs text-danger"
                      loading={revokingId === s.id}
                      onClick={() => void handleRevokeSession(s.id)}
                    >
                      下线
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2.5 text-xs text-fg-muted">暂无其他活跃设备会话</p>
            )}
          </div>

          <div className="border-t border-current/10 pt-4">
            <h3 className="text-xs font-semibold tracking-wide text-fg-muted">最近安全活动</h3>
            {loadingOverview && !overview ? (
              <p className="mt-2.5 text-xs text-fg-muted">正在加载安全日志…</p>
            ) : overview && overview.recentEvents.length > 0 ? (
              <ul className="mt-2.5 max-h-[34dvh] space-y-2 overflow-y-auto pr-1">
                {overview.recentEvents.map((ev) => (
                  <li
                    key={ev.id}
                    className="surface-subtle flex items-start justify-between gap-2.5 rounded-2xl px-3.5 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {ev.severity === 'critical' ? '🚨 ' : ev.severity === 'warn' ? '⚠️ ' : '✓ '}
                        {ev.label}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-fg-muted">
                        {[ev.deviceLabel, ev.ipMasked ? `IP ${ev.ipMasked}` : null].filter(Boolean).join(' · ') || '系统安全记录'}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums text-[11px] text-fg-muted">
                      {formatShortTime(ev.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2.5 text-xs text-fg-muted">暂无近期安全事件记录</p>
            )}
          </div>
        </div>
      </Sheet>

      {/* 隐私与安全白皮书 */}
      <Sheet open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="隐私与安全说明">
        <div className="space-y-3.5 pb-3 text-xs leading-relaxed text-fg-muted">
          <div className="surface-subtle rounded-2xl p-3.5">
            <p className="text-sm font-semibold text-fg">1. 教务密码与 Cookie 绝不经过服务器</p>
            <p className="mt-1">
              广工统一身份认证全程在你的手机本地 WebView 直连学校官网完成，GDUT Help 后端从不采集、不缓存也不记录你的统一认证密码或教务 Cookie；默认开启「用完即焚」，全量同步完成后自动清除本地学校 Cookie。
            </p>
          </div>

          <div className="surface-subtle rounded-2xl p-3.5">
            <p className="text-sm font-semibold text-fg">2. 硬件密钥库与正式版防篡改加固</p>
            <p className="mt-1">
              安卓正式版启用独立 4096 位签名证书与 R8 代码混淆，关闭调试权限（禁止 <code className="font-mono">adb run-as</code>）与系统备份导出，仅信任系统根证书防止代理抓包；登录刷新令牌使用 Android Keystore（AES-256-GCM）加密存储。
            </p>
            {storageStatus && (
              <p className="mt-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                当前设备保护：{storageStatus.algorithm}
              </p>
            )}
          </div>

          <div className="surface-subtle rounded-2xl p-3.5">
            <p className="text-sm font-semibold text-fg">3. 你的数据完全属于你</p>
            <p className="mt-1">
              匿名课程评价对他人展示时严格隐藏账号 ID，防止跨接口关联去匿名化；你可随时在此一键导出全部个人 JSON 数据、管理活跃设备或永久注销账号并级联清空云端记录。
            </p>
          </div>

          <div className="surface-subtle rounded-2xl p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-fg">4. 官方安装包 SHA-256 核验指纹</p>
              {apkSha256 && (
                <button
                  type="button"
                  onClick={() => void copySha256()}
                  className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-semibold text-accent"
                >
                  复制指纹
                </button>
              )}
            </div>
            <p className="mt-1">
              请仅从官方站点 <code className="font-mono text-fg">https://youhelp.top</code> 下载正式签名安装包，并核对 SHA-256：
            </p>
            <p className="mt-1.5 break-all rounded-xl bg-black/8 px-2.5 py-2 font-mono text-[11px] text-fg select-all dark:bg-white/10">
              {apkSha256 ?? '加载中或仅服务端托管 APK 时显示'}
            </p>
          </div>
        </div>
      </Sheet>

      <Sheet open={pwdOpen} onClose={() => setPwdOpen(false)} title={hasPassword ? '修改登录密码' : '设置登录密码'}>
        <form onSubmit={(e) => void handleSavePassword(e)} className="space-y-4 pb-2">
          <p className="text-sm text-fg-muted">
            {hasPassword
              ? '修改后其他旧设备的登录状态会自动失效，可直接用新密码在手机 App 或网页端登录。'
              : '设置密码后，之后登录不用每次收邮箱验证码，在 App 端切换设备也更方便。'}
          </p>
          {hasPassword && (
            <Field label="当前密码">
              <input
                className="field"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setPwdError(null);
                }}
              />
            </Field>
          )}
          <Field label="新密码（至少 8 位）">
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setPwdError(null);
              }}
              placeholder="建议字母与数字组合"
            />
          </Field>
          {pwdError && <p className="text-sm text-danger">{pwdError}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" type="button" className="flex-1" onClick={() => setPwdOpen(false)}>
              取消
            </Button>
            <Button type="submit" className="flex-1" loading={savingPwd}>
              保存密码
            </Button>
          </div>
        </form>
      </Sheet>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="永久注销账号">
        <form onSubmit={(e) => void handleDelete(e)} className="space-y-4 pb-2">
          <p className="text-sm leading-relaxed text-fg-muted">
            注销后将永久删除你的课表、待办、提醒、心情、口味偏好与评价记录，且无法恢复。建议先点击「导出数据 (JSON)」留存备份。
          </p>
          <Field label={`请输入当前账号邮箱 ${email} 以确认`}>
            <input
              className="field"
              type="email"
              value={confirmEmail}
              onChange={(e) => {
                setConfirmEmail(e.target.value);
                setDeleteError(null);
              }}
              placeholder={email}
              autoComplete="off"
            />
          </Field>
          {deleteError && <p className="text-sm text-danger">{deleteError}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" type="button" className="flex-1" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-danger! text-white!"
              disabled={confirmEmail.trim().toLowerCase() !== email.toLowerCase()}
              loading={deleting}
            >
              确认永久注销
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
