import {
  convertGdutScore,
  courseGradeInputSchema,
  formatSemesterName,
  normalizeSemesterCode,
  type CourseGrade,
  type CourseGradeInput,
} from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Chip, Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { api, ApiError } from '../../lib/api';
import { keys } from '../../lib/queries';
import { toast } from '../../lib/toast-store';

export type GradeDraft = { grade?: CourseGrade; defaultSemesterCode?: string };

const COURSE_TYPE_PRESETS = ['必修', '专业选修', '公共选修', '实践环节'] as const;

function defaultSemesterCodeNow(): string {
  const bj = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const y = bj.getUTCFullYear();
  const m = bj.getUTCMonth() + 1;
  if (m >= 9) return `${y}01`;
  if (m <= 2) return `${y - 1}01`;
  return `${y - 1}02`;
}

export function GradeEditorSheet({ draft, onClose }: { draft: GradeDraft | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(draft)} onClose={onClose} title={draft?.grade ? '编辑课程成绩' : '添加 / 试算课程'}>
      {draft && <GradeForm key={draft.grade?.id ?? 'new'} draft={draft} onClose={onClose} />}
    </Sheet>
  );
}

function GradeForm({ draft, onClose }: { draft: GradeDraft; onClose: () => void }) {
  const qc = useQueryClient();
  const existing = draft.grade;

  const [semesterCode, setSemesterCode] = useState(
    existing?.semesterCode ?? draft.defaultSemesterCode ?? defaultSemesterCodeNow(),
  );
  const [courseName, setCourseName] = useState(existing?.courseName ?? '');
  const [credits, setCredits] = useState(existing ? String(existing.credits) : '3');
  const [scoreText, setScoreText] = useState(existing?.scoreText ?? '');
  const [courseType, setCourseType] = useState(existing?.courseType ?? '必修');
  const [examType, setExamType] = useState(existing?.examType ?? '正常考试');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = scoreText.trim() ? convertGdutScore(scoreText) : null;
  const previewSemester = formatSemesterName(normalizeSemesterCode(semesterCode));

  const save = useMutation({
    mutationFn: (payload: CourseGradeInput) =>
      existing
        ? api<CourseGrade>(`/grades/${existing.id}`, { method: 'PUT', body: payload })
        : api<CourseGrade>('/grades', { method: 'POST', body: payload }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.grades });
      toast.success(existing ? '成绩已更新' : '已添加课程成绩');
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '保存失败'),
  });

  const remove = useMutation({
    mutationFn: () => api(`/grades/${existing!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.grades });
      toast.info('已删除该门成绩');
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '删除失败'),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const creditsNum = Number(credits);
    const parsed = courseGradeInputSchema.safeParse({
      semesterCode: normalizeSemesterCode(semesterCode),
      semesterName: formatSemesterName(normalizeSemesterCode(semesterCode)),
      courseCode: existing?.courseCode ?? null,
      courseName,
      credits: Number.isFinite(creditsNum) ? creditsNum : -1,
      scoreText,
      courseType: courseType.trim() || null,
      examType: examType.trim() || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '请检查填写内容');
      return;
    }
    setError(null);
    save.mutate(parsed.data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-2">
      <div className="surface-subtle flex items-center justify-between rounded-2xl px-4 py-3 text-xs">
        <div>
          <p className="text-fg-muted">广工 5.0 制实时折算</p>
          <p className="mt-0.5 font-medium text-fg">{previewSemester}</p>
        </div>
        <div className="text-right tabular-nums">
          <p className="font-num text-xl font-bold text-accent">{preview ? preview.gradePoint.toFixed(1) : '--'}</p>
          <p className="text-[11px] text-fg-muted">课程绩点</p>
        </div>
      </div>

      <Field label="课程名称">
        <input
          className="field"
          value={courseName}
          maxLength={80}
          placeholder="如：高等数学A(1)、数据结构"
          onChange={(e) => {
            setCourseName(e.target.value);
            setError(null);
          }}
          autoFocus={!existing}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="成绩（百分制或五级制）">
          <input
            className="field font-num"
            value={scoreText}
            maxLength={20}
            placeholder="如 88 或 优秀"
            onChange={(e) => {
              setScoreText(e.target.value);
              setError(null);
            }}
          />
        </Field>
        <Field label="学分">
          <input
            className="field font-num"
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            max="30"
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="学期代码">
          <input
            className="field font-num"
            value={semesterCode}
            placeholder="202501"
            onChange={(e) => setSemesterCode(e.target.value)}
          />
        </Field>
        <Field label="考试性质">
          <input
            className="field"
            value={examType}
            placeholder="正常考试 / 补考 / 重修"
            onChange={(e) => setExamType(e.target.value)}
          />
        </Field>
      </div>

      <Field label="课程性质">
        <div className="flex flex-wrap gap-1.5">
          {COURSE_TYPE_PRESETS.map((t) => (
            <Chip key={t} active={courseType === t} onClick={() => setCourseType(t)} className="text-xs">
              {t}
            </Chip>
          ))}
        </div>
      </Field>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2 pt-1">
        {existing && (
          <Button
            type="button"
            variant="ghost"
            className="shrink-0 px-4 text-danger"
            loading={remove.isPending}
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              remove.mutate();
            }}
          >
            {confirmDelete ? '确认删除' : '删除'}
          </Button>
        )}
        <Button type="submit" className="flex-1" loading={save.isPending}>
          {existing ? '保存修改' : '保存课程'}
        </Button>
      </div>
    </form>
  );
}
