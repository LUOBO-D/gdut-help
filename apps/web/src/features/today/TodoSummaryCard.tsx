import { dayOffset, formatWhen } from '@gduthelp/shared';
import { Link } from 'react-router';
import { GlassCard } from '../../components/GlassCard';
import { PlusIcon } from '../../components/icons';
import { useTodos } from '../../lib/queries';
import { toast } from '../../lib/toast-store';
import { useNow } from '../../lib/use-now';
import { stagger } from '../../motion/presets';
import { useToggleTodo } from '../todo/mutations';
import { TodoCheck } from '../todo/TodoCheck';

export function TodoSummaryCard() {
  const { data: todos = [] } = useTodos();
  const toggle = useToggleTodo();
  const now = useNow();
  const open = todos.filter((t) => !t.completedAt);
  const dueToday = open.filter((t) => t.dueAt && dayOffset(new Date(t.dueAt), now) <= 0).length;

  return (
    <GlassCard variants={stagger.item} className="col-span-2 p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <Link to="/todo" className="flex min-w-0 items-baseline gap-2">
          <h2 className="text-[15px] font-semibold">待办</h2>
          <span className="truncate text-xs text-fg-muted">
            {open.length ? `${open.length} 项未完成${dueToday ? ` · ${dueToday} 项今天截止` : ''}` : '全部完成'}
          </span>
        </Link>
        <Link
          to="/todo?new=1"
          aria-label="新建待办"
          className="surface-subtle surface-subtle-hover grid size-7 shrink-0 place-items-center rounded-full text-fg-muted hover:text-fg"
        >
          <PlusIcon size={15} />
        </Link>
      </div>
      {open.length === 0 ? (
        <Link to="/todo?new=1" className="block py-3 text-sm text-fg-muted">
          手头很清爽，点这里记一件待办
        </Link>
      ) : (
        <ul className="space-y-2.5">
          {open.slice(0, 3).map((t) => (
            <li key={t.id} className="flex items-center gap-3">
              <TodoCheck
                done={false}
                label={t.title}
                onToggle={() =>
                  toggle.mutate(
                    { id: t.id, done: true },
                    { onSuccess: () => toast.success(`已完成「${t.title}」`) },
                  )
                }
              />
              <Link to="/todo" className="min-w-0 flex-1 truncate text-[15px]">
                {t.title}
              </Link>
              {t.dueAt && (
                <span
                  className={`shrink-0 font-num text-xs tabular-nums ${
                    new Date(t.dueAt) < now ? 'font-medium text-danger' : 'text-fg-muted'
                  }`}
                >
                  {formatWhen(new Date(t.dueAt), now)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
