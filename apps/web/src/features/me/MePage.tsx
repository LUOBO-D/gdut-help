import {
  changePasswordSchema,
  computeGpaSummary,
  defaultAcademicYear,
  deleteAccountSchema,
  evaluateFitnessRecord,
  FITNESS_LEVEL_LABELS,
  today,
  updateProfileSchema,
  type UserDataExport,
  type UserProfile,
} from '@gduthelp/shared';
import { motion } from 'motion/react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Sheet } from '../../components/Sheet';
import { ChevronRightIcon } from '../../components/icons';
import { api, ApiError, deleteAccount, logout, logoutAll } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';
import { useOtaStore } from '../../lib/ota-store';
import { DEFAULT_API_ORIGIN, getApiOrigin, isNative, normalizeApiOrigin, setApiOriginOverride } from '../../lib/platform';
import { useCurrentFitness, useGrades, usePreferences } from '../../lib/queries';
import {
  SCENE_STYLES,
  SCENES,
  TIME_PHASE_LABELS,
  TIME_PHASES,
  type Scene,
  type TimePhase,
} from '../../lib/scene';
import { useScene } from '../../lib/use-scene';
import { toast } from '../../lib/toast-store';
import { useUi } from '../../lib/ui-store';
import { pressable, spring } from '../../motion/presets';
import { PreferencesSheet } from '../food/PreferencesSheet';
import { CampusPicker } from './CampusPicker';
import { DisplaySettings } from './DisplaySettings';
import { GdutAuthCard } from './GdutAuthCard';
import { ReminderSettings } from './ReminderSettings';
import { SemesterSettings } from './SemesterSettings';
import { useUpdateProfile } from './useUpdateProfile';

export function MePage() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [prefOpen, setPrefOpen] = useState(false);
  const prefQuery = usePreferences();
  const gradesQuery = useGrades();
  const fitnessQuery = useCurrentFitness(defaultAcademicYear());
  if (!user) return null;

  const gpaSummary = computeGpaSummary(gradesQuery.data?.grades ?? []);
  const currentFitness = fitnessQuery.data?.record ?? null;
  const fitnessEval = currentFitness ? evaluateFitnessRecord(currentFitness) : null;
  const scoresSummaryParts: string[] = [];
  if (gpaSummary.courseCount > 0) {
    scoresSummaryParts.push(`平均绩点 ${gpaSummary.gpa.toFixed(2)}`);
  }
  if (fitnessEval && (fitnessEval.completedCount > 0 || currentFitness?.exempt)) {
    scoresSummaryParts.push(`本学年体测 ${fitnessEval.totalScore.toFixed(1)} 分（${FITNESS_LEVEL_LABELS[fitnessEval.level]}）`);
  }
  const scoresSummary =
    scoresSummaryParts.length > 0 ? scoresSummaryParts.join(' · ') : '查看广工 5.0 绩点与当前学年体测，支持自动更新';

  const pref = prefQuery.data;
  const prefSummary =
    pref && (pref.tastes.length || pref.dislikes.length || pref.budgetMin != null || pref.budgetMax != null)
      ? [
          pref.tastes.length ? `偏好：${pref.tastes.slice(0, 3).join('·')}` : null,
          pref.dislikes.length ? `忌口：${pref.dislikes.slice(0, 3).join('·')}` : null,
          pref.budgetMin != null || pref.budgetMax != null
            ? `预算：¥${pref.budgetMin ?? '不限'}–${pref.budgetMax ?? '不限'}`
            : null,
        ]
          .filter(Boolean)
          .join(' ｜ ')
      : '未设置口味、忌口与预算';

  return (
    <>
      <PageHeader title="我的" subtitle="账号资料、学业偏好与系统设置" />
      <div className="space-y-6">
        <section className="space-y-3">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-fg-muted">个人与校区</h2>
          <ProfileCard user={user} />
          <CampusPicker />
        </section>

        <section className="space-y-3">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-fg-muted">学业与偏好</h2>
          <GdutAuthCard />
          <GlassCard className="p-5">
            <Link to="/study?tab=scores" className="flex w-full items-center justify-between gap-3 text-left">
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold">成绩与体测</h3>
                <p className="mt-1 truncate text-sm text-fg-muted">{scoresSummary}</p>
              </div>
              <ChevronRightIcon size={18} className="shrink-0 text-fg-muted" />
            </Link>
          </GlassCard>
          <GlassCard className="p-5">
            <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setPrefOpen(true)}>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold">饮食偏好</h3>
                <p className="mt-1 truncate text-sm text-fg-muted">{prefSummary}</p>
              </div>
              <ChevronRightIcon size={18} className="shrink-0 text-fg-muted" />
            </button>
          </GlassCard>
          <ReminderSettings />
        </section>

        {user.role === 'admin' && (
          <section className="space-y-3">
            <h2 className="px-1 text-xs font-semibold tracking-wide text-fg-muted">管理员工具</h2>
            <GlassCard className="p-5">
              <Link to="/admin" className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold">商家管理</h3>
                  <p className="mt-1 text-sm text-fg-muted">审核待上架商家、编辑信息或标记已关店</p>
                </div>
                <ChevronRightIcon size={18} className="shrink-0 text-fg-muted" />
              </Link>
            </GlassCard>
            <SemesterSettings />
          </section>
        )}

        <section className="space-y-3">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-fg-muted">外观与系统</h2>
          <ScenePicker />
          <DisplaySettings />
          {isNative && <AppUpdateCard />}
          <AccountSecurityCard
            email={user.email}
            hasPassword={user.hasPassword}
            onLoggedOut={() => navigate('/login', { replace: true })}
          />
          <Button
            variant="ghost"
            className="w-full"
            loading={loggingOut}
            onClick={async () => {
              setLoggingOut(true);
              await logout().catch(() => undefined);
              navigate('/login', { replace: true });
            }}
          >
            退出当前设备
          </Button>
        </section>
      </div>
      <PreferencesSheet open={prefOpen} onClose={() => setPrefOpen(false)} initial={pref} />
    </>
  );
}

