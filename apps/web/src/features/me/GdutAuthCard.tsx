import { DEFAULT_CREDIT_PLAN } from '@gduthelp/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { Switch } from '../../components/Switch';
import {
  connectGdutAuth,
  disconnectGdutAuth,
  syncAllFromGdut,
  useGdutAuthStore,
} from '../../lib/gdut-auth';
import { isNative } from '../../lib/platform';
import { useCreditPlan } from '../../lib/queries';
import { formatRelativeSyncTime } from '../../lib/scores-sync';
import { toast } from '../../lib/toast-store';

/**
 * 「我的 → 广工统一认证」总控卡片：
 * 一次登录广工统一身份认证，全局复用于课表、考试、绩点、学分、空教室、二课与公选课目录；
 * 自动开启持久 Cookie 保护、CAS 静默无感续期与前台 15 分钟保活，最大程度减少重复认证。
 */
export function GdutAuthCard() {
  const qc = useQueryClient();
  const creditPlan = useCreditPlan().data ?? DEFAULT_CREDIT_PLAN;
  const { status, lastVerifiedAt, lastSyncAllAt, autoClearAfterSync, setAutoClearAfterSync } = useGdutAuthStore();
  const [connecting, setConnecting] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleConnect = async () => {
    if (!isNative) {
      toast.info('请在安卓 App 内完成广工统一认证（本机直连学校，不上传密码）');
      return;
    }
    setConnecting(true);
    try {
      toast.info('登录时建议勾选学校页面的「免登录 / 记住登录」，可长时间免重复认证');
      const ok = await connectGdutAuth();
      if (ok) {
        toast.success('广工统一认证已连接，全应用教务功能均可直接复用');
      } else {
        toast.info('已取消广工统一认证');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '打开统一认证页失败');
    } finally {
      setConnecting(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    const res = await syncAllFromGdut(qc, creditPlan);
    setSyncingAll(false);
    if (res.ok) {
      toast.success(res.summary);
    } else if (!res.cancelled) {
      toast.error(res.summary);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await disconnectGdutAuth();
    setDisconnecting(false);
    toast.success('已清除本机保存的广工统一认证会话');
  };

  const badgeText =
    status === 'connected'
      ? autoClearAfterSync
        ? '已连接 · 用完即焚模式'
        : '已连接 · 持久保活中'
      : status === 'expired'
        ? '会话需续期'
        : autoClearAfterSync
          ? '未留存会话（推荐）'
          : '未连接';
  const dotColor =
    status === 'connected' ? 'bg-emerald-500' : status === 'expired' ? 'bg-amber-500' : 'bg-current/30';

  return (
    <GlassCard className="space-y-3.5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold">广工统一认证中心</h3>
            <span className="surface-subtle inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium text-fg-muted">
              <span className={`size-1.5 rounded-full ${dotColor}`} aria-hidden />
              {badgeText}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            本机直连广工教务同步课表、考试、绩点、学分与空教室，账号密码与学校 Cookie 绝不上传至 GDUT Help 服务器。
          </p>
        </div>
      </div>

      {(lastVerifiedAt || lastSyncAllAt) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-muted">
          {lastVerifiedAt && <span>会话校验：{formatRelativeSyncTime(lastVerifiedAt)}</span>}
          {lastSyncAllAt && <span>全量同步：{formatRelativeSyncTime(lastSyncAllAt)}</span>}
        </div>
      )}

      {isNative ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="h-9 px-3.5 text-xs"
              loading={connecting}
              onClick={() => void handleConnect()}
            >
              {status === 'connected' ? '重新认证 / 续期' : '连接广工认证'}
            </Button>
            <Button
              variant="ghost"
              className="h-9 px-3.5 text-xs"
              loading={syncingAll}
              onClick={() => void handleSyncAll()}
            >
              一键同步全部学业数据
            </Button>
            <Button
              variant="ghost"
              className="h-9 px-3 text-xs text-danger"
              loading={disconnecting}
              onClick={() => void handleDisconnect()}
            >
              清除本地 Cookie
            </Button>
          </div>
          <div className="border-t border-current/10 pt-2">
            <Switch
              checked={autoClearAfterSync}
              label="同步后自动清除教务会话（用完即焚）"
              description={
                autoClearAfterSync
                  ? '已开启：全量同步完成后立刻清空本机学校 Cookie，不持久保留教务登录态'
                  : '已关闭：保留 14 天持久会话与 CAS 静默续期，减少重复认证'
              }
              onChange={(checked) => {
                setAutoClearAfterSync(checked);
                if (checked) {
                  void disconnectGdutAuth({ keepSyncMeta: true });
                  toast.success('已开启用完即焚，并清空当前本机教务 Cookie');
                } else {
                  toast.info('已切换为持久会话模式，下次认证后自动保活');
                }
              }}
            />
          </div>
        </>
      ) : (
        <p className="surface-subtle rounded-2xl px-3.5 py-2.5 text-xs text-fg-muted">
          浏览器网页端受跨域限制，请在安卓 App 的「我的 → 广工统一认证」一键同步；网页端各模块仍支持粘贴/表格导入。
        </p>
      )}
    </GlassCard>
  );
}
