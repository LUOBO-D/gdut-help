import {
  defaultAcademicYear,
  evaluateFitnessRecord,
  FITNESS_GENDER_LABELS,
  FITNESS_GENDERS,
  FITNESS_GRADE_LABELS,
  FITNESS_GRADE_YEARS,
  FITNESS_LEVEL_LABELS,
  fitnessRecordInputSchema,
  formatRunTime,
  parseRunTime,
  type FitnessGender,
  type FitnessGradeYear,
  type FitnessRecord,
  type FitnessRecordInput,
} from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Chip, Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { Switch } from '../../components/Switch';
import { api, ApiError } from '../../lib/api';
import { keys } from '../../lib/queries';
import { toast } from '../../lib/toast-store';

export type FitnessDraft = {
  record?: FitnessRecord;
  defaultGender?: FitnessGender;
  defaultGradeYear?: FitnessGradeYear;
  defaultAcademicYear?: string;
};

function parseOptFloat(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseOptInt(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function recentAcademicYears(): string[] {
  const cur = defaultAcademicYear();
  const start = Number(cur.slice(0, 4));
  return [0, -1, -2, -3].map((d) => `${start + d}-${start + d + 1}`);
}

export function FitnessEditorSheet({ draft, onClose }: { draft: FitnessDraft | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(draft)} onClose={onClose} title={draft?.record ? '编辑体测成绩' : '录入体测成绩'}>
      {draft && <FitnessForm key={draft.record?.id ?? 'new'} draft={draft} onClose={onClose} />}
    </Sheet>
  );
}

function FitnessForm({ draft, onClose }: { draft: FitnessDraft; onClose: () => void }) {
  const qc = useQueryClient();
  const existing = draft.record;

  const [academicYear, setAcademicYear] = useState(
    existing?.academicYear ?? draft.defaultAcademicYear ?? defaultAcademicYear(),
  );
  const [gradeYear, setGradeYear] = useState<FitnessGradeYear>(existing?.gradeYear ?? draft.defaultGradeYear ?? 1);
  const [gender, setGender] = useState<FitnessGender>(existing?.gender ?? draft.defaultGender ?? 'male');
  const [exempt, setExempt] = useState(existing?.exempt ?? false);

  const [heightCm, setHeightCm] = useState(existing?.heightCm != null ? String(existing.heightCm) : '');
  const [weightKg, setWeightKg] = useState(existing?.weightKg != null ? String(existing.weightKg) : '');
  const [lungCapacityMl, setLungCapacityMl] = useState(
    existing?.lungCapacityMl != null ? String(existing.lungCapacityMl) : '',
  );
  const [sprint50mSec, setSprint50mSec] = useState(existing?.sprint50mSec != null ? String(existing.sprint50mSec) : '');
  const [sitAndReachCm, setSitAndReachCm] = useState(
    existing?.sitAndReachCm != null ? String(existing.sitAndReachCm) : '',
  );
  const [standingLongJumpCm, setStandingLongJumpCm] = useState(
    existing?.standingLongJumpCm != null ? String(existing.standingLongJumpCm) : '',
  );
  const [strengthCount, setStrengthCount] = useState(
    existing?.strengthCount != null ? String(existing.strengthCount) : '',
  );
  const [enduranceText, setEnduranceText] = useState(
    existing?.enduranceSec != null ? formatRunTime(existing.enduranceSec) : '',
  );
  const [officialTotal, setOfficialTotal] = useState(
    existing?.officialTotal != null ? String(existing.officialTotal) : '',
  );
  const [testedAt, setTestedAt] = useState(existing?.testedAt ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedEnduranceSec = parseRunTime(enduranceText);
  const enduranceInvalid = enduranceText.trim().length > 0 && parsedEnduranceSec === null;

  // 实时算分预览：录入时即充当操场随身国家体测算分器
  const liveEval = evaluateFitnessRecord({
    gradeYear,
    gender,
    heightCm: parseOptFloat(heightCm),
    weightKg: parseOptFloat(weightKg),
    lungCapacityMl: parseOptInt(lungCapacityMl),
    sprint50mSec: parseOptFloat(sprint50mSec),
    sitAndReachCm: parseOptFloat(sitAndReachCm),
    standingLongJumpCm: parseOptInt(standingLongJumpCm),
    strengthCount: parseOptInt(strengthCount),
    enduranceSec: parsedEnduranceSec,
    exempt,
  });

  const save = useMutation({
    mutationFn: (payload: FitnessRecordInput) =>
      existing
        ? api<FitnessRecord>(`/fitness/${existing.id}`, { method: 'PUT', body: payload })
        : api<FitnessRecord>('/fitness', { method: 'POST', body: payload }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.fitness });
      toast.success(existing ? '体测成绩已更新' : '体测成绩已收录');
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '保存失败'),
  });

  const remove = useMutation({
    mutationFn: () => api(`/fitness/${existing!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.fitness });
      toast.info('已删除该学年体测记录');
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '删除失败'),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (enduranceInvalid) {
      setError(`请检查${gender === 'male' ? '1000米' : '800米'}格式，支持 3'45"、3:45、3分45秒 或 225`);
      return;
    }

    const parsed = fitnessRecordInputSchema.safeParse({
      academicYear,
      gradeYear,
      gender,
      heightCm: parseOptFloat(heightCm),
      weightKg: parseOptFloat(weightKg),
      lungCapacityMl: parseOptInt(lungCapacityMl),
      sprint50mSec: parseOptFloat(sprint50mSec),
      sitAndReachCm: parseOptFloat(sitAndReachCm),
      standingLongJumpCm: parseOptInt(standingLongJumpCm),
      strengthCount: parseOptInt(strengthCount),
      enduranceSec: parsedEnduranceSec,
      exempt,
      officialTotal: parseOptFloat(officialTotal),
      testedAt: testedAt.trim() || null,
      note: note.trim() || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '请检查录入数据范围');
      return;
    }
    setError(null);
    save.mutate(parsed.data);
  };

  const yearPresets = recentAcademicYears();
  const strengthLabel = gender === 'male' ? '引体向上（次）' : '1分钟仰卧起坐（次）';
  const enduranceLabel = gender === 'male' ? '1000米跑（分秒）' : '800米跑（分秒）';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-2">
      {/* 实时国家标准算分预览条 */}
      <div className="surface-subtle flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
        <div>
          <p className="text-xs text-fg-muted">
            实时国家标准试算（{FITNESS_GRADE_LABELS[gradeYear]} · {FITNESS_GENDER_LABELS[gender]}）
          </p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="font-num text-2xl font-bold text-accent tabular-nums">
              {liveEval.completedCount > 0 || exempt ? liveEval.totalScore.toFixed(1) : '--'}
            </span>
            <span className="text-xs font-medium text-fg-muted">
              {FITNESS_LEVEL_LABELS[liveEval.level]}
              {liveEval.bonusScore > 0 ? ` · 含 +${liveEval.bonusScore} 附加分` : ''}
            </span>
          </div>
        </div>
        <div className="text-right text-xs text-fg-muted tabular-nums">
          <p>已录 {liveEval.completedCount}/7 项</p>
          {liveEval.bmi !== null && <p className="mt-0.5">BMI {liveEval.bmi.toFixed(1)}</p>}
        </div>
      </div>

      {/* 学年 + 年级 + 性别 */}
      <div className="space-y-3">
        <Field label="测试学年">
          <input
            className="field font-num"
            value={academicYear}
            placeholder="2025-2026"
            onChange={(e) => {
              setAcademicYear(e.target.value);
              setError(null);
            }}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {yearPresets.map((y) => (
              <Chip key={y} active={academicYear === y} onClick={() => setAcademicYear(y)} className="text-xs">
                {y}
              </Chip>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="年级组">
            <div className="flex flex-wrap gap-1.5">
              {FITNESS_GRADE_YEARS.map((g) => (
                <Chip key={g} active={gradeYear === g} onClick={() => setGradeYear(g)} className="px-2.5 text-xs">
                  {FITNESS_GRADE_LABELS[g]}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="性别标准">
            <div className="flex gap-1.5">
              {FITNESS_GENDERS.map((g) => (
                <Chip key={g} active={gender === g} onClick={() => setGender(g)} className="flex-1 justify-center text-xs">
                  {FITNESS_GENDER_LABELS[g]}
                </Chip>
              ))}
            </div>
          </Field>
        </div>

        <Switch
          label="本学年已申请免测"
          description="伤病免测按国家标准记 60 分计入毕业总评"
          checked={exempt}
          onChange={setExempt}
        />
      </div>

      {/* 7 项测试成绩输入（均可留空，支持先录已测项目） */}
      {!exempt && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="身高（cm）">
            <input
              className="field font-num"
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder={gender === 'male' ? '175.0' : '163.0'}
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
            />
          </Field>
          <Field label="体重（kg）">
            <input
              className="field font-num"
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder={gender === 'male' ? '65.0' : '52.0'}
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
            />
          </Field>
          <Field label="肺活量（mL）">
            <input
              className="field font-num"
              type="number"
              inputMode="numeric"
              placeholder={gender === 'male' ? '4500' : '3100'}
              value={lungCapacityMl}
              onChange={(e) => setLungCapacityMl(e.target.value)}
            />
          </Field>
          <Field label="50米跑（秒）">
            <input
              className="field font-num"
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder={gender === 'male' ? '7.2' : '8.4'}
              value={sprint50mSec}
              onChange={(e) => setSprint50mSec(e.target.value)}
            />
          </Field>
          <Field label="坐位体前屈（cm）">
            <input
              className="field font-num"
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="16.5（可填负数）"
              value={sitAndReachCm}
              onChange={(e) => setSitAndReachCm(e.target.value)}
            />
          </Field>
          <Field label="立定跳远（cm）">
            <input
              className="field font-num"
              type="number"
              inputMode="numeric"
              placeholder={gender === 'male' ? '245' : '180'}
              value={standingLongJumpCm}
              onChange={(e) => setStandingLongJumpCm(e.target.value)}
            />
          </Field>
          <Field label={strengthLabel}>
            <input
              className="field font-num"
              type="number"
              inputMode="numeric"
              placeholder={gender === 'male' ? '14' : '45'}
              value={strengthCount}
              onChange={(e) => setStrengthCount(e.target.value)}
            />
          </Field>
          <Field label={enduranceLabel}>
            <input
              className="field font-num"
              placeholder={gender === 'male' ? `3'45" 或 3:45` : `3'48" 或 3:48`}
              value={enduranceText}
              onChange={(e) => {
                setEnduranceText(e.target.value);
                setError(null);
              }}
            />
            {enduranceText.trim() && (
              <p className={`mt-1 text-[11px] ${enduranceInvalid ? 'text-danger' : 'text-fg-muted'}`}>
                {enduranceInvalid ? `格式如 3'45" / 3:45 / 225` : `已识别：${formatRunTime(parsedEnduranceSec!)}（${parsedEnduranceSec} 秒）`}
              </p>
            )}
          </Field>
        </div>
      )}

      {/* 可选补充信息 */}
      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-fg-muted">更多信息（测试日期、官方总分对照、备注）</summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="测试日期">
              <input className="field" type="date" value={testedAt} onChange={(e) => setTestedAt(e.target.value)} />
            </Field>
            <Field label="体测系统官方总分">
              <input
                className="field font-num"
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="选填，便于核对"
                value={officialTotal}
                onChange={(e) => setOfficialTotal(e.target.value)}
              />
            </Field>
          </div>
          <Field label="备注">
            <input
              className="field"
              maxLength={120}
              placeholder="如：大学城田径场补测 / 伤病缓测"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
      </details>

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
          {existing ? '保存修改' : '保存收录'}
        </Button>
      </div>
    </form>
  );
}
