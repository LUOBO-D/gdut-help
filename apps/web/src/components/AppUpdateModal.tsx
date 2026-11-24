import { formatBundleSize, parseReleaseNotes } from '@gduthelp/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useOtaStore } from '../lib/ota-store';
import { pushSheet } from '../lib/sheet-stack';
import { toast } from '../lib/toast-store';
import { spring } from '../motion/presets';
import { Button } from './Button';
import { DownloadCloudIcon, XIcon } from './icons';

function formatPublishedDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 新版本更新说明弹窗：
 * 检测到新版本后向用户清晰展示版本号、体积、更新方式与分条更新说明，
 * 由用户自行选择「立即更新」或「暂不更新」，不再后台静默切换。
 */
export function AppUpdateModal() {
  const available = useOtaStore((s) => s.available);
  const open = useOtaStore((s) => s.open);
  const phase = useOtaStore((s) => s.phase);
  const progress = useOtaStore((s) => s.progress);
  const error = useOtaStore((s) => s.error);
  const dismissCurrent = useOtaStore((s) => s.dismissCurrent);

  const busy = phase === 'downloading' || phase === 'applying';
  const forced = Boolean(available?.forceUpgrade);
  const visible = Boolean(open && available);

  const handleDefer = useCallback(() => {
    if (busy || forced) return;
    dismissCurrent();
    toast.info('已暂缓更新，可随时在「我的 → 检查更新」升级');
  }, [busy, forced, dismissCurrent]);

  const handleConfirm = useCallback(async () => {
    if (busy) return;
    const { applyPendingOtaUpdate } = await import('../lib/ota-updater');
    await applyPendingOtaUpdate();
  }, [busy]);

  useEffect(() => {
    if (!visible) return;
    const pop = pushSheet(() => {
      if (!busy && !forced) handleDefer();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy && !forced) handleDefer();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      pop();
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [visible, busy, forced, handleDefer]);

  if (typeof document === 'undefined') return null;

  const latest = available?.latest;
  const noteLines = latest ? parseReleaseNotes(latest.notes) : [];
  const sizeLabel = formatBundleSize(latest?.sizeBytes);
  const publishedDate = latest ? formatPublishedDate(latest.publishedAt) : null;
  const needsNative = available?.needsNativeUpgrade ?? false;

  const primaryLabel = needsNative
    ? available?.apkUrl
      ? '前往下载新版'
      : '查看获取说明'
    : phase === 'downloading'
      ? progress > 0
        ? `下载中 ${progress}%`
        : '正在下载…'
      : phase === 'applying'
        ? '正在切换新版本…'
        : phase === 'error'
          ? '重试更新'
          : '立即更新';

  return createPortal(
    <AnimatePresence>
      {visible && available && latest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (!busy && !forced) handleDefer();
            }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-update-modal-title"
            className="glass-thick relative w-full max-w-md overflow-hidden rounded-[28px]! p-5 sm:p-6"
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={spring.snappy}
          >
            {/* 顶部柔和环境光 */}
            <div
              className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full opacity-25 blur-2xl"
              style={{ background: 'var(--accent)' }}
              aria-hidden="true"
            />

            <div className="relative flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent">
                  <DownloadCloudIcon size={22} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-accent-fg">
                      发现新版本
                    </span>
                    {publishedDate && <span className="text-xs text-fg-muted">{publishedDate}</span>}
                  </div>
                  <h2 id="app-update-modal-title" className="mt-1 text-xl font-bold tracking-tight tabular-nums">
                    v{latest.version}
                  </h2>
                </div>
              </div>

              {!busy && !forced && (
                <button
                  type="button"
                  onClick={handleDefer}
                  className="-mr-1 -mt-1 rounded-full p-2 text-fg-muted transition-colors hover:bg-current/10"
                  aria-label="暂不更新"
                >
                  <XIcon size={18} />
                </button>
              )}
            </div>

            {/* 版本过渡与更新类型说明 */}
            <div className="relative mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              <span className="rounded-full bg-current/8 px-2.5 py-1 font-medium tabular-nums">
                当前 v{available.currentVersion} → v{latest.version}
              </span>
              {forced ? (
                <span className="rounded-full bg-danger/15 px-2.5 py-1 font-semibold text-danger">
                  安全强制升级 · 请卸载旧版并安装正式安全版
                </span>
              ) : needsNative ? (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-1 font-medium text-amber-600 dark:text-amber-300">
                  含底层升级 · 需下载新版安装包
                </span>
              ) : (
                <span className="rounded-full bg-accent/12 px-2.5 py-1 font-medium text-accent">
                  在线轻更新{sizeLabel ? ` · ${sizeLabel}` : ''} · 免重装
                </span>
              )}
            </div>

            {/* 更新说明列表 */}
            <div className="glass-thin relative mt-4 rounded-2xl! p-4">
              <p className="text-xs font-semibold tracking-wide text-fg-muted">本次更新内容</p>
              <ul className="mt-2.5 max-h-[34dvh] space-y-2 overflow-y-auto overscroll-contain pr-1 text-sm leading-relaxed">
                {(noteLines.length > 0 ? noteLines : ['优化界面体验与细节问题']).map((line, index) => (
                  <li key={`${index}-${line}`} className="flex items-start gap-2.5">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    <span className="min-w-0 flex-1 break-words">{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 下载与校验进度条 */}
            {(phase === 'downloading' || phase === 'applying') && (
              <div className="mt-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-fg-muted">
                  <span>{phase === 'applying' ? 'SHA-256 校验通过，正在切换新版本…' : '正在安全下载更新包…'}</span>
                  <span className="font-medium tabular-nums">{progress > 0 ? `${progress}%` : '连接中'}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-current/12">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    initial={{ width: '8%' }}
                    animate={{ width: `${Math.max(8, progress)}%` }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                  />
                </div>
              </div>
            )}

            {/* 失败提示 */}
            {phase === 'error' && error && (
              <p className="mt-3.5 rounded-2xl bg-danger/12 px-3.5 py-2.5 text-xs leading-relaxed text-danger">
                {error}
              </p>
            )}

            {/* 用户自主选择操作区 */}
            <div className="mt-5 flex items-center gap-2.5">
              {!forced && (
                <Button
                  variant="ghost"
                  className="h-11 flex-1 text-sm"
                  disabled={busy}
                  onClick={handleDefer}
                >
                  暂不更新
                </Button>
              )}
              <Button
                variant="primary"
                className={forced ? 'h-11 w-full text-sm' : 'h-11 flex-[1.35] text-sm'}
                loading={busy}
                onClick={() => void handleConfirm()}
              >
                {forced ? '立即下载正式安全版' : primaryLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
