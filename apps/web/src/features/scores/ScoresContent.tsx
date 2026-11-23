import {
  DEFAULT_CREDIT_PLAN,
  defaultAcademicYear,
  defaultSemesterCode,
  type CourseGrade,
} from '@gduthelp/shared';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { PlusIcon } from '../../components/icons';
import { isNative } from '../../lib/platform';
import { useCreditPlan, useCurrentFitness, useGrades, useSecondClassSummary } from '../../lib/queries';
import {
  getAutoSyncEnabled,
  setAutoSyncEnabled,
  shouldAutoSyncFitness,
  shouldAutoSyncGrades,
  syncCreditAuditFromSchool,
  syncCurrentFitnessFromSchool,
  syncGradesFromSchool,
  syncSecondClassFromSchool,
} from '../../lib/scores-sync';
import { toast } from '../../lib/toast-store';
import { spring } from '../../motion/presets';
import { CreditPlanEditorSheet } from './CreditPlanEditorSheet';
import { CreditProgressPanel } from './CreditProgressPanel';
import { CurrentFitnessEditorSheet } from './CurrentFitnessEditorSheet';
import { CurrentFitnessPanel } from './CurrentFitnessPanel';
import { GpaPanel } from './GpaPanel';
import { GradeEditorSheet, type GradeDraft } from './GradeEditorSheet';
import {
  SecondClassEditorSheet,
  SecondClassImportSheet,
  type SecondClassDraft,
} from './SecondClassEditorSheet';
import { SecondClassPanel } from './SecondClassPanel';

const GradeImportSheet = lazy(() =>
  import('./GradeImportSheet').then((m) => ({ default: m.GradeImportSheet })),
);

export type ScoresSubTab = 'gpa' | 'credits' | 'secondClass' | 'fitness';
const TAB_STORAGE_KEY = 'gduthelp-scores-tab';
const EMPTY_GRADES: CourseGrade[] = [];

function readSavedSubTab(): ScoresSubTab {
  try {
    const saved = localStorage.getItem(TAB_STORAGE_KEY);
    if (saved === 'gpa' || saved === 'credits' || saved === 'secondClass' || saved === 'fitness') {
      return saved;
    }
  } catch {
    // ignore
  }
  return 'gpa';
}

interface ScoresContentProps {
  /** 从外部深链指定初始子面板（例如 /study?tab=scores&sub=credits） */
  requestedSub?: ScoresSubTab | null;
  /** 切换子面板后用于清理 URL 上的 sub 参数 */
  onSubChange?: (next: ScoresSubTab) => void;
}

/**
 * 成绩与学业进度统一内容区（位于「学业 → 成绩」下）：
 * - 绩点：广工 5.0 制 GPA 统计与自动同步
 * - 学分：毕业学分五大模块修读进度与培养方案核验
 * - 二课：当前学期 & 当前学年第二课堂时长查询
 * - 体测：当前学年体测直查与国家标准算分
 */
