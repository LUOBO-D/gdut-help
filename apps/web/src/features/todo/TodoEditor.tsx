import {
  computeSmartReminders,
  formatWhen,
  MAX_REMINDERS,
  PRIORITY_LABEL,
  reminderFireAt,
  todoInputSchema,
  type ReminderInput,
  type Todo,
  type TodoInput,
} from '@gduthelp/shared';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Chip, Field } from '../../components/Field';
import { XIcon } from '../../components/icons';
import { Sheet } from '../../components/Sheet';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';
import { useTimetable } from '../../lib/queries';
import { toast } from '../../lib/toast-store';
import { useNow } from '../../lib/use-now';
import { at, fromLocalInput, toLocalInput } from './datetime';
import { useDeleteTodo, useSaveTodo } from './mutations';

const OFFSETS = [
  { minutes: 0, label: '截止时' },
  { minutes: 15, label: '提前 15 分钟' },
  { minutes: 60, label: '提前 1 小时' },
  { minutes: 24 * 60, label: '提前 1 天' },
];

const DUE_PRESETS = [
  { label: '今晚 23:59', value: () => at(0, 23, 59) },
  { label: '明天 08:00', value: () => at(1, 8) },
  { label: '明晚 23:59', value: () => at(1, 23, 59) },
];

export function TodoEditor({ todo, open, onClose }: { todo: Todo | null; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={todo ? '编辑待办' : '新建待办'}>
      {open && <TodoForm key={todo?.id ?? 'new'} todo={todo} onDone={onClose} />}
    </Sheet>
  );
}

