import {
  MEAL_LABELS,
  MERCHANT_CATEGORY_LABELS,
  dishInputSchema,
  type Merchant,
} from '@gduthelp/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { PinIcon } from '../../components/icons';
import { Sheet } from '../../components/Sheet';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';
import { useMerchantReviews } from '../../lib/queries';
import { toast } from '../../lib/toast-store';
import { useAddDish, useRemoveDish } from './mutations';
import { ReviewSheet } from '../ranking/ReviewSheet';
import { useToggleReviewLike } from '../ranking/mutations';

interface MerchantDetailSheetProps {
  merchant: Merchant | null;
  onClose: () => void;
  onEdit?: (merchant: Merchant) => void;
}

export function MerchantDetailSheet({ merchant, onClose, onEdit }: MerchantDetailSheetProps) {
  const user = useAuth((s) => s.user);
  const addDish = useAddDish();
  const removeDish = useRemoveDish();
  const reviewsQuery = useMerchantReviews(merchant?.id ?? null);
  const toggleLike = useToggleReviewLike(merchant?.id ?? '');

  const [dishName, setDishName] = useState('');
  const [dishPrice, setDishPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const canEdit = Boolean(onEdit && merchant && user && (merchant.submittedBy === user.id || user.role === 'admin'));

  const submitDish = (e: FormEvent) => {
    e.preventDefault();
    if (!merchant) return;
    setError(null);
    const parsed = dishInputSchema.safeParse({
      name: dishName,
      price: dishPrice.trim() ? Number(dishPrice) : null,
      tags: [],
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? '请填写菜名');
    addDish.mutate(
      { merchantId: merchant.id, data: parsed.data },
      {
        onSuccess: () => {
          setDishName('');
          setDishPrice('');
          toast.success('已补充招牌菜');
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : '添加菜品失败'),
      },
    );
  };

  const reviewData = reviewsQuery.data;

  return (
    <>
      <Sheet
        open={Boolean(merchant)}
        onClose={onClose}
        title={merchant?.name ?? ''}
        footer={
          merchant ? (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setReviewOpen(true)}>
                {reviewData?.myReview ? '修改我的评价' : '写一条评价'}
              </Button>
              {canEdit && onEdit && (
                <Button
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => {
                    onClose();
                    onEdit(merchant);
                  }}
                >
                  编辑商家
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        {merchant && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              <span className="rounded-full bg-accent/15 px-2.5 py-1 font-medium text-accent">
                {MERCHANT_CATEGORY_LABELS[merchant.category]}
              </span>
              <span className="font-num text-sm font-semibold text-fg tabular-nums">人均 ¥{merchant.priceAvg}</span>
              {merchant.walkMinutes != null && <span>· 步行约 {merchant.walkMinutes} 分钟</span>}
              {merchant.ratingCount > 0 && (
                <span className="font-num text-accent tabular-nums">
                  · ★ {merchant.ratingAvg.toFixed(1)}（{merchant.ratingCount} 评）
                </span>
              )}
            </div>

            <div className="flex items-start gap-2 text-sm">
              <PinIcon size={16} className="mt-0.5 shrink-0 text-fg-muted" />
              <div>
                <p>{merchant.locationText}</p>
                {merchant.openHours && (
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {merchant.openHours.meals?.map((m) => MEAL_LABELS[m]).join(' / ')}
                    {merchant.openHours.text ? ` · ${merchant.openHours.text}` : ''}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {merchant.tags.map((t) => (
                <span key={t} className="rounded-full border border-current/15 px-2.5 py-0.5 text-xs">
                  {t}
                </span>
              ))}
            </div>

            {/* 四维评分概览 */}
            {reviewData?.dimensions && (
              <div className="surface-subtle space-y-2 rounded-2xl p-3.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-semibold">四维评分</span>
                  <span className="font-num text-xs text-fg-muted tabular-nums">
                    综合 {merchant.ratingAvg.toFixed(1)} · 榜单分 {merchant.bayesScore.toFixed(2)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {(
                    [
                      ['口味', reviewData.dimensions.taste],
                      ['性价比', reviewData.dimensions.value],
                      ['环境', reviewData.dimensions.env],
                      ['出餐速度', reviewData.dimensions.speed],
                    ] as const
                  ).map(([label, val]) => (
                    <div key={label} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-fg-muted">{label}</span>
                        <span className="font-num font-medium tabular-nums">{val.toFixed(1)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-current/10">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${(val / 5) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 招牌菜品 */}
            <div className="border-t border-current/10 pt-4">
              <h3 className="text-sm font-semibold">推荐菜品（{merchant.dishes.length}）</h3>
              {merchant.dishes.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {merchant.dishes.map((d) => (
                    <li key={d.id} className="surface-subtle flex items-center justify-between rounded-2xl px-3 py-2 text-sm">
                      <span>{d.name}</span>
                      <div className="flex items-center gap-2">
                        {d.price != null && <span className="font-num text-xs text-fg-muted tabular-nums">¥{d.price}</span>}
                        {canEdit && (
                          <button
                            type="button"
                            className="text-xs text-fg-muted hover:text-danger"
                            onClick={() => removeDish.mutate({ merchantId: merchant.id, dishId: d.id })}
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-fg-muted">还没有补充招牌菜，补充后推荐理由会更具体</p>
              )}

              <form onSubmit={submitDish} className="mt-3 flex gap-2">
                <input
                  className="field h-10 flex-1 py-0 text-sm"
                  placeholder="补充一道推荐菜"
                  maxLength={40}
                  value={dishName}
                  onChange={(e) => setDishName(e.target.value)}
                />
                <input
                  type="number"
                  min={1}
                  max={500}
                  className="field h-10 w-20 py-0 text-sm"
                  placeholder="¥"
                  value={dishPrice}
                  onChange={(e) => setDishPrice(e.target.value)}
                />
                <Button type="submit" className="h-10 shrink-0 px-3 text-sm" loading={addDish.isPending}>
                  添加
                </Button>
              </form>
              {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
            </div>

            {/* 同学评价流 */}
            <div className="border-t border-current/10 pt-4">
              <h3 className="text-sm font-semibold">同学评价（{reviewData?.reviews.length ?? 0}）</h3>
              {reviewData && reviewData.reviews.length > 0 ? (
                <ul className="mt-2.5 space-y-2.5">
                  {reviewData.reviews.map((r) => (
                    <li key={r.id} className="surface-subtle rounded-2xl p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{r.authorNickname}</span>
                          {r.isMine && (
                            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                              我的
                            </span>
                          )}
                        </div>
                        <span className="font-num text-xs font-semibold text-accent tabular-nums">★ {r.scoreOverall}.0</span>
                      </div>
                      {r.content && <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-fg">{r.content}</p>}
                      <div className="mt-2 flex items-center justify-between text-[11px] text-fg-muted">
                        <span className="font-num tabular-nums">
                          口味 {r.scoreTaste} · 性价比 {r.scoreValue} · 环境 {r.scoreEnv} · 速度 {r.scoreSpeed}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleLike.mutate(r.id)}
                          className={`rounded-full px-2 py-0.5 transition-colors ${
                            r.likedByMe ? 'bg-accent/20 font-medium text-accent' : 'hover:text-fg'
                          }`}
                        >
                          赞 {r.likeCount > 0 ? r.likeCount : ''}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-xs text-fg-muted">还没有人评价这家店，来写第一条吧</p>
              )}
            </div>
          </div>
        )}
      </Sheet>

      {merchant && (
        <ReviewSheet
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          merchantId={merchant.id}
          merchantName={merchant.name}
          existing={reviewData?.myReview ?? null}
        />
      )}
    </>
  );
}
