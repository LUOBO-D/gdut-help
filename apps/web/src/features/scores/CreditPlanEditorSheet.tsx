import { GDUT_CREDIT_PRESETS, type CreditPlan } from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { api, ApiError } from '../../lib/api';
import { keys } from '../../lib/queries';
import { toast } from '../../lib/toast-store';

interface CreditPlanEditorSheetProps {
  open: boolean;
  plan: CreditPlan;
  onClose: () => void;
}

export function CreditPlanEditorSheet({ open, plan, onClose }: CreditPlanEditorSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="毕业学分目标设置">
      {open && <CreditPlanForm plan={plan} onClose={onClose} />}
    </Sheet>
  );
}

function CreditPlanForm({ plan, onClose }: { plan: CreditPlan; onClose: () => void }) {
  const qc = useQueryClient();
  const [majorName, setMajorName] = useState(plan.majorName ?? '');
  const [totalTarget, setTotalTarget] = useState(String(plan.totalTarget));
  const [generalRequired, setGeneralRequired] = useState(String(plan.generalRequiredTarget));
  const [majorRequired, setMajorRequired] = useState(String(plan.majorRequiredTarget));
  const [majorElective, setMajorElective] = useState(String(plan.majorElectiveTarget));
  const [generalElective, setGeneralElective] = useState(String(plan.generalElectiveTarget));
  const [practice, setPractice] = useState(String(plan.practiceTarget));

  const saveMutation = useMutation({
    mutationFn: () =>
      api<CreditPlan>('/grades/credit-plan', {
        method: 'PUT',
        body: {
          totalTarget: Number(totalTarget) || 160,
          generalRequiredTarget: Number(generalRequired) || 0,
          majorRequiredTarget: Number(majorRequired) || 0,
          majorElectiveTarget: Number(majorElective) || 0,
          generalElectiveTarget: Number(generalElective) || 0,
          practiceTarget: Number(practice) || 0,
          majorName: majorName.trim() || null,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.creditPlan });
      toast.success('毕业学分目标已保存');
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : '保存失败'),
  });

  const applyPreset = (id: string) => {
    const preset = GDUT_CREDIT_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setTotalTarget(String(preset.targets.totalTarget));
    setGeneralRequired(String(preset.targets.generalRequiredTarget));
    setMajorRequired(String(preset.targets.majorRequiredTarget));
    setMajorElective(String(preset.targets.majorElectiveTarget));
    setGeneralElective(String(preset.targets.generalElectiveTarget));
    setPractice(String(preset.targets.practiceTarget));
  };

  const sumModules =
    (Number(generalRequired) || 0) +
    (Number(majorRequired) || 0) +
    (Number(majorElective) || 0) +
    (Number(generalElective) || 0) +
    (Number(practice) || 0);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-2">
      <div>
        <p className="mb-2 text-xs font-medium text-fg-muted">广工大类培养方案一键预设</p>
        <div className="flex flex-wrap gap-1.5">
          {GDUT_CREDIT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className="surface-subtle surface-subtle-hover rounded-full px-3 py-1.5 text-xs font-medium text-fg"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <Field label="专业备注（可选）">
        <input
          className="field"
          value={majorName}
          onChange={(e) => setMajorName(e.target.value)}
          placeholder="例如：2024 级 计算机科学与技术"
          maxLength={60}
        />
      </Field>

      <Field label="毕业总学分要求">
        <input
          className="field"
          type="number"
          step="0.5"
          min={30}
          max={300}
          value={totalTarget}
          onChange={(e) => setTotalTarget(e.target.value)}
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="通识必修">
          <input
            className="field"
            type="number"
            step="0.5"
            min={0}
            max={150}
            value={generalRequired}
            onChange={(e) => setGeneralRequired(e.target.value)}
          />
        </Field>
        <Field label="学科与专业必修">
          <input
            className="field"
            type="number"
            step="0.5"
            min={0}
            max={150}
            value={majorRequired}
            onChange={(e) => setMajorRequired(e.target.value)}
          />
        </Field>
        <Field label="专业选修">
          <input
            className="field"
            type="number"
            step="0.5"
            min={0}
            max={100}
            value={majorElective}
            onChange={(e) => setMajorElective(e.target.value)}
          />
        </Field>
        <Field label="通识选修（公选）">
          <input
            className="field"
            type="number"
            step="0.5"
            min={0}
            max={60}
            value={generalElective}
            onChange={(e) => setGeneralElective(e.target.value)}
          />
        </Field>
        <Field label="集中实践环节">
          <input
            className="field"
            type="number"
            step="0.5"
            min={0}
            max={80}
            value={practice}
            onChange={(e) => setPractice(e.target.value)}
          />
        </Field>
        <div className="surface-subtle flex flex-col justify-center rounded-2xl px-3.5 py-2">
          <span className="text-[11px] text-fg-muted">五项合计</span>
          <span className="font-num text-base font-bold tabular-nums">{Math.round(sumModules * 10) / 10} 分</span>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1" loading={saveMutation.isPending}>
          保存学分目标
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          取消
        </Button>
      </div>
    </form>
  );
}