function TodoForm({ todo, onDone }: { todo: Todo | null; onDone: () => void }) {
  const save = useSaveTodo();
  const remove = useDeleteTodo();
  const timetable = useTimetable().data;
  const campusId = useAuth((s) => s.user?.campusId);
  const [title, setTitle] = useState(todo?.title ?? '');
  const [note, setNote] = useState(todo?.note ?? '');
  const [due, setDue] = useState(toLocalInput(todo?.dueAt));
  const [priority, setPriority] = useState(todo?.priority ?? 3);
  const pending = todo?.reminders.filter((r) => r.status !== 'cancelled') ?? [];
  const [offsets, setOffsets] = useState<number[]>(
    todo ? pending.filter((r) => r.offsetMinutes !== null).map((r) => r.offsetMinutes!) : [0],
  );
  const [customs, setCustoms] = useState<string[]>(pending.filter((r) => r.offsetMinutes === null).map((r) => toLocalInput(r.fireAt)));
  const [customDraft, setCustomDraft] = useState('');
  const [smartHint, setSmartHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dueIso = fromLocalInput(due);
  const now = useNow(30_000);

  const applySmartReminders = () => {
    if (!dueIso) return;
    const plan = computeSmartReminders({ dueAt: dueIso, priority, timetable, campusId, now });
    if (!plan.reminders.length) {
      toast.info('截止时间已过，无法生成智能提醒');
      return;
    }
    setOffsets([]);
    setCustoms(plan.reminders.map((r) => toLocalInput(r.at)));
    const summary = plan.reminders.map((r) => r.reason).join('；');
    setSmartHint(plan.freeSlotHint ? `${summary} · ${plan.freeSlotHint}` : summary);
    toast.success(`已生成 ${plan.reminders.length} 条智能提醒`);
  };
  const reminders: ReminderInput[] = [
    ...(dueIso ? offsets.map((m) => ({ offsetMinutes: m })) : []),
    ...customs.map((c) => fromLocalInput(c)).filter((x): x is string => !!x).map((iso) => ({ at: iso })),
  ];
  const count = (dueIso ? offsets.length : 0) + customs.length;
  const sentTimes = new Set(todo?.reminders.filter((r) => r.status === 'sent').map((r) => r.fireAt));

  const submit = () => {
    const input: TodoInput = { title, note: note || null, dueAt: dueIso, priority, reminders };
    const parsed = todoInputSchema.safeParse(input);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? '请检查填写的内容');
    setError(null);
    save.mutate({ id: todo?.id, input }, { onSuccess: onDone, onError: (e) => setError(e instanceof ApiError ? e.message : '保存失败') });
  };

  return (
    <div className="space-y-4 pb-2">
      <Field label="要做什么">
        <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="如：交高数作业" autoFocus />
      </Field>

      <Field label="截止时间（可选）">
        <input className="field" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <div className="-mt-2 flex flex-wrap gap-1.5">
        {DUE_PRESETS.map((p) => (
          <Chip key={p.label} active={false} onClick={() => setDue(toLocalInput(p.value()))}>
            {p.label}
          </Chip>
        ))}
        {due && (
          <Chip active={false} onClick={() => setDue('')}>
            不设截止
          </Chip>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-sm text-fg-muted">优先级</p>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((p) => (
            <Chip key={p} active={priority === p} onClick={() => setPriority(p)}>
              {PRIORITY_LABEL[p]}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm text-fg-muted">
          提醒（最多 {MAX_REMINDERS} 个）
          {!dueIso && ' · 设置截止时间后可选「提前提醒」'}
        </p>
        {dueIso && (
          <div className="mb-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={applySmartReminders}
                className="surface-subtle surface-subtle-hover rounded-full px-3 py-1 text-xs font-medium text-accent"
              >
                ✦ 智能计算提醒（避开上课和深夜）
              </button>
            </div>
            {smartHint && <p className="text-xs text-fg-muted">{smartHint}</p>}
            <div className="flex flex-wrap gap-1.5">
              {OFFSETS.map((o) => {
                const active = offsets.includes(o.minutes);
                const fire = reminderFireAt({ offsetMinutes: o.minutes }, dueIso)!;
                const past = fire < now && !sentTimes.has(fire.toISOString());
                return (
                  <Chip
                    key={o.minutes}
                    active={active}
                    onClick={() => setOffsets(active ? offsets.filter((m) => m !== o.minutes) : count < MAX_REMINDERS ? [...offsets, o.minutes] : offsets)}
                    className={past ? 'opacity-50' : ''}
                  >
                    {o.label}
                    {past && active ? '（已过）' : ''}
                  </Chip>
                );
              })}
            </div>
          </div>
        )}
        {customs.map((c, i) => (
          <div key={i} className="mb-1.5 flex items-center gap-2 text-sm">
            <span className="flex-1">{formatWhen(new Date(c), now)}</span>
            <button type="button" aria-label="删除这个提醒" className="p-1 text-fg-muted" onClick={() => setCustoms(customs.filter((_, j) => j !== i))}>
              <XIcon size={16} />
            </button>
          </div>
        ))}
        {count < MAX_REMINDERS && (
          <div className="flex gap-2">
            <input className="field h-11 flex-1 py-0" type="datetime-local" value={customDraft} onChange={(e) => setCustomDraft(e.target.value)} aria-label="自定义提醒时间" />
            <Button
              variant="ghost"
              className="h-11 shrink-0 px-4 text-sm"
              disabled={!customDraft}
              onClick={() => {
                setCustoms([...customs, customDraft]);
                setCustomDraft('');
              }}
            >
              添加
            </Button>
          </div>
        )}
        <p className="mt-1.5 text-xs text-fg-muted">到点会发站内通知，并按「我的 → 提醒设置」发送浏览器推送和邮件。已经过去的时间不会再提醒。</p>
      </div>

      <Field label="备注（可选）">
        <textarea className="field min-h-20 resize-y" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </Field>

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-3 pt-1">
        {todo && (
          <Button
            variant="ghost"
            className="text-danger!"
            loading={remove.isPending}
            onClick={() => (confirmDelete ? remove.mutate(todo.id, { onSuccess: onDone }) : setConfirmDelete(true))}
          >
            {confirmDelete ? '确认删除' : '删除'}
          </Button>
        )}
        <Button className="flex-1" loading={save.isPending} onClick={submit}>
          保存
        </Button>
      </div>
    </div>
  );
}
