import {
  parseSecondClassImport,
  SECOND_CLASS_CATEGORIES,
  SECOND_CLASS_CATEGORY_LABELS,
  today,
  type SecondClassCategory,
  type SecondClassRecord,
  type SecondClassStatus,
  type SecondClassSyncResult,
} from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { api, ApiError } from '../../lib/api';
import { keys } from '../../lib/queries';
import { toast } from '../../lib/toast-store';

export interface SecondClassDraft {
  record?: SecondClassRecord;
  presetTitle?: string;
  presetCategory?: SecondClassCategory;
  presetHours?: number;
}

interface SecondClassEditorSheetProps {
  draft: SecondClassDraft | null;
  defaultSemesterCode: string;
  onClose: () => void;
}

export function SecondClassEditorSheet({ draft, defaultSemesterCode, onClose }: SecondClassEditorSheetProps) {
  const isEdit = Boolean(draft?.record);
  return (
    <Sheet open={Boolean(draft)} onClose={onClose} title={isEdit ? '编辑第二课堂记录' : '记录第二课堂活动'}>
      {draft && <SecondClassForm draft={draft} defaultSemesterCode={defaultSemesterCode} onClose={onClose} />}
    </Sheet>
  );
}

function SecondClassForm({
  draft,
  defaultSemesterCode,
  onClose,
}: {
  draft: SecondClassDraft;
  defaultSemesterCode: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const existing = draft.record;

  const [title, setTitle] = useState(existing?.title ?? draft.presetTitle ?? '');
  const [category, setCategory] = useState<SecondClassCategory>(
    existing?.category ?? draft.presetCategory ?? 'volunteer',
  );
  const [hours, setHours] = useState(String(existing?.hours ?? draft.presetHours ?? 2));
  const [credits, setCredits] = useState(String(existing?.credits ?? 0));
  const [activityDate, setActivityDate] = useState(existing?.activityDate ?? today());
  const [organizer, setOrganizer] = useState(existing?.organizer ?? '');
  const [status, setStatus] = useState<SecondClassStatus>(existing?.status ?? 'approved');
  const [note, setNote] = useState(existing?.note ?? '');

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        title: title.trim(),
        category,
        hours: Number(hours),
        credits: Number(credits) || 0,
        activityDate,
        semesterCode: existing?.semesterCode ?? defaultSemesterCode,
        organizer: organizer.trim() || null,
        status,
        note: note.trim() || null,
      };
      return existing
        ? api<SecondClassRecord>(`/second-class/${existing.id}`, { method: 'PUT', body })
        : api<SecondClassRecord>('/second-class', { method: 'POST', body });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.secondClassPrefix });
      toast.success(existing ? '已更新第二课堂记录' : '已记入第二课堂时长');
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : '保存失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/second-class/${existing!.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.secondClassPrefix });
      toast.success('已删除该条记录');
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : '删除失败'),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('请填写活动名称');
      return;
    }
    saveMutation.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-2">
      <Field label="活动 / 项目名称">
        <input
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：图书馆志愿服务 / 创新创业学术讲座"
          required
        />
      </Field>

      <div>
        <p className="mb-1.5 text-sm text-fg-muted">所属第二课堂模块</p>
        <div className="grid grid-cols-3 gap-1.5">
          {SECOND_CLASS_CATEGORIES.map((cat) => {
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-xl py-2 text-xs font-medium transition-colors ${
                  active ? 'bg-accent text-accent-fg shadow-sm' : 'surface-subtle text-fg-muted hover:text-fg'
                }`}
              >
                {SECOND_CLASS_CATEGORY_LABELS[cat]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="时长（小时 / 学时）">
          <input
            className="field"
            type="number"
            step="0.5"
            min={0.5}
            max={200}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            required
          />
        </Field>
        <Field label="折算学分（可选）">
          <input
            className="field"
            type="number"
            step="0.1"
            min={0}
            max={20}
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="活动日期">
          <input
            className="field"
            type="date"
            value={activityDate}
            onChange={(e) => setActivityDate(e.target.value)}
            required
          />
        </Field>
        <div>
          <p className="mb-1.5 text-sm text-fg-muted">认定状态</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ['approved', '已认定'],
                ['pending', '待审核'],
              ] as const
            ).map(([s, label]) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`h-11 rounded-2xl text-xs font-medium transition-colors ${
                  status === s ? 'bg-accent text-accent-fg' : 'surface-subtle text-fg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Field label="主办单位 / 学院（可选）">
        <input
          className="field"
          value={organizer}
          onChange={(e) => setOrganizer(e.target.value)}
          placeholder="例如：校青协 / 计算机学院团委"
        />
      </Field>

      <Field label="备注（可选）">
        <input
          className="field"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="如活动证明编号、综测加分说明"
        />
      </Field>

      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1" loading={saveMutation.isPending}>
          保存记录
        </Button>
        {existing && (
          <Button
            type="button"
            variant="ghost"
            className="text-danger"
            loading={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            删除
          </Button>
        )}
      </div>
    </form>
  );
}

/** 第二课堂粘贴导入 + 学期/学年目标时长弹窗 */
export function SecondClassImportSheet({
  open,
  semesterTarget,
  yearTarget,
  defaultSemesterCode,
  onClose,
}: {
  open: boolean;
  semesterTarget: number;
  yearTarget: number;
  defaultSemesterCode: string;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="导入第二课堂 / 设置目标">
      {open && (
        <SecondClassImportBody
          semesterTarget={semesterTarget}
          yearTarget={yearTarget}
          defaultSemesterCode={defaultSemesterCode}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function SecondClassImportBody({
  semesterTarget,
  yearTarget,
  defaultSemesterCode,
  onClose,
}: {
  semesterTarget: number;
  yearTarget: number;
  defaultSemesterCode: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [raw, setRaw] = useState('');
  const [semHours, setSemHours] = useState(String(semesterTarget));
  const [yrHours, setYrHours] = useState(String(yearTarget));

  const parsed = parseSecondClassImport(raw, { fallbackSemesterCode: defaultSemesterCode });

  const importMutation = useMutation({
    mutationFn: () =>
      api<SecondClassSyncResult>('/second-class/sync', {
        method: 'POST',
        body: { records: parsed },
      }),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: keys.secondClassPrefix });
      toast.success(`已导入第二课堂：新增 ${res.added} 条、更新 ${res.updated} 条`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : '导入失败'),
  });

  const targetMutation = useMutation({
    mutationFn: () =>
      api('/second-class/targets', {
        method: 'PUT',
        body: {
          semesterTargetHours: Number(semHours) || 12,
          yearTargetHours: Number(yrHours) || 24,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.secondClassPrefix });
      toast.success('已更新第二课堂目标时长');
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : '保存目标失败'),
  });

  return (
    <div className="space-y-5 pb-2">
      <section className="space-y-2.5">
        <p className="text-xs font-semibold text-fg-muted">智能粘贴导入（Better Me / 办事大厅 / i志愿表格）</p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={5}
          placeholder={'每行一条（支持直接从网页复制表格或 JSON）：\n图书馆志愿服务\t公益志愿\t2026-10-20\t3.5\n学术前沿讲座\t创新创业\t2026-11-05\t2'}
          className="surface-subtle w-full rounded-2xl p-3 text-xs outline-none placeholder:text-fg-muted/70"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-fg-muted">
            {raw.trim()
              ? parsed.length > 0
                ? `已识别 ${parsed.length} 条记录（自动归类当前学期/学年）`
                : '暂未识别到有效记录，请确认每行含活动名与时长数字'
              : '支持自动按日期匹配所属学期与学年并去重'}
          </span>
          <Button
            className="h-9 shrink-0 px-3.5 text-xs"
            disabled={parsed.length === 0}
            loading={importMutation.isPending}
            onClick={() => importMutation.mutate()}
          >
            导入 {parsed.length > 0 ? `(${parsed.length})` : ''}
          </Button>
        </div>
      </section>

      <section className="space-y-3 border-t border-current/10 pt-4">
        <p className="text-xs font-semibold text-fg-muted">设置学期与学年达标时长目标（小时）</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="当前学期目标 (h)">
            <input
              className="field"
              type="number"
              step="1"
              min={1}
              max={200}
              value={semHours}
              onChange={(e) => setSemHours(e.target.value)}
            />
          </Field>
          <Field label="当前学年目标 (h)">
            <input
              className="field"
              type="number"
              step="1"
              min={1}
              max={400}
              value={yrHours}
              onChange={(e) => setYrHours(e.target.value)}
            />
          </Field>
        </div>
        <Button
          variant="ghost"
          className="w-full"
          loading={targetMutation.isPending}
          onClick={() => targetMutation.mutate()}
        >
          仅保存时长目标
        </Button>
      </section>
    </div>
  );
}
