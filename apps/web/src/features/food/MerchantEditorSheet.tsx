import {
  DEFAULT_CAMPUS_ID,
  FOOD_TAGS,
  MEAL_LABELS,
  MEAL_TYPES,
  MERCHANT_CATEGORIES,
  MERCHANT_CATEGORY_LABELS,
  merchantInputSchema,
  merchantUpdateSchema,
  type MealType,
  type Merchant,
  type MerchantCategory,
  type SimilarMerchant,
} from '@gduthelp/shared';
import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Chip, Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { ApiError, api } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';
import { toast } from '../../lib/toast-store';
import { useCreateMerchant, useDeleteMerchant, useUpdateMerchant } from './mutations';

/** 大学城校区高频位置快捷填选，减少手机打字 */
const LOCATION_PRESETS = ['一饭', '二饭', '三饭', '四饭', '东区食堂', '西区食堂', '南亭村', 'GOGO新天地'] as const;

interface MerchantEditorSheetProps {
  open: boolean;
  onClose: () => void;
  /** 不为空时为编辑模式 */
  editing?: Merchant | null;
  /** 查重命中后用户点击「查看」 */
  onPickSimilar?: (id: string) => void;
}

interface DraftDish {
  name: string;
  price: string;
}

export function MerchantEditorSheet(props: MerchantEditorSheetProps) {
  if (!props.open) return <Sheet open={false} onClose={props.onClose} title="添一家店">{null}</Sheet>;
  return <MerchantEditorSheetInner key={props.editing?.id ?? 'new'} {...props} />;
}

