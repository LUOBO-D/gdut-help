import {
  CET_MAX_LISTENING,
  CET_MAX_READING,
  CET_MAX_WRITING,
  CET_OFFICIAL_LINKS,
  CET_SCHEDULE_GUIDE,
  CET_SHORT_LABELS,
  CET_TIER_LABELS,
  cetScoreTier,
  summarizeCetRecords,
  type CetRecord,
  type CetScoreTier,
} from '@gduthelp/shared';
import { motion } from 'motion/react';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { CopyIcon, ExternalLinkIcon, PlusIcon } from '../../components/icons';
import { CardSkeleton } from '../../components/Skeleton';
import { openOfficialWebPage } from '../../lib/jw';
import { isNative } from '../../lib/platform';
import { toast } from '../../lib/toast-store';
import { pressable, stagger } from '../../motion/presets';

interface CetPanelProps {
  records: CetRecord[];
  isLoading: boolean;
  syncing: boolean;
  syncHint: string | null;
  onSyncJw: () => void;
  onAdd: () => void;
  onEdit: (record: CetRecord) => void;
}

function tierBadgeClass(tier: CetScoreTier): string {
  switch (tier) {
    case 'high':
      return 'bg-emerald-500/16 text-emerald-600 dark:text-emerald-300';
    case 'good':
      return 'bg-sky-500/16 text-sky-600 dark:text-sky-300';
    case 'pass':
      return 'bg-accent/15 text-accent';
    case 'fail':
      return 'bg-danger/15 text-danger';
  }
}

function maskTicketNo(no: string): string {
  if (no.length <= 8) return no;
  return `${no.slice(0, 4)}••••${no.slice(-4)}`;
}

/**
 * 四六级（CET-4 / CET-6）查分直达与历次成绩存档面板（位于「学业 → 成绩 → 四六级」）：
 * - 双栏紧凑总览 CET-4 / CET-6 最高分与 425 过线状态；
 * - 一键直达中国教育考试网官方查分与报名入口，安卓端同时支持教务等级考试同步；
 * - 支持粘贴查分文本秒填 + 听力/阅读/写作翻译三分项可视化。
 */
