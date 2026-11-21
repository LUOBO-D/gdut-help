import {
  diffImport,
  parseTimetableImport,
  type Course,
  type ImportDiff,
  type ImportedCourse,
  type ImportedSlot,
  type ImportParseResult,
  type Semester,
  type TimetableImportResult,
} from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ChangeEvent } from 'react';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { Switch } from '../../components/Switch';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';
import { isNative } from '../../lib/platform';
import { keys } from '../../lib/queries';
import { WEEKDAY_LABEL } from './weekday';

/** [1,2,3,5,7,9] → 「1-3、5-9单」 */
function formatWeeks(weeks: number[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < weeks.length) {
    let j = i;
    while (j + 1 < weeks.length && weeks[j + 1] === weeks[j]! + 1) j++;
    if (j - i >= 1) {
      parts.push(`${weeks[i]}-${weeks[j]}`);
      i = j + 1;
      continue;
    }
    // 连续的单周或双周
    let k = i;
    while (k + 1 < weeks.length && weeks[k + 1] === weeks[k]! + 2) k++;
    if (k - i >= 2) {
      parts.push(`${weeks[i]}-${weeks[k]}${weeks[i]! % 2 ? '单' : '双'}`);
      i = k + 1;
    } else {
      parts.push(String(weeks[i]));
      i++;
    }
  }
  return `${parts.join('、')}周`;
}

const slotText = (s: ImportedSlot, courseLocation: string | null) =>
  `周${WEEKDAY_LABEL[s.weekday - 1]} ${s.periodStart}-${s.periodEnd}节 · ${formatWeeks(s.weeks)}${s.location || courseLocation ? ` · ${s.location || courseLocation}` : ''}`;

export function ImportSheet({ open, onClose, semester, courses }: { open: boolean; onClose: () => void; semester: Semester; courses: Course[] }) {
  return (
    <Sheet open={open} onClose={onClose} title="从教务系统导入">
      {open && <ImportForm semester={semester} courses={courses} onDone={onClose} />}
    </Sheet>
  );
}

