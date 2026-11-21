import { MEAL_LABELS, MERCHANT_CATEGORY_LABELS, defaultMealForHour } from '@gduthelp/shared';
import { Link } from 'react-router';
import { GlassCard } from '../../components/GlassCard';
import { SkeletonBlock } from '../../components/Skeleton';
import { ChevronRightIcon, PinIcon } from '../../components/icons';
import { useMealRecommendations } from '../../lib/queries';
import { useNow } from '../../lib/use-now';
import { stagger } from '../../motion/presets';

export function TodayMealCard() {
  const now = useNow(60_000);
  const meal = defaultMealForHour(now.getHours());
  const rec = useMealRecommendations(meal);
  const top = rec.data?.items[0];
  const rest = rec.data?.items.slice(1, 3) ?? [];

  return (
    <Link to="/food" className="col-span-2 block">
      <GlassCard interactive variants={stagger.item} className="h-full min-h-32 p-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="shrink-0 text-[15px] font-semibold">{MEAL_LABELS[meal]}推荐</h2>
            {rec.data?.scheduleHint && (
              <span className="hidden truncate rounded-full border border-current/15 px-2 py-0.5 text-[11px] text-fg-muted sm:inline">
                {rec.data.scheduleHint}
              </span>
            )}
          </div>
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-accent">
            去挑一挑
            <ChevronRightIcon size={14} />
          </span>
        </div>

        {rec.isPending && !rec.data ? (
          <SkeletonBlock className="h-16 w-full" />
        ) : top ? (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-base font-semibold">
                {top.merchant.name}
                <span className="ml-2 text-xs font-normal text-fg-muted">
                  {MERCHANT_CATEGORY_LABELS[top.merchant.category]}
                </span>
              </p>
              <span className="shrink-0 font-num text-base font-bold text-accent tabular-nums">
                ¥{top.merchant.priceAvg}
              </span>
            </div>
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-fg-muted">
              <PinIcon size={12} className="shrink-0" />
              <span className="truncate">{top.merchant.locationText}</span>
              {top.merchant.walkMinutes != null && <span className="shrink-0">· 步行 {top.merchant.walkMinutes} 分钟</span>}
            </p>
            <p className="surface-subtle mt-2 rounded-xl px-3 py-1.5 text-xs leading-relaxed">{top.reason}</p>
            {rest.length > 0 && (
              <p className="mt-2 truncate text-xs text-fg-muted">
                备选：{rest.map((r) => `${r.merchant.name} ¥${r.merchant.priceAvg}`).join(' · ')}
              </p>
            )}
          </div>
        ) : (
          <p className="py-2 text-sm text-fg-muted">还没有收录商家，去「吃什么」添几家常去的食堂档口或小店 →</p>
        )}
      </GlassCard>
    </Link>
  );
}
