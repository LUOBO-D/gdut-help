import {
  MERCHANT_CATEGORIES,
  MERCHANT_CATEGORY_LABELS,
  RANKING_TYPE_LABELS,
  RANKING_TYPES,
  type Merchant,
  type MerchantCategory,
  type RankedMerchant,
  type RankingType,
} from '@gduthelp/shared';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Field';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { CardSkeleton, SkeletonBlock } from '../../components/Skeleton';
import { PinIcon, TrophyIcon } from '../../components/icons';
import { useRankings } from '../../lib/queries';
import { pressable, spring, stagger } from '../../motion/presets';
import { MerchantDetailSheet } from '../food/MerchantDetailSheet';
import { MerchantEditorSheet } from '../food/MerchantEditorSheet';

export function RankingPage() {
  const [type, setType] = useState<RankingType>('overall');
  const [category, setCategory] = useState<MerchantCategory>('canteen');
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Merchant | null>(null);

  const rankingsQuery = useRankings(type, type === 'category' ? category : undefined);
  const items = rankingsQuery.data?.items ?? [];
  const viewingMerchant = items.find((i) => i.merchant.id === viewingId)?.merchant ?? null;

  const top3 = items.slice(0, 3);
  const rest = items.slice(3);

  return (
    <>
      <PageHeader
        title="榜单"
        subtitle="贝叶斯加权防刷榜，真实口碑一目了然"
        action={
          <Link to="/food" className="glass-thin inline-flex h-10 items-center rounded-2xl px-3.5 text-sm font-medium">
            去吃什么
          </Link>
        }
      />

      {/* 顶部榜单切换 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="glass-thin inline-flex rounded-full p-1">
          {RANKING_TYPES.map((t) => {
            const active = type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  active ? 'text-accent-fg' : 'text-fg-muted'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="ranking-tab-pill"
                    transition={spring.snappy}
                    className="absolute inset-0 rounded-full bg-accent"
                  />
                )}
                <span className="relative">{RANKING_TYPE_LABELS[t]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {type === 'category' && (
        <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto pb-1">
          {MERCHANT_CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)} className="shrink-0 text-xs">
              {MERCHANT_CATEGORY_LABELS[c]}
            </Chip>
          ))}
        </div>
      )}

      {rankingsQuery.isPending && !rankingsQuery.data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2.5">
            <SkeletonBlock className="h-36" />
            <SkeletonBlock className="h-44" />
            <SkeletonBlock className="h-32" />
          </div>
          <CardSkeleton rows={3} />
        </div>
      ) : items.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <TrophyIcon size={32} className="mx-auto text-accent opacity-80" />
          <p className="mt-3 text-base font-semibold">该榜单还没有商家</p>
          <p className="mt-1 text-sm text-fg-muted">先去「吃什么」录入几家常去的店并打分，榜单就会自动生成</p>
          <Link to="/food" className="mt-4 inline-block">
            <Button className="h-10 px-5 text-sm">前往录入商家</Button>
          </Link>
        </GlassCard>
      ) : (
        <div className="space-y-4">
          {/* Top 3 极简玻璃领奖台（#2 / #1 / #3 视觉阶梯） */}
          <motion.div
            key={`${type}-${category}`}
            variants={stagger.container}
            initial="hidden"
            animate="show"
            className={`grid items-end gap-2.5 sm:gap-3 ${
              top3.length === 1 ? 'grid-cols-1 max-w-sm mx-auto' : top3.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
            }`}
          >
            {(top3.length === 3 ? [top3[1]!, top3[0]!, top3[2]!] : top3).map((item) => (
              <PodiumCard
                key={item.merchant.id}
                item={item}
                weekly={type === 'weekly'}
                onOpen={() => setViewingId(item.merchant.id)}
              />
            ))}
          </motion.div>

          {/* #4 及以后榜单列表 */}
          {rest.length > 0 && (
            <GlassCard className="divide-y divide-current/10 px-4">
              {rest.map((item) => {
                const { merchant } = item;
                return (
                  <button
                    key={merchant.id}
                    type="button"
                    onClick={() => setViewingId(merchant.id)}
                    className="flex w-full items-center gap-3 py-3.5 text-left"
                  >
                    <span className="w-7 shrink-0 text-center font-num text-sm font-semibold text-fg-muted tabular-nums">
                      {item.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="truncate font-medium">{merchant.name}</p>
                        <span className="shrink-0 text-xs text-fg-muted">{MERCHANT_CATEGORY_LABELS[merchant.category]}</span>
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-fg-muted">
                        <PinIcon size={12} className="shrink-0" />
                        <span className="truncate">{merchant.locationText}</span>
                        <span className="shrink-0 font-num tabular-nums">· ¥{merchant.priceAvg}</span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {type === 'weekly' ? (
                        <p className="font-num text-sm font-semibold text-accent tabular-nums">热度 {item.weeklyHeat ?? 0}</p>
                      ) : merchant.ratingCount > 0 ? (
                        <>
                          <p className="font-num text-sm font-semibold text-accent tabular-nums">
                            ★ {merchant.ratingAvg.toFixed(1)}
                          </p>
                          <p className="font-num text-[11px] text-fg-muted tabular-nums">{merchant.ratingCount} 评</p>
                        </>
                      ) : (
                        <p className="text-xs text-fg-muted">暂无评分</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </GlassCard>
          )}
        </div>
      )}

      <MerchantDetailSheet
        merchant={viewingMerchant}
        onClose={() => setViewingId(null)}
        onEdit={(m) => setEditing(m)}
      />
      <MerchantEditorSheet open={Boolean(editing)} onClose={() => setEditing(null)} editing={editing} />
    </>
  );
}

const MEDAL_STYLES: Record<number, { badge: string; ring: string; height: string }> = {
  1: {
    badge: 'bg-[#FFB020] text-[#2B1B12]',
    ring: 'ring-1 ring-[#FFB020]/50',
    height: 'min-h-44 sm:min-h-48',
  },
  2: {
    badge: 'bg-[#B8C4D8] text-[#10233F]',
    ring: 'ring-1 ring-white/35',
    height: 'min-h-36 sm:min-h-40',
  },
  3: {
    badge: 'bg-[#D99B66] text-[#2B1B12]',
    ring: 'ring-1 ring-[#D99B66]/40',
    height: 'min-h-32 sm:min-h-36',
  },
};

function PodiumCard({
  item,
  weekly,
  onOpen,
}: {
  item: RankedMerchant;
  weekly: boolean;
  onOpen: () => void;
}) {
  const { merchant, rank } = item;
  const style = MEDAL_STYLES[rank] ?? MEDAL_STYLES[3]!;

  return (
    <motion.button
      type="button"
      variants={stagger.item}
      {...pressable}
      onClick={onOpen}
      className="block h-full w-full text-left"
    >
      <GlassCard interactive className={`flex flex-col justify-between p-3.5 sm:p-4 ${style.height} ${style.ring}`}>
        <div>
          <div className="flex items-center justify-between gap-1">
            <span className={`inline-flex size-6 items-center justify-center rounded-full font-num text-xs font-bold ${style.badge}`}>
              {rank}
            </span>
            <span className="font-num text-xs text-fg-muted tabular-nums">¥{merchant.priceAvg}</span>
          </div>
          <h3 className="mt-2.5 line-clamp-2 text-sm font-semibold leading-snug sm:text-base">{merchant.name}</h3>
          <p className="mt-1 truncate text-[11px] text-fg-muted">{merchant.locationText}</p>
        </div>

        <div className="mt-3 border-t border-current/10 pt-2">
          {weekly ? (
            <p className="font-num text-xs font-semibold text-accent tabular-nums">本周热度 {item.weeklyHeat ?? 0}</p>
          ) : merchant.ratingCount > 0 ? (
            <div className="flex items-baseline justify-between gap-1">
              <span className="font-num text-sm font-bold text-accent tabular-nums">★ {merchant.ratingAvg.toFixed(1)}</span>
              <span className="font-num text-[11px] text-fg-muted tabular-nums">{merchant.ratingCount} 评</span>
            </div>
          ) : (
            <p className="text-[11px] text-fg-muted">点此写第一条评价</p>
          )}
        </div>
      </GlassCard>
    </motion.button>
  );
}
