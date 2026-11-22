import {
  defaultAcademicYear,
  estimateGraduationFitness,
  evaluateFitnessRecord,
  FITNESS_GENDER_LABELS,
  FITNESS_GRADE_LABELS,
  FITNESS_LEVEL_LABELS,
  type FitnessGradeYear,
  type FitnessItemEvaluation,
  type FitnessLevel,
  type FitnessRecord,
} from '@gduthelp/shared';
import { motion } from 'motion/react';
import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { CardSkeleton } from '../../components/Skeleton';
import { ArrowLeftIcon, PlusIcon, TrophyIcon } from '../../components/icons';
import { useFitnessRecords } from '../../lib/queries';
import { toast } from '../../lib/toast-store';
import { spring, stagger } from '../../motion/presets';
import { FitnessEditorSheet, type FitnessDraft } from './FitnessEditorSheet';

const FitnessImportSheet = lazy(() =>
  import('./FitnessImportSheet').then((m) => ({ default: m.FitnessImportSheet })),
);

const EMPTY_RECORDS: FitnessRecord[] = [];
const TZCS_URL = 'http://tzcs.gdut.edu.cn/';

function levelBadgeStyle(level: FitnessLevel): string {
  switch (level) {
    case 'excellent':
      return 'bg-emerald-500/18 text-emerald-600 dark:text-emerald-300';
    case 'good':
      return 'bg-sky-500/18 text-sky-600 dark:text-sky-300';
    case 'pass':
    case 'exempt':
      return 'bg-accent/15 text-accent';
    case 'fail':
      return 'bg-danger/15 text-danger';
    default:
      return 'bg-current/8 text-fg-muted';
  }
}

function barFillClass(level: FitnessLevel): string {
  switch (level) {
    case 'excellent':
      return 'bg-emerald-500';
    case 'good':
      return 'bg-sky-500';
    case 'pass':
    case 'exempt':
      return 'bg-accent';
    case 'fail':
      return 'bg-danger';
    default:
      return 'bg-current/20';
  }
}

function nextDefaultDraft(records: FitnessRecord[]): FitnessDraft {
  const latest = records[0];
  if (!latest) {
    return { defaultGender: 'male', defaultGradeYear: 1, defaultAcademicYear: defaultAcademicYear() };
  }
  const usedYears = new Set(records.map((r) => r.academicYear));
  const curYear = defaultAcademicYear();
  let suggestedYear = curYear;
  if (usedYears.has(suggestedYear)) {
    const start = Number(latest.academicYear.slice(0, 4));
    for (const delta of [1, -1, -2, -3, 2]) {
      const candidate = `${start + delta}-${start + delta + 1}`;
      if (!usedYears.has(candidate)) {
        suggestedYear = candidate;
        break;
      }
    }
  }
  const nextGrade = Math.min(4, Math.max(1, latest.gradeYear + (suggestedYear > latest.academicYear ? 1 : -1))) as FitnessGradeYear;
  return {
    defaultGender: latest.gender,
    defaultGradeYear: nextGrade,
    defaultAcademicYear: suggestedYear,
  };
}

