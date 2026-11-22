import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../lib/auth-store';
import { useOfflineQueue } from '../lib/offline-queue';
import { useOnline } from '../lib/use-online';

/** 断网或存在待同步离线操作时顶部轻提示 */
export function OfflineBanner() {
  const online = useOnline();
  const offlineSession = useAuth((s) => s.offline);
  const pendingCount = useOfflineQueue((s) => s.pendingCount);
  const syncing = useOfflineQueue((s) => s.syncing);
  const show = !online || offlineSession || syncing || pendingCount > 0;

  let text = '离线中：可正常记待办与勾选，联网后自动同步';
  if (!online) {
    text = pendingCount > 0 ? `离线中：已有 ${pendingCount} 条待办操作待同步` : '离线中：可正常记待办与勾选，联网后自动同步';
  } else if (syncing) {
    text = `正在同步 ${pendingCount || ''} 条离线操作…`;
  } else if (offlineSession) {
    text = '正在重新连接…';
  } else if (pendingCount > 0) {
    text = `有 ${pendingCount} 条离线操作等待同步`;
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          className="glass-thick fixed inset-x-3 top-[max(env(safe-area-inset-top),8px)] z-50 mx-auto max-w-md rounded-full! px-4 py-2 text-center text-sm"
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
        >
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
