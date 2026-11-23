import {
  computeGpaSummary,
  simulateGpaWithCourse,
  type CourseGrade,
} from '@gduthelp/shared';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Field';
import { GlassCard } from '../../components/GlassCard';
import { CardSkeleton } from '../../components/Skeleton';
import { isNative } from '../../lib/platform';
import { formatRelativeSyncTime } from '../../lib/scores-sync';
import { pressable, stagger } from '../../motion/presets';

interface GpaPanelProps {
  grades: CourseGrade[];
  syncedAt: string | null;
  isLoading: boolean;
  syncing: boolean;
  syncHint: string | null;
  onSync: () => void;
  onAdd: () => void;
  onImport: () => void;
  onEdit: (grade: CourseGrade) => void;
}

function scoreColorClass(g: CourseGrade): string {
  if (g.gradePoint <= 0) return 'text-danger bg-danger/15';
  if (g.gradePoint >= 4.0) return 'text-emerald-600 dark:text-emerald-300 bg-emerald-500/16';
  if (g.gradePoint >= 3.0) return 'text-sky-600 dark:text-sky-300 bg-sky-500/16';
  return 'text-accent bg-accent/15';
}

export function GpaPanel({
  grades,
  syncedAt,
  isLoading,
  syncing,
  syncHint,
  onSync,
  onAdd,
  onImport,
  onEdit,
}: GpaPanelProps) {
  const [requiredOnly, setRequiredOnly] = useState(false);
  const [selectedSem, setSelectedSem] = useState<string | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [simCredits, setSimCredits] = useState('3');
  const [simScore, setSimScore] = useState('90');

  const allSummary = computeGpaSummary(grades, { requiredOnly });
  const activeSem =
    selectedSem && allSummary.semesters.some((s) => s.semesterCode === selectedSem) ? selectedSem : null;
  const viewSummary = activeSem
    ? computeGpaSummary(grades, { requiredOnly, semesterCode: activeSem })
    : allSummary;

  const simCreditsNum = Number(simCredits);
  const simResult =
    simOpen && Number.isFinite(simCreditsNum) && simCreditsNum > 0 && simScore.trim()
      ? simulateGpaWithCourse(allSummary, simCreditsNum, simScore)
      : null;

  if (isLoading && grades.length === 0) {
    return <CardSkeleton rows={4} />;
  }

  if (grades.length === 0) {
    return (
      <GlassCard className="p-6 text-center">
        <p className="text-base font-semibold">还没有课程成绩记录</p>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-fg-muted">
          {isNative
            ? '登录一次广工统一认证后，自动拉取全部已出分课程并按广工 5.0 制核算总绩点与必修绩点，后续打开页面自动静默刷新。'
            : '支持粘贴教务系统成绩表格一键导入，或手动录入课程按广工 5.0 制计算绩点。'}
        </p>
        {syncHint && <p className="mt-3 rounded-2xl bg-amber-400/18 px-3 py-2 text-xs leading-relaxed">{syncHint}</p>}
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          {isNative ? (
            <Button className="h-10 px-4 text-sm" loading={syncing} onClick={onSync}>
              一键同步教务成绩
            </Button>
          ) : (
            <Button className="h-10 px-4 text-sm" onClick={onImport}>
              粘贴导入成绩
            </Button>
          )}
          <Button variant="ghost" className="h-10 px-4 text-sm" onClick={onAdd}>
            手动添加 / 试算
          </Button>
        </div>
      </GlassCard>
    );
  }

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-4">
      {/* 1. 绩点总览主卡 */}
      <GlassCard variants={stagger.item} className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-fg-muted">
              {activeSem
                ? `${viewSummary.semesters[0]?.semesterName ?? activeSem} · ${requiredOnly ? '必修' : '全部'}平均学分绩点`
                : `累计${requiredOnly ? '必修' : '平均'}学分绩点（5.0 制）`}
            </p>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span className="font-num text-4xl font-bold tracking-tight tabular-nums">
                {viewSummary.gpa.toFixed(2)}
              </span>
              <span className="font-num text-sm text-fg-muted tabular-nums">/ 5.00</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  viewSummary.meetsDegreeLine
                    ? 'bg-emerald-500/16 text-emerald-600 dark:text-emerald-300'
                    : 'bg-danger/15 text-danger'
                }`}
              >
                {viewSummary.meetsDegreeLine ? '达 1.6 学位线' : '低于 1.6 学位线'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Chip active={!requiredOnly} onClick={() => setRequiredOnly(false)} className="text-xs">
              全部
            </Chip>
            <Chip active={requiredOnly} onClick={() => setRequiredOnly(true)} className="text-xs">
              仅必修
            </Chip>
          </div>
        </div>

        {/* 核心 4 格指标 */}
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          <StatCell label="加权均分" value={viewSummary.weightedAvg !== null ? viewSummary.weightedAvg.toFixed(1) : '--'} />
          <StatCell label="已获学分" value={`${viewSummary.earnedCredits}`} />
          <StatCell label="课程门数" value={`${viewSummary.courseCount}`} />
          <StatCell label="未通过" value={`${viewSummary.failedCount}`} danger={viewSummary.failedCount > 0} />
        </div>

        {/* 同步状态与快捷操作 */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-current/10 pt-3 text-xs">
          <span className="text-fg-muted">{formatRelativeSyncTime(syncedAt)}</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onAdd}
              className="font-medium text-accent hover:underline"
            >
              + 添课
            </button>
            <span className="text-fg-muted/40">·</span>
            <button
              type="button"
              onClick={() => setSimOpen((v) => !v)}
              className="font-medium text-accent hover:underline"
            >
              {simOpen ? '收起试算' : '目标绩点试算'}
            </button>
            <span className="text-fg-muted/40">·</span>
            {isNative ? (
              <button
                type="button"
                disabled={syncing}
                onClick={onSync}
                className="font-medium text-accent hover:underline disabled:opacity-50"
              >
                {syncing ? '正在同步…' : '立即刷新'}
              </button>
            ) : (
              <button type="button" onClick={onImport} className="font-medium text-accent hover:underline">
                粘贴更新
              </button>
            )}
          </div>
        </div>

        {syncHint && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-amber-400/18 px-3 py-2 text-xs">
            <span className="leading-relaxed">{syncHint}</span>
            {isNative && (
              <button type="button" onClick={onSync} className="shrink-0 font-semibold text-accent">
                去同步
              </button>
            )}
          </div>
        )}

        {/* 内嵌迷你绩点试算器 */}
        {simOpen && (
          <div className="surface-subtle mt-3 space-y-2.5 rounded-2xl p-3.5 text-xs">
            <p className="font-semibold text-fg">如果下一门课考到目标分，累计绩点会变多少？</p>
            <div className="flex items-center gap-2">
              <input
                className="field h-9 w-20 font-num text-xs"
                type="number"
                step="0.5"
                min="0.5"
                max="20"
                value={simCredits}
                onChange={(e) => setSimCredits(e.target.value)}
                aria-label="模拟学分"
              />
              <span className="text-fg-muted">学分，考</span>
              <input
                className="field h-9 w-24 font-num text-xs"
                value={simScore}
                onChange={(e) => setSimScore(e.target.value)}
                placeholder="90 或 优秀"
                aria-label="模拟成绩"
              />
              {simResult && (
                <span className="ml-auto font-num text-sm font-bold text-accent tabular-nums">
                  → {simResult.newGpa.toFixed(2)}{' '}
                  <span className="text-[11px] font-medium">
                    ({simResult.delta >= 0 ? `+${simResult.delta.toFixed(2)}` : simResult.delta.toFixed(2)})
                  </span>
                </span>
              )}
            </div>
          </div>
        )}
      </GlassCard>

      {/* 2. 学期切换条 */}
      {allSummary.semesters.length > 1 && (
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <Chip active={activeSem === null} onClick={() => setSelectedSem(null)} className="shrink-0 text-xs">
            全部学期
          </Chip>
          {allSummary.semesters.map((sem) => (
            <Chip
              key={sem.semesterCode}
              active={activeSem === sem.semesterCode}
              onClick={() => setSelectedSem(sem.semesterCode)}
              className="shrink-0 text-xs tabular-nums"
            >
              {sem.semesterName} · {sem.gpa.toFixed(2)}
            </Chip>
          ))}
        </div>
      )}

      {/* 3. 按学期分组的课程成绩卡片 */}
      {viewSummary.semesters.map((sem) => (
        <section key={sem.semesterCode} className="space-y-2">
          <div className="flex items-baseline justify-between px-1 text-xs text-fg-muted">
            <h2 className="font-semibold text-fg/85">{sem.semesterName}</h2>
            <span className="font-num tabular-nums">
              学期绩点 {sem.gpa.toFixed(2)} · {sem.totalCredits} 学分
            </span>
          </div>

          <GlassCard className="divide-y divide-current/8 px-4">
            {sem.grades.map((g) => (
              <motion.button
                key={g.id}
                type="button"
                {...pressable}
                onClick={() => onEdit(g)}
                className="flex w-full items-center justify-between gap-3 py-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{g.courseName}</p>
                    {g.courseType && (
                      <span className="rounded-full bg-current/8 px-2 py-0.2 text-[10px] text-fg-muted">
                        {g.courseType}
                      </span>
                    )}
                    {g.source === 'manual' && (
                      <span className="rounded-full bg-accent/12 px-1.5 py-0.2 text-[10px] text-accent">手动</span>
                    )}
                  </div>
                  <p className="mt-0.5 font-num text-xs text-fg-muted tabular-nums">
                    {g.credits} 学分 · 绩点 {g.gradePoint.toFixed(1)}
                    {g.examType && !/正常/.test(g.examType) ? ` · ${g.examType}` : ''}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-xl px-2.5 py-1 font-num text-sm font-bold tabular-nums ${scoreColorClass(g)}`}
                >
                  {g.scoreText}
                </span>
              </motion.button>
            ))}
          </GlassCard>
        </section>
      ))}
    </motion.div>
  );
}

function StatCell({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="surface-subtle rounded-xl px-2 py-2">
      <p className="text-[11px] text-fg-muted">{label}</p>
      <p className={`mt-0.5 font-num text-sm font-bold tabular-nums ${danger ? 'text-danger' : ''}`}>{value}</p>
    </div>
  );
}
