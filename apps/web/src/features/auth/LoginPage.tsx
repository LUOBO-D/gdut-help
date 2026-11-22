import {
  EMAIL_CODE_LENGTH,
  emailCodeRequestSchema,
  passwordLoginRequestSchema,
  passwordSchema,
  type AuthConfig,
  type AuthSession,
  type EmailCodeSent,
} from '@gduthelp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { GlassCard } from '../../components/GlassCard';
import { Sheet } from '../../components/Sheet';
import { ArrowLeftIcon, MailIcon, MapIcon } from '../../components/icons';
import { api, ApiError, saveSession } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';
import {
  DEFAULT_API_ORIGIN,
  getApiOrigin,
  isNative,
  normalizeApiOrigin,
  setApiOriginOverride,
} from '../../lib/platform';
import { toast } from '../../lib/toast-store';
import { spring } from '../../motion/presets';
import { CodeInput } from './CodeInput';

type Mode = 'password' | 'code' | 'register' | 'reset';

export function LoginPage() {
  const status = useAuth((s) => s.status);
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';

  const configQuery = useQuery({
    queryKey: ['auth-config'],
    queryFn: () => api<AuthConfig>('/auth/config', { auth: false }),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const authConfig = configQuery.data;

  const [mode, setMode] = useState<Mode>('password');
  const [codeStep, setCodeStep] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [nickname, setNickname] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setCodeStep(false);
    setCode('');
    setPassword('');
    setError(null);
  };

  const sendCode = useMutation({
    mutationFn: (payload: { email: string; inviteCode?: string }) =>
      api<EmailCodeSent>('/auth/email-code', { method: 'POST', body: payload, auth: false }),
    onSuccess: (data) => {
      setCodeStep(true);
      setCode('');
      setError(null);
      setCooldown(data.cooldownSeconds);
    },
    onError: (err) => setError(messageOf(err)),
  });

  const codeLogin = useMutation({
    mutationFn: (input: { email: string; code: string; inviteCode?: string }) =>
      api<AuthSession>('/auth/login', { method: 'POST', body: input, auth: false }),
    onSuccess: async (session) => {
      await saveSession(session);
      navigate(from, { replace: true });
    },
    onError: (err) => {
      setError(messageOf(err));
      setCode('');
    },
  });

  const passwordLogin = useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api<AuthSession>('/auth/login/password', { method: 'POST', body: input, auth: false }),
    onSuccess: async (session) => {
      await saveSession(session);
      navigate(from, { replace: true });
    },
    onError: (err) => setError(messageOf(err)),
  });

  const registerMutation = useMutation({
    mutationFn: (input: { email: string; code: string; password: string; nickname?: string; inviteCode?: string }) =>
      api<AuthSession>('/auth/register', { method: 'POST', body: input, auth: false }),
    onSuccess: async (session) => {
      await saveSession(session);
      toast.success('注册并设置密码成功');
      navigate(from, { replace: true });
    },
    onError: (err) => setError(messageOf(err)),
  });

  const resetMutation = useMutation({
    mutationFn: (input: { email: string; code: string; newPassword: string }) =>
      api<null>('/auth/password/reset', { method: 'POST', body: input, auth: false }),
    onSuccess: () => {
      toast.success('密码已重置，请使用新密码登录');
      switchMode('password');
    },
    onError: (err) => setError(messageOf(err)),
  });

  if (status === 'authenticated') return <Navigate to={from} replace />;

  const domainHint = authConfig?.allowedEmailDomains.length
    ? `支持 ${authConfig.allowedEmailDomains.map((d) => `@${d}`).join(' / ')} 邮箱`
    : '支持广工邮箱、QQ 邮箱等常用邮箱';

  const requestEmailCode = (e?: FormEvent) => {
    e?.preventDefault();
    const parsed = emailCodeRequestSchema.safeParse({
      email,
      inviteCode: authConfig?.inviteRequired && mode !== 'reset' ? inviteCode : undefined,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? '邮箱格式不正确');
    setEmail(parsed.data.email);
    sendCode.mutate({ email: parsed.data.email, inviteCode: parsed.data.inviteCode });
  };

  const submitPasswordLogin = (e: FormEvent) => {
    e.preventDefault();
    const parsed = passwordLoginRequestSchema.safeParse({ email, password });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? '请检查邮箱和密码');
    setEmail(parsed.data.email);
    passwordLogin.mutate(parsed.data);
  };

  const changeQuickCode = (value: string) => {
    setCode(value);
    setError(null);
    if (mode === 'code' && value.length === EMAIL_CODE_LENGTH && !codeLogin.isPending) {
      codeLogin.mutate({
        email,
        code: value,
        inviteCode: authConfig?.inviteRequired ? inviteCode.trim() || undefined : undefined,
      });
    }
  };

  const submitRegisterOrReset = (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== EMAIL_CODE_LENGTH) return setError(`请输入 ${EMAIL_CODE_LENGTH} 位邮箱验证码`);
    const pwd = passwordSchema.safeParse(password);
    if (!pwd.success) return setError(pwd.error.issues[0]?.message ?? '密码至少 8 位');

    if (mode === 'register') {
      registerMutation.mutate({
        email,
        code,
        password: pwd.data,
        nickname: nickname.trim() || undefined,
        inviteCode: authConfig?.inviteRequired ? inviteCode.trim() || undefined : undefined,
      });
    } else {
      resetMutation.mutate({ email, code, newPassword: pwd.data });
    }
  };

  const isMainTab = mode === 'password' || mode === 'code';

  return (
    <div className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <motion.div
          className="mb-8 text-center"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.snappy}
        >
          <h1 className="text-4xl font-bold tracking-tight">GDUT Help</h1>
          <p className="mt-2 text-fg-muted">广工校园生活助手</p>
        </motion.div>

        <GlassCard
          variant="thick"
          className="overflow-hidden p-6"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring.snappy, delay: 0.05 }}
          layout
        >
          {isMainTab && !codeStep && (
            <div className="surface-subtle mb-5 grid grid-cols-2 rounded-full p-1" role="tablist" aria-label="登录方式">
              {(
                [
                  { id: 'password', label: '密码登录' },
                  { id: 'code', label: '验证码登录' },
                ] as const
              ).map((tab) => {
                const active = mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => switchMode(tab.id)}
                    className={`relative rounded-full py-1.5 text-sm font-medium transition-colors ${
                      active ? 'text-accent-fg' : 'text-fg-muted'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="login-mode-pill"
                        transition={spring.snappy}
                        className="absolute inset-0 rounded-full bg-accent"
                      />
                    )}
                    <span className="relative">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            {mode === 'password' && (
              <motion.form
                key="password"
                onSubmit={submitPasswordLogin}
                className="space-y-4"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={spring.snappy}
                noValidate
              >
                <div>
                  <h2 className="text-xl font-semibold">欢迎回来</h2>
                  <p className="mt-1 text-xs text-fg-muted">{domainHint}</p>
                </div>

                <label className="relative block">
                  <span className="sr-only">邮箱</span>
                  <MailIcon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-muted" />
                  <input
                    className="field pl-11"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="邮箱地址"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    autoFocus
                  />
                </label>

                <div className="relative">
                  <input
                    className="field pr-14"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="登录密码"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 px-1 text-xs text-fg-muted hover:text-fg"
                  >
                    {showPassword ? '隐藏' : '显示'}
                  </button>
                </div>

                <ErrorText message={error} />

                <Button type="submit" className="w-full" loading={passwordLogin.isPending}>
                  登录
                </Button>

                <div className="flex items-center justify-between pt-1 text-xs text-fg-muted">
                  <button type="button" className="text-accent hover:underline" onClick={() => switchMode('register')}>
                    新同学注册 / 设密码
                  </button>
                  <button type="button" className="hover:text-fg hover:underline" onClick={() => switchMode('reset')}>
                    忘记密码？
                  </button>
                </div>
              </motion.form>
            )}

            {mode === 'code' && !codeStep && (
              <motion.form
                key="code-email"
                onSubmit={requestEmailCode}
                className="space-y-4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={spring.snappy}
                noValidate
              >
                <div>
                  <h2 className="text-xl font-semibold">邮箱验证码登录</h2>
                  <p className="mt-1 text-xs text-fg-muted">首次验证会自动注册账号 · {domainHint}</p>
                </div>
                <label className="relative block">
                  <span className="sr-only">邮箱</span>
                  <MailIcon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-muted" />
                  <input
                    className="field pl-11"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="你的邮箱"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    autoFocus
                  />
                </label>
                {authConfig?.inviteRequired && (
                  <input
                    className="field"
                    type="text"
                    placeholder="校园邀请码（新用户必填，老用户可留空）"
                    value={inviteCode}
                    onChange={(e) => {
                      setInviteCode(e.target.value);
                      setError(null);
                    }}
                  />
                )}
                <ErrorText message={error} />
                <Button type="submit" className="w-full" loading={sendCode.isPending}>
                  获取 6 位验证码
                </Button>
              </motion.form>
            )}

            {mode === 'code' && codeStep && (
              <motion.div
                key="code-verify"
                className="space-y-5"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={spring.snappy}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    className="-ml-2 rounded-full p-2 text-fg-muted"
                    onClick={() => {
                      setCodeStep(false);
                      setError(null);
                    }}
                    aria-label="返回修改邮箱"
                  >
                    <ArrowLeftIcon size={20} />
                  </button>
                  <div>
                    <h2 className="text-xl font-semibold">输入验证码</h2>
                    <p className="mt-1 break-all text-sm text-fg-muted">已发送到 {email}</p>
                  </div>
                </div>
                <CodeInput value={code} onChange={changeQuickCode} disabled={codeLogin.isPending} invalid={!!error} />
                <ErrorText message={error} />
                <Button
                  variant="ghost"
                  className="w-full"
                  disabled={cooldown > 0}
                  loading={sendCode.isPending}
                  onClick={() => requestEmailCode()}
                >
                  {cooldown > 0 ? `${cooldown} 秒后可重新发送` : '重新发送验证码'}
                </Button>
              </motion.div>
            )}

            {(mode === 'register' || mode === 'reset') && (
              <motion.div
                key={`${mode}-${codeStep ? 'verify' : 'email'}`}
                className="space-y-4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={spring.snappy}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    className="-ml-2 rounded-full p-2 text-fg-muted"
                    onClick={() => (codeStep ? setCodeStep(false) : switchMode('password'))}
                    aria-label="返回"
                  >
                    <ArrowLeftIcon size={20} />
                  </button>
                  <div>
                    <h2 className="text-xl font-semibold">
                      {mode === 'register' ? '邮箱注册并设密码' : '重置登录密码'}
                    </h2>
                    <p className="mt-1 text-xs text-fg-muted">
                      {codeStep
                        ? `验证码已发送到 ${email}`
                        : mode === 'register'
                          ? `验证邮箱并设置密码，以后免收邮件直接登 · ${domainHint}`
                          : '通过邮箱验证码重置密码，并自动退出其他设备'}
                    </p>
                  </div>
                </div>

                {!codeStep ? (
                  <form onSubmit={requestEmailCode} className="space-y-4" noValidate>
                    <label className="relative block">
                      <span className="sr-only">邮箱</span>
                      <MailIcon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-muted" />
                      <input
                        className="field pl-11"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="你的邮箱"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setError(null);
                        }}
                        autoFocus
                      />
                    </label>
                    {mode === 'register' && authConfig?.inviteRequired && (
                      <input
                        className="field"
                        type="text"
                        placeholder="校园邀请码（新用户必填）"
                        value={inviteCode}
                        onChange={(e) => {
                          setInviteCode(e.target.value);
                          setError(null);
                        }}
                      />
                    )}
                    <ErrorText message={error} />
                    <Button type="submit" className="w-full" loading={sendCode.isPending}>
                      发送验证码
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={submitRegisterOrReset} className="space-y-3.5" noValidate>
                    <CodeInput value={code} onChange={(v) => { setCode(v); setError(null); }} invalid={!!error} />
                    {mode === 'register' && (
                      <input
                        className="field"
                        type="text"
                        maxLength={20}
                        placeholder="昵称（可选，如：大学城干饭王）"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                      />
                    )}
                    <div className="relative">
                      <input
                        className="field pr-14"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder={mode === 'register' ? '设置登录密码（至少 8 位）' : '输入新密码（至少 8 位）'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError(null);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 px-1 text-xs text-fg-muted hover:text-fg"
                      >
                        {showPassword ? '隐藏' : '显示'}
                      </button>
                    </div>
                    <ErrorText message={error} />
                    <Button
                      type="submit"
                      className="w-full"
                      loading={registerMutation.isPending || resetMutation.isPending}
                    >
                      {mode === 'register' ? '完成注册并登录' : '确认重置密码'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      disabled={cooldown > 0}
                      loading={sendCode.isPending}
                      onClick={() => requestEmailCode()}
                    >
                      {cooldown > 0 ? `${cooldown} 秒后可重新发送` : '重新发送验证码'}
                    </Button>
                  </form>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>

        <div className="mt-4">
          <Link
            to="/map"
            state={{ fromLogin: true }}
            className="glass flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-fg transition-transform active:scale-[0.98]"
          >
            <MapIcon size={17} className="text-accent" />
            <span>先逛逛广工大学城 3D 校园地图（免登录）</span>
          </Link>
        </div>

        {isNative && <NativeServerSettings />}
      </div>
    </div>
  );
}

/** 安卓 App 专属：支持运行时切换后端地址，临时隧道换址或迁移云服务器无需重新安装 APK */
function NativeServerSettings() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [currentOrigin, setCurrentOrigin] = useState(() => getApiOrigin());
  const [draft, setDraft] = useState(() => getApiOrigin());
  const [testing, setTesting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const openSheet = () => {
    const cur = getApiOrigin();
    setCurrentOrigin(cur);
    setDraft(cur);
    setHint(null);
    setOpen(true);
  };

  const testConnection = async (raw: string) => {
    const origin = normalizeApiOrigin(raw);
    if (!/^https?:\/\//i.test(origin)) {
      setHint('请输入以 https:// 开头的服务器地址');
      return false;
    }
    setTesting(true);
    setHint(null);
    try {
      const res = await fetch(`${origin}/api/v1/health`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setHint('连接正常，后端健康检查已通过');
      return true;
    } catch {
      setHint('暂时连不上该地址，请确认后端和公网隧道正在运行');
      return false;
    } finally {
      setTesting(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeApiOrigin(draft);
    if (cleaned && !/^https?:\/\//i.test(cleaned)) {
      setHint('地址需以 https:// 开头');
      return;
    }
    const saved = setApiOriginOverride(cleaned);
    setCurrentOrigin(saved);
    void qc.invalidateQueries({ queryKey: ['auth-config'] });
    toast.success('已切换服务器地址');
    setOpen(false);
  };

  return (
    <>
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={openSheet}
          className="text-xs text-fg-muted underline-offset-4 hover:text-fg hover:underline"
        >
          服务器地址{currentOrigin ? ` · ${currentOrigin.replace(/^https?:\/\//, '')}` : '（未配置）'}
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="服务器地址设置">
        <form onSubmit={save} className="space-y-4 pb-2">
          <p className="text-xs leading-relaxed text-fg-muted">
            换用新的临时公网隧道或迁移到云服务器时，在这里粘贴新地址即可直接连接，无需重新安装 APK。
          </p>
          <Field label="后端地址（不含 /api/v1）">
            <input
              className="field font-mono text-xs"
              type="url"
              placeholder="https://xxxx.trycloudflare.com"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setHint(null);
              }}
            />
          </Field>
          {hint && <p className="text-xs text-fg-muted">{hint}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" className="h-10 text-xs" loading={testing} onClick={() => void testConnection(draft)}>
              测试连通性
            </Button>
            {DEFAULT_API_ORIGIN && draft !== DEFAULT_API_ORIGIN && (
              <Button
                type="button"
                variant="ghost"
                className="h-10 text-xs"
                onClick={() => {
                  setDraft(DEFAULT_API_ORIGIN);
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

function ErrorText({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.p
          role="alert"
          className="text-sm font-medium text-danger"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : '出了点问题，请稍后再试';
}
