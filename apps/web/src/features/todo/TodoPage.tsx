import { dayOffset, formatWhen, PRIORITY_LABEL, type Todo } from '@gduthelp/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { BellIcon, PlusIcon } from '../../components/icons';
import { PageHeader } from '../../components/PageHeader';
import { useTodos } from '../../lib/queries';
import { useNow } from '../../lib/use-now';
import { spring } from '../../motion/presets';
import { useToggleTodo } from './mutations';
import { TodoCheck } from './TodoCheck';
import { TodoEditor } from './TodoEditor';

const PRIORITY_COLOR: Record<number, string> = { 1: '#ef5350', 2: '#ffa726', 3: 'transparent', 4: 'transparent' };

type GroupKey = 'overdue' | 'today' | 'tomorrow' | 'later' | 'none' | 'done';
const GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'overdue', label: '已逾期' },
  { key: 'today', label: '今天' },
  { key: 'tomorrow', label: '明天' },
  { key: 'later', label: '以后' },
  { key: 'none', label: '没有截止时间' },
  { key: 'done', label: '最近完成' },
];

function groupOf(t: Todo, now: Date): GroupKey {
  if (t.completedAt) return 'done';
  if (!t.dueAt) return 'none';
  const due = new Date(t.dueAt);
  if (due < now) return 'overdue';
  const d = dayOffset(due, now);
  return d === 0 ? 'today' : d === 1 ? 'tomorrow' : 'later';
}

export function TodoPage() {
  const { data: todos = [], isPending } = useTodos();
  const toggle = useToggleTodo();
  const now = useNow(30_000);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [open, setOpen] = useState(false);

  const grouped = GROUPS.map((g) => ({
    ...g,
    items: todos
      .filter((t) => groupOf(t, now) === g.key)
      .sort((a, b) => (g.key === 'done' ? (b.completedAt ?? '').localeCompare(a.completedAt ?? '') : a.priority - b.priority || (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))),
  })).filter((g) => g.items.length);
  const openCount = todos.filter((t) => !t.completedAt).length;

  const edit = (t: Todo | null) => {
    setEditing(t);
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title="待办"
        subtitle={isPending && !todos.length ? '加载中…' : openCount ? `${openCount} 项未完成` : '全部完成'}
        action={
          <Button className="h-10 px-3 text-sm" onClick={() => edit(null)}>
            <PlusIcon size={18} />
            新建
          </Button>
        }
      />

      {!isPending && todos.length === 0 && (
        <GlassCard className="p-6 text-center text-[15px] text-fg-muted">还没有待办，点右上角「新建」添加第一项</GlassCard>
      )}

      <div className="space-y-5">
        {grouped.map((g) => (
          <section key={g.key}>
            <h2 className={`mb-2 px-1 text-sm font-semibold ${g.key === 'overdue' ? 'text-danger' : 'text-fg-muted'}`}>
              {g.label} · {g.items.length}
            </h2>
            <GlassCard className="divide-y divide-current/10 px-4">
              <AnimatePresence initial={false}>
                {g.items.map((t) => {
                  const done = !!t.completedAt;
                  const nextReminder = t.reminders.find((r) => r.status === 'pending');
                  return (
                    <motion.div
                      key={t.id}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={spring.snappy}
                      className="overflow-hidden"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => edit(t)}
                        onKeyDown={(e) => e.key === 'Enter' && edit(t)}
                        className="flex cursor-pointer items-center gap-3 py-3"
                      >
                        <TodoCheck done={done} label={t.title} onToggle={() => toggle.mutate({ id: t.id, done: !done })} />
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-[15px] ${done ? 'text-fg-muted line-through' : ''}`}>{t.title}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
                            {t.dueAt && <span className={g.key === 'overdue' ? 'text-danger' : ''}>截止 {formatWhen(new Date(t.dueAt), now)}</span>}
                            {!done && nextReminder && (
                              <span className="inline-flex items-center gap-0.5">
                                <BellIcon size={11} />
                                {formatWhen(new Date(nextReminder.fireAt), now)}
                              </span>
                            )}
                            {t.priority <= 2 && <span>{PRIORITY_LABEL[t.priority]}</span>}
                          </p>
                        </div>
                        <span className="size-2 shrink-0 rounded-full" style={{ background: done ? 'transparent' : PRIORITY_COLOR[t.priority] }} />
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </GlassCard>
          </section>
        ))}
      </div>

      <TodoEditor todo={editing} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
