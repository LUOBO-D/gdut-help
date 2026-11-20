import { LocalNotifications } from '@capacitor/local-notifications';
import type { Todo } from '@gduthelp/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { CHANNEL_ID, syncLocalReminders, TEST_NOTIFICATION_ID } from '../../lib/local-reminders';
import { keys } from '../../lib/queries';

interface Status {
  /** 通知权限（安卓 13 起需要单独授权） */
  display: string;
  /** 「闹钟和提醒」权限（安卓 12 起，没有它提醒可能延后几分钟到十几分钟） */
  exact: string;
  /** 已经写进手机、等待触发的提醒数量 */
  pending: number;
}

async function readStatus(): Promise<Status> {
  const [{ display }, { exact_alarm }, { notifications }] = await Promise.all([
    LocalNotifications.checkPermissions(),
    LocalNotifications.checkExactNotificationSetting(),
    LocalNotifications.getPending(),
  ]);
  return { display, exact: exact_alarm, pending: notifications.length };
}

/** App 里的提醒设置：检查通知和准点权限，引导去系统设置打开 */
export function NativeNotifySettings() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status | null>(null);
  const [testAt, setTestAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => setStatus(await readStatus()), []);
  useEffect(() => {
    void readStatus().then(setStatus);
    // 从系统设置返回 App 时重新检查
    const onVisible = () => document.visibilityState === 'visible' && void readStatus().then(setStatus);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const resync = async () => {
    const todos = qc.getQueryData<Todo[]>(keys.todos);
    if (todos) await syncLocalReminders(todos);
    await refresh();
  };

  const requestDisplay = async () => {
    await LocalNotifications.requestPermissions();
    await resync();
  };

  const openExact = async () => {
    await LocalNotifications.changeExactNotificationSetting();
    await refresh();
  };

  /** 一分钟后弹一条测试通知。可以锁屏、划掉 App 后台来验证 */
  const test = async () => {
    const at = new Date(Date.now() + 60_000);
    // 上一条测试通知还留在通知栏里时，同 id 的新通知只会替换它，不会再响铃，所以先清掉
    const { notifications: delivered } = await LocalNotifications.getDeliveredNotifications();
    const old = delivered.filter((n) => n.id === TEST_NOTIFICATION_ID);
    if (old.length) await LocalNotifications.removeDeliveredNotifications({ notifications: old });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: TEST_NOTIFICATION_ID,
          title: '测试提醒',
          body: '能看到这条，说明手机本地提醒正常',
          channelId: CHANNEL_ID,
          smallIcon: 'ic_stat_notify',
          schedule: { at, allowWhileIdle: true },
          extra: { link: '/me' },
        },
      ],
    });
    setTestAt(at);
    await refresh();
  };

  if (!status) return <p className="py-3 text-sm text-fg-muted">检测中…</p>;
  const displayOk = status.display === 'granted';
  const exactOk = status.exact === 'granted';

  return (
    <div className="space-y-3 py-3 text-sm">
      <Row label="通知权限" ok={displayOk} text={displayOk ? '已允许' : '未允许，提醒不会弹出'}>
        {!displayOk && (
          <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => void requestDisplay()}>
            去允许
          </Button>
        )}
      </Row>
      <Row label="闹钟和提醒" ok={exactOk} text={exactOk ? '已允许，提醒准点弹出' : '未允许，提醒可能延后几分钟'}>
        {!exactOk && (
          <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => void openExact()}>
            去设置
          </Button>
        )}
      </Row>
      <p className="text-fg-muted">
        已写入手机的提醒：{status.pending} 条（未来 7 天内）。提醒存在手机里，电脑关机、手机断网也会准时弹出。
        在电脑上新建的待办，要打开一次 App 才会写进手机。
      </p>
      <p className="text-fg-muted">
        一加 / OPPO 手机还需要：设置 → 应用 → GDUT Help → 耗电管理，选「允许后台行为」，并打开「自启动」，否则重启手机后提醒可能失效。
        通知 → 待办提醒里打开「横幅通知」「锁屏通知」「响铃」，否则提醒只会安静地出现在通知栏里。
      </p>
      <Button variant="ghost" className="w-full" disabled={!displayOk} onClick={() => void test()}>
        1 分钟后弹一条测试通知
      </Button>
      {testAt && <p className="text-fg-muted">已安排在 {testAt.toLocaleTimeString('zh-CN', { hour12: false })} 弹出，可以先锁屏等待。</p>}
    </div>
  );
}

function Row({ label, ok, text, children }: { label: string; ok: boolean; text: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`size-2 shrink-0 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-fg-muted">{text}</p>
      </div>
      {children}
    </div>
  );
}
