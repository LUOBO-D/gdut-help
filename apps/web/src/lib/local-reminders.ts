/**
 * App 端：把待办提醒写成手机的本地通知。
 *
 * 到点由安卓系统直接弹出，不经过任何推送服务，电脑关机或手机断网也照常提醒。
 * 每次待办列表有变化（打开 App、回到前台、增删改待办）就整体重排一次：
 * 取消之前排好的全部通知，再按最新数据重新排。这样不用逐条比对，结果总是和服务端一致。
 *
 * 只有 App 里会加载这个模块（见 main.tsx），网页端不受影响。
 */
import type { Todo } from '@gduthelp/shared';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import type { QueryClient } from '@tanstack/react-query';
import { keys } from './queries';
import { planReminders, TEST_NOTIFICATION_ID } from './reminder-plan';

export const CHANNEL_ID = 'todo-reminders';
export { TEST_NOTIFICATION_ID };


let queue: Promise<void> = Promise.resolve();

/** 按最新的待办列表重排本地通知。连续调用会排队执行，不会交错 */
export function syncLocalReminders(todos: Todo[]): Promise<void> {
  queue = queue.then(() => doSync(todos)).catch((err: unknown) => console.warn('本地提醒同步失败', err));
  return queue;
}

async function doSync(todos: Todo[]) {
  const { display } = await LocalNotifications.checkPermissions();
  // 还没授权时不排（schedule 会自动弹授权框，打断用户）。授权在「我的 → 提醒设置」里引导
  if (display !== 'granted') return;
  const pending = (await LocalNotifications.getPending()).notifications.filter((n) => n.id !== TEST_NOTIFICATION_ID);
  if (pending.length) await LocalNotifications.cancel({ notifications: pending.map((n) => ({ id: n.id })) });
  const planned = planReminders(todos, new Date());
  if (!planned.length) return;
  const notifications: LocalNotificationSchema[] = planned.map((p) => ({
    id: p.id,
    title: p.title,
    body: p.body,
    largeBody: p.body,
    channelId: CHANNEL_ID,
    smallIcon: 'ic_stat_notify',
    schedule: { at: p.at, allowWhileIdle: true },
    extra: { link: '/todo', todoId: p.todoId },
  }));
  await LocalNotifications.schedule({ notifications });
}

/** 启动时调用一次：建通知渠道、监听待办缓存变化、处理点击通知 */
export async function initLocalReminders(queryClient: QueryClient, router: { navigate: (to: string) => unknown }) {
  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: '待办提醒',
    description: '待办到点时提醒',
    importance: 5,
    visibility: 1,
    vibration: true,
  });

  let last: Todo[] | undefined;
  const sync = () => {
    const todos = queryClient.getQueryData<Todo[]>(keys.todos);
    if (!todos || todos === last) return;
    last = todos;
    void syncLocalReminders(todos);
  };
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.query.queryKey[0] === keys.todos[0]) sync();
  });
  sync();

  await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
    const link = (notification.extra as { link?: string } | undefined)?.link;
    if (link) void Promise.resolve(router.navigate(link));
  });
}

/** 退出登录时清掉已排的通知，避免下一个账号收到上一个人的提醒 */
export async function clearLocalReminders() {
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }
}
