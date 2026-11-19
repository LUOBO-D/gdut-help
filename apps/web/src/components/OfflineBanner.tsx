import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../lib/auth-store';
import { useOnline } from '../lib/use-online';

/** 断网时顶部提示：显示的是缓存数据，修改暂时无法保存 */
export function OfflineBanner() {
  const online = useOnline();
  const offlineSession = useAuth((s) => s.offline);
  const show = !online || offlineSession;
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
          {online ? '正在重新连接…' : '离线中：显示的是上次的数据，修改暂时无法保存'}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