function ImportForm({ semester, courses, onDone }: { semester: Semester; courses: Course[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ImportParseResult | null>(null);
  const [removeMissing, setRemoveMissing] = useState(true);
  const [meta, setMeta] = useState<JwMeta | null>(null);
  const isAdmin = useAuth((s) => s.user?.role === 'admin');
  const campusId = useAuth((s) => s.user?.campusId);

  const diff: ImportDiff | null = useMemo(() => (parsed?.courses.length ? diffImport(courses, parsed.courses) : null), [parsed, courses]);
  const maxWeek = useMemo(() => Math.max(0, ...(parsed?.courses.flatMap((c) => c.slots.flatMap((s) => s.weeks)) ?? [])), [parsed]);
  const outOfRange = useMemo(
    () => parsed?.courses.filter((c) => c.slots.some((s) => s.weeks.some((w) => w > semester.totalWeeks))).map((c) => c.name) ?? [],
    [parsed, semester.totalWeeks],
  );

  const submit = useMutation({
    mutationFn: () =>
      api<TimetableImportResult>('/timetable/import', {
        method: 'POST',
        body: { courses: parsed!.courses, removeMissing },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.timetable }),
  });

  const parse = (value: string) => {
    setText(value);
    setParsed(
      value.trim()
        ? parseTimetableImport(value, {
            semesterStartDate: semester.startDate,
            totalWeeks: semester.totalWeeks,
            campusId,
          })
        : null,
    );
    submit.reset();
  };

  const readFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parse(await file.text());
  };

  if (submit.data) {
    const r = submit.data;
    return (
      <div className="space-y-4 text-[15px]">
        <p>
          导入完成：新增 {r.added} 门，更新 {r.changed} 门，删除 {r.removed} 门，{r.unchanged} 门没有变化。
        </p>
        <p className="text-sm text-fg-muted">以后课表有变动，再导入一次就会刷新。你手动添加的课不受影响。</p>
        <Button className="w-full" onClick={onDone}>
          完成
        </Button>
      </div>
    );
  }

  const nothingToDo = diff && !diff.added.length && !diff.changed.length && !(removeMissing && diff.removed.length);

  return (
    <div className="space-y-4">
      {isNative && (
        <JwFetch
          onData={(json, m) => {
            parse(json);
            setMeta(m);
          }}
        />
      )}
      {meta?.weekOneMonday && meta.weekOneMonday !== semester.startDate && (
        <SemesterMismatch semester={semester} monday={meta.weekOneMonday} maxWeek={maxWeek} canFix={isAdmin} />
      )}
      <details className="glass-thin rounded-2xl p-3 text-sm">
        <summary className="cursor-pointer font-medium">{isNative ? '也可以手动粘贴课表数据' : '怎么从教务系统复制课表数据'}</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-fg-muted">
          <li>电脑浏览器登录教务系统，打开「我的课表」</li>
          <li>按 F12，切到「网络 / Network」，筛选 Fetch/XHR，刷新页面</li>
          <li>按 Ctrl+F 搜一门课的名字，点开搜到的请求</li>
          <li>在「响应 / Response」里全选复制，粘贴到下面；或者右键请求另存为文件，再在下面选择文件</li>
        </ol>
        <p className="mt-2 text-fg-muted">不要复制 Cookie。数据只用来读取课程，不会保存原文。</p>
      </details>

      <textarea
        className="field min-h-32 font-mono text-xs"
        placeholder="把课表数据（教务 JSON 或 .ics 日历内容）粘贴到这里"
        value={text}
        onChange={(e) => parse(e.target.value)}
        spellCheck={false}
        aria-label="课表数据"
      />
      <label className="block text-sm text-fg-muted">
        或选择保存的文件（支持 `.json` / `.ics`）：
        <input type="file" accept=".json,.txt,.ics,application/json,text/plain,text/calendar" className="mt-1 block w-full text-sm" onChange={(e) => void readFile(e)} />
      </label>

      {parsed && (
        <div className="space-y-3 text-sm">
          {parsed.courses.length > 0 && (
            <p>
              读到 {parsed.records} 条上课记录，整理成 {parsed.courses.length} 门课。
            </p>
          )}
          {parsed.warnings.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-amber-400/20 p-3 text-fg">
              {parsed.warnings.slice(0, 8).map((w) => (
                <li key={w}>⚠️ {w}</li>
              ))}
              {parsed.warnings.length > 8 && <li>…还有 {parsed.warnings.length - 8} 条</li>}
            </ul>
          )}
          {outOfRange.length > 0 && (
            <p className="text-fg-muted">
              ⚠️ {outOfRange.join('、')} 有超过第 {semester.totalWeeks} 周的安排，超出的部分不会显示。确认学期总周数是否正确。
            </p>
          )}
          {diff && (
            <>
              <DiffGroup title="新增" items={diff.added.map((c) => ({ key: c.importKey, course: c }))} />
              <DiffGroup title="有变化" items={diff.changed.map(({ after }) => ({ key: after.importKey, course: after }))} />
              {diff.removed.length > 0 && (
                <div>
                  <p className="font-medium">教务系统里已经没有（{diff.removed.length}）</p>
                  <p className="text-fg-muted">{diff.removed.map((c) => c.name).join('、')}</p>
                  <Switch label="删除这些课" description="只删除以前从教务系统导入的课" checked={removeMissing} onChange={setRemoveMissing} />
                </div>
              )}
              {diff.unchanged > 0 && <p className="text-fg-muted">{diff.unchanged} 门课没有变化</p>}
            </>
          )}
        </div>
      )}

      {submit.error && <p className="text-sm text-danger">{submit.error instanceof ApiError ? submit.error.message : '导入失败'}</p>}
      <Button className="w-full" disabled={!diff || !!nothingToDo} loading={submit.isPending} onClick={() => submit.mutate()}>
        {nothingToDo ? '课表没有变化' : '确认导入'}
      </Button>
    </div>
  );
}

