import { dayOffset, formatWhen, PRIORITY_LABEL, type Todo } from '@gduthelp/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { BellIcon, PlusIcon } from '../../components/icons';
import { PageHeader } from '../../components/PageHeader';
import { CardSkeleton } from '../../components/Skeleton';
import { ApiError } from '../../lib/api';
import { useTodos } from '../../lib/queries';
import { toast } from '../../lib/toast-store';
import { useNow } from '../../lib/use-now';
import { spring } from '../../motion/presets';
import { useSaveTodo, useToggleTodo } from './mutations';
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
  const save = useSaveTodo();
  const now = useNow(30_000);
  const [searchParams, setSearchParams] = useSearchParams();
  const quickInputRef = useRef<HTMLInputElement>(null);

  const [quickTitle, setQuickTitle] = useState('');
  const [editing, setEditing] = useState<Todo | null>(null);
  const [open, setOpen] = useState(false);

  // 支持从首页「+」或电脑端快捷键 N 直接聚焦极速输入栏
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    quickInputRef.current?.focus();
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const grouped = GROUPS.map((g) => ({
    ...g,
    items: todos
      .filter((t) => groupOf(t, now) === g.key)
      .sort((a, b) =>
        g.key === 'done'
          ? (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
          : a.priority - b.priority || (a.dueAt ?? '').localeCompare(b.dueAt ?? ''),
      ),
  })).filter((g) => g.items.length);
  const openCount = todos.filter((t) => !t.completedAt).length;

  const edit = (t: Todo | null) => {
    setEditing(t);
    setOpen(true);
  };

  const quickAdd = (e: FormEvent) => {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title || save.isPending) return;
    save.mutate(
      { input: { title, note: null, dueAt: null, priority: 3, reminders: [] } },
      {
        onSuccess: () => {
          setQuickTitle('');
          toast.success('已添加待办');
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : '添加失败'),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="待办"
        subtitle={isPending && !todos.length ? '加载中…' : openCount ? `${openCount} 项未完成` : '全部完成'}
        action={
          <Button className="h-10 gap-1 px-3 text-sm" onClick={() => edit(null)}>
            <PlusIcon size={18} />
            详细新建
          </Button>
        }
      />

      {/* 极速一行捕获栏：回车即可记下待办，无需每次打开弹层 */}
      <GlassCard className="mb-5 p-2">
        <form onSubmit={quickAdd} className="flex items-center gap-2">
          <input
            ref={quickInputRef}
            className="h-10 min-w-0 flex-1 bg-transparent px-3 text-[15px] text-fg placeholder:text-fg-muted focus:outline-none"
            placeholder="记一件要办的事，回车立即添加…"
            maxLength={100}
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
          />
          {quickTitle.trim() && (
            <Button type="submit" className="h-9 shrink-0 rounded-xl! px-3.5 text-xs" loading={save.isPending}>
              添加
            </Button>
          )}
        </form>
      </GlassCard>

      {isPending && todos.length === 0 && <CardSkeleton rows={3} />}

      {!isPending && todos.length === 0 && (
        <GlassCard className="p-6 text-center text-sm text-fg-muted">
          手头很清爽，在上方直接输入回车，或点「详细新建」设置截止与提醒
        </GlassCard>
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
                        <TodoCheck
                          done={done}
                          label={t.title}
                          onToggle={() =>
                            toggle.mutate(
                              { id: t.id, done: !done },
                              {
                                onSuccess: () => toast.info(!done ? `已完成「${t.title}」` : `已恢复「${t.title}」`),
                              },
                            )
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-[15px] ${done ? 'text-fg-muted line-through' : ''}`}>{t.title}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
                            {t.dueAt && (
                              <span className={`font-num tabular-nums ${g.key === 'overdue' ? 'text-danger' : ''}`}>
                                截止 {formatWhen(new Date(t.dueAt), now)}
                              </span>
                            )}
                            {!done && nextReminder && (
                              <span className="inline-flex items-center gap-0.5 font-num tabular-nums">
                                <BellIcon size={11} />
                                {formatWhen(new Date(nextReminder.fireAt), now)}
                              </span>
                            )}
                            {t.priority <= 2 && <span>{PRIORITY_LABEL[t.priority]}</span>}
                          </p>
                        </div>
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: done ? 'transparent' : PRIORITY_COLOR[t.priority] }}
                        />
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
