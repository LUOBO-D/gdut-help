import { REVIEW_DIMENSIONS, reviewInputSchema, type Review } from '@gduthelp/shared';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { ApiError } from '../../lib/api';
import { toast } from '../../lib/toast-store';
import { useDeleteReview, useUpsertReview } from './mutations';

interface ReviewSheetProps {
  open: boolean;
  onClose: () => void;
  merchantId: string;
  merchantName: string;
  existing: Review | null;
}

export function ReviewSheet(props: ReviewSheetProps) {
  if (!props.open) return <Sheet open={false} onClose={props.onClose} title="写评价">{null}</Sheet>;
  return <ReviewSheetInner key={props.existing?.id ?? `new-${props.merchantId}`} {...props} />;
}

function ReviewSheetInner({ open, onClose, merchantId, merchantName, existing }: ReviewSheetProps) {
  const save = useUpsertReview(merchantId);
  const remove = useDeleteReview(merchantId);

  const [scoreOverall, setScoreOverall] = useState(existing?.scoreOverall ?? 5);
  const [scores, setScores] = useState({
    scoreTaste: existing?.scoreTaste ?? 5,
    scoreValue: existing?.scoreValue ?? 4,
    scoreEnv: existing?.scoreEnv ?? 4,
    scoreSpeed: existing?.scoreSpeed ?? 4,
  });
  const [content, setContent] = useState(existing?.content ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const parsed = reviewInputSchema.safeParse({ scoreOverall, ...scores, content });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? '请检查评分内容');
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(existing ? '已更新你的评价' : '感谢分享评价');
        onClose();
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : '提交失败'),
    });
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    remove.mutate(undefined, {
      onSuccess: () => {
        toast.info('已删除你的评价');
        onClose();
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : '删除失败'),
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? `修改评价 · ${merchantName}` : `评价 · ${merchantName}`}
      footer={
        <div className="space-y-2">
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            {existing && (
              <Button variant="ghost" className="shrink-0 text-danger" loading={remove.isPending} onClick={handleDelete}>
                {confirmDelete ? '再点一次确认' : '删除评价'}
              </Button>
            )}
            <Button className="flex-1" loading={save.isPending} onClick={submit}>
              {existing ? '更新评价' : '发布评价'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="surface-subtle rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">综合评分</span>
            <span className="font-num text-lg font-bold text-accent tabular-nums">{scoreOverall}.0 分</span>
          </div>
          <div className="mt-3 flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setScoreOverall(n)}
                className={`flex-1 rounded-xl py-2 font-num text-sm font-semibold transition-colors ${
                  n <= scoreOverall ? 'bg-accent text-accent-fg' : 'border border-current/15 text-fg-muted'
                }`}
              >
                {n}★
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-fg-muted">四维细项评分（独立统计，不影响你给的综合总分）</p>
          {REVIEW_DIMENSIONS.map(({ key, label }) => {
            const val = scores[key];
            return (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="w-16 shrink-0 text-sm">{label}</span>
                <div className="flex flex-1 gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setScores((prev) => ({ ...prev, [key]: n }))}
                      className={`h-8 flex-1 rounded-xl font-num text-xs font-medium transition-colors ${
                        n <= val ? 'bg-accent/85 text-accent-fg' : 'surface-subtle text-fg-muted'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <Field label="短评（选填，最多 500 字）">
          <textarea
            className="field min-h-24 resize-y text-sm"
            maxLength={500}
            placeholder="推荐哪道菜？排队久吗？避雷点是什么？"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </Field>
      </div>
    </Sheet>
  );
}
