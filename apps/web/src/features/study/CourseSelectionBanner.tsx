import { nextActiveSelection, selectionCountdownText, selectionStatus } from '@gduthelp/shared';
import { useState } from 'react';
import { GlassCard } from '../../components/GlassCard';
import { BellIcon, ChevronRightIcon } from '../../components/icons';
import { openJwSelectionPage } from '../../lib/jw';
import { isNative } from '../../lib/platform';
import { useCourseSelections } from '../../lib/queries';
import { useNow } from '../../lib/use-now';
import { CourseSelectionSheet } from './CourseSelectionSheet';

function formatCompactStart(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const m = bj.getUTCMonth() + 1;
  const day = bj.getUTCDate();
  const hh = String(bj.getUTCHours()).padStart(2, '0');
  const mm = String(bj.getUTCMinutes()).padStart(2, '0');
  return `${m}/${day} ${hh}:${mm}`;
}

/**
 * 极简单行「选课时间提醒条」（置于「学业 → 选课」顶部）：
 * 不占用多余版面，一眼展示下一场抢课倒计时；点击即可管理多轮次与手机提前推送。
 */
export function CourseSelectionBanner() {
  const { data: items = [] } = useCourseSelections();
  const now = useNow(60_000);
  const [open, setOpen] = useState(false);

  const next = nextActiveSelection(items, now);
  const status = next ? selectionStatus(next, now) : null;

  return (
    <>
      <GlassCard variant="thin" className="flex items-center justify-between gap-2.5 rounded-2xl! px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span
            className={`grid size-7 shrink-0 place-items-center rounded-xl ${
              status === 'ongoing' ? 'bg-emerald-500/18 text-emerald-500' : 'bg-accent/15 text-accent'
            }`}
          >
            <BellIcon size={14} />
          </span>

          {next ? (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-semibold">{next.title}</span>
                <span className="shrink-0 font-num text-[11px] font-semibold text-accent tabular-nums">
                  {selectionCountdownText(next, now)}
                </span>
              </div>
              <p className="mt-0.5 truncate font-num text-[11px] text-fg-muted tabular-nums">
                {formatCompactStart(next.startAt)} 开放
                {items.length > 1 ? ` · 共 ${items.length} 条提醒` : ''}
              </p>
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">选课时间提醒</p>
              <p className="truncate text-[11px] text-fg-muted">
                设置公选 / 体育抢课倒计时，开抢前自动通知
              </p>
            </div>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          {isNative && next && (
            <button
              type="button"
              onClick={() => void openJwSelectionPage()}
              className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-fg"
            >
              去选课
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-0.5 text-xs font-medium text-accent hover:opacity-80"
          >
            <span>{next ? '管理' : '设置'}</span>
            <ChevronRightIcon size={13} />
          </button>
        </div>
      </GlassCard>

      <CourseSelectionSheet open={open} items={items} now={now} onClose={() => setOpen(false)} />
    </>
  );
}
