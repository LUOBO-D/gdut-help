import {
  MERCHANT_CATEGORY_LABELS,
  MERCHANT_STATUSES,
  MERCHANT_STATUS_LABELS,
  type Merchant,
  type MerchantStatus,
} from '@gduthelp/shared';
import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Field';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { SkeletonBlock } from '../../components/Skeleton';
import { ArrowLeftIcon, PinIcon, PlusIcon } from '../../components/icons';
import { useAuth } from '../../lib/auth-store';
import { useAdminMerchants } from '../../lib/queries';
import { toast } from '../../lib/toast-store';
import { MerchantEditorSheet } from '../food/MerchantEditorSheet';
import { useAdminMerchantAction, useSeedHemcMerchants } from '../food/mutations';

export function AdminPage() {
  const user = useAuth((s) => s.user);
  const [status, setStatus] = useState<MerchantStatus | undefined>(undefined);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Merchant | null>(null);

  const list = useAdminMerchants(status);
  const act = useAdminMerchantAction();
  const seed = useSeedHemcMerchants();

  if (user && user.role !== 'admin') return <Navigate to="/" replace />;

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (m: Merchant) => {
    setEditing(m);
    setEditorOpen(true);
  };

  const runSeed = () => {
    seed.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(r.created ? `已导入 ${r.created} 家大学城默认商家（跳过 ${r.skipped} 家已有）` : '大学城默认商家均已存在'),
      onError: () => toast.error('导入默认商家失败'),
    });
  };

  return (
    <>
      <PageHeader
        title="管理后台"
        subtitle="商家审核、状态管理与编辑"
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/me" className="glass-thin inline-flex h-10 items-center gap-1 rounded-2xl px-3 text-sm">
              <ArrowLeftIcon size={16} />
              返回
            </Link>
            <Button variant="ghost" className="h-10 px-3 text-sm" loading={seed.isPending} onClick={runSeed}>
              导入大学城种子店
            </Button>
            <Button className="h-10 gap-1 px-3 text-sm" onClick={openCreate}>
              <PlusIcon size={16} />
              新增商家
            </Button>
          </div>
        }
      />

      <GlassCard className="p-5">
        <div className="flex flex-wrap gap-2">
          <Chip active={status === undefined} onClick={() => setStatus(undefined)} className="text-xs">
            全部
          </Chip>
          {MERCHANT_STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)} className="text-xs">
              {MERCHANT_STATUS_LABELS[s]}
            </Chip>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {list.isLoading && (
            <>
              <SkeletonBlock className="h-28" />
              <SkeletonBlock className="h-28" />
            </>
          )}
          {!list.isLoading && (list.data?.length ?? 0) === 0 && (
            <p className="py-6 text-center text-sm text-fg-muted">该分类下暂无商家</p>
          )}
          {list.data?.map((m) => (
            <div key={m.id} className="surface-subtle rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold">{m.name}</h3>
                    <span className="rounded-full bg-current/10 px-2 py-0.5 text-[11px]">
                      {MERCHANT_STATUS_LABELS[m.status]}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
                    <PinIcon size={13} className="shrink-0" />
                    <span>
                      {m.locationText} · {MERCHANT_CATEGORY_LABELS[m.category]} · 人均 ¥{m.priceAvg}
                      {m.walkMinutes != null ? ` · 步行 ${m.walkMinutes} 分钟` : ''}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.tags.map((t) => (
                      <span key={t} className="rounded-full border border-current/15 px-2 py-0.5 text-[11px] text-fg-muted">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-current/10 pt-3">
                {m.status !== 'approved' && (
                  <Button
                    className="h-8 px-3 text-xs"
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate(
                        { id: m.id, action: 'approve' },
                        { onSuccess: () => toast.success(`已上架「${m.name}」`) },
                      )
                    }
                  >
                    通过上架
                  </Button>
                )}
                {m.status === 'pending' && (
                  <Button
                    variant="ghost"
                    className="h-8 px-3 text-xs text-danger"
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate(
                        { id: m.id, action: 'reject' },
                        { onSuccess: () => toast.info(`已拒绝「${m.name}」`) },
                      )
                    }
                  >
                    拒绝
                  </Button>
                )}
                {m.status === 'approved' && (
                  <Button
                    variant="ghost"
                    className="h-8 px-3 text-xs text-fg-muted"
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate(
                        { id: m.id, action: 'close' },
                        { onSuccess: () => toast.info(`已标记「${m.name}」关店`) },
                      )
                    }
                  >
                    标记关店
                  </Button>
                )}
                <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => openEdit(m)}>
                  编辑
                </Button>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <MerchantEditorSheet open={editorOpen} onClose={() => setEditorOpen(false)} editing={editing} />
    </>
  );
}
