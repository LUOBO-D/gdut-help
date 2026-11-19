import { EMAIL_CODE_LENGTH, emailCodeRequestSchema, type AuthSession, type EmailCodeSent } from '@gduthelp/shared';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { ArrowLeftIcon, MailIcon } from '../../components/icons';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';
import { spring } from '../../motion/presets';
import { CodeInput } from './CodeInput';

type Step = 'email' | 'code';

export function LoginPage() {
  const status = useAuth((s) => s.status);
  const setSession = useAuth((s) => s.setSession);
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const sendCode = useMutation({
    mutationFn: (to: string) =>
      api<EmailCodeSent>('/auth/email-code', { method: 'POST', body: { email: to }, auth: false }),
    onSuccess: (data) => {
      setStep('code');
      setCode('');
      setError(null);
      setCooldown(data.cooldownSeconds);
    },
    onError: (err) => setError(messageOf(err)),
  });

  const login = useMutation({
    mutationFn: (input: { email: string; code: string }) =>
      api<AuthSession>('/auth/login', { method: 'POST', body: input, auth: false }),
    onSuccess: (session) => {
      setSession(session);
      navigate(from, { replace: true });
    },
    onError: (err) => {
      setError(messageOf(err));
      setCode('');
    },
  });

  if (status === 'authenticated') return <Navigate to={from} replace />;

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    const parsed = emailCodeRequestSchema.safeParse({ email });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? '邮箱格式不正确');
    setEmail(parsed.data.email);
    sendCode.mutate(parsed.data.email);
  };

  const changeCode = (value: string) => {
    setCode(value);
    setError(null);
    if (value.length === EMAIL_CODE_LENGTH && !login.isPending) login.mutate({ email, code: value });
  };

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
          <AnimatePresence mode="wait" initial={false}>
            {step === 'email' ? (
              <motion.form
                key="email"
                onSubmit={submitEmail}
                className="space-y-5"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={spring.snappy}
                noValidate
              >
                <div>
                  <h2 className="text-xl font-semibold">邮箱登录</h2>
                  <p className="mt-1 text-sm text-fg-muted">首次登录会自动注册</p>
                </div>
                <label className="relative block">
                  <span className="sr-only">邮箱</span>
                  <MailIcon size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-muted" />
                  <input
                    className="field pl-12"
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
                <ErrorText message={error} />
                <Button type="submit" className="w-full" loading={sendCode.isPending}>
                  获取验证码
                </Button>
              </motion.form>
            ) : (
              <motion.div
                key="code"
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
                      setStep('email');
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
                <CodeInput value={code} onChange={changeCode} disabled={login.isPending} invalid={!!error} />
                <ErrorText message={error} />
                <Button
                  variant="ghost"
                  className="w-full"
                  disabled={cooldown > 0}
                  loading={sendCode.isPending}
                  onClick={() => sendCode.mutate(email)}
                >
                  {cooldown > 0 ? `${cooldown} 秒后可重新发送` : '重新发送验证码'}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>
      </div>
    </div>
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
