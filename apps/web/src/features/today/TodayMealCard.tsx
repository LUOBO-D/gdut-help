import { MEAL_LABELS, MERCHANT_CATEGORY_LABELS, defaultMealForHour } from '@gduthelp/shared';
import { Link } from 'react-router';
import { GlassCard } from '../../components/GlassCard';
import { SkeletonBlock } from '../../components/Skeleton';
import { BowlIcon, ChevronRightIcon, PinIcon } from '../../components/icons';
import { useMealRecommendations } from '../../lib/queries';
import { useNow } from '../../lib/use-now';
import { stagger } from '../../motion/presets';

export function TodayMealCard({ mealPriority = false }: { mealPriority?: boolean }) {
  const now = useNow(60_000);
  const meal = defaultMealForHour(now.getHours());
  const rec = useMealRecommendations(meal);
  const top = rec.data?.items[0];
  const rest = rec.data?.items.slice(1, 3) ?? [];

  return (
    <Link to="/food" className="block">
      <GlassCard interactive variants={stagger.item} className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-fg-muted">
            <BowlIcon size={15} className="shrink-0 text-accent" />
            <h2 className="shrink-0">{MEAL_LABELS[meal]}推荐</h2>
            {mealPriority && (
              <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                饭点
              </span>
            )}
          </div>
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-accent">
            换一换
            <ChevronRightIcon size={14} />
          </span>
        </div>

        {rec.isPending && !rec.data ? (
          <SkeletonBlock className="mt-3 h-16 w-full" />
        ) : top ? (
          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex min-w-0 items-baseline gap-2">
                <p className="truncate text-[17px] font-bold tracking-tight">{top.merchant.name}</p>
                <span className="shrink-0 text-xs text-fg-muted">
                  {MERCHANT_CATEGORY_LABELS[top.merchant.category]}
                </span>
              </div>
              <span className="shrink-0 font-num text-base font-bold text-accent tabular-nums">
                ¥{top.merchant.priceAvg}
              </span>
            </div>

            <p className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
              <PinIcon size={12} className="shrink-0" />
              <span className="truncate">{top.merchant.locationText}</span>
              {top.merchant.walkMinutes != null && (
                <span className="shrink-0">· 步行 {top.merchant.walkMinutes} 分钟</span>
              )}
            </p>

            <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-fg/85">
              {top.reason}
            </p>

            {rest.length > 0 && (
              <p className="mt-3 truncate border-t border-current/10 pt-2.5 text-xs text-fg-muted">
                备选：{rest.map((r) => `${r.merchant.name} ¥${r.merchant.priceAvg}`).join(' · ')}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 py-1 text-sm text-fg-muted">
            还没有收录商家，去「吃什么」添几家常去的食堂档口或小店 →
          </p>
        )}
      </GlassCard>
    </Link>
  );
}
