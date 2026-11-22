import {
  diffExamImport,
  parseExamImport,
  type Exam,
  type ExamImportDiff,
  type ExamImportParseResult,
  type ExamImportResult,
  type ImportedExam,
} from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ChangeEvent } from 'react';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { Switch } from '../../components/Switch';
import { api, ApiError } from '../../lib/api';
import { isNative } from '../../lib/platform';
import { keys } from '../../lib/queries';
import { toast } from '../../lib/toast-store';

export function ExamImportSheet({ open, onClose, exams }: { open: boolean; onClose: () => void; exams: Exam[] }) {
  return (
    <Sheet open={open} onClose={onClose} title="同步 / 导入考试安排">
      {open && <ExamImportForm exams={exams} onDone={onClose} />}
    </Sheet>
  );
}

function ExamImportForm({ exams, onDone }: { exams: Exam[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ExamImportParseResult | null>(null);
  const [removeMissing, setRemoveMissing] = useState(true);
  const [jwEmptyHint, setJwEmptyHint] = useState<string | null>(null);

  const diff: ExamImportDiff | null = useMemo(
    () => (parsed && parsed.exams.length > 0 ? diffExamImport(exams, parsed.exams) : null),
    [parsed, exams],
  );

  const submit = useMutation({
    mutationFn: () =>
      api<ExamImportResult>('/exams/import', {
        method: 'POST',
        body: {
          exams: parsed!.exams,
          removeMissing,
        },
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: keys.exams });
      toast.success(`考试安排已同步（新增 ${res.added} 场，更新 ${res.changed} 场）`);
    },
  });

  const handleRaw = (value: string, sourceSemester?: string) => {
    setText(value);
    setJwEmptyHint(null);
    const result = value.trim() ? parseExamImport(value) : null;
    setParsed(result);
    submit.reset();
    if (sourceSemester && result && result.exams.length === 0 && result.warnings.length === 0) {
      setJwEmptyHint(`教务系统「${sourceSemester}」暂未公布考试安排，等学校排好考场后再来一键同步，或先手动添加考试。`);
    }
  };

  const readFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleRaw(await file.text());
  };

  if (submit.data) {
    const r = submit.data;
    return (
      <div className="space-y-4 pb-2 text-[15px]">
        <p>
          同步完成：新增 {r.added} 场，更新 {r.changed} 场，删除 {r.removed} 场，{r.unchanged} 场无变化。
        </p>
        <p className="text-sm text-fg-muted">
          App 会自动在每场考试前一天晚上 20:00 和考前 1 小时发本地提醒；你手动添加的考试（如四六级）不受教务同步影响。
        </p>
        <Button className="w-full" onClick={onDone}>
          查看考试安排
        </Button>
      </div>
    );
  }

  const nothingToDo =
    diff !== null && diff.added.length === 0 && diff.changed.length === 0 && (!removeMissing || diff.removed.length === 0);

  return (
    <div className="space-y-4 pb-2">
      {isNative && <JwExamFetch onData={(raw, sem) => handleRaw(raw, sem)} />}

      {jwEmptyHint && <p className="rounded-2xl bg-amber-400/20 p-3 text-sm leading-relaxed">{jwEmptyHint}</p>}

      {isNative ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-fg-muted">手动粘贴教务 JSON 或考试表格</summary>
          <div className="mt-3 space-y-2">
            <ManualPasteArea text={text} onChange={(v) => handleRaw(v)} onFile={readFile} />
          </div>
        </details>
      ) : (
        <ManualPasteArea text={text} onChange={(v) => handleRaw(v)} onFile={readFile} />
      )}

      {parsed && (
        <div className="space-y-3 text-sm">
          {parsed.warnings.length > 0 && (
            <div className="rounded-2xl bg-amber-400/18 p-3 text-xs leading-relaxed">
              {parsed.warnings.slice(0, 4).map((w) => (
                <p key={w}>⚠️ {w}</p>
              ))}
            </div>
          )}

          {diff && (
            <>
              <ExamDiffGroup title="新增考试" items={diff.added} />
              <ExamDiffGroup title="时间/考场有更新" items={diff.changed.map((c) => c.after)} />
              {diff.removed.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-medium">教务系统里已移除（{diff.removed.length}）</p>
                  <p className="text-xs text-fg-muted">{diff.removed.map((e) => e.courseName).join('、')}</p>
                  <Switch
                    label="删除这些已移除的记录"
                    description="仅清理之前从教务同步的考试，手动添加的不会删"
                    checked={removeMissing}
                    onChange={setRemoveMissing}
                  />
                </div>
              )}
              {diff.unchanged > 0 && <p className="text-fg-muted">{diff.unchanged} 场考试无变化</p>}
            </>
          )}
        </div>
      )}

      {submit.error && <p className="text-sm text-danger">{submit.error instanceof ApiError ? submit.error.message : '导入失败'}</p>}

      <Button className="w-full" disabled={!diff || !!nothingToDo} loading={submit.isPending} onClick={() => submit.mutate()}>
        {nothingToDo ? '考试安排没有变化' : '确认导入'}
      </Button>
    </div>
  );
}

