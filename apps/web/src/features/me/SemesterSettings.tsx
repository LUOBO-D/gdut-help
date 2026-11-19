import { semesterInputSchema, type Semester, type SemesterInput } from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { GlassCard } from '../../components/GlassCard';
import { api, ApiError } from '../../lib/api';
import { keys, useTimetable } from '../../lib/queries';

/** 管理员：设置当前学期。全校统一，用户不需要自己填开学日期 */
export function SemesterSettings() {
  const current = useTimetable().data?.semester;
  return (
    <GlassCard className="p-5">
      <h2 className="text-[15px] font-semibold">学期设置 · 管理员</h2>
      <p className="mt-1 text-sm text-fg-muted">每学期开学前改一次，所有人的课表周次都按这里计算</p>
      <SemesterForm key={current?.id ?? 'none'} current={current ?? null} />
    </GlassCard>
  );
}

function SemesterForm({ current }: { current: Semester | null }) {
  const qc = useQueryClient();
  const [name, setName] = useState(current?.name ?? '');
  const [startDate, setStartDate] = useState(current?.startDate ?? '');
  const [weeks, setWeeks] = useState(String(current?.totalWeeks ?? 20));
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (input: SemesterInput) => api<Semester>('/admin/semesters/current', { method: 'PUT', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.timetable }),
    onError: (e) => setError(e instanceof ApiError ? e.message : '保存失败'),
  });

  const submit = () => {
    const input = { name, startDate, totalWeeks: Number(weeks) };
    const parsed = semesterInputSchema.safeParse(input);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? '请检查填写的内容');
    setError(null);
    save.mutate(parsed.data);
  };

  return (
    <div className="mt-3 space-y-3">
      <Field label="学期名称">
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="2026-2027 第一学期" maxLength={30} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="第 1 周周一">
          <input className="field" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="总周数">
          <input className="field" type="number" min={1} max={30} value={weeks} onChange={(e) => setWeeks(e.target.value)} />
        </Field>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {save.isSuccess && !error && <p className="text-sm text-fg-muted">已保存</p>}
      <Button className="w-full" loading={save.isPending} onClick={submit}>
        保存学期
      </Button>
    </div>
  );
}
