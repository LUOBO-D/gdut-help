import { FOOD_TAGS, userPreferenceInputSchema, type UserPreference } from '@gduthelp/shared';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Chip, Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { ApiError } from '../../lib/api';
import { toast } from '../../lib/toast-store';
import { useSavePreferences } from './mutations';

interface PreferencesSheetProps {
  open: boolean;
  onClose: () => void;
  initial: UserPreference | undefined;
}

export function PreferencesSheet({ open, onClose, initial }: PreferencesSheetProps) {
  if (!open) return <Sheet open={false} onClose={onClose} title="口味与预算偏好">{null}</Sheet>;
  return <PreferencesSheetInner key={initial?.updatedAt ?? 'default'} open={open} onClose={onClose} initial={initial} />;
}

function PreferencesSheetInner({ open, onClose, initial }: PreferencesSheetProps) {
  const save = useSavePreferences();
  const [tastes, setTastes] = useState<string[]>(() => initial?.tastes ?? []);
  const [dislikes, setDislikes] = useState<string[]>(() => initial?.dislikes ?? []);
  const [budgetMin, setBudgetMin] = useState(() => (initial?.budgetMin != null ? String(initial.budgetMin) : ''));
  const [budgetMax, setBudgetMax] = useState(() => (initial?.budgetMax != null ? String(initial.budgetMax) : ''));
  const [error, setError] = useState<string | null>(null);

  const toggleTaste = (tag: string) => {
    setDislikes((prev) => prev.filter((x) => x !== tag));
    setTastes((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  };

  const toggleDislike = (tag: string) => {
    setTastes((prev) => prev.filter((x) => x !== tag));
    setDislikes((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  };

  const submit = () => {
    setError(null);
    const parsed = userPreferenceInputSchema.safeParse({
      tastes,
      dislikes,
      budgetMin: budgetMin.trim() ? Number(budgetMin) : null,
      budgetMax: budgetMax.trim() ? Number(budgetMax) : null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '偏好填写有误');
      return;
    }
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast.success('饮食偏好已保存');
        onClose();
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : '保存失败'),
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="口味与预算偏好"
      footer={
        <div className="space-y-2">
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button className="w-full" loading={save.isPending} onClick={submit}>
            保存偏好
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium">喜欢的口味与类型</p>
          <p className="mb-3 text-xs text-fg-muted">命中的商家会在推荐打分中加分</p>
          <div className="flex flex-wrap gap-2">
            {FOOD_TAGS.map((tag) => (
              <Chip key={tag} active={tastes.includes(tag)} onClick={() => toggleTaste(tag)}>
                {tag}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">忌口 / 不想吃</p>
          <p className="mb-3 text-xs text-fg-muted">带这些标签的商家会被直接过滤掉</p>
          <div className="flex flex-wrap gap-2">
            {FOOD_TAGS.map((tag) => (
              <Chip
                key={tag}
                active={dislikes.includes(tag)}
                onClick={() => toggleDislike(tag)}
                className={dislikes.includes(tag) ? '!bg-danger !text-white' : ''}
              >
                {tag}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="每餐最低预算（元）" hint="选填">
            <input
              type="number"
              min={1}
              max={500}
              className="field"
              placeholder="如 10"
              value={budgetMin}
              onChange={(e) => setBudgetMin(e.target.value)}
            />
          </Field>
          <Field label="每餐最高预算（元）" hint="犒劳自己时会自动放宽">
            <input
              type="number"
              min={1}
              max={500}
              className="field"
              placeholder="如 25"
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
            />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}
