import {
  DEFAULT_CAMPUS_ID,
  DINING_PACE_LABELS,
  DINING_PACE_MODES,
  DINING_PARTY_LABELS,
  DINING_PARTY_MODES,
  MEAL_LABELS,
  MEAL_TYPES,
  MERCHANT_CATEGORIES,
  MERCHANT_CATEGORY_LABELS,
  defaultMealForHour,
  type DiningContext,
  type DiningPaceMode,
  type DiningPartyMode,
  type MealRecommendation,
  type MealType,
  type Merchant,
  type MerchantCategory,
} from '@gduthelp/shared';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Field';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { SkeletonBlock } from '../../components/Skeleton';
import { PinIcon, PlusIcon } from '../../components/icons';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';
import { hapticLight } from '../../lib/native-ux';
import { useMealHistory, useMealRecommendations, useMerchants, usePreferences, useTodayMood } from '../../lib/queries';
import { toast } from '../../lib/toast-store';
import { useNow } from '../../lib/use-now';
import { pressable, spring, stagger } from '../../motion/presets';
import { RankingContent } from '../ranking/RankingContent';
import { MerchantDetailSheet } from './MerchantDetailSheet';
import { MerchantEditorSheet } from './MerchantEditorSheet';
import { MoodCard } from './MoodCard';
import { PreferencesSheet } from './PreferencesSheet';
import { useSeedHemcMerchants, useSendMealFeedback } from './mutations';

type FoodView = 'recommend' | 'ranking' | 'directory';