function MerchantEditorSheetInner({ open, onClose, editing, onPickSimilar }: MerchantEditorSheetProps) {
  const campusId = useAuth((s) => s.user?.campusId ?? DEFAULT_CAMPUS_ID);
  const create = useCreateMerchant();
  const update = useUpdateMerchant();
  const remove = useDeleteMerchant();

  const [name, setName] = useState(() => editing?.name ?? '');
  const [category, setCategory] = useState<MerchantCategory>(() => editing?.category ?? 'canteen');
  const [locationText, setLocationText] = useState(() => editing?.locationText ?? '');
  const [walkMinutes, setWalkMinutes] = useState(() => (editing?.walkMinutes != null ? String(editing.walkMinutes) : ''));
  const [priceAvg, setPriceAvg] = useState(() => (editing ? String(editing.priceAvg) : '16'));
  const [tags, setTags] = useState<string[]>(() => editing?.tags ?? ['饭', '热食']);
  const [openMeals, setOpenMeals] = useState<MealType[]>(() =>
    editing?.openHours?.meals?.length ? editing.openHours.meals : ['lunch', 'dinner'],
  );
  const [openHoursText, setOpenHoursText] = useState(() => editing?.openHours?.text ?? '');
  const [dishes, setDishes] = useState<DraftDish[]>([]);
  const [similarResult, setSimilarResult] = useState<{ query: string; items: SimilarMerchant[] }>({ query: '', items: [] });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const similar = trimmedName.length >= 2 && similarResult.query === trimmedName ? similarResult.items : [];

  // 实时查重（输入店名 2 字以上，300ms 防抖）
  useEffect(() => {
    if (trimmedName.length < 2) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      const qs = new URLSearchParams({ name: trimmedName, campusId });
      if (locationText.trim()) qs.set('locationText', locationText.trim());
      if (editing) qs.set('excludeId', editing.id);
      api<SimilarMerchant[]>(`/merchants/similar?${qs.toString()}`, { signal: ctrl.signal })
        .then((items) => setSimilarResult({ query: trimmedName, items }))
        .catch(() => undefined);
    }, 300);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [trimmedName, locationText, campusId, editing]);

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  };

  const toggleMeal = (meal: MealType) => {
    setOpenMeals((prev) => {
      if (prev.includes(meal)) return prev.length > 1 ? prev.filter((x) => x !== meal) : prev;
      return [...prev, meal];
    });
  };

  const submit = () => {
    setError(null);
    const payload = {
      name,
      category,
      campusId: editing?.campusId ?? campusId,
      locationText,
      walkMinutes: walkMinutes.trim() ? Number(walkMinutes) : null,
      priceAvg: Number(priceAvg),
      tags,
      openMeals,
      openHoursText: openHoursText.trim() || null,
    };

    if (editing) {
      const parsed = merchantUpdateSchema.safeParse(payload);
      if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? '请检查填写内容');
      update.mutate(
        { id: editing.id, data: parsed.data },
        {
          onSuccess: () => {
            toast.success('已保存商家修改');
            onClose();
          },
          onError: (err) => setError(err instanceof ApiError ? err.message : '保存失败'),
        },
      );
      return;
    }

    const parsedDishes = dishes
      .filter((d) => d.name.trim())
      .map((d) => ({
        name: d.name.trim(),
        price: d.price.trim() ? Number(d.price) : null,
        tags: [],
      }));

    const parsed = merchantInputSchema.safeParse({
      ...payload,
      ...(parsedDishes.length ? { dishes: parsedDishes } : {}),
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? '请检查填写内容');
    create.mutate(parsed.data, {
      onSuccess: (created) => {
        toast.success(created.status === 'approved' ? `已上架「${created.name}」` : `已提交「${created.name}」，等待审核`);
        onClose();
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : '提交失败'),
    });
  };

  const handleDelete = () => {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    remove.mutate(editing.id, {
      onSuccess: () => {
        toast.info(`已删除「${editing.name}」`);
        onClose();
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : '删除失败'),
    });
  };

  const busy = create.isPending || update.isPending;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? '编辑商家' : '添一家店'}
      footer={
        <div className="space-y-2">
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            {editing && (
              <Button variant="ghost" className="shrink-0 text-danger" loading={remove.isPending} onClick={handleDelete}>
                {confirmDelete ? '再点一次确认删除' : '删除'}
              </Button>
            )}
            <Button className="flex-1" loading={busy} onClick={submit}>
              {editing ? '保存修改' : '提交并上架'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="商家 / 档口名称">
          <input
            className="field"
            placeholder="如：二饭三楼老广煲仔饭"
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={!editing}
          />
        </Field>

        {similar.length > 0 && (
          <div className="glass-thin rounded-2xl p-3 text-sm">
            <p className="font-medium text-accent">发现相似商家，是否是这家？</p>
            <ul className="mt-2 space-y-1.5">
              {similar.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="truncate text-fg-muted">
                      {s.locationText} · ¥{s.priceAvg} · {MERCHANT_CATEGORY_LABELS[s.category]}
                    </p>
                  </div>
                  {onPickSimilar && (
                    <button
                      type="button"
                      className="shrink-0 rounded-full border border-current/25 px-2.5 py-1 text-xs"
                      onClick={() => onPickSimilar(s.id)}
                    >
                      查看
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm text-fg-muted">分类</p>
          <div className="flex flex-wrap gap-2">
            {MERCHANT_CATEGORIES.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                {MERCHANT_CATEGORY_LABELS[c]}
              </Chip>
            ))}
          </div>
        </div>

        <Field label="位置描述">
          <input
            className="field"
            placeholder="如：二饭三楼靠窗 / 南亭村商业街"
            maxLength={80}
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
          />
          <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
            {LOCATION_PRESETS.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setLocationText(loc)}
                className="surface-subtle surface-subtle-hover shrink-0 rounded-full px-2.5 py-1 text-xs text-fg-muted hover:text-fg"
              >
                {loc}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="人均（元）">
            <input
              type="number"
              min={1}
              max={500}
              className="field"
              value={priceAvg}
              onChange={(e) => setPriceAvg(e.target.value)}
            />
          </Field>
          <Field label="步行分钟（选填）" hint="从教学区出发估算">
            <input
              type="number"
              min={1}
              max={60}
              className="field"
              placeholder="如 6"
              value={walkMinutes}
              onChange={(e) => setWalkMinutes(e.target.value)}
            />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-sm text-fg-muted">口味与特点（至少选 1 个）</p>
          <div className="flex flex-wrap gap-2">
            {FOOD_TAGS.map((tag) => (
              <Chip key={tag} active={tags.includes(tag)} onClick={() => toggleTag(tag)}>
                {tag}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-2 text-sm text-fg-muted">供应时段</p>
            <div className="flex gap-2">
              {MEAL_TYPES.map((m) => (
                <Chip key={m} active={openMeals.includes(m)} onClick={() => toggleMeal(m)}>
                  {MEAL_LABELS[m]}
                </Chip>
              ))}
            </div>
          </div>
          <Field label="营业时间（选填）">
            <input
              className="field"
              placeholder="如 10:30–21:00"
              maxLength={40}
              value={openHoursText}
              onChange={(e) => setOpenHoursText(e.target.value)}
            />
          </Field>
        </div>

        {!editing && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm text-fg-muted">招牌菜品（选填，让推荐理由更具体）</p>
              {dishes.length < 5 && (
                <button
                  type="button"
                  className="text-xs font-medium text-accent"
                  onClick={() => setDishes((prev) => [...prev, { name: '', price: '' }])}
                >
                  + 加一道菜
                </button>
              )}
            </div>
            {dishes.length > 0 && (
              <div className="space-y-2">
                {dishes.map((d, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className="field h-10 flex-1 py-0 text-sm"
                      placeholder="菜名，如腊味煲仔饭"
                      value={d.name}
                      maxLength={40}
                      onChange={(e) =>
                        setDishes((prev) => prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))
                      }
                    />
                    <input
                      type="number"
                      min={1}
                      max={500}
                      className="field h-10 w-20 py-0 text-sm"
                      placeholder="¥"
                      value={d.price}
                      onChange={(e) =>
                        setDishes((prev) => prev.map((x, idx) => (idx === i ? { ...x, price: e.target.value } : x)))
                      }
                    />
                    <button
                      type="button"
                      className="px-2 text-xs text-fg-muted"
                      onClick={() => setDishes((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