/** 账号安全与个人数据自主权：登录密码、JSON 导出备份、退出全部设备、二次确认注销账号 */
function AccountSecurityCard({
  email,
  hasPassword,
  onLoggedOut,
}: {
  email: string;
  hasPassword: boolean;
  onLoggedOut: () => void;
}) {
  const setUser = useAuth((s) => s.setUser);
  const [exporting, setExporting] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      toast.success(hasPassword ? '登录密码已修改' : '已设置登录密码，下次可直接用密码登录');
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

  return (
    <>
      <GlassCard className="p-5">
        <h2 className="text-[15px] font-semibold">账号安全与数据</h2>
        <p className="mt-1 text-sm text-fg-muted">支持设置登录密码、随时备份个人数据或清理其他设备的登录状态</p>
        <div className="mt-3.5 grid gap-2 sm:grid-cols-3">
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
          <Button variant="ghost" className="h-10 text-sm" loading={loggingOutAll} onClick={() => void handleLogoutAll()}>
            退出全部设备
          </Button>
        </div>
        <div className="mt-3 border-t border-current/10 pt-3">
          <button
            type="button"
            onClick={() => {
              setConfirmEmail('');
              setDeleteError(null);
              setDeleteOpen(true);
            }}
            className="text-xs font-medium text-danger hover:underline"
          >
            永久注销账号并清空个人数据…
          </button>
        </div>
      </GlassCard>

      <Sheet open={pwdOpen} onClose={() => setPwdOpen(false)} title={hasPassword ? '修改登录密码' : '设置登录密码'}>
        <form onSubmit={(e) => void handleSavePassword(e)} className="space-y-4 pb-2">
          <p className="text-sm text-fg-muted">
            {hasPassword
              ? '修改后可直接用新密码在手机 App 或网页端登录。'
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
            注销后将永久删除你的课表、待办、提醒、心情、口味偏好与评价记录，且无法恢复。建议先点击「导出我的数据」留存备份。
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

function ProfileCard({ user }: { user: UserProfile }) {
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(user.nickname);
  const [error, setError] = useState<string | null>(null);
  const save = useUpdateProfile();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = updateProfileSchema.safeParse({ nickname });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? '昵称不合法');
    save.mutate(parsed.data, {
      onSuccess: () => setEditing(false),
      onError: (err) => setError(err instanceof ApiError ? err.message : '保存失败'),
    });
  };

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-4">
        <div className="grid size-16 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_30%_25%,white,var(--accent))] text-2xl font-bold text-accent-fg shadow-lg">
          {user.nickname.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <form onSubmit={submit} className="flex gap-2">
              <input
                className="field h-10 py-0"
                value={nickname}
                maxLength={20}
                autoFocus
                aria-label="昵称"
                onChange={(e) => {
                  setNickname(e.target.value);
                  setError(null);
                }}
              />
              <Button type="submit" className="h-10 shrink-0 px-4 text-sm" loading={save.isPending}>
                保存
              </Button>
            </form>
          ) : (
            <button type="button" className="flex max-w-full items-center gap-2 text-left" onClick={() => setEditing(true)}>
              <span className="truncate text-xl font-semibold">{user.nickname}</span>
              <span className="shrink-0 text-xs text-fg-muted">修改</span>
            </button>
          )}
          {error && <p className="mt-1 text-sm text-danger">{error}</p>}
          <p className="mt-1 truncate text-sm text-fg-muted">{user.email}</p>
        </div>
        {user.role === 'admin' && (
          <span className="shrink-0 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-fg">管理员</span>
        )}
      </div>
    </GlassCard>
  );
}

