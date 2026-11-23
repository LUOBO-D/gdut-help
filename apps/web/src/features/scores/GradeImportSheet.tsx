import {
  diffGradeSync,
  parseGradeImport,
  type CourseGrade,
  type GradeSyncResult,
} from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ChangeEvent } from 'react';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { api, ApiError } from '../../lib/api';
import { keys } from '../../lib/queries';
import { toast } from '../../lib/toast-store';

export function GradeImportSheet({
  open,
  onClose,
  existingGrades,
}: {
  open: boolean;
  onClose: () => void;
  existingGrades: CourseGrade[];
}) {
  return (
    <Sheet open={open} onClose={onClose} title="粘贴导入教务成绩">
      {open && <GradeImportForm existingGrades={existingGrades} onDone={onClose} />}
    </Sheet>
  );
}

function GradeImportForm({ existingGrades, onDone }: { existingGrades: CourseGrade[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');

  const parsed = useMemo(() => (text.trim() ? parseGradeImport(text) : null), [text]);
  const diff = useMemo(
    () => (parsed && parsed.grades.length > 0 ? diffGradeSync(existingGrades, parsed.grades) : null),
    [parsed, existingGrades],
  );

  const submit = useMutation({
    mutationFn: () =>
      api<GradeSyncResult>('/grades/sync', {
        method: 'POST',
        body: { grades: parsed!.grades, removeMissing: false },
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: keys.grades });
      toast.success(`已同步 ${res.total} 门成绩（新增 ${res.added}，更新 ${res.changed}）`);
      onDone();
    },
  });

  const readFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setText(await file.text());
    submit.reset();
  };

  const nothingToDo = diff !== null && diff.added.length === 0 && diff.changed.length === 0;

  return (
    <div className="space-y-4 pb-2">
      <p className="text-xs leading-relaxed text-fg-muted">
        在电脑打开广工教务系统「课程成绩查询」页面，直接全选复制表格粘贴到下方，或粘贴{' '}
        <code className="font-mono">xskccjxx!getDataList.action</code> 返回的 JSON（安卓 App 支持直连自动更新，无需手动粘贴）。
      </p>

      <textarea
        className="field min-h-32 resize-y py-3 font-mono text-xs"
        placeholder="粘贴成绩表格（TSV / HTML）或教务 JSON…"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          submit.reset();
        }}
      />

      <label className="glass-thin inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium">
        <span>选择 JSON / 表格文件</span>
        <input type="file" accept=".json,.txt,.html,.tsv" className="sr-only" onChange={readFile} />
      </label>

      {parsed && (
        <div className="space-y-2 text-xs">
          {parsed.warnings.map((w) => (
            <p key={w} className="rounded-xl bg-amber-400/18 p-2.5">
              ⚠️ {w}
            </p>
          ))}
          {diff && (
            <div className="surface-subtle rounded-2xl p-3.5 text-fg-muted">
              共解析 <strong className="font-num text-fg">{parsed.grades.length}</strong> 门课程：新增{' '}
              <strong className="font-num text-accent">{diff.added.length}</strong> 门，更新{' '}
              <strong className="font-num text-fg">{diff.changed.length}</strong> 门，无变化{' '}
              <strong className="font-num">{diff.unchanged}</strong> 门。
            </div>
          )}
        </div>
      )}

      {submit.error && (
        <p className="text-sm text-danger">{submit.error instanceof ApiError ? submit.error.message : '导入失败'}</p>
      )}

      <Button
        className="w-full"
        disabled={!diff || nothingToDo}
        loading={submit.isPending}
        onClick={() => submit.mutate()}
      >
        {nothingToDo ? '成绩没有变化' : '确认同步成绩'}
      </Button>
    </div>
  );
}