function ManualPasteArea({
  text,
  onChange,
  onFile,
}: {
  text: string;
  onChange: (value: string) => void;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-2.5">
      <p className="text-xs leading-relaxed text-fg-muted">
        在电脑登录广工教务系统「考试安排」页面后，直接选中表格复制粘贴到下面，或粘贴 <code className="font-mono">xsksap!getDataList.action</code> 的 JSON 返回内容。
      </p>
      <textarea
        className="field min-h-28 resize-y py-3 font-mono text-xs"
        placeholder="粘贴考试安排表格文本或教务 JSON…"
        value={text}
        onChange={(e) => onChange(e.target.value)}
      />
      <label className="glass-thin inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium">
        <span>选择 JSON / 表格文件</span>
        <input type="file" accept=".json,.txt,.html,.tsv" className="sr-only" onChange={onFile} />
      </label>
    </div>
  );
}

type FetchState = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'done'; semester: string } | { kind: 'error'; text: string };

function JwExamFetch({ onData }: { onData: (raw: string, semesterName: string) => void }) {
  const [state, setState] = useState<FetchState>({ kind: 'idle' });

  const run = async () => {
    const jw = await import('../../lib/jw');
    const withLogin = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch (err) {
        if (!(err instanceof jw.JwLoginRequired)) throw err;
        setState({ kind: 'busy', text: '请在弹出的学校页面登录统一认证…' });
        if (!(await jw.loginToJw())) return null;
        setState({ kind: 'busy', text: '已登录，正在读取考试安排…' });
        return fn();
      }
    };

    try {
      setState({ kind: 'busy', text: '正在连接广工教务系统…' });
      const semesters = await withLogin(jw.jwSemesters);
      if (!semesters) return setState({ kind: 'idle' });
      if (!semesters.current) return setState({ kind: 'error', text: '教务系统里未找到当前学期' });

      setState({ kind: 'busy', text: `正在读取 ${semesters.current.name} 的考试安排…` });
      const payload = await withLogin(() => jw.jwExamsPayload(semesters.current!.code));
      if (!payload) return setState({ kind: 'idle' });
      onData(payload, semesters.current.name);
      setState({ kind: 'done', semester: semesters.current.name });
    } catch (err) {
      setState({ kind: 'error', text: err instanceof Error ? `读取失败：${err.message}` : '读取失败，请稍后重试' });
    }
  };

  return (
    <div className="space-y-1.5">
      <Button className="w-full" loading={state.kind === 'busy'} onClick={() => void run()}>
        从教务系统读取考试安排
      </Button>
      <p className="text-xs leading-relaxed text-fg-muted">
        {state.kind === 'busy'
          ? state.text
          : state.kind === 'done'
            ? `已读取 ${state.semester} 的考试数据，核对下方预览后确认导入`
            : state.kind === 'error'
              ? state.text
              : '复用学校官方统一认证页面由你本人登录，密码不经过本应用。若刚同步过课表通常无需重复登录。'}
      </p>
    </div>
  );
}

function ExamDiffGroup({ title, items }: { title: string; items: ImportedExam[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="font-medium">
        {title}（{items.length}）
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((exam) => (
          <li key={exam.importKey} className="glass-thin rounded-xl p-2.5">
            <p className="font-medium">
              {exam.courseName}
              {exam.examType && <span className="ml-1.5 text-xs font-normal text-fg-muted">{exam.examType}</span>}
            </p>
            <p className="mt-0.5 text-xs text-fg-muted">
              {exam.examDate} {exam.startTime}–{exam.endTime}
              {exam.location ? ` · ${exam.location}` : ''}
              {exam.seatNo ? ` · 座位 ${exam.seatNo}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
