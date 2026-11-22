import { examInputSchema, today, type Exam, type ExamInput } from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { api, ApiError } from '../../lib/api';
import { keys } from '../../lib/queries';
import { toast } from '../../lib/toast-store';

export type ExamDraft = { exam?: Exam };

export function ExamEditorSheet({ draft, onClose }: { draft: ExamDraft | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(draft)} onClose={onClose} title={draft?.exam ? '编辑考试安排' : '添加考试安排'}>
      {draft && <ExamForm key={draft.exam?.id ?? 'new'} exam={draft.exam} onClose={onClose} />}
    </Sheet>
  );
}

function ExamForm({ exam, onClose }: { exam?: Exam; onClose: () => void }) {
  const qc = useQueryClient();
  const [courseName, setCourseName] = useState(exam?.courseName ?? '');
  const [examDate, setExamDate] = useState(exam?.examDate ?? today());
  const [startTime, setStartTime] = useState(exam?.startTime ?? '08:30');
  const [endTime, setEndTime] = useState(exam?.endTime ?? '10:30');
  const [location, setLocation] = useState(exam?.location ?? '');
  const [seatNo, setSeatNo] = useState(exam?.seatNo ?? '');
  const [examType, setExamType] = useState(exam?.examType ?? '期末考试');
  const [campus, setCampus] = useState(exam?.campus ?? '大学城校区');
  const [note, setNote] = useState(exam?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (payload: ExamInput) =>
      exam
        ? api<Exam>(`/exams/${exam.id}`, { method: 'PUT', body: payload })
        : api<Exam>('/exams', { method: 'POST', body: payload }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.exams });
      toast.success(exam ? '已更新考试安排' : '已添加考试安排');
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '保存失败'),
  });

  const remove = useMutation({
    mutationFn: () => api(`/exams/${exam!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.exams });
      toast.info('已删除考试记录');
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '删除失败'),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = examInputSchema.safeParse({
      courseName,
      examDate,
      startTime,
      endTime,
      location: location.trim() || null,
      seatNo: seatNo.trim() || null,
      examType: examType.trim() || null,
      campus: campus.trim() || null,
      note: note.trim() || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '请检查填写内容');
      return;
    }
    setError(null);
    save.mutate(parsed.data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5 pb-2">
      <Field label="考试科目">
        <input
          className="field"
          value={courseName}
          maxLength={50}
          placeholder="如：高等数学A(1)、英语六级 CET-6"
          onChange={(e) => {
            setCourseName(e.target.value);
            setError(null);
          }}
          autoFocus={!exam}
        />
      </Field>

      <div className="grid grid-cols-3 gap-2.5">
        <Field label="考试日期" className="col-span-3 sm:col-span-1">
          <input
            className="field"
            type="date"
            value={examDate}
            onChange={(e) => {
              setExamDate(e.target.value);
              setError(null);
            }}
          />
        </Field>
        <Field label="开始时间">
          <input
            className="field"
            type="time"
            value={startTime}
            onChange={(e) => {
              setStartTime(e.target.value);
              setError(null);
            }}
          />
        </Field>
        <Field label="结束时间">
          <input
            className="field"
            type="time"
            value={endTime}
            onChange={(e) => {
              setEndTime(e.target.value);
              setError(null);
            }}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="考场教室（可一键导航）">
          <input
            className="field"
            value={location}
            maxLength={40}
            placeholder="如：教3-305"
            onChange={(e) => setLocation(e.target.value)}
          />
        </Field>
        <Field label="座位号（可选）">
          <input
            className="field"
            value={seatNo}
            maxLength={20}
            placeholder="如：18"
            onChange={(e) => setSeatNo(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="考试类型">
          <input
            className="field"
            value={examType}
            maxLength={30}
            placeholder="期末考试 / 期中 / 闭卷"
            onChange={(e) => setExamType(e.target.value)}
          />
        </Field>
        <Field label="校区（可选）">
          <input
            className="field"
            value={campus}
            maxLength={30}
            placeholder="大学城校区"
            onChange={(e) => setCampus(e.target.value)}
          />
        </Field>
      </div>

      <Field label="备注（可选）">
        <input
          className="field"
          value={note}
          maxLength={120}
          placeholder="如：开卷、带计算器、带听力耳机"
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2 pt-1">
        {exam && (
          <Button
            type="button"
            variant="ghost"
            className="text-danger!"
            loading={remove.isPending}
            onClick={() => remove.mutate()}
          >
            删除
          </Button>
        )}
        <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
          取消
        </Button>
        <Button type="submit" className="flex-[1.3]" loading={save.isPending}>
          {exam ? '保存修改' : '添加考试'}
        </Button>
      </div>
    </form>
  );
}
