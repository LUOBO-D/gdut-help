import { updateProfileSchema, type UserProfile } from '@gduthelp/shared';
import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { ChevronRightIcon } from '../../components/icons';
import { ApiError, logout } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';
import { usePreferences } from '../../lib/queries';
import { SCENE_STYLES, SCENES, type Scene } from '../../lib/scene';
import { useUi } from '../../lib/ui-store';
import { pressable, spring } from '../../motion/presets';
import { PreferencesSheet } from '../food/PreferencesSheet';
import { CampusPicker } from './CampusPicker';
import { DisplaySettings } from './DisplaySettings';
import { ReminderSettings } from './ReminderSettings';
import { SemesterSettings } from './SemesterSettings';
import { useUpdateProfile } from './useUpdateProfile';

export function MePage() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [prefOpen, setPrefOpen] = useState(false);
  const prefQuery = usePreferences();
  if (!user) return null;

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
      <PageHeader title="我的" />
      <div className="space-y-4">
        <ProfileCard user={user} />
        <CampusPicker />
        <GlassCard className="p-5">
          <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setPrefOpen(true)}>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold">饮食偏好</h2>
              <p className="mt-1 truncate text-sm text-fg-muted">{prefSummary}</p>
            </div>
            <ChevronRightIcon size={18} className="shrink-0 text-fg-muted" />
          </button>
        </GlassCard>
        <ReminderSettings />
        {user.role === 'admin' && (
          <>
            <GlassCard className="p-5">
              <Link to="/admin" className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold">商家管理 · 管理员</h2>
                  <p className="mt-1 text-sm text-fg-muted">审核待上架商家、编辑信息或标记已关店</p>
                </div>
                <ChevronRightIcon size={18} className="shrink-0 text-fg-muted" />
              </Link>
            </GlassCard>
            <SemesterSettings />
          </>
        )}
        <ScenePicker />
        <DisplaySettings />
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
          退出登录
        </Button>
      </div>
      <PreferencesSheet open={prefOpen} onClose={() => setPrefOpen(false)} initial={pref} />
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

/** 手动预览各天气主题；选「自动」时跟随实时天气 */
function ScenePicker() {
  const override = useUi((s) => s.sceneOverride);
  const setOverride = useUi((s) => s.setSceneOverride);
  const options: (Scene | null)[] = [null, ...SCENES];

  return (
    <GlassCard className="p-5">
      <h2 className="text-[15px] font-semibold">主题预览</h2>
      <p className="mt-1 text-sm text-fg-muted">「自动」跟随实时天气；其他选项只是预览，不影响天气数据</p>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {options.map((scene) => {
          const active = override === scene;
          return (
            <motion.button
              key={scene ?? 'auto'}
              type="button"
              {...pressable}
              onClick={() => setOverride(scene)}
              className="relative flex flex-col items-center gap-1.5 rounded-2xl p-2 text-xs"
              aria-pressed={active}
            >
              {active && (
                <motion.span layoutId="scene-active" className="absolute inset-0 rounded-2xl bg-white/25" transition={spring.snappy} />
              )}
              <span
                className="relative size-10 rounded-full border border-white/50 shadow"
                style={{ background: scene ? SCENE_STYLES[scene].sky : 'conic-gradient(#ffc27a, #4b6cb7, #0f2027, #a1c4fd, #ffc27a)' }}
              />
              <span className="relative">{scene ? SCENE_STYLES[scene].label : '自动'}</span>
            </motion.button>
          );
        })}
      </div>
    </GlassCard>
  );
}
