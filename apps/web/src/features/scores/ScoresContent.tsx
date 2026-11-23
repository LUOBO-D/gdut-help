import {
  DEFAULT_CREDIT_PLAN,
  defaultAcademicYear,
  defaultSemesterCode,
  parseJwCetScores,
  type CetRecord,
  type CetSyncResult,
  type CourseGrade,
} from '@gduthelp/shared';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { jwCetScoresPayload, JwLoginRequired, loginToJw } from '../../lib/jw';
import { isNative } from '../../lib/platform';
import {
  keys,
  useCetRecords,
  useCreditPlan,
  useCurrentFitness,
  useGrades,
  useSecondClassSummary,
} from '../../lib/queries';
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
import { CetEditorSheet, type CetDraft } from './CetEditorSheet';
import { CetPanel } from './CetPanel';
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

export type ScoresSubTab = 'gpa' | 'credits' | 'secondClass' | 'fitness' | 'cet';
const TAB_STORAGE_KEY = 'gduthelp-scores-tab';
const EMPTY_GRADES: CourseGrade[] = [];
const EMPTY_CET: CetRecord[] = [];

function readSavedSubTab(): ScoresSubTab {
  try {
    const saved = localStorage.getItem(TAB_STORAGE_KEY);
    if (saved === 'gpa' || saved === 'credits' || saved === 'secondClass' || saved === 'fitness' || saved === 'cet') {
      return saved;
    }
  } catch {
    // ignore
  }
  return 'gpa';
}

interface ScoresContentProps {
  /** 从外部深链指定初始子面板（例如 /study?tab=scores&sub=cet） */
  requestedSub?: ScoresSubTab | null;
  /** 切换子面板后用于清理 URL 上的 sub 参数 */
  onSubChange?: (next: ScoresSubTab) => void;
}

/**
 * 成绩与学业进度统一内容区（位于「学业 → 成绩」下）：
 * 简洁全宽 5 段切换（绩点 · 学分 · 二课 · 体测 · 四六级），操作收拢至各自卡片内部，消除重复工具栏。
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
  const cetQuery = useCetRecords();

  const grades = gradesQuery.data?.grades ?? EMPTY_GRADES;
  const creditPlan = creditPlanQuery.data ?? DEFAULT_CREDIT_PLAN;
  const currentFitness = fitnessQuery.data?.record ?? null;
  const cetRecords = cetQuery.data ?? EMPTY_CET;

  const [gradeSyncing, setGradeSyncing] = useState(false);
  const [gradeHint, setGradeHint] = useState<string | null>(null);
  const [creditSyncing, setCreditSyncing] = useState(false);
  const [scSyncing, setScSyncing] = useState(false);
  const [scHint, setScHint] = useState<string | null>(null);
  const [fitnessSyncing, setFitnessSyncing] = useState(false);
  const [fitnessHint, setFitnessHint] = useState<string | null>(null);
  const [cetSyncing, setCetSyncing] = useState(false);
  const [cetHint, setCetHint] = useState<string | null>(null);

  const [gradeDraft, setGradeDraft] = useState<GradeDraft | null>(null);
  const [gradeImportOpen, setGradeImportOpen] = useState(false);
  const [gradeImportLoaded, setGradeImportLoaded] = useState(false);
  const [creditPlanOpen, setCreditPlanOpen] = useState(false);
  const [scDraft, setScDraft] = useState<SecondClassDraft | null>(null);
  const [scImportOpen, setScImportOpen] = useState(false);
  const [fitnessEditOpen, setFitnessEditOpen] = useState(false);
  const [cetDraft, setCetDraft] = useState<CetDraft>(null);

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
    toast.info(next ? '已开启自动更新：进入成绩页将静默刷新最新数据' : '已暂停自动更新，可随时手动刷新');
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

  const runCetSync = useCallback(async () => {
    if (!isNative) return;
    setCetSyncing(true);
    setCetHint(null);
    try {
      let raw = await jwCetScoresPayload();
      if (!raw) {
        const ok = await loginToJw();
        if (ok) raw = await jwCetScoresPayload();
      }
      const parsed = parseJwCetScores(raw);
      if (parsed.length === 0) {
        setCetHint('教务系统暂未同步四六级记录，建议点击上方「中国教育考试网查分」后粘贴存档。');
        toast.info('教务暂未返回四六级成绩，可直接走教育考试网查询');
        return;
      }
      const res = await api<CetSyncResult>('/cet/sync', {
        method: 'POST',
        body: {
          records: parsed.map((p) => ({ ...p, note: null })),
        },
      });
      void qc.invalidateQueries({ queryKey: keys.cetRecords });
      toast.success(`已同步 ${parsed.length} 条四六级成绩（新增 ${res.added}，更新 ${res.updated}）`);
    } catch (err) {
      if (err instanceof JwLoginRequired) {
        setCetHint('请先完成广工统一认证后再同步。');
      } else {
        const msg = err instanceof Error ? err.message : '同步失败';
        setCetHint(msg);
        toast.error(msg);
      }
    } finally {
      setCetSyncing(false);
    }
  }, [qc]);

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
      {/* 全宽整齐 5 段子切换：绩点 · 学分 · 二课 · 体测 · 四六级（零换行挤压、零重复外层按钮） */}
      <div className="glass-thin grid grid-cols-5 rounded-full p-1" role="tablist" aria-label="成绩与学业进度视图">
        {(
          [
            { id: 'gpa', label: '绩点' },
            { id: 'credits', label: '学分' },
            { id: 'secondClass', label: '二课' },
            { id: 'fitness', label: '体测' },
            { id: 'cet', label: '四六级' },
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
              className={`relative rounded-full py-1.5 text-xs font-medium transition-colors ${
                active ? 'font-semibold text-accent-fg' : 'text-fg-muted'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="scores-sub-pill"
                  transition={spring.snappy}
                  className="absolute inset-0 rounded-full bg-accent shadow-sm"
                />
              )}
              <span className="relative">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* 安卓端轻盈单行自动刷新开关（仅在支持自动静默刷新的绩点/体测页展示） */}
      {isNative && (tab === 'gpa' || tab === 'fitness') && (
        <div className="flex justify-end px-1">
          <button
            type="button"
            onClick={toggleAutoSync}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <span
              className={`size-1.5 rounded-full ${autoSync ? 'bg-emerald-500' : 'bg-current/30'}`}
              aria-hidden
            />
            <span>{autoSync ? '进页自动刷新已开启' : '自动刷新已暂停'}</span>
          </button>
        </div>
      )}

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
      ) : tab === 'fitness' ? (
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
      ) : (
        <CetPanel
          records={cetRecords}
          isLoading={cetQuery.isPending}
          syncing={cetSyncing}
          syncHint={cetHint}
          onSyncJw={() => void runCetSync()}
          onAdd={() => setCetDraft({})}
          onEdit={(record) => setCetDraft({ record })}
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
      <CetEditorSheet draft={cetDraft} onClose={() => setCetDraft(null)} />
    </div>
  );
}
