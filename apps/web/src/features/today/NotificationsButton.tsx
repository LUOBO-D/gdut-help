import { formatWhen } from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BellIcon } from '../../components/icons';
import { Sheet } from '../../components/Sheet';
import { api } from '../../lib/api';
import { keys, useNotifications } from '../../lib/queries';
import { useNow } from '../../lib/use-now';

/** 铃铛 + 未读数，点开显示站内通知列表，打开即全部标为已读 */
export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const markRead = useMutation({
    mutationFn: () => api<null>('/notifications/read', { method: 'POST', body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
  const unread = data?.unread ?? 0;
  const now = useNow();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (unread) markRead.mutate();
        }}
        className="glass-thin relative grid size-10 shrink-0 place-items-center rounded-full!"
        aria-label={unread ? `通知，${unread} 条未读` : '通知'}
      >
        <BellIcon size={19} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="通知">
        {!data?.items.length ? (
          <p className="py-10 text-center text-sm text-fg-muted">还没有通知</p>
        ) : (
          <ul className="divide-y divide-current/10">
            {data.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="w-full py-3 text-left"
                  onClick={() => {
                    setOpen(false);
                    if (n.link) navigate(n.link);
                  }}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={`truncate ${n.readAt ? '' : 'font-semibold'}`}>{n.title}</span>
                    <span className="shrink-0 text-xs text-fg-muted">{formatWhen(new Date(n.createdAt), now)}</span>
                  </span>
                  <span className="mt-0.5 block text-sm text-fg-muted">{n.body}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}