/** 手动预览各天气与时段光影；选「自动」时随实时天气与北京时间自动切换全站 UI */
function ScenePicker() {
  const override = useUi((s) => s.sceneOverride);
  const timeOverride = useUi((s) => s.timeOverride);
  const setOverride = useUi((s) => s.setSceneOverride);
  const setTimeOverride = useUi((s) => s.setTimeOverride);
  const active = useScene();
  const options: (Scene | null)[] = [null, ...SCENES];
  const timeOptions: (TimePhase | null)[] = [null, ...TIME_PHASES];
  const hasOverride = override !== null || timeOverride !== null;

  return (
    <GlassCard className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold">天气与昼夜主题</h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            当前生效：
            <strong className="text-fg">
              {SCENE_STYLES[active.scene].label} · {TIME_PHASE_LABELS[active.timePhase]}
            </strong>
            {hasOverride ? '（预览中）' : '（自动跟随实时天气与时间）'}
          </p>
        </div>
        {hasOverride && (
          <button
            type="button"
            onClick={() => {
              setOverride(null);
              setTimeOverride(null);
            }}
            className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent hover:opacity-85"
          >
            恢复自动
          </button>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-fg-muted">天气氛围</p>
        <div className="grid grid-cols-4 gap-2">
          {options.map((scene) => {
            const isPicked = override === scene;
            return (
              <motion.button
                key={scene ?? 'auto'}
                type="button"
                {...pressable}
                onClick={() => setOverride(scene)}
                className="relative flex flex-col items-center gap-1.5 rounded-2xl p-2 text-xs"
                aria-pressed={isPicked}
              >
                {isPicked && (
                  <motion.span layoutId="scene-active" className="absolute inset-0 rounded-2xl bg-white/25" transition={spring.snappy} />
                )}
                <span
                  className="relative size-9 rounded-full border border-white/50 shadow"
                  style={{ background: scene ? SCENE_STYLES[scene].sky : 'conic-gradient(#ffc27a, #4b6cb7, #0f2027, #a1c4fd, #ffc27a)' }}
                />
                <span className="relative">{scene ? SCENE_STYLES[scene].label : '自动'}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-current/10 pt-3">
        <p className="mb-2 text-xs font-medium text-fg-muted">时段光影（清晨 / 白天 / 黄昏 / 夜晚）</p>
        <div className="grid grid-cols-5 gap-1.5">
          {timeOptions.map((phase) => {
            const isPicked = timeOverride === phase;
            return (
              <button
                key={phase ?? 'auto-time'}
                type="button"
                onClick={() => setTimeOverride(phase)}
                className={`rounded-xl py-2 text-xs font-medium transition-colors ${
                  isPicked ? 'bg-accent font-semibold text-accent-fg shadow-sm' : 'surface-subtle text-fg-muted hover:text-fg'
                }`}
              >
                {phase ? TIME_PHASE_LABELS[phase] : '自动'}
              </button>
            );
          })}
        </div>
      </div>
    </GlassCard>
  );
}

/** 安卓 App 专属：显示当前资源包版本、一键检查热更新，并支持无需退出直接切换服务器地址 */
function AppUpdateCard() {
  const [info, setInfo] = useState<{ bundleVersion: string; nativeVersion: number; isOtaActive: boolean } | null>(null);
  const [checking, setChecking] = useState(false);
  const available = useOtaStore((s) => s.available);
  const openUpdateModal = useOtaStore((s) => s.openModal);
  const [origin, setOrigin] = useState(() => getApiOrigin());
  const [serverOpen, setServerOpen] = useState(false);
  const [draftOrigin, setDraftOrigin] = useState(() => getApiOrigin());
  const [testing, setTesting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    void import('../../lib/ota-updater').then((m) => m.getOtaInfo()).then(setInfo);
  }, []);

  const handleCheck = async () => {
    setChecking(true);
    try {
      const { checkForOtaUpdate } = await import('../../lib/ota-updater');
      const res = await checkForOtaUpdate({ interactive: true });
      if (res.status === 'up-to-date') {
        toast.info(`当前已是最新版本 v${res.currentVersion}`);
      } else if (res.status === 'error') {
        toast.error(res.message);
      }
    } finally {
      setChecking(false);
    }
  };

  const testServer = async () => {
    const cleaned = normalizeApiOrigin(draftOrigin);
    if (!/^https?:\/\//i.test(cleaned)) {
      setHint('请输入以 https:// 开头的服务器地址');
      return;
    }
    setTesting(true);
    setHint(null);
    try {
      const res = await fetch(`${cleaned}/api/v1/health`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setHint('连接正常，后端健康检查已通过');
    } catch {
      setHint('暂时连不上该地址，请确认后端和隧道在线');
    } finally {
      setTesting(false);
    }
  };

  const saveServer = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeApiOrigin(draftOrigin);
    if (cleaned && !/^https?:\/\//i.test(cleaned)) {
      setHint('地址需以 https:// 开头');
      return;
    }
    const saved = setApiOriginOverride(cleaned);
    setOrigin(saved);
    setServerOpen(false);
    toast.success('已切换服务器地址');
  };

  return (
    <>
      <GlassCard className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold">应用更新 · 热更新</h2>
              {available && (
                <button
                  type="button"
                  onClick={openUpdateModal}
                  className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg"
                >
                  新版本 v{available.latest.version}
                </button>
              )}
            </div>
            <p className="mt-1 text-sm text-fg-muted">
              当前版本 v{info?.bundleVersion ?? '…'}（外壳 v{info?.nativeVersion ?? 5}
              {info?.isOtaActive ? ' · 已热更新' : ''}）
            </p>
            {origin && <p className="mt-1 truncate text-xs text-fg-muted">后端：{origin}</p>}
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button
              variant="ghost"
              className="h-9 px-2.5 text-xs"
              onClick={() => {
                setDraftOrigin(origin);
                setHint(null);
                setServerOpen(true);
              }}
            >
              换地址
            </Button>
            <Button variant="ghost" className="h-9 px-3 text-sm" loading={checking} onClick={() => void handleCheck()}>
              {available ? '查看更新' : '检查更新'}
            </Button>
          </div>
        </div>
        <p className="mt-2.5 text-xs text-fg-muted">
          有新版本时会弹出更新说明并由你自由选择是否在线升级，日常改动无需重新发送安装包。
        </p>
      </GlassCard>

      <Sheet open={serverOpen} onClose={() => setServerOpen(false)} title="切换服务器地址">
        <form onSubmit={saveServer} className="space-y-4 pb-2">
          <p className="text-xs leading-relaxed text-fg-muted">
            临时公网隧道换址或迁到正式云服务器时，在这里粘贴新地址即可立即生效，无需退出登录或重装 APK。
          </p>
          <Field label="后端地址（不含 /api/v1）">
            <input
              className="field font-mono text-xs"
              type="url"
              placeholder="https://xxxx.trycloudflare.com"
              value={draftOrigin}
              onChange={(e) => {
                setDraftOrigin(e.target.value);
                setHint(null);
              }}
            />
          </Field>
          {hint && <p className="text-xs text-fg-muted">{hint}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" className="h-10 text-xs" loading={testing} onClick={() => void testServer()}>
              测试连通性
            </Button>
            {DEFAULT_API_ORIGIN && draftOrigin !== DEFAULT_API_ORIGIN && (
              <Button
                type="button"
                variant="ghost"
                className="h-10 text-xs"
                onClick={() => {
                  setDraftOrigin(DEFAULT_API_ORIGIN);
                  setHint(null);
                }}
              >
                恢复默认
              </Button>
            )}
            <Button type="submit" className="h-10 flex-1 text-xs">
              保存并使用
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
