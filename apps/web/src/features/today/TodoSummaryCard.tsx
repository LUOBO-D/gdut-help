import { dayOffset, formatWhen } from '@gduthelp/shared';
import { Link } from 'react-router';
import { GlassCard } from '../../components/GlassCard';
import { CheckIcon, ChevronRightIcon, PlusIcon } from '../../components/icons';
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
    <GlassCard variants={stagger.item} className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <Link to="/todo" className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-fg-muted">
          <CheckIcon size={15} className="shrink-0 text-accent" />
          <h2 className="shrink-0">待办</h2>
          <span className="truncate font-normal">
            · {open.length ? `${open.length} 项未完成${dueToday ? ` (${dueToday} 今日)` : ''}` : '全部完成'}
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          {open.length > 3 && (
            <Link
              to="/todo"
              className="inline-flex items-center gap-0.5 text-xs font-medium text-accent transition-opacity hover:opacity-80"
            >
              全部
              <ChevronRightIcon size={14} />
            </Link>
          )}
          <Link
            to="/todo?new=1"
            aria-label="新建待办"
            className="surface-subtle surface-subtle-hover grid size-7 place-items-center rounded-full text-fg-muted hover:text-fg"
          >
            <PlusIcon size={14} />
          </Link>
        </div>
      </div>

      {open.length === 0 ? (
        <Link to="/todo?new=1" className="mt-3 block py-1 text-sm text-fg-muted">
          手头很清爽，点这里记一件待办 →
        </Link>
      ) : (
        <ul className="mt-2 divide-y divide-current/8">
          {open.slice(0, 3).map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5 first:pt-2 last:pb-0.5">
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
              <Link to="/todo" className="min-w-0 flex-1 truncate text-sm font-medium">
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