export function FitnessPage() {
  const navigate = useNavigate();
  const query = useFitnessRecords();
  const records = query.data?.records ?? EMPTY_RECORDS;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FitnessDraft | null>(null);
  const [importing, setImporting] = useState(false);
  const [importLoaded, setImportLoaded] = useState(false);

  const activeRecord = records.find((r) => r.id === selectedId) ?? records[0] ?? null;
  const graduation = estimateGraduationFitness(records);
  const activeEval = activeRecord ? evaluateFitnessRecord(activeRecord) : null;

  const openImport = () => {
    setImportLoaded(true);
    setImporting(true);
  };

  const copyTzcsUrl = async () => {
    try {
      await navigator.clipboard.writeText(TZCS_URL);
      toast.success('已复制广工体测系统网址，请在校园网浏览器中打开');
    } catch {
      toast.info(`体测查询网址：${TZCS_URL}`);
    }
  };

  return (
    <>
      <PageHeader
        title="体测成绩"
        subtitle="国家体质健康标准自动算分与毕业总评"
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="h-10 px-3 text-sm" onClick={openImport}>
              导入
            </Button>
            <Button className="h-10 gap-1 px-3 text-sm" onClick={() => setDraft(nextDefaultDraft(records))}>
              <PlusIcon size={16} />
              录入
            </Button>
          </div>
        }
      />

      <div className="mb-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="glass-thin inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeftIcon size={14} />
          返回
        </button>
      </div>

      {query.isPending && !query.data ? (
        <CardSkeleton rows={4} />
      ) : records.length === 0 ? (
        <div className="space-y-4">
          <GlassCard className="p-6 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent/15 text-accent">
              <TrophyIcon size={24} />
            </div>
            <h2 className="mt-3 text-base font-semibold">还没有收录体测成绩</h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-fg-muted">
              录入或直接粘贴广工体测系统 / 体育学院公众号里的成绩，自动按《国家学生体质健康标准（2014）》计算各单项得分、附加分、提分建议与毕业体测总评。
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              <Button className="h-10 px-4 text-sm" onClick={openImport}>
                粘贴导入体测成绩
              </Button>
              <Button variant="ghost" className="h-10 px-4 text-sm" onClick={() => setDraft(nextDefaultDraft(records))}>
                手动录入 & 实时算分
              </Button>
            </div>
          </GlassCard>

          <OfficialChannelCard onCopy={copyTzcsUrl} />
        </div>
      ) : (
        <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-4">
          {/* 1. 毕业体测总评总览卡 */}
          <GlassCard variants={stagger.item} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-fg-muted">
                  {graduation.hasSenior
                    ? `毕业体测总评（大四×50% + 其他学年均分×50% · 共 ${graduation.recordCount} 学年）`
                    : `当前体测均分估算（已收录 ${graduation.recordCount} 学年，待录入大四）`}
                </p>
                <div className="mt-1.5 flex items-baseline gap-2.5">
                  <span className="font-num text-4xl font-bold tracking-tight tabular-nums">
                    {graduation.score !== null ? graduation.score.toFixed(1) : '--'}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${levelBadgeStyle(graduation.level)}`}>
                    {FITNESS_LEVEL_LABELS[graduation.level]}
                  </span>
                  {graduation.latestDelta !== null && graduation.latestDelta !== 0 && (
                    <span
                      className={`text-xs font-medium tabular-nums ${
                        graduation.latestDelta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-danger'
                      }`}
                    >
                      较上学年 {graduation.latestDelta > 0 ? `+${graduation.latestDelta}` : graduation.latestDelta}
                    </span>
                  )}
                </div>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  graduation.meetsGraduation
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                    : 'bg-danger/15 text-danger'
                }`}
              >
                {graduation.meetsGraduation ? '已达 50 分毕业线' : '未达 50 分毕业线'}
              </span>
            </div>

            {/* 0–100 刻度进度条（标出 50 毕业 / 60 及格 / 80 良好 / 90 优秀） */}
            {graduation.score !== null && (
              <div className="mt-4">
                <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-current/10">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${barFillClass(graduation.level)}`}
                    style={{ width: `${Math.min(100, Math.max(0, graduation.score))}%` }}
                  />
                  {[50, 60, 80, 90].map((mark) => (
                    <span
                      key={mark}
                      className="absolute top-0 h-full w-px bg-white/55 dark:bg-black/35"
                      style={{ left: `${mark}%` }}
                    />
                  ))}
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-fg-muted tabular-nums">
                  <span>0</span>
                  <span>50 毕业</span>
                  <span>60 及格</span>
                  <span>80 良好</span>
                  <span>90 优秀</span>
                </div>
              </div>
            )}

            {/* 未测大四时：反推大四至少要考多少分 */}
            {!graduation.hasSenior && graduation.neededSeniorFor50 !== null && (
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-current/10 pt-3.5 text-center">
                <TargetMetric label="大四保毕业 (50)" value={graduation.neededSeniorFor50} />
                <TargetMetric label="大四冲及格 (60)" value={graduation.neededSeniorFor60!} />
                <TargetMetric label="大四冲良好 (80)" value={graduation.neededSeniorFor80!} />
              </div>
            )}
          </GlassCard>

          {/* 2. 历年学年切换条 */}
          <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-0.5">
            {records.map((rec) => {
              const active = activeRecord?.id === rec.id;
              const ev = evaluateFitnessRecord(rec);
              return (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => setSelectedId(rec.id)}
                  className={`relative shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
                    active ? 'text-accent-fg' : 'glass-thin text-fg-muted hover:text-fg'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="fitness-year-pill"
                      transition={spring.snappy}
                      className="absolute inset-0 rounded-full bg-accent"
                    />
                  )}
                  <span className="relative flex items-center gap-1.5 tabular-nums">
                    <span>
                      {rec.academicYear} {FITNESS_GRADE_LABELS[rec.gradeYear]}
                    </span>
                    <span className={active ? 'opacity-90' : 'text-fg'}>
                      {ev.completedCount > 0 || rec.exempt ? `${ev.totalScore.toFixed(1)}分` : '待录'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* 3. 选中年份的成绩详情与 7 项拆解 */}
          {activeRecord && activeEval && (
            <GlassCard variants={stagger.item} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">
                      {activeRecord.academicYear} 学年 · {FITNESS_GRADE_LABELS[activeRecord.gradeYear]}（
                      {FITNESS_GENDER_LABELS[activeRecord.gender]}）
                    </h2>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${levelBadgeStyle(activeEval.level)}`}>
                      {FITNESS_LEVEL_LABELS[activeEval.level]}
                    </span>
                    {activeRecord.source === 'import' && (
                      <span className="rounded-full bg-current/8 px-2 py-0.5 text-[10px] text-fg-muted">表格导入</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-fg-muted tabular-nums">
                    {activeRecord.exempt
                      ? '本学年办理了免测，按国家标准记 60.0 分'
                      : `学年总分 ${activeEval.totalScore.toFixed(1)} = 标准分 ${activeEval.standardScore.toFixed(1)} + 附加分 ${activeEval.bonusScore} · 已录 ${activeEval.completedCount}/7 项`}
                    {activeRecord.officialTotal !== null ? ` · 系统原分 ${activeRecord.officialTotal.toFixed(1)}` : ''}
                  </p>
                  {(activeRecord.testedAt || activeRecord.note) && (
                    <p className="mt-1 text-xs text-fg-muted">
                      {[activeRecord.testedAt ? `测试日期 ${activeRecord.testedAt}` : null, activeRecord.note]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>

                <Button
                  variant="ghost"
                  className="h-9 shrink-0 px-3 text-xs"
                  onClick={() => setDraft({ record: activeRecord })}
                >
                  编辑 / 算分
                </Button>
              </div>

              {!activeRecord.exempt && (
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {activeEval.items.map((item) => (
                    <ItemScoreCard key={item.key} item={item} />
                  ))}
                </div>
              )}
            </GlassCard>
          )}

          {/* 4. 广工官方体测查分渠道指引 */}
          <OfficialChannelCard onCopy={copyTzcsUrl} />
        </motion.div>
      )}

      <FitnessEditorSheet draft={draft} onClose={() => setDraft(null)} />
      {importLoaded && (
        <Suspense fallback={null}>
          <FitnessImportSheet
            open={importing}
            onClose={() => setImporting(false)}
            records={records}
            defaultGender={activeRecord?.gender}
          />
        </Suspense>
      )}
    </>
  );
}

function TargetMetric({ label, value }: { label: string; value: number }) {
  const unreachable = value > 120;
  return (
    <div className="surface-subtle rounded-xl px-2 py-2">
      <p className="text-[11px] text-fg-muted">{label}</p>
      <p className={`mt-0.5 font-num text-sm font-bold tabular-nums ${unreachable ? 'text-danger' : ''}`}>
        {value <= 0 ? '已稳过' : unreachable ? '需补测提分' : `≥ ${value.toFixed(1)} 分`}
      </p>
    </div>
  );
}

function ItemScoreCard({ item }: { item: FitnessItemEvaluation }) {
  const pct = item.score !== null ? Math.min(100, Math.max(0, item.score)) : 0;

  return (
    <div className="surface-subtle rounded-2xl p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-sm font-semibold">{item.label}</span>
          <span className="shrink-0 text-[11px] text-fg-muted">权重 {item.weightPercent}%</span>
        </div>
        <div className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
          {item.score !== null ? (
            <>
              <span className="font-num text-base font-bold">{item.score}</span>
              <span className="text-[11px] text-fg-muted">分</span>
              {item.bonus > 0 && (
                <span className="rounded-full bg-emerald-500/18 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
                  +{item.bonus}
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-fg-muted">未录入</span>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="font-num font-medium text-fg/85 tabular-nums">{item.displayValue ?? '—'}</span>
        {item.weightedScore !== null && (
          <span className="text-[11px] text-fg-muted tabular-nums">折合 +{item.weightedScore.toFixed(1)} 分</span>
        )}
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-current/10">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barFillClass(item.level)}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {item.nextTargetTip && <p className="mt-2 text-[11px] leading-relaxed text-fg-muted">{item.nextTargetTip}</p>}
    </div>
  );
}

function OfficialChannelCard({ onCopy }: { onCopy: () => void }) {
  return (
    <GlassCard className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">广工官方体测查分入口</h3>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            校内网或 VPN 可访问 <code className="font-mono">{TZCS_URL}</code>（学号 + 身份证后 6 位），或在微信搜索关注
            「广东工业大学体育学院」→ 体质测试 → 学生成绩查询。复制页面表格或文字后，点右上角「导入」即可一键收录。
          </p>
        </div>
        <Button variant="ghost" className="h-9 shrink-0 px-3 text-xs" onClick={onCopy}>
          复制网址
        </Button>
      </div>
    </GlassCard>
  );
}
