import {
  SECOND_CLASS_CATEGORY_LABELS,
  type SecondClassCategory,
  type SecondClassRecord,
  type SecondClassSummaryResponse,
} from '@gduthelp/shared';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { ClockIcon } from '../../components/icons';
import { CardSkeleton } from '../../components/Skeleton';
import { isNative } from '../../lib/platform';
import { formatRelativeSyncTime } from '../../lib/scores-sync';
import type { SecondClassDraft } from './SecondClassEditorSheet';

type Scope = 'semester' | 'year';

const QUICK_TEMPLATES: { title: string; category: SecondClassCategory; hours: number }[] = [
  { title: '学术/创新讲座', category: 'innovation', hours: 2 },
  { title: '校园志愿服务', category: 'volunteer', hours: 4 },
  { title: '文体/社团活动', category: 'culture', hours: 2 },
  { title: '社会实践调研', category: 'practice', hours: 8 },
];

interface SecondClassPanelProps {
  summary: SecondClassSummaryResponse | undefined;
  isLoading: boolean;
  syncing: boolean;
  syncHint: string | null;
  onSync: () => void;
  onAdd: (draft?: SecondClassDraft) => void;
  onOpenImport: () => void;
  onEdit: (record: SecondClassRecord) => void;
}

/**
 * 广工第二课堂时长查询面板：
 * 同时清晰呈现「当前学期」与「当前学年」双视角时长、六大模块分布与活动明细。
 */
