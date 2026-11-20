import type { DeliveryResult } from '@gduthelp/shared';
import { useMutation } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { Switch } from '../../components/Switch';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';
import { isNative } from '../../lib/platform';
import { disablePush, enablePush, PUSH_STATE_TEXT, pushState, type PushState } from '../../lib/push';
import { useUpdateProfile } from './useUpdateProfile';

// 只有 App 里才加载，网页端不下载本地通知插件
const NativeNotifySettings = lazy(() => import('./NativeNotifySettings').then((m) => ({ default: m.NativeNotifySettings })));

function describe(r: DeliveryResult): string {
  const push = r.push.sent ? `浏览器推送已发出 ${r.push.sent} 条` : r.push.failed ? '浏览器推送发送失败' : '没有开启浏览器推送的设备';
  const email = r.email === 'sent' ? '邮件已发送' : r.email === 'failed' ? '邮件发送失败' : '邮件提醒已关闭';
  return `站内通知已写入；${push}；${email}。`;
}

export function ReminderSettings() {
  const remindByEmail = useAuth((s) => s.user?.remindByEmail ?? true);
  const email = useAuth((s) => s.user?.email);
  const update = useUpdateProfile();
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // App 里不用浏览器推送（安卓 WebView 不支持），改用手机本地通知
    if (!isNative) void pushState().then(setPush);
  }, []);

  const test = useMutation({ mutationFn: () => api<DeliveryResult>('/notifications/test', { method: 'POST' }) });

  const togglePush = async (on: boolean) => {
    setBusy(true);
    try {
      setPush(on ? await enablePush() : await disablePush());
    } catch {
      setPush(await pushState());
    } finally {
      setBusy(false);
    }
  };
  const canToggle = push === 'enabled' || push === 'disabled';

  return (
    <GlassCard className="p-5">
      <h2 className="text-[15px] font-semibold">提醒设置</h2>
      <p className="mt-1 text-sm text-fg-muted">待办到点时，会同时写入站内通知（今天页右上角的铃铛）</p>
      <div className="mt-3 divide-y divide-current/10">
        {isNative ? (
          <Suspense fallback={<p className="py-3 text-sm text-fg-muted">检测中…</p>}>
            <NativeNotifySettings />
          </Suspense>
        ) : (
          <Switch
            label="浏览器推送"
            description={busy ? '处理中…' : push ? PUSH_STATE_TEXT[push] : '检测中…'}
            checked={push === 'enabled'}
            onChange={(v) => canToggle && !busy && void togglePush(v)}
          />
        )}
        <Switch
          label="邮件提醒"
          description={
            isNative
              ? `发送到 ${email}。App 已经用手机本地通知提醒，邮件是额外的一份，可以关掉`
              : `发送到 ${email}。安卓手机上浏览器推送常常收不到，建议保持开启`
          }
          checked={remindByEmail}
          onChange={(v) => update.mutate({ remindByEmail: v })}
        />
      </div>
      <Button variant="ghost" className="mt-3 w-full" loading={test.isPending} onClick={() => test.mutate()}>
        发送一条测试提醒
      </Button>
      {test.data && <p className="mt-2 text-sm text-fg-muted">{describe(test.data)}</p>}
      {test.error && <p className="mt-2 text-sm text-danger">{test.error instanceof ApiError ? test.error.message : '发送失败'}</p>}
    </GlassCard>
  );
}