export function CetPanel({
  records,
  isLoading,
  syncing,
  syncHint,
  onSyncJw,
  onAdd,
  onEdit,
}: CetPanelProps) {
  const summary = summarizeCetRecords(records);

  const openLink = async (url: string) => {
    try {
      await openOfficialWebPage(url);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const copyTicket = async (no: string) => {
    try {
      await navigator.clipboard.writeText(no);
      toast.success('已复制准考证号');
    } catch {
      toast.info(`准考证号：${no}`);
    }
  };

  if (isLoading && records.length === 0) {
    return <CardSkeleton rows={3} />;
  }

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="show" className="space-y-3.5">
      {/* 1. 极简双栏四六级概览 + 官方查分直达 */}
      <GlassCard variants={stagger.item} className="space-y-4 p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-2.5">
          <SummaryTile
            label="CET-4 四级"
            record={summary.bestCet4}
            passed={summary.cet4Passed}
          />
          <SummaryTile
            label="CET-6 六级"
            record={summary.bestCet6}
            passed={summary.cet6Passed}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button className="h-9 flex-1 gap-1.5 text-xs" onClick={() => void openLink(CET_OFFICIAL_LINKS.scoreQuery)}>
            <ExternalLinkIcon size={14} />
            中国教育考试网查分
          </Button>
          <Button variant="ghost" className="h-9 gap-1 px-3 text-xs" onClick={onAdd}>
            <PlusIcon size={14} />
            记录 / 粘贴
          </Button>
          {isNative && (
            <Button variant="ghost" className="h-9 px-3 text-xs" loading={syncing} onClick={onSyncJw}>
              教务同步
            </Button>
          )}
        </div>

        {syncHint && (
          <p className="rounded-2xl bg-amber-400/16 px-3 py-2 text-xs leading-relaxed text-fg/90">{syncHint}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-current/10 pt-2.5 text-[11px] text-fg-muted">
          <span>满 425 分即过线 · 查完分可一键粘贴存档</span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void openLink(CET_OFFICIAL_LINKS.register)}
              className="font-medium text-accent hover:underline"
            >
              报名 / 准考证
            </button>
            <span className="opacity-40">·</span>
            <button
              type="button"
              onClick={() => void openLink(CET_OFFICIAL_LINKS.chsiQuery)}
              className="font-medium text-accent hover:underline"
            >
              学信网查分
            </button>
          </div>
        </div>
      </GlassCard>

      {/* 2. 历次成绩单 */}
      {records.length > 0 ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1 text-xs text-fg-muted">
            <span className="font-medium">已存档成绩（{records.length}）</span>
            <span>点击卡片可修改</span>
          </div>
          {records.map((rec) => {
            const tier = cetScoreTier(rec.totalScore);
            const hasParts = rec.listening !== null || rec.reading !== null || rec.writing !== null;
            return (
              <motion.div key={rec.id} variants={stagger.item} {...pressable}>
                <GlassCard interactive onClick={() => onEdit(rec)} className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 font-num text-[11px] font-bold text-accent">
                          {CET_SHORT_LABELS[rec.level]}
                        </span>
                        <span className="text-sm font-semibold">{rec.examSession}</span>
                        {rec.oralGrade && (
                          <span className="surface-subtle rounded-full px-2 py-0.5 text-[11px] text-fg-muted">
                            口语 {rec.oralGrade}
                          </span>
                        )}
                      </div>
                      {rec.ticketNo && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void copyTicket(rec.ticketNo!);
                          }}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-accent"
                        >
                          <span className="font-num tabular-nums">准考证 {maskTicketNo(rec.ticketNo)}</span>
                          <CopyIcon size={11} />
                        </button>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="font-num text-2xl font-bold leading-none tabular-nums">{rec.totalScore}</p>
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${tierBadgeClass(tier)}`}
                      >
                        {CET_TIER_LABELS[tier]}
                      </span>
                    </div>
                  </div>

                  {hasParts && (
                    <div className="grid grid-cols-3 gap-2 border-t border-current/8 pt-2.5">
                      <SubScoreBar label="听力" value={rec.listening} max={CET_MAX_LISTENING} />
                      <SubScoreBar label="阅读" value={rec.reading} max={CET_MAX_READING} />
                      <SubScoreBar label="写作翻译" value={rec.writing} max={CET_MAX_WRITING} />
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <GlassCard variant="thin" className="p-4 text-center text-xs leading-relaxed text-fg-muted">
          点击上方「中国教育考试网查分」查到成绩后，复制整段文本点「记录 / 粘贴」即可自动识别听力、阅读、写作分项并永久存档。
        </GlassCard>
      )}

      {/* 3. 全年考次紧凑时间参考 */}
      <GlassCard variant="thin" className="divide-y divide-current/8 overflow-hidden p-0">
        {CET_SCHEDULE_GUIDE.map((item) => (
          <div key={item.term} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
            <span className="font-medium">{item.term}</span>
            <span className="text-fg-muted">
              {item.register}报名 · {item.writtenExam}考 · {item.scoreRelease}查分
            </span>
          </div>
        ))}
      </GlassCard>
    </motion.div>
  );
}

function SummaryTile({
  label,
  record,
  passed,
}: {
  label: string;
  record: CetRecord | null;
  passed: boolean;
}) {
  return (
    <div className="surface-subtle rounded-2xl p-3.5">
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-xs font-medium text-fg-muted">{label}</span>
        {record ? (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              passed ? 'bg-emerald-500/16 text-emerald-600 dark:text-emerald-300' : 'bg-danger/15 text-danger'
            }`}
          >
            {passed ? '已过线' : '未过线'}
          </span>
        ) : (
          <span className="text-[10px] text-fg-muted/70">待记录</span>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-num text-2xl font-bold tracking-tight tabular-nums">
          {record ? record.totalScore : '--'}
        </span>
        <span className="text-[11px] text-fg-muted">{record ? record.examSession : '/ 710'}</span>
      </div>
    </div>
  );
}

function SubScoreBar({ label, value, max }: { label: string; value: number | null; max: number }) {
  const pct = value !== null ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-fg-muted">{label}</span>
        <span className="font-num font-semibold tabular-nums">{value ?? '--'}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-current/10">
        <div className="h-full rounded-full bg-accent/80 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