export function FoodPage() {
  const user = useAuth((s) => s.user);
  const campusId = user?.campusId ?? DEFAULT_CAMPUS_ID;
  const now = useNow(60_000);
  const initialMeal = defaultMealForHour(now.getHours());
  const [view, setView] = useState<FoodView>('recommend');
  const [meal, setMeal] = useState<MealType>(initialMeal);
  const [party, setParty] = useState<DiningPartyMode | undefined>(undefined);
  const [pace, setPace] = useState<DiningPaceMode | undefined>(undefined);
  const [excludeByMeal, setExcludeByMeal] = useState<Record<MealType, string[]>>({ lunch: [], dinner: [] });

  const [prefOpen, setPrefOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState<Merchant | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const [filterCat, setFilterCat] = useState<MerchantCategory | undefined>(undefined);
  const [search, setSearch] = useState('');

  const context: DiningContext | undefined = party || pace ? { party, pace } : undefined;

  const moodQuery = useTodayMood();
  const prefQuery = usePreferences();
  const recQuery = useMealRecommendations(meal, excludeByMeal[meal], context);
  const merchantsQuery = useMerchants(filterCat, search);
  const allCampusMerchants = useMerchants();
  const historyQuery = useMealHistory();
  const feedback = useSendMealFeedback();
  const seedHemc = useSeedHemcMerchants();

  const toggleParty = (next: DiningPartyMode) => {
    setParty((prev) => (prev === next ? undefined : next));
    setExcludeByMeal((prev) => ({ ...prev, [meal]: [] }));
  };

  const togglePace = (next: DiningPaceMode) => {
    setPace((prev) => (prev === next ? undefined : next));
    setExcludeByMeal((prev) => ({ ...prev, [meal]: [] }));
  };

  const handleSeedHemc = () => {
    seedHemc.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(r.created ? `已导入 ${r.created} 家大学城默认商家，现在可以开挑啦` : '默认商家已全部导入'),
      onError: (err) => toast.error(err instanceof ApiError ? err.message : '导入失败'),
    });
  };

  const viewingMerchant = useMemo(() => {
    if (!viewingId) return null;
    return (
      allCampusMerchants.data?.find((m) => m.id === viewingId) ??
      recQuery.data?.items.find((r) => r.merchant.id === viewingId)?.merchant ??
      null
    );
  }, [viewingId, allCampusMerchants.data, recQuery.data]);

  const excludeCurrent = (ids: string[]) => {
    setExcludeByMeal((prev) => ({
      ...prev,
      [meal]: [...new Set([...prev[meal], ...ids])],
    }));
  };

  const resetExcluded = () => {
    setExcludeByMeal((prev) => ({ ...prev, [meal]: [] }));
  };

  const handleFeedback = (item: MealRecommendation, action: 'accepted' | 'skipped' | 'disliked') => {
    hapticLight();
    feedback.mutate(
      { merchantId: item.merchant.id, meal, action },
      {
        onSuccess: () => {
          if (action === 'accepted') {
            toast.success(`就吃「${item.merchant.name}」啦`);
          } else if (action === 'disliked') {
            excludeCurrent([item.merchant.id]);
            toast.info(`已记下，近期不再推荐「${item.merchant.name}」`);
          } else {
            excludeCurrent([item.merchant.id]);
          }
        },
        onError: () => toast.error('提交反馈失败，请稍后重试'),
      },
    );
  };

  const handleRefreshBatch = () => {
    hapticLight();
    const currentIds = recQuery.data?.items.map((i) => i.merchant.id) ?? [];
    if (currentIds.length === 0) {
      resetExcluded();
      return;
    }
    excludeCurrent(currentIds);
  };

  const onSwipeRecommend = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -70 && Math.abs(info.offset.x) > Math.abs(info.offset.y) * 1.4) {
      handleRefreshBatch();
    }
  };

  const openCreate = () => {
    setEditingMerchant(null);
    setEditorOpen(true);
  };

  const openEdit = (m: Merchant) => {
    setEditingMerchant(m);
    setEditorOpen(true);
  };

  const rec = recQuery.data;
  const totalMerchants = rec?.totalMerchants ?? allCampusMerchants.data?.length ?? 0;
  const hasPrefs = Boolean(
    prefQuery.data &&
      (prefQuery.data.tastes.length ||
        prefQuery.data.dislikes.length ||
        prefQuery.data.budgetMin != null ||
        prefQuery.data.budgetMax != null),
  );

  return (
    <>
      <PageHeader
        title="吃什么"
        subtitle="按天气、课表空档和今日心情挑一顿"
        action={
          <div className="flex gap-2">
            <Button variant="ghost" className="h-10 px-3 text-sm" onClick={() => setPrefOpen(true)}>
              {hasPrefs ? '偏好' : '设偏好'}
            </Button>
            <Button className="h-10 gap-1 px-3 text-sm" onClick={openCreate}>
              <PlusIcon size={16} />
              添店
            </Button>
          </div>
        }
      />

      {/* 顶部三视图分段开关：今日推荐 / 口碑榜 / 商家库，把榜单优雅收拢到饮食中心 */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="glass-thin inline-flex rounded-full p-1">
          {(
            [
              { id: 'recommend', label: '今日推荐' },
              { id: 'ranking', label: '口碑榜' },
              { id: 'directory', label: `商家库 (${totalMerchants})` },
            ] as const
          ).map((tab) => {
            const active = view === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setView(tab.id)}
                className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  active ? 'text-accent-fg' : 'text-fg-muted'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="food-view-pill"
                    transition={spring.snappy}
                    className="absolute inset-0 rounded-full bg-accent"
                  />
                )}
                <span className="relative">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {view === 'recommend' ? (
        <div className="space-y-4">
          <MoodCard moodLog={moodQuery.data} />

          <GlassCard className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="surface-subtle inline-flex rounded-full p-1">
                {MEAL_TYPES.map((m) => {
                  const active = meal === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMeal(m)}
                      className={`relative rounded-full px-4 py-1 text-sm font-medium transition-colors ${
                        active ? 'text-accent-fg' : 'text-fg-muted'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="meal-tab-pill"
                          transition={spring.snappy}
                          className="absolute inset-0 rounded-full bg-accent"
                        />
                      )}
                      <span className="relative">{MEAL_LABELS[m]}</span>
                    </button>
                  );
                })}
              </div>

              {rec && rec.items.length > 0 && (
                <button
                  type="button"
                  className="text-xs font-medium text-accent hover:underline"
                  onClick={handleRefreshBatch}
                >
                  换一批
                </button>
              )}
            </div>

            {/* 真实校园就餐场景快选：无需额外配置，按当下人数与节奏即时调整排序 */}
            <div className="no-scrollbar mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {DINING_PARTY_MODES.map((mode) => (
                <Chip key={mode} active={party === mode} onClick={() => toggleParty(mode)} className="shrink-0 text-xs">
                  {DINING_PARTY_LABELS[mode]}
                </Chip>
              ))}
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-current/15" aria-hidden />
              {DINING_PACE_MODES.map((mode) => (
                <Chip key={mode} active={pace === mode} onClick={() => togglePace(mode)} className="shrink-0 text-xs">
                  {DINING_PACE_LABELS[mode]}
                </Chip>
              ))}
            </div>

            {(rec?.weatherSummary || rec?.scheduleHint) && (
              <div className="mt-2.5 flex flex-wrap gap-2 text-xs text-fg-muted">
                {rec.weatherSummary && (
                  <span className="surface-subtle rounded-full px-2.5 py-0.5">{rec.weatherSummary}</span>
                )}
                {rec.scheduleHint && (
                  <span className="surface-subtle rounded-full px-2.5 py-0.5">{rec.scheduleHint}</span>
                )}
              </div>
            )}

            <div className="mt-4">
              {recQuery.isPending && !recQuery.data ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <SkeletonBlock className="h-44" />
                  <SkeletonBlock className="h-44" />
                  <SkeletonBlock className="hidden h-44 md:block" />
                </div>
              ) : rec && rec.items.length > 0 ? (
                <motion.div
                  key={`${meal}-${party ?? ''}-${pace ?? ''}-${excludeByMeal[meal].join(',')}`}
                  className="grid touch-pan-y gap-3 md:grid-cols-3"
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.18}
                  onDragEnd={onSwipeRecommend}
                  variants={stagger.container}
                  initial="hidden"
                  animate="show"
                >
                  <AnimatePresence mode="popLayout">
                    {rec.items.map((item, idx) => (
                      <RecommendCard
                        key={item.merchant.id}
                        item={item}
                        rank={idx + 1}
                        busy={feedback.isPending}
                        onOpen={() => setViewingId(item.merchant.id)}
                        onFeedback={(action) => handleFeedback(item, action)}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              ) : totalMerchants === 0 ? (
                <div className="rounded-2xl border border-dashed border-current/20 p-6 text-center">
                  <p className="text-base font-medium">还没有收录商家</p>
                  <p className="mt-1 text-sm text-fg-muted">
                    {campusId === 'hemc'
                      ? '一键导入广工大学城一饭至四饭及南亭村常见店，或手动添一家你的私藏小店'
                      : '添几家常去的食堂档口或周边小店，推荐就会立即可用'}
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {campusId === 'hemc' && (
                      <Button className="h-10 px-4 text-sm" loading={seedHemc.isPending} onClick={handleSeedHemc}>
                        一键导入大学城默认商家库
                      </Button>
                    )}
                    <Button variant={campusId === 'hemc' ? 'ghost' : 'primary'} className="h-10 px-4 text-sm" onClick={openCreate}>
                      手动录入第一家店
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-current/20 p-6 text-center">
                  <p className="text-sm text-fg-muted">
                    {excludeByMeal[meal].length > 0 ? '本轮候选都看过了' : '当前偏好、忌口或时段下暂无合适商家'}
                  </p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {excludeByMeal[meal].length > 0 && (
                      <Button variant="ghost" className="h-9 px-3 text-sm" onClick={resetExcluded}>
                        重新看一遍
                      </Button>
                    )}
                    <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => setPrefOpen(true)}>
                      调整偏好
                    </Button>
                    <Button className="h-9 px-3 text-sm" onClick={openCreate}>
                      补充新店
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {totalMerchants > 0 && totalMerchants < 10 && (
              <div className="surface-subtle mt-4 flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-xs">
                <span className="text-fg-muted">
                  已收录 <strong className="font-num text-fg tabular-nums">{totalMerchants}</strong> 家店，满 10 家推荐会更丰富
                </span>
                <button type="button" className="shrink-0 font-medium text-accent hover:underline" onClick={openCreate}>
                  + 补充一家
                </button>
              </div>
            )}
          </GlassCard>

          {historyQuery.data && historyQuery.data.length > 0 && (
            <GlassCard className="p-4">
              <h2 className="text-sm font-semibold">最近吃过</h2>
              <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto pb-0.5">
                {historyQuery.data.slice(0, 8).map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setViewingId(h.merchantId)}
                    className="surface-subtle surface-subtle-hover shrink-0 rounded-2xl px-3 py-1.5 text-left text-xs"
                  >
                    <p className="font-medium">{h.merchantName ?? '商家'}</p>
                    <p className="font-num text-[11px] text-fg-muted tabular-nums">
                      {h.date.slice(5)} · {MEAL_LABELS[h.meal]}
                    </p>
                  </button>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      ) : view === 'ranking' ? (
        <RankingContent onGoCreate={openCreate} />
      ) : (
        <GlassCard className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold">本校区商家</h2>
            <input
              className="field h-9 w-full py-0 text-sm sm:w-56"
              placeholder="搜店名、地点或标签"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto pb-1">
            <Chip active={filterCat === undefined} onClick={() => setFilterCat(undefined)} className="shrink-0 text-xs">
              全部
            </Chip>
            {MERCHANT_CATEGORIES.map((c) => (
              <Chip
                key={c}
                active={filterCat === c}
                onClick={() => setFilterCat(filterCat === c ? undefined : c)}
                className="shrink-0 text-xs"
              >
                {MERCHANT_CATEGORY_LABELS[c]}
              </Chip>
            ))}
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {merchantsQuery.isPending && !merchantsQuery.data && (
              <>
                <SkeletonBlock className="h-24" />
                <SkeletonBlock className="h-24" />
              </>
            )}
            {merchantsQuery.data?.map((m) => (
              <motion.button
                key={m.id}
                type="button"
                {...pressable}
                onClick={() => setViewingId(m.id)}
                className="surface-subtle surface-subtle-hover rounded-2xl p-3.5 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-medium">{m.name}</p>
                  <span className="shrink-0 font-num text-sm font-semibold text-accent tabular-nums">¥{m.priceAvg}</span>
                </div>
                <p className="mt-1 flex items-center gap-1 truncate text-xs text-fg-muted">
                  <PinIcon size={13} className="shrink-0" />
                  <span className="truncate">{m.locationText}</span>
                  {m.walkMinutes != null && <span className="shrink-0">· {m.walkMinutes} 分钟</span>}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="rounded-full bg-current/10 px-2 py-0.5 text-[11px]">
                    {MERCHANT_CATEGORY_LABELS[m.category]}
                  </span>
                  {m.tags.slice(0, 3).map((t) => (
                    <span key={t} className="rounded-full border border-current/15 px-2 py-0.5 text-[11px] text-fg-muted">
                      {t}
                    </span>
                  ))}
                </div>
              </motion.button>
            ))}
            {!merchantsQuery.isPending && (merchantsQuery.data?.length ?? 0) === 0 && (
              <div className="col-span-full py-8 text-center text-sm text-fg-muted">
                <p>没有匹配的商家</p>
                <Button variant="ghost" className="mt-3 h-9 px-4 text-sm" onClick={openCreate}>
                  + 添一家新店
                </Button>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      <PreferencesSheet open={prefOpen} onClose={() => setPrefOpen(false)} initial={prefQuery.data} />
      <MerchantEditorSheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        editing={editingMerchant}
        onPickSimilar={(id) => {
          setEditorOpen(false);
          setViewingId(id);
        }}
      />
      <MerchantDetailSheet merchant={viewingMerchant} onClose={() => setViewingId(null)} onEdit={openEdit} />
    </>
  );
}

function RecommendCard({
  item,
  rank,
  busy,
  onOpen,
  onFeedback,
}: {
  item: MealRecommendation;
  rank: number;
  busy: boolean;
  onOpen: () => void;
  onFeedback: (action: 'accepted' | 'skipped' | 'disliked') => void;
}) {
  const { merchant } = item;
  return (
    <motion.div
      layout
      variants={stagger.item}
      exit={{ opacity: 0, scale: 0.94 }}
      className="surface-subtle flex flex-col justify-between rounded-2xl p-4"
    >
      <div>
        <button type="button" onClick={onOpen} className="w-full text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-fg-muted">
                #{rank} · {MERCHANT_CATEGORY_LABELS[merchant.category]}
              </span>
              <h3 className="mt-0.5 truncate text-base font-semibold">{merchant.name}</h3>
            </div>
            <span className="shrink-0 font-num text-base font-bold text-accent tabular-nums">¥{merchant.priceAvg}</span>
          </div>

          <p className="mt-1 flex items-center gap-1 truncate text-xs text-fg-muted">
            <PinIcon size={13} className="shrink-0" />
            <span className="truncate">{merchant.locationText}</span>
            {merchant.walkMinutes != null && <span className="shrink-0">· 步行 {merchant.walkMinutes} 分钟</span>}
          </p>

          <p className="mt-2.5 rounded-xl bg-accent/12 px-2.5 py-1.5 text-xs leading-relaxed text-fg">{item.reason}</p>

          <div className="mt-2.5 flex flex-wrap gap-1">
            {merchant.tags.slice(0, 4).map((t) => {
              const hit = item.matchedTags.includes(t);
              return (
                <span
                  key={t}
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    hit ? 'bg-accent/20 font-medium text-accent' : 'border border-current/15 text-fg-muted'
                  }`}
                >
                  {t}
                </span>
              );
            })}
          </div>
        </button>
      </div>

      <div className="mt-3.5 flex gap-1.5 border-t border-current/10 pt-3">
        <Button className="h-8 flex-1 px-2 text-xs" disabled={busy} onClick={() => onFeedback('accepted')}>
          就吃这个
        </Button>
        <Button variant="ghost" className="h-8 px-2.5 text-xs" disabled={busy} onClick={() => onFeedback('skipped')}>
          换一个
        </Button>
        <Button
          variant="ghost"
          className="h-8 px-2.5 text-xs text-fg-muted"
          disabled={busy}
          onClick={() => onFeedback('disliked')}
        >
          不想吃
        </Button>
      </div>
    </motion.div>
  );
}