export function ScoresContent({ requestedSub = null, onSubChange }: ScoresContentProps) {
  const qc = useQueryClient();
  const [localTab, setLocalTab] = useState<ScoresSubTab>(readSavedSubTab);
  const tab: ScoresSubTab = requestedSub ?? localTab;
  const [autoSync, setAutoSync] = useState<boolean>(() => getAutoSyncEnabled());

  const academicYear = defaultAcademicYear();
  const semesterCode = defaultSemesterCode();
  const gradesQuery = useGrades();
  const creditPlanQuery = useCreditPlan();
  const secondClassQuery = useSecondClassSummary(academicYear, semesterCode);
  const fitnessQuery = useCurrentFitness(academicYear);

  const grades = gradesQuery.data?.grades ?? EMPTY_GRADES;
  const creditPlan = creditPlanQuery.data ?? DEFAULT_CREDIT_PLAN;
  const currentFitness = fitnessQuery.data?.record ?? null;

  const [gradeSyncing, setGradeSyncing] = useState(false);
  const [gradeHint, setGradeHint] = useState<string | null>(null);
  const [creditSyncing, setCreditSyncing] = useState(false);
  const [scSyncing, setScSyncing] = useState(false);
  const [scHint, setScHint] = useState<string | null>(null);
  const [fitnessSyncing, setFitnessSyncing] = useState(false);
  const [fitnessHint, setFitnessHint] = useState<string | null>(null);

  const [gradeDraft, setGradeDraft] = useState<GradeDraft | null>(null);
  const [gradeImportOpen, setGradeImportOpen] = useState(false);
  const [gradeImportLoaded, setGradeImportLoaded] = useState(false);
  const [creditPlanOpen, setCreditPlanOpen] = useState(false);
  const [scDraft, setScDraft] = useState<SecondClassDraft | null>(null);
  const [scImportOpen, setScImportOpen] = useState(false);
  const [fitnessEditOpen, setFitnessEditOpen] = useState(false);

  const switchTab = (next: ScoresSubTab) => {
    setLocalTab(next);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    onSubChange?.(next);
  };

  const toggleAutoSync = () => {
    const next = !autoSync;
    setAutoSync(next);
    setAutoSyncEnabled(next);
    toast.info(next ? '已开启自动更新：进入成绩页将静默刷新最新数据' : '已暂停自动更新，可随时点击手动刷新');
  };

  const runGradeSync = useCallback(
    async (interactive: boolean) => {
      setGradeSyncing(true);
      if (interactive) setGradeHint(null);
      const outcome = await syncGradesFromSchool({ interactive, queryClient: qc });
      setGradeSyncing(false);

      if (outcome.status === 'synced') {
        setGradeHint(null);
        if (interactive || outcome.added > 0 || outcome.changed > 0) {
          toast.success(outcome.message);
        }
      } else if (outcome.status === 'empty') {
        setGradeHint(interactive ? outcome.message : null);
      } else if (outcome.status === 'login-required') {
        setGradeHint(outcome.message);
      } else if (outcome.status === 'error' && interactive) {
        setGradeHint(outcome.message);
        toast.error(outcome.message);
      }
    },
    [qc],
  );

  const runCreditSync = useCallback(async () => {
    setCreditSyncing(true);
    const outcome = await syncCreditAuditFromSchool({
      interactive: true,
      queryClient: qc,
      currentPlan: creditPlan,
    });
    setCreditSyncing(false);
    if (outcome.status === 'synced') {
      toast.success(outcome.message);
    } else if (outcome.status === 'error') {
      toast.error(outcome.message);
    } else if (outcome.status === 'empty' || outcome.status === 'login-required') {
      toast.info(outcome.message);
    }
  }, [qc, creditPlan]);

  const runSecondClassSync = useCallback(async () => {
    setScSyncing(true);
    setScHint(null);
    const outcome = await syncSecondClassFromSchool({ interactive: true, queryClient: qc });
    setScSyncing(false);
    if (outcome.status === 'synced') {
      toast.success(outcome.message);
    } else if (outcome.status === 'empty' || outcome.status === 'login-required') {
      setScHint(outcome.message);
      toast.info(outcome.message);
    } else if (outcome.status === 'error') {
      setScHint(outcome.message);
      toast.error(outcome.message);
    }
  }, [qc]);

  const runFitnessSync = useCallback(
    async (interactive: boolean) => {
      setFitnessSyncing(true);
      if (interactive) setFitnessHint(null);
      const outcome = await syncCurrentFitnessFromSchool({
        interactive,
        queryClient: qc,
        academicYear,
        defaultGender: currentFitness?.gender,
        defaultGradeYear: currentFitness?.gradeYear,
      });
      setFitnessSyncing(false);

      if (outcome.status === 'synced') {
        setFitnessHint(null);
        toast.success(outcome.message);
      } else if (outcome.status === 'empty') {
        if (interactive) {
          setFitnessHint(outcome.message);
          toast.info(outcome.message);
        }
      } else if (outcome.status === 'login-required') {
        setFitnessHint(outcome.message);
      } else if (outcome.status === 'error' && interactive) {
        setFitnessHint(outcome.message);
        toast.error(outcome.message);
      }
    },
    [qc, academicYear, currentFitness?.gender, currentFitness?.gradeYear],
  );

  // 安卓端自动静默刷新：进入成绩视图或切回前台且超过冷却时间，自动后台同步当前面板
  useEffect(() => {
    if (!isNative || !autoSync) return;

    const trigger = () => {
      if ((tab === 'gpa' || tab === 'credits') && shouldAutoSyncGrades()) {
        void runGradeSync(false);
      } else if (tab === 'fitness' && shouldAutoSyncFitness()) {
        void runFitnessSync(false);
      }
    };

    trigger();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') trigger();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [tab, autoSync, runGradeSync, runFitnessSync]);

  const openGradeImport = () => {
    setGradeImportLoaded(true);
    setGradeImportOpen(true);
  };

  return (
    <div className="space-y-3.5">
      {/* 子功能工具条：绩点 / 学分 / 二课 / 体测四段切换 + 快捷操作 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="glass-thin inline-flex rounded-full p-1" role="tablist" aria-label="成绩与进度视图">
          {(
            [
              { id: 'gpa', label: '绩点' },
              { id: 'credits', label: '学分' },
              { id: 'secondClass', label: '二课' },
              { id: 'fitness', label: '体测' },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(item.id)}
                className={`relative rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  active ? 'text-accent-fg' : 'text-fg-muted'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="scores-sub-pill"
                    transition={spring.snappy}
                    className="absolute inset-0 rounded-full bg-accent"
                  />
                )}
                <span className="relative">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          {isNative && (tab === 'gpa' || tab === 'fitness') && (
            <button
              type="button"
              onClick={toggleAutoSync}
              className="glass-thin inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-fg-muted transition-colors hover:text-fg"
              title="开启后每次进入自动静默更新"
            >
              <span
                className={`size-1.5 rounded-full ${autoSync ? 'bg-emerald-500' : 'bg-current/30'}`}
                aria-hidden
              />
              <span>{autoSync ? '自动' : '手动'}</span>
            </button>
          )}

          {tab === 'gpa' ? (
            <>
              {isNative ? (
                <Button variant="ghost" className="h-8 px-2.5 text-xs" loading={gradeSyncing} onClick={() => void runGradeSync(true)}>
                  同步
                </Button>
              ) : (
                <Button variant="ghost" className="h-8 px-2.5 text-xs" onClick={openGradeImport}>
                  导入
                </Button>
              )}
              <Button className="h-8 gap-1 px-2.5 text-xs" onClick={() => setGradeDraft({})}>
                <PlusIcon size={14} />
                添课
              </Button>
            </>
          ) : tab === 'credits' ? (
            <Button variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => setCreditPlanOpen(true)}>
              调目标
            </Button>
          ) : tab === 'secondClass' ? (
            <Button className="h-8 gap-1 px-2.5 text-xs" onClick={() => setScDraft({})}>
              <PlusIcon size={14} />
              记活动
            </Button>
          ) : (
            <>
              {isNative && (
                <Button
                  variant="ghost"
                  className="h-8 px-2.5 text-xs"
                  loading={fitnessSyncing}
                  onClick={() => void runFitnessSync(true)}
                >
                  查询
                </Button>
              )}
              <Button className="h-8 px-3 text-xs" onClick={() => setFitnessEditOpen(true)}>
                {currentFitness ? '编辑' : '录入'}
              </Button>
            </>
          )}
        </div>
      </div>

      {tab === 'gpa' ? (
        <GpaPanel
          grades={grades}
          syncedAt={gradesQuery.data?.syncedAt ?? null}
          isLoading={gradesQuery.isPending}
          syncing={gradeSyncing}
          syncHint={gradeHint}
          onSync={() => void runGradeSync(true)}
          onAdd={() => setGradeDraft({})}
          onImport={openGradeImport}
          onEdit={(grade) => setGradeDraft({ grade })}
        />
      ) : tab === 'credits' ? (
        <CreditProgressPanel
          grades={grades}
          plan={creditPlanQuery.data}
          syncedAt={gradesQuery.data?.syncedAt ?? null}
          isLoading={gradesQuery.isPending || creditPlanQuery.isPending}
          syncing={creditSyncing}
          onSync={() => void runCreditSync()}
          onImportGrades={openGradeImport}
          onEditPlan={() => setCreditPlanOpen(true)}
        />
      ) : tab === 'secondClass' ? (
        <SecondClassPanel
          summary={secondClassQuery.data}
          isLoading={secondClassQuery.isPending}
          syncing={scSyncing}
          syncHint={scHint}
          onSync={() => void runSecondClassSync()}
          onAdd={(draft) => setScDraft(draft ?? {})}
          onOpenImport={() => setScImportOpen(true)}
          onEdit={(record) => setScDraft({ record })}
        />
      ) : (
        <CurrentFitnessPanel
          academicYear={academicYear}
          record={currentFitness}
          syncedAt={fitnessQuery.data?.syncedAt ?? null}
          isLoading={fitnessQuery.isPending}
          syncing={fitnessSyncing}
          syncHint={fitnessHint}
          onQuery={() => void runFitnessSync(true)}
          onEdit={() => setFitnessEditOpen(true)}
        />
      )}

      <GradeEditorSheet draft={gradeDraft} onClose={() => setGradeDraft(null)} />
      {gradeImportLoaded && (
        <Suspense fallback={null}>
          <GradeImportSheet
            open={gradeImportOpen}
            onClose={() => setGradeImportOpen(false)}
            existingGrades={grades}
          />
        </Suspense>
      )}
      <CreditPlanEditorSheet open={creditPlanOpen} plan={creditPlan} onClose={() => setCreditPlanOpen(false)} />
      <SecondClassEditorSheet
        draft={scDraft}
        defaultSemesterCode={semesterCode}
        onClose={() => setScDraft(null)}
      />
      <SecondClassImportSheet
        open={scImportOpen}
        semesterTarget={secondClassQuery.data?.semesterTargetHours ?? 12}
        yearTarget={secondClassQuery.data?.yearTargetHours ?? 24}
        defaultSemesterCode={semesterCode}
        onClose={() => setScImportOpen(false)}
      />
      <CurrentFitnessEditorSheet
        open={fitnessEditOpen}
        academicYear={academicYear}
        record={currentFitness}
        onClose={() => setFitnessEditOpen(false)}
      />
    </div>
  );
}
