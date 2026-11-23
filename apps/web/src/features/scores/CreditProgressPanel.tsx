import {
  computeCreditProgress,
  DEFAULT_CREDIT_PLAN,
  type CourseGrade,
  type CreditBucketKey,
  type CreditPlan,
} from '@gduthelp/shared';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { ChevronRightIcon } from '../../components/icons';
import { CardSkeleton } from '../../components/Skeleton';
import { isNative } from '../../lib/platform';
import { formatRelativeSyncTime } from '../../lib/scores-sync';

interface CreditProgressPanelProps {
  grades: CourseGrade[];
  plan: CreditPlan | undefined;
  syncedAt: string | null;
  isLoading: boolean;
  syncing: boolean;
  onSync: () => void;
  onImportGrades: () => void;
  onEditPlan: () => void;
}

/**
 * 广工毕业学分进度查询面板：
 * - 自动按广工五大培养模块归类全部已修课程学分，展示总进度、分项缺口与未通过待重修课程；
 * - 支持按本专业培养方案自定义目标，以及安卓端尝试直连教务培养方案学分核验。
 */
export function CreditProgressPanel({
  grades,
  plan,
  syncedAt,
  isLoading,
  syncing,
  onSync,
  onImportGrades,
  onEditPlan,
}: CreditProgressPanelProps) {
  const [expandedBucket, setExpandedBucket] = useState<CreditBucketKey | null>(null);

  if (isLoading && grades.length === 0) {
    return <CardSkeleton rows={4} />;
  }

  const effectivePlan = plan ?? DEFAULT_CREDIT_PLAN;
  const summary = computeCreditProgress(grades, effectivePlan);

  return (
    <div className="space-y-4">
      {/* 毕业学分总进度卡 */}
      <GlassCard className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-fg-muted">本科毕业学分进度</p>
              <span className="surface-subtle rounded-full px-2 py-0.5 text-[10px] font-medium text-fg-muted">
                {effectivePlan.majorName ?? '默认工科参考'}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="font-num text-3xl font-bold tracking-tight text-accent tabular-nums">
                {summary.earnedTotal}
              </span>
              <span className="font-num text-sm text-fg-muted tabular-nums">
                / {summary.targetTotal} 学分（{summary.percent}%）
              </span>
            </div>
          </div>

          <div className="text-right">
            <p className="text-[11px] text-fg-muted">
              {summary.remainingTotal > 0 ? '距毕业目标还差' : '总学分已达标'}
            </p>
            <p className="font-num text-lg font-bold tabular-nums">
              {summary.remainingTotal > 0 ? `${summary.remainingTotal} 分` : '✓ 已修满'}
            </p>
          </div>
        </div>

        <div>
          <div className="h-2.5 overflow-hidden rounded-full bg-current/10">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${summary.percent}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
            <span>
              已通过 <strong className="font-num text-fg tabular-nums">{summary.passedCourseCount}</strong> 门课
              {summary.failedCourses.length > 0 && (
                <>
                  {' '}· 待重修/补考{' '}
                  <strong className="font-num text-danger tabular-nums">
                    {summary.failedCourses.length} 门（{summary.failedCredits} 分）
                  </strong>
                </>
              )}
            </span>
            <span>{formatRelativeSyncTime(effectivePlan.officialSyncedAt ?? syncedAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {isNative ? (
            <Button className="h-9 px-3.5 text-xs" loading={syncing} onClick={onSync}>
              查询教务最新学分
            </Button>
          ) : (
            <Button className="h-9 px-3.5 text-xs" onClick={onImportGrades}>
              导入教务成绩核算
            </Button>
          )}
          <Button variant="ghost" className="h-9 px-3.5 text-xs" onClick={onEditPlan}>
            按本专业调目标
          </Button>
        </div>
      </GlassCard>

      {/* 教务官方培养方案模块（安卓直连同步到时展示） */}
      {summary.hasOfficialAudit && (
        <GlassCard className="space-y-3 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">教务培养方案官方学分审核</h3>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              教务直连数据
            </span>
          </div>
          <div className="space-y-2.5">
            {effectivePlan.officialModules.map((m) => {
              const pct = m.required > 0 ? Math.min(100, Math.round((m.earned / m.required) * 100)) : 100;
              return (
                <div key={m.name} className="surface-subtle rounded-2xl px-3.5 py-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{m.name}</span>
                    <span className="font-num tabular-nums">
                      <strong>{m.earned}</strong> / {m.required} 分
                      {m.missing > 0 ? (
                        <span className="ml-1.5 text-amber-600 dark:text-amber-400">缺 {m.missing}</span>
                      ) : (
                        <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">已满</span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-current/10">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* 五大培养模块分项进度（点击可展开对应课程明细） */}
      <GlassCard className="space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">各课程模块修读进度</h3>
          <span className="text-[11px] text-fg-muted">点击模块查看已修课程</span>
        </div>

        <div className="space-y-2.5">
          {summary.buckets.map((b) => {
            const isOpen = expandedBucket === b.key;
            const done = b.target > 0 && b.earned >= b.target;
            return (
              <div key={b.key} className="surface-subtle overflow-hidden rounded-2xl">
                <button
                  type="button"
                  onClick={() => setExpandedBucket(isOpen ? null : b.key)}
                  className="w-full px-3.5 py-3 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-semibold">{b.label}</span>
                      <span className="shrink-0 text-[11px] text-fg-muted">{b.courseCount} 门</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-num text-xs tabular-nums">
                        <strong className={done ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg'}>
                          {b.earned}
                        </strong>
                        <span className="text-fg-muted"> / {b.target} 分</span>
                      </span>
                      <ChevronRightIcon
                        size={14}
                        className={`text-fg-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-current/10">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${done ? 'bg-emerald-500' : 'bg-accent'}`}
                        style={{ width: `${b.percent}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right font-num text-[11px] text-fg-muted tabular-nums">
                      {done ? '已达标' : `差 ${b.remaining} 分`}
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-current/8 px-3.5 py-2.5">
                    {b.courses.length === 0 ? (
                      <p className="py-1 text-xs text-fg-muted">暂无归入该模块的已通过课程成绩</p>
                    ) : (
                      <ul className="divide-y divide-current/6 text-xs">
                        {b.courses.map((c) => (
                          <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{c.courseName}</p>
                              <p className="text-[11px] text-fg-muted">
                                {c.semesterName}
                                {c.courseType ? ` · ${c.courseType}` : ''}
                              </p>
                            </div>
                            <span className="shrink-0 font-num text-fg-muted tabular-nums">
                              {c.credits} 分 · {c.scoreText}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* 未通过 / 待补修提醒 */}
      {summary.failedCourses.length > 0 && (
        <GlassCard className="space-y-2.5 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-danger">未通过 / 待补考重修（{summary.failedCredits} 学分）</h3>
          <ul className="divide-y divide-current/8 text-xs">
            {summary.failedCourses.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.courseName}</p>
                  <p className="text-[11px] text-fg-muted">{c.semesterName}</p>
                </div>
                <span className="shrink-0 font-num font-semibold text-danger tabular-nums">
                  {c.credits} 分 · {c.scoreText}
                </span>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
    </div>
  );
}
