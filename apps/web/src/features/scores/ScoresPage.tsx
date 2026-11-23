import { defaultAcademicYear, type CourseGrade } from '@gduthelp/shared';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { PlusIcon } from '../../components/icons';
import { isNative } from '../../lib/platform';
import { useCurrentFitness, useGrades } from '../../lib/queries';
import {
  getAutoSyncEnabled,
  setAutoSyncEnabled,
  shouldAutoSyncFitness,
  shouldAutoSyncGrades,
  syncCurrentFitnessFromSchool,
  syncGradesFromSchool,
} from '../../lib/scores-sync';
import { toast } from '../../lib/toast-store';
import { spring } from '../../motion/presets';
import { CurrentFitnessEditorSheet } from './CurrentFitnessEditorSheet';
import { CurrentFitnessPanel } from './CurrentFitnessPanel';
import { GpaPanel } from './GpaPanel';
import { GradeEditorSheet, type GradeDraft } from './GradeEditorSheet';

const GradeImportSheet = lazy(() =>
  import('./GradeImportSheet').then((m) => ({ default: m.GradeImportSheet })),
);

type ScoresTab = 'gpa' | 'fitness';
const TAB_STORAGE_KEY = 'gduthelp-scores-tab';
const EMPTY_GRADES: CourseGrade[] = [];

function resolveInitialTab(param: string | null): ScoresTab {
  if (param === 'gpa' || param === 'fitness') return param;
  try {
    const saved = localStorage.getItem(TAB_STORAGE_KEY);
    if (saved === 'fitness' || saved === 'gpa') return saved;
  } catch {
    // ignore
  }
  return 'gpa';
}

export function ScoresPage() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<ScoresTab>(() => resolveInitialTab(searchParams.get('tab')));
  const [autoSync, setAutoSync] = useState<boolean>(() => getAutoSyncEnabled());

  const academicYear = defaultAcademicYear();
  const gradesQuery = useGrades();
  const fitnessQuery = useCurrentFitness(academicYear);

  const grades = gradesQuery.data?.grades ?? EMPTY_GRADES;
  const currentFitness = fitnessQuery.data?.record ?? null;

  const [gradeSyncing, setGradeSyncing] = useState(false);
  const [gradeHint, setGradeHint] = useState<string | null>(null);
  const [fitnessSyncing, setFitnessSyncing] = useState(false);
  const [fitnessHint, setFitnessHint] = useState<string | null>(null);

  const [gradeDraft, setGradeDraft] = useState<GradeDraft | null>(null);
  const [gradeImportOpen, setGradeImportOpen] = useState(false);
  const [gradeImportLoaded, setGradeImportLoaded] = useState(false);
  const [fitnessEditOpen, setFitnessEditOpen] = useState(false);

  const switchTab = (next: ScoresTab) => {
    setTab(next);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    if (searchParams.has('tab')) {
      const sp = new URLSearchParams(searchParams);
      sp.delete('tab');
      setSearchParams(sp, { replace: true });
    }
  };

  const toggleAutoSync = () => {
    const next = !autoSync;
    setAutoSync(next);
    setAutoSyncEnabled(next);
    toast.info(next ? '已开启自动同步：进入成绩页将静默刷新最新数据' : '已暂停自动同步，可随时点击手动刷新');
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

  // 安卓端自动静默刷新：进入「成绩」页或切回前台且超过冷却时间，自动后台同步当前面板
  useEffect(() => {
    if (!isNative || !autoSync) return;

    const trigger = () => {
      if (tab === 'gpa' && shouldAutoSyncGrades()) {
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
    <>
      <PageHeader
        title="成绩"
        subtitle={tab === 'gpa' ? '广工 5.0 制绩点统计 · 支持自动更新' : `${academicYear} 当前学年体测成绩直查`}
        action={
          tab === 'gpa' ? (
            <div className="flex items-center gap-2">
              {isNative ? (
                <Button variant="ghost" className="h-9 px-3 text-xs" loading={gradeSyncing} onClick={() => void runGradeSync(true)}>
                  同步
                </Button>
              ) : (
                <Button variant="ghost" className="h-9 px-3 text-xs" onClick={openGradeImport}>
                  导入
                </Button>
              )}
              <Button className="h-9 gap-1 px-3 text-xs" onClick={() => setGradeDraft({})}>
                <PlusIcon size={15} />
                添课
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {isNative && (
                <Button
                  variant="ghost"
                  className="h-9 px-3 text-xs"
                  loading={fitnessSyncing}
                  onClick={() => void runFitnessSync(true)}
                >
                  查询
                </Button>
              )}
              <Button className="h-9 px-3 text-xs" onClick={() => setFitnessEditOpen(true)}>
                {currentFitness ? '编辑' : '录入'}
              </Button>
            </div>
          )
        }
      />

      {/* 顶部双标签切换 + 自动更新状态芯片 */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="glass-thin inline-flex rounded-full p-1" role="tablist" aria-label="成绩视图">
          {(
            [
              { id: 'gpa', label: '绩点' },
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
                className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  active ? 'text-accent-fg' : 'text-fg-muted'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="scores-tab-pill"
                    transition={spring.snappy}
                    className="absolute inset-0 rounded-full bg-accent"
                  />
                )}
                <span className="relative">{item.label}</span>
              </button>
            );
          })}
        </div>

        {isNative && (
          <button
            type="button"
            onClick={toggleAutoSync}
            className="glass-thin inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <span
              className={`size-2 rounded-full ${autoSync ? 'bg-emerald-500' : 'bg-current/30'}`}
              aria-hidden
            />
            <span>{autoSync ? '自动更新已开' : '自动更新已关'}</span>
          </button>
        )}
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
      <CurrentFitnessEditorSheet
        open={fitnessEditOpen}
        academicYear={academicYear}
        record={currentFitness}
        onClose={() => setFitnessEditOpen(false)}
      />
    </>
  );
}
