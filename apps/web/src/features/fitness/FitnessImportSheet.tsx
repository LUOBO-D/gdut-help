import {
  defaultAcademicYear,
  diffFitnessImport,
  evaluateFitnessRecord,
  FITNESS_GENDER_LABELS,
  FITNESS_GENDERS,
  FITNESS_GRADE_LABELS,
  FITNESS_GRADE_YEARS,
  FITNESS_LEVEL_LABELS,
  parseFitnessImport,
  type FitnessGender,
  type FitnessGradeYear,
  type FitnessImportResult,
  type FitnessRecord,
  type ImportedFitnessRecord,
} from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ChangeEvent } from 'react';
import { Button } from '../../components/Button';
import { Chip, Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { api, ApiError } from '../../lib/api';
import { keys } from '../../lib/queries';
import { toast } from '../../lib/toast-store';

export function FitnessImportSheet({
  open,
  onClose,
  records,
  defaultGender,
}: {
  open: boolean;
  onClose: () => void;
  records: FitnessRecord[];
  defaultGender?: FitnessGender;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="导入体测成绩">
      {open && <FitnessImportForm records={records} defaultGender={defaultGender ?? 'male'} onDone={onClose} />}
    </Sheet>
  );
}

function FitnessImportForm({
  records,
  defaultGender,
  onDone,
}: {
  records: FitnessRecord[];
  defaultGender: FitnessGender;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [gender, setGender] = useState<FitnessGender>(defaultGender);
  const [gradeYear, setGradeYear] = useState<FitnessGradeYear>(1);
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear());

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    return parseFitnessImport(text, { gender, gradeYear, academicYear });
  }, [text, gender, gradeYear, academicYear]);

  const diff = useMemo(() => {
    if (!parsed || parsed.records.length === 0) return null;
    return diffFitnessImport(records, parsed.records);
  }, [parsed, records]);

  const submit = useMutation({
    mutationFn: () =>
      api<FitnessImportResult>('/fitness/import', {
        method: 'POST',
        body: { records: parsed!.records },
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: keys.fitness });
      toast.success(`体测成绩已收录（新增 ${res.added} 学年，更新 ${res.changed} 学年）`);
    },
  });

  const readFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setText(await file.text());
    submit.reset();
  };

  if (submit.data) {
    const r = submit.data;
    return (
      <div className="space-y-4 pb-2 text-[15px]">
        <p>
          导入完成：新增 {r.added} 学年，更新 {r.changed} 学年，{r.unchanged} 学年无变化。
        </p>
        <p className="text-sm text-fg-muted">
          系统已按《国家学生体质健康标准（2014年修订）》自动核算各单项得分、附加分与毕业体测总评。
        </p>
        <Button className="w-full" onClick={onDone}>
          查看体测档案
        </Button>
      </div>
    );
  }

  const nothingToDo = diff !== null && diff.added.length === 0 && diff.changed.length === 0;

  return (
    <div className="space-y-4 pb-2">
      <div className="surface-subtle space-y-1.5 rounded-2xl p-3.5 text-xs leading-relaxed text-fg-muted">
        <p className="font-medium text-fg">支持直接复制粘贴以下任意来源：</p>
        <p>
          1. 广工体测系统（<code className="font-mono">tzcs.gdut.edu.cn</code> 校园网）网页成绩表格，支持一次粘贴多学年；
        </p>
        <p>2. 「广东工业大学体育学院」微信公众号 → 体质测试 → 学生成绩查询页长按复制的成绩文本；</p>
        <p>3. 导出的 JSON 备份或 Excel/TSV 表格。</p>
      </div>

      {/* 默认兜底上下文（仅在粘贴文本缺少性别/学年/年级字段时生效） */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="默认性别（文本缺失时）">
          <div className="flex gap-1.5">
            {FITNESS_GENDERS.map((g) => (
              <Chip
                key={g}
                active={gender === g}
                onClick={() => {
                  setGender(g);
                  submit.reset();
                }}
                className="flex-1 justify-center text-xs"
              >
                {FITNESS_GENDER_LABELS[g]}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="默认学年（文本缺失时）">
          <input
            className="field font-num text-sm"
            value={academicYear}
            placeholder="2025-2026"
            onChange={(e) => {
              setAcademicYear(e.target.value);
              submit.reset();
            }}
          />
        </Field>
      </div>

      <Field label="默认年级（文本缺失时）">
        <div className="flex flex-wrap gap-1.5">
          {FITNESS_GRADE_YEARS.map((g) => (
            <Chip
              key={g}
              active={gradeYear === g}
              onClick={() => {
                setGradeYear(g);
                submit.reset();
              }}
              className="px-3 text-xs"
            >
              {FITNESS_GRADE_LABELS[g]}
            </Chip>
          ))}
        </div>
      </Field>

      <div className="space-y-2.5">
        <textarea
          className="field min-h-32 resize-y py-3 font-mono text-xs"
          placeholder={`粘贴成绩表格、JSON 或公众号文本，例如：\n2025-2026学年 大二 男\n身高：175cm  体重：65kg\n肺活量：4500  50米：7.2\n坐位体前屈：16.5  立定跳远：245\n引体向上：14  1000米：3'48"`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            submit.reset();
          }}
        />
        <label className="glass-thin inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium">
          <span>选择 JSON / 表格文件</span>
          <input type="file" accept=".json,.txt,.html,.tsv,.csv" className="sr-only" onChange={readFile} />
        </label>
      </div>

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
              <ImportGroup title="新增学年" items={diff.added} />
              <ImportGroup title="成绩有更新" items={diff.changed.map((c) => c.after)} />
              {diff.unchanged > 0 && <p className="text-xs text-fg-muted">{diff.unchanged} 条学年记录内容无变化</p>}
            </>
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
        {nothingToDo ? '成绩没有变化' : '确认收录'}
      </Button>
    </div>
  );
}

function ImportGroup({ title, items }: { title: string; items: ImportedFitnessRecord[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-fg-muted">
        {title}（{items.length}）
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item) => {
          const ev = evaluateFitnessRecord(item);
          return (
            <li key={item.academicYear} className="glass-thin flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {item.academicYear} 学年 · {FITNESS_GRADE_LABELS[item.gradeYear]} · {FITNESS_GENDER_LABELS[item.gender]}
                </p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  识别 {ev.completedCount}/7 项
                  {ev.bmi !== null ? ` · BMI ${ev.bmi.toFixed(1)}` : ''}
                  {item.exempt ? ' · 免测' : ''}
                </p>
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <p className="font-num text-base font-bold text-accent">
                  {ev.completedCount > 0 || item.exempt ? ev.totalScore.toFixed(1) : '--'}
                </p>
                <p className="text-[11px] text-fg-muted">{FITNESS_LEVEL_LABELS[ev.level]}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