/** 教务系统的第 1 周和本应用设置的学期开学日期不一致：周次会整体错开。管理员可以一键改成教务系统的日期 */
function SemesterMismatch({ semester, monday, maxWeek, canFix }: { semester: Semester; monday: string; maxWeek: number; canFix: boolean }) {
  const qc = useQueryClient();
  const fix = useMutation({
    mutationFn: () =>
      api('/admin/semesters/current', {
        method: 'PUT',
        body: { name: semester.name, startDate: monday, totalWeeks: Math.max(semester.totalWeeks, maxWeek) },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.timetable }),
  });
  if (fix.isSuccess) return <p className="rounded-xl bg-emerald-400/20 p-3 text-sm">已把开学日期改为 {monday}，周次和教务系统一致了。</p>;
  return (
    <div className="space-y-2 rounded-xl bg-amber-400/20 p-3 text-sm">
      <p>
        ⚠️ 教务系统的第 1 周从 <b>{monday}</b> 开始，本应用里「{semester.name}」设置的是 {semester.startDate}。不改的话，所有课的周次都会错开。
      </p>
      {canFix ? (
        <Button variant="ghost" className="h-9 w-full text-sm" loading={fix.isPending} onClick={() => fix.mutate()}>
          改成 {monday}
          {maxWeek > semester.totalWeeks ? `，总周数改为 ${maxWeek}` : ''}
        </Button>
      ) : (
        <p className="text-fg-muted">请联系管理员在「我的 → 学期设置」里修改。</p>
      )}
      {fix.error && <p className="text-danger">{fix.error instanceof ApiError ? fix.error.message : '修改失败'}</p>}
    </div>
  );
}

type FetchState = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'done'; semester: string } | { kind: 'error'; text: string };

/**
 * App 里：打开学校登录页让用户自己登录，然后在手机上直接取整学期课表。
 * 已经登录过（登录状态还没过期）时不再弹登录页。
 */
export interface JwMeta {
  semesterName: string;
  /** 教务系统里第 1 周星期一的日期 */
  weekOneMonday: string | null;
}

function JwFetch({ onData }: { onData: (json: string, meta: JwMeta) => void }) {
  const [state, setState] = useState<FetchState>({ kind: 'idle' });
  const run = async () => {
    const jw = await import('../../lib/jw');
    const withLogin = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch (err) {
        if (!(err instanceof jw.JwLoginRequired)) throw err;
        setState({ kind: 'busy', text: '请在弹出的页面里登录教务系统…' });
        if (!(await jw.loginToJw())) return null;
        setState({ kind: 'busy', text: '已登录，正在读取课表…' });
        return fn();
      }
    };
    try {
      setState({ kind: 'busy', text: '正在连接教务系统…' });
      const semesters = await withLogin(jw.jwSemesters);
      if (!semesters) return setState({ kind: 'idle' });
      if (!semesters.current) return setState({ kind: 'error', text: '教务系统里没有找到学期' });
      setState({ kind: 'busy', text: `正在读取 ${semesters.current.name} 的课表…` });
      const json = await withLogin(() => jw.jwTimetableJson(semesters.current!.code));
      if (!json) return setState({ kind: 'idle' });
      const weekOneMonday = await jw.jwWeekOneMonday(semesters.current.code).catch(() => null);
      onData(json, { semesterName: semesters.current.name, weekOneMonday });
      setState({ kind: 'done', semester: semesters.current.name });
    } catch (err) {
      setState({ kind: 'error', text: err instanceof Error ? `读取失败：${err.message}` : '读取失败' });
    }
  };
  return (
    <div className="space-y-1">
      <Button className="w-full" loading={state.kind === 'busy'} onClick={() => void run()}>
        从教务系统读取课表
      </Button>
      <p className="text-sm text-fg-muted">
        {state.kind === 'busy'
          ? state.text
          : state.kind === 'done'
            ? `已读取 ${state.semester} 的课表，确认下面的变化后导入`
            : state.kind === 'error'
              ? state.text
              : '会打开学校的登录页，由你自己登录。密码不经过本应用'}
      </p>
    </div>
  );
}

function DiffGroup({ title, items }: { title: string; items: { key: string; course: ImportedCourse }[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="font-medium">
        {title}（{items.length}）
      </p>
      <ul className="mt-1 space-y-1.5">
        {items.map(({ key, course }) => (
          <li key={key} className="glass-thin rounded-xl p-2">
            <p className="font-medium">
              {course.name}
              {course.teacher && <span className="font-normal text-fg-muted"> · {course.teacher}</span>}
            </p>
            {course.slots.map((s) => (
              <p key={`${s.weekday}-${s.periodStart}-${s.location ?? ''}`} className="text-xs text-fg-muted">
                {slotText(s, course.location)}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
