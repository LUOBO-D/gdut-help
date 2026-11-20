import {
  COURSE_COLORS,
  courseInputSchema,
  MAX_PERIOD,
  periodsFor,
  type Course,
  type CourseInput,
  type Semester,
} from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Chip, Field } from '../../components/Field';
import { PlusIcon, XIcon } from '../../components/icons';
import { Sheet } from '../../components/Sheet';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';
import { keys } from '../../lib/queries';

import { WEEKDAY_LABEL } from './weekday';

interface SlotForm {
  weekday: number;
  periodStart: number;
  periodEnd: number;
  weeks: number[];
  location: string;
}

export interface CourseDraft {
  course?: Course;
  /** 在空白格子上点击新建时，预填星期和节次 */
  weekday?: number;
  period?: number;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export function CourseEditor({ draft, semester, onClose }: { draft: CourseDraft | null; semester: Semester; onClose: () => void }) {
  return (
    <Sheet open={draft !== null} onClose={onClose} title={draft?.course ? '编辑课程' : '添加课程'}>
      {draft && <CourseForm key={draft.course?.id ?? 'new'} draft={draft} semester={semester} onDone={onClose} />}
    </Sheet>
  );
}

function CourseForm({ draft, semester, onDone }: { draft: CourseDraft; semester: Semester; onDone: () => void }) {
  const qc = useQueryClient();
  const periods = periodsFor(useAuth((s) => s.user?.campusId));
  const all = range(semester.totalWeeks);
  const c = draft.course;
  const [name, setName] = useState(c?.name ?? '');
  const [teacher, setTeacher] = useState(c?.teacher ?? '');
  const [location, setLocation] = useState(c?.location ?? '');
  const [color, setColor] = useState<string>(() => c?.color ?? COURSE_COLORS[Math.floor(Math.random() * COURSE_COLORS.length)]!);
  const [slots, setSlots] = useState<SlotForm[]>(
    c?.slots.map((s) => ({ ...s, location: s.location ?? '' })) ?? [
      { weekday: draft.weekday ?? 1, periodStart: draft.period ?? 1, periodEnd: Math.min(MAX_PERIOD, (draft.period ?? 1) + 1), weeks: all, location: '' },
    ],
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const done = () => {
    void qc.invalidateQueries({ queryKey: keys.timetable });
    onDone();
  };
  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : '保存失败');
  const save = useMutation({
    mutationFn: (input: CourseInput) =>
      c ? api<Course>(`/courses/${c.id}`, { method: 'PUT', body: input }) : api<Course>('/courses', { method: 'POST', body: input }),
    onSuccess: done,
    onError: fail,
  });
  const remove = useMutation({ mutationFn: () => api<null>(`/courses/${c!.id}`, { method: 'DELETE' }), onSuccess: done, onError: fail });

  const updateSlot = (i: number, patch: Partial<SlotForm>) => setSlots((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const submit = () => {
    const input: CourseInput = {
      name,
      teacher: teacher || null,
      location: location || null,
      color: color as CourseInput['color'],
      slots: slots.map((s) => ({ ...s, location: s.location || null })),
    };
    const parsed = courseInputSchema.safeParse(input);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? '请检查填写的内容');
    setError(null);
    save.mutate(input);
  };

  return (
    <div className="space-y-4 pb-2">
      {c?.source === 'import' && (
        <p className="glass-thin rounded-xl p-2 text-xs text-fg-muted">
          这门课来自教务系统。在这里改的时间和教室，下次重新导入时会按教务系统的数据覆盖；颜色会保留。
        </p>
      )}
      <Field label="课程名">
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="如：高等数学" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="教师（可选）">
          <input className="field" value={teacher} onChange={(e) => setTeacher(e.target.value)} maxLength={20} />
        </Field>
        <Field label="教室（可选）">
          <input className="field" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={30} placeholder="教3-305" />
        </Field>
      </div>
      <div>
        <p className="mb-1.5 text-sm text-fg-muted">颜色</p>
        <div className="flex flex-wrap gap-2">
          {COURSE_COLORS.map((col) => (
            <button
              key={col}
              type="button"
              aria-label={`颜色 ${col}`}
              aria-pressed={color === col}
              onClick={() => setColor(col)}
              className={`size-8 rounded-full border-2 transition-transform ${color === col ? 'scale-110 border-white shadow-lg' : 'border-transparent'}`}
              style={{ background: col }}
            />
          ))}
        </div>
      </div>

      {slots.map((s, i) => (
        <div key={i} className="glass-thin space-y-3 rounded-2xl! p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">上课时间 {slots.length > 1 ? i + 1 : ''}</p>
            {slots.length > 1 && (
              <button type="button" className="p-1 text-fg-muted" aria-label="删除这个上课时间" onClick={() => setSlots((l) => l.filter((_, j) => j !== i))}>
                <XIcon size={18} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_LABEL.map((label, d) => (
              <Chip key={label} active={s.weekday === d + 1} onClick={() => updateSlot(i, { weekday: d + 1 })} className="px-2.5!">
                周{label}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['periodStart', 'periodEnd'] as const).map((k) => (
              <Field key={k} label={k === 'periodStart' ? '从第几节' : '到第几节'}>
                <select className="field" value={s[k]} onChange={(e) => updateSlot(i, { [k]: Number(e.target.value) })}>
                  {periods.map((p) => (
                    <option key={p.no} value={p.no}>
                      第 {p.no} 节（{k === 'periodStart' ? p.start : p.end}）
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <WeekPicker total={semester.totalWeeks} value={s.weeks} onChange={(weeks) => updateSlot(i, { weeks })} />
          <Field label="这个时间的教室（与上面不同时填写）">
            <input className="field" value={s.location} onChange={(e) => updateSlot(i, { location: e.target.value })} maxLength={30} />
          </Field>
        </div>
      ))}
      {slots.length < 10 && (
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => setSlots((l) => [...l, { weekday: 1, periodStart: 1, periodEnd: 2, weeks: all, location: '' }])}
        >
          <PlusIcon size={18} />
          再加一个上课时间
        </Button>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-3 pt-1">
        {c && (
          <Button
            variant="ghost"
            className="text-danger!"
            loading={remove.isPending}
            onClick={() => (confirmDelete ? remove.mutate() : setConfirmDelete(true))}
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

function WeekPicker({ total, value, onChange }: { total: number; value: number[]; onChange: (w: number[]) => void }) {
  const weeks = range(total);
  const set = new Set(value);
  const preset = (pick: (w: number) => boolean) => onChange(weeks.filter(pick));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-sm text-fg-muted">上课周（已选 {value.length} 周）</p>
        <div className="flex gap-1 text-xs">
          <button type="button" className="rounded-full px-2 py-1 text-accent" onClick={() => preset(() => true)}>
            全部
          </button>
          <button type="button" className="rounded-full px-2 py-1 text-accent" onClick={() => preset((w) => w % 2 === 1)}>
            单周
          </button>
          <button type="button" className="rounded-full px-2 py-1 text-accent" onClick={() => preset((w) => w % 2 === 0)}>
            双周
          </button>
          <button type="button" className="rounded-full px-2 py-1 text-fg-muted" onClick={() => onChange([])}>
            清空
          </button>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {weeks.map((w) => (
          <button
            key={w}
            type="button"
            aria-pressed={set.has(w)}
            onClick={() => onChange(set.has(w) ? value.filter((x) => x !== w) : [...value, w])}
            className={`h-8 rounded-lg text-xs tabular-nums ${set.has(w) ? 'bg-accent text-accent-fg' : 'bg-current/10'}`}
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}
