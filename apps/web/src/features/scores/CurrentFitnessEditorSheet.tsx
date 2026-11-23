import {
  evaluateFitnessRecord,
  FITNESS_GENDER_LABELS,
  FITNESS_GENDERS,
  FITNESS_GRADE_LABELS,
  FITNESS_GRADE_YEARS,
  FITNESS_LEVEL_LABELS,
  fitnessRecordInputSchema,
  formatRunTime,
  parseFitnessImport,
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

export function CurrentFitnessEditorSheet({
  open,
  academicYear,
  record,
  onClose,
}: {
  open: boolean;
  academicYear: string;
  record: FitnessRecord | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`${academicYear} 学年体测录入与试算`}>
      {open && (
        <CurrentFitnessForm
          key={record?.updatedAt ?? academicYear}
          academicYear={academicYear}
          record={record}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function CurrentFitnessForm({
  academicYear,
  record,
  onClose,
}: {
  academicYear: string;
  record: FitnessRecord | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const [gradeYear, setGradeYear] = useState<FitnessGradeYear>(record?.gradeYear ?? 1);
  const [gender, setGender] = useState<FitnessGender>(record?.gender ?? 'male');
  const [exempt, setExempt] = useState(record?.exempt ?? false);

  const [heightCm, setHeightCm] = useState(record?.heightCm != null ? String(record.heightCm) : '');
  const [weightKg, setWeightKg] = useState(record?.weightKg != null ? String(record.weightKg) : '');
  const [lungCapacityMl, setLungCapacityMl] = useState(
    record?.lungCapacityMl != null ? String(record.lungCapacityMl) : '',
  );
  const [sprint50mSec, setSprint50mSec] = useState(record?.sprint50mSec != null ? String(record.sprint50mSec) : '');
  const [sitAndReachCm, setSitAndReachCm] = useState(record?.sitAndReachCm != null ? String(record.sitAndReachCm) : '');
  const [standingLongJumpCm, setStandingLongJumpCm] = useState(
    record?.standingLongJumpCm != null ? String(record.standingLongJumpCm) : '',
  );
  const [strengthCount, setStrengthCount] = useState(record?.strengthCount != null ? String(record.strengthCount) : '');
  const [enduranceText, setEnduranceText] = useState(
    record?.enduranceSec != null ? formatRunTime(record.enduranceSec) : '',
  );
  const [pasteBox, setPasteBox] = useState('');
  const [error, setError] = useState<string | null>(null);

  const parsedEnduranceSec = parseRunTime(enduranceText);
  const enduranceInvalid = enduranceText.trim().length > 0 && parsedEnduranceSec === null;

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
      api<FitnessRecord>('/fitness/current', {
        method: 'PUT',
        body: { ...payload, source: 'manual' },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.fitnessCurrent(academicYear) });
      void qc.invalidateQueries({ queryKey: keys.fitness });
      toast.success(`已更新 ${academicYear} 学年体测成绩`);
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '保存失败'),
  });

  const applyPastedText = () => {
    if (!pasteBox.trim()) return;
    const res = parseFitnessImport(pasteBox, { academicYear, gender, gradeYear });
    const picked = res.records.find((r) => r.academicYear === academicYear) ?? res.records[0];
    if (!picked) {
      setError(res.warnings[0] ?? '未识别到体测项目数据');
      return;
    }
    setGender(picked.gender);
    setGradeYear(picked.gradeYear);
    setExempt(picked.exempt);
    if (picked.heightCm != null) setHeightCm(String(picked.heightCm));
    if (picked.weightKg != null) setWeightKg(String(picked.weightKg));
    if (picked.lungCapacityMl != null) setLungCapacityMl(String(picked.lungCapacityMl));
    if (picked.sprint50mSec != null) setSprint50mSec(String(picked.sprint50mSec));
    if (picked.sitAndReachCm != null) setSitAndReachCm(String(picked.sitAndReachCm));
    if (picked.standingLongJumpCm != null) setStandingLongJumpCm(String(picked.standingLongJumpCm));
    if (picked.strengthCount != null) setStrengthCount(String(picked.strengthCount));
    if (picked.enduranceSec != null) setEnduranceText(formatRunTime(picked.enduranceSec));
    setPasteBox('');
    setError(null);
    toast.success('已智能填充当前学年项目，请核对后保存');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (enduranceInvalid) {
      setError(`请检查${gender === 'male' ? '1000米' : '800米'}格式，支持 3'45"、3:45 或 225`);
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
      officialTotal: record?.officialTotal ?? null,
      testedAt: record?.testedAt ?? null,
      note: record?.note ?? null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '请检查录入数据');
      return;
    }
    setError(null);
    save.mutate(parsed.data);
  };

  const strengthLabel = gender === 'male' ? '引体向上（次）' : '1分钟仰卧起坐（次）';
  const enduranceLabel = gender === 'male' ? '1000米跑（分秒）' : '800米跑（分秒）';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-2">
      {/* 实时试算预览 */}
      <div className="surface-subtle flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
        <div>
          <p className="text-xs text-fg-muted">
            {academicYear} 实时国家标准试算（{FITNESS_GRADE_LABELS[gradeYear]} · {FITNESS_GENDER_LABELS[gender]}）
          </p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="font-num text-2xl font-bold text-accent tabular-nums">
              {liveEval.completedCount > 0 || exempt ? liveEval.totalScore.toFixed(1) : '--'}
            </span>
            <span className="text-xs font-medium text-fg-muted">
              {FITNESS_LEVEL_LABELS[liveEval.level]}
              {liveEval.bonusScore > 0 ? ` · +${liveEval.bonusScore} 附加` : ''}
            </span>
          </div>
        </div>
        <div className="text-right text-xs text-fg-muted tabular-nums">
          <p>已填 {liveEval.completedCount}/7 项</p>
          {liveEval.bmi !== null && <p className="mt-0.5">BMI {liveEval.bmi.toFixed(1)}</p>}
        </div>
      </div>

      {/* 快捷粘贴填充（校外/公众号兜底） */}
      <details className="text-xs">
        <summary className="cursor-pointer font-medium text-fg-muted">从公众号或网页快速粘贴填充</summary>
        <div className="mt-2 space-y-2">
          <textarea
            className="field min-h-20 resize-y py-2 font-mono text-xs"
            placeholder="粘贴「广东工业大学体育学院」公众号或体测网页的本学年成绩文字…"
            value={pasteBox}
            onChange={(e) => setPasteBox(e.target.value)}
          />
          <Button type="button" variant="ghost" className="h-8 px-3 text-xs" onClick={applyPastedText}>
            智能识别填充到下方
          </Button>
        </div>
      </details>

      {/* 年级与性别标准 */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="当前年级">
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
              <Chip
                key={g}
                active={gender === g}
                onClick={() => setGender(g)}
                className="flex-1 justify-center text-xs"
              >
                {FITNESS_GENDER_LABELS[g]}
              </Chip>
            ))}
          </div>
        </Field>
      </div>

      <Switch
        label="本学年已办理免测"
        description="按国家标准记 60 分"
        checked={exempt}
        onChange={setExempt}
      />

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
              placeholder="16.5"
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
              placeholder={gender === 'male' ? `3'45"` : `3'48"`}
              value={enduranceText}
              onChange={(e) => {
                setEnduranceText(e.target.value);
                setError(null);
              }}
            />
            {enduranceText.trim() && (
              <p className={`mt-1 text-[11px] ${enduranceInvalid ? 'text-danger' : 'text-fg-muted'}`}>
                {enduranceInvalid ? `支持 3'45" / 3:45 / 225` : `已识别：${formatRunTime(parsedEnduranceSec!)}`}
              </p>
            )}
          </Field>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" className="w-full" loading={save.isPending}>
        保存本学年体测成绩
      </Button>
    </form>
  );
}