export function SecondClassPanel({
  summary,
  isLoading,
  syncing,
  syncHint,
  onSync,
  onAdd,
  onOpenImport,
  onEdit,
}: SecondClassPanelProps) {
  const [scope, setScope] = useState<Scope>('semester');

  if (isLoading && !summary) {
    return <CardSkeleton rows={4} />;
  }

  if (!summary) {
    return <GlassCard className="p-5 text-sm text-fg-muted">正在加载第二课堂数据…</GlassCard>;
  }

  const sem = summary.currentSemester;
  const yr = summary.currentAcademicYear;
  const active = scope === 'semester' ? sem : yr;

  return (
    <div className="space-y-4">
      {/* 双维度核心卡：当前学期 vs 当前学年 一眼对照，点哪张看哪张明细 */}
      <GlassCard className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">第二课堂时长查询</h2>
            <p className="mt-0.5 text-[11px] text-fg-muted">
              点选切换「当前学期」与「当前学年」统计口径
            </p>
          </div>
          <span className="text-[11px] text-fg-muted">{formatRelativeSyncTime(summary.syncedAt)}</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {(
            [
              { key: 'semester', badge: '当前学期', title: summary.semesterName, stats: sem },
              { key: 'year', badge: '当前学年', title: `${summary.academicYear} 学年`, stats: yr },
            ] as const
          ).map(({ key, badge, title, stats }) => {
            const selected = scope === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setScope(key)}
                className={`rounded-2xl p-3.5 text-left transition-all ${
                  selected
                    ? 'bg-accent/14 ring-2 ring-accent'
                    : 'surface-subtle surface-subtle-hover opacity-85'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[11px] font-semibold ${selected ? 'text-accent' : 'text-fg-muted'}`}>
                    {badge}
                  </span>
                  <span className="font-num text-[11px] text-fg-muted tabular-nums">{stats.percent}%</span>
                </div>
                <p className="mt-1.5 font-num text-2xl font-bold tracking-tight tabular-nums">
                  {stats.totalHours}
                  <span className="ml-1 text-xs font-medium text-fg-muted">小时</span>
                </p>
                <p className="mt-0.5 truncate text-[11px] text-fg-muted">
                  {title} · 目标 {stats.targetHours}h
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-current/10">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${stats.percent}%` }} />
                </div>
              </button>
            );
          })}
        </div>

        {/* 当前视角细节指标 + 快捷操作 */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-current/10 pt-3 text-xs text-fg-muted">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              已认定 <strong className="font-num text-fg tabular-nums">{active.approvedHours}h</strong>
            </span>
            {active.pendingHours > 0 && (
              <span>
                待审核 <strong className="font-num text-amber-600 dark:text-amber-400 tabular-nums">{active.pendingHours}h</strong>
              </span>
            )}
            {active.totalCredits > 0 && (
              <span>
                折算二课分 <strong className="font-num text-accent tabular-nums">{active.totalCredits}</strong>
              </span>
            )}
            <span>
              {active.remainingHours > 0 ? `距目标还差 ${active.remainingHours}h` : '✓ 已达成目标'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isNative && (
            <Button className="h-9 px-3.5 text-xs" loading={syncing} onClick={onSync}>
              查询广工二课
            </Button>
          )}
          <Button variant={isNative ? 'ghost' : 'primary'} className="h-9 px-3.5 text-xs" onClick={onOpenImport}>
            粘贴导入 / 调目标
          </Button>
          <Button variant="ghost" className="h-9 px-3.5 text-xs" onClick={() => onAdd({})}>
            手动记一笔
          </Button>
        </div>

        {syncHint && <p className="text-xs text-amber-600 dark:text-amber-400">{syncHint}</p>}
      </GlassCard>

      {/* 六大第二课堂模块时长分布 */}
      <GlassCard className="space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">六大模块时长分布（{scope === 'semester' ? '当前学期' : '当前学年'}）</h3>
          <span className="font-num text-xs text-fg-muted tabular-nums">共 {active.count} 项活动</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {active.byCategory.map((item) => (
            <div key={item.category} className="surface-subtle rounded-2xl px-3 py-2.5">
              <p className="text-xs text-fg-muted">{item.label}</p>
              <div className="mt-1 flex items-baseline justify-between gap-1">
                <span className="font-num text-base font-bold tabular-nums">{item.hours}h</span>
                <span className="font-num text-[11px] text-fg-muted tabular-nums">{item.count} 次</span>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* 活动时长明细 */}
      <GlassCard className="space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {scope === 'semester' ? `${summary.semesterName}活动明细` : `${summary.academicYear} 学年活动明细`}
          </h3>
          <span className="text-[11px] text-fg-muted">点击条目可编辑</span>
        </div>

        {active.records.length === 0 ? (
          <div className="space-y-3 py-3 text-center">
            <p className="text-sm text-fg-muted">
              {scope === 'semester' ? '当前学期还没有第二课堂时长记录' : '当前学年还没有第二课堂时长记录'}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {QUICK_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.title}
                  type="button"
                  onClick={() =>
                    onAdd({
                      presetTitle: tpl.title,
                      presetCategory: tpl.category,
                      presetHours: tpl.hours,
                    })
                  }
                  className="surface-subtle surface-subtle-hover rounded-full px-3 py-1.5 text-xs font-medium text-accent"
                >
                  + {tpl.title} {tpl.hours}h
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-current/8">
            {active.records.map((rec) => (
              <li key={rec.id}>
                <button
                  type="button"
                  onClick={() => onEdit(rec)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition-opacity hover:opacity-85"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{rec.title}</p>
                      {rec.status === 'pending' && (
                        <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          待审核
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-fg-muted">
                      <span className="text-accent">{SECOND_CLASS_CATEGORY_LABELS[rec.category]}</span>
                      <span className="font-num tabular-nums">{rec.activityDate}</span>
                      {scope === 'year' && <span>{rec.semesterName}</span>}
                      {rec.organizer && <span className="truncate">{rec.organizer}</span>}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <span className="inline-flex items-center gap-1 font-num text-sm font-bold text-accent tabular-nums">
                      <ClockIcon size={12} />
                      +{rec.hours}h
                    </span>
                    {rec.credits > 0 && (
                      <p className="font-num text-[10px] text-fg-muted tabular-nums">{rec.credits} 二课分</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
