import { dayOffset, formatWhen } from '@gduthelp/shared';
import { Link } from 'react-router';
import { GlassCard } from '../../components/GlassCard';
import { useTodos } from '../../lib/queries';
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
      <Link to="/todo" className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">待办</h2>
        <span className="text-xs text-fg-muted">
          {open.length ? `${open.length} 项未完成${dueToday ? ` · ${dueToday} 项今天截止` : ''}` : '全部完成'}
        </span>
      </Link>
      {open.length === 0 ? (
        <Link to="/todo" className="block py-3 text-sm text-fg-muted">
          没有待办，点这里添加
        </Link>
      ) : (
        <ul className="space-y-2.5">
          {open.slice(0, 3).map((t) => (
            <li key={t.id} className="flex items-center gap-3">
              <TodoCheck done={false} label={t.title} onToggle={() => toggle.mutate({ id: t.id, done: true })} />
              <span className="min-w-0 flex-1 truncate text-[15px]">{t.title}</span>
              {t.dueAt && (
                <span className={`shrink-0 text-xs ${new Date(t.dueAt) < now ? 'text-danger' : 'text-fg-muted'}`}>
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
