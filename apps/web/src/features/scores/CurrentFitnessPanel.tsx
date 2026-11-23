import {
  evaluateFitnessRecord,
  FITNESS_GENDER_LABELS,
  FITNESS_GRADE_LABELS,
  FITNESS_LEVEL_LABELS,
  type FitnessItemEvaluation,
  type FitnessLevel,
  type FitnessRecord,
} from '@gduthelp/shared';
import { motion } from 'motion/react';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { CardSkeleton } from '../../components/Skeleton';
import { isNative } from '../../lib/platform';
import { formatRelativeSyncTime } from '../../lib/scores-sync';
import { toast } from '../../lib/toast-store';
import { stagger } from '../../motion/presets';

interface CurrentFitnessPanelProps {
  academicYear: string;
  record: FitnessRecord | null;
  syncedAt: string | null;
  isLoading: boolean;
  syncing: boolean;
  syncHint: string | null;
  onQuery: () => void;
  onEdit: () => void;
}

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

export function CurrentFitnessPanel({
  academicYear,
  record,
  syncedAt,
  isLoading,
  syncing,
  syncHint,
  onQuery,
  onEdit,
}: CurrentFitnessPanelProps) {
  const copyTzcsUrl = async () => {
    try {
      await navigator.clipboard.writeText(TZCS_URL);
      toast.success('已复制广工体测系统网址');
    } catch {
      toast.info(`体测查询网址：${TZCS_URL}`);
    }
  };

  if (isLoading && !record) {
    return <CardSkeleton rows={4} />;
  }

  if (!record) {
    return (
      <div className="space-y-4">
        <GlassCard className="p-6 text-center">
          <p className="text-xs font-medium text-fg-muted">{academicYear} 学年体测</p>
          <h2 className="mt-1 text-base font-semibold">暂未查询到本学年体测成绩</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-fg-muted">
            {isNative
              ? '聚焦当前学年：在校园网或 VPN 环境下可一键直连广工体测系统查询并自动刷新，也可手动录入即时按国家标准算分。'
              : '聚焦当前学年：安卓 App 支持直连广工体测系统自动更新，网页端可手动录入或直接粘贴公众号成绩实时算分。'}
          </p>
          {syncHint && <p className="mt-3 rounded-2xl bg-amber-400/18 px-3 py-2 text-xs leading-relaxed">{syncHint}</p>}
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            {isNative && (
              <Button className="h-10 px-4 text-sm" loading={syncing} onClick={onQuery}>
                直接查询本学年体测
              </Button>
            )}
            <Button variant={isNative ? 'ghost' : 'primary'} className="h-10 px-4 text-sm" onClick={onEdit}>
              手动录入 / 粘贴算分
            </Button>
          </div>
        </GlassCard>

        <GlassCard variant="thin" className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs text-fg-muted">
          <p className="min-w-0 flex-1 leading-relaxed">
            学校通常在体测结束约 3 天后上传至 <code className="font-mono text-fg/80">{TZCS_URL}</code>
            （校园网）及「广东工业大学体育学院」公众号。
          </p>
          <button type="button" onClick={copyTzcsUrl} className="shrink-0 font-medium text-accent hover:underline">
            复制网址
          </button>
        </GlassCard>
      </div>
    );
  }

  const ev = evaluateFitnessRecord(record);

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-4">
      {/* 1. 本学年体测总分主卡 */}
      <GlassCard variants={stagger.item} className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-fg-muted">
              {academicYear} 学年体测 · {FITNESS_GRADE_LABELS[record.gradeYear]}（{FITNESS_GENDER_LABELS[record.gender]}）
            </p>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span className="font-num text-4xl font-bold tracking-tight tabular-nums">
                {ev.completedCount > 0 || record.exempt ? ev.totalScore.toFixed(1) : '--'}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${levelBadgeStyle(ev.level)}`}>
                {FITNESS_LEVEL_LABELS[ev.level]}
              </span>
              {ev.bonusScore > 0 && (
                <span className="rounded-full bg-emerald-500/16 px-2 py-0.5 font-num text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
                  +{ev.bonusScore} 附加分
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs text-fg-muted tabular-nums">
              {record.exempt
                ? '本学年已办理免测，按国家标准记 60.0 分'
                : `标准分 ${ev.standardScore.toFixed(1)} + 附加分 ${ev.bonusScore} · 已出 ${ev.completedCount}/7 项`}
              {record.officialTotal !== null ? ` · 系统原分 ${record.officialTotal.toFixed(1)}` : ''}
            </p>
          </div>

          <Button variant="ghost" className="h-9 shrink-0 px-3 text-xs" onClick={onEdit}>
            编辑 / 试算
          </Button>
        </div>

        {/* 0–100 等级进度条 */}
        {(ev.completedCount > 0 || record.exempt) && (
          <div className="mt-4">
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-current/10">
              <div
                className={`h-full rounded-full transition-all duration-300 ${barFillClass(ev.level)}`}
                style={{ width: `${Math.min(100, Math.max(0, ev.totalScore))}%` }}
              />
              {[60, 80, 90].map((mark) => (
                <span
                  key={mark}
                  className="absolute top-0 h-full w-px bg-white/55 dark:bg-black/35"
                  style={{ left: `${mark}%` }}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-fg-muted tabular-nums">
              <span>0</span>
              <span>60 及格</span>
              <span>80 良好</span>
              <span>90 优秀</span>
              <span>100+</span>
            </div>
          </div>
        )}

        {/* 底部更新状态与直连刷新 */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-current/10 pt-3 text-xs">
          <span className="text-fg-muted">{formatRelativeSyncTime(syncedAt)}</span>
          {isNative ? (
            <button
              type="button"
              disabled={syncing}
              onClick={onQuery}
              className="font-medium text-accent hover:underline disabled:opacity-50"
            >
              {syncing ? '正在查询…' : '立即直连刷新'}
            </button>
          ) : (
            <button type="button" onClick={copyTzcsUrl} className="font-medium text-accent hover:underline">
              复制体测系统网址
            </button>
          )}
        </div>

        {syncHint && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-amber-400/18 px-3 py-2 text-xs">
            <span className="leading-relaxed">{syncHint}</span>
            {isNative && (
              <button type="button" onClick={onQuery} className="shrink-0 font-semibold text-accent">
                去查询
              </button>
            )}
          </div>
        )}
      </GlassCard>

      {/* 2. 当前学年 7 项成绩拆解与提分建议 */}
      {!record.exempt && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {ev.items.map((item) => (
            <FitnessItemCard key={item.key} item={item} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function FitnessItemCard({ item }: { item: FitnessItemEvaluation }) {
  const pct = item.score !== null ? Math.min(100, Math.max(0, item.score)) : 0;

  return (
    <GlassCard variants={stagger.item} className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-sm font-semibold">{item.label}</span>
          <span className="shrink-0 text-[11px] text-fg-muted">{item.weightPercent}%</span>
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
            <span className="text-xs text-fg-muted">未出分</span>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="font-num font-medium text-fg/85 tabular-nums">{item.displayValue ?? '—'}</span>
        {item.weightedScore !== null && (
          <span className="text-[11px] text-fg-muted tabular-nums">折合 +{item.weightedScore.toFixed(1)}</span>
        )}
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-current/10">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barFillClass(item.level)}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {item.nextTargetTip && <p className="mt-2 text-[11px] leading-relaxed text-fg-muted">{item.nextTargetTip}</p>}
    </GlassCard>
  );
}
