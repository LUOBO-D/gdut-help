import { AnimatePresence, motion } from 'motion/react';
import { useToastStore } from '../lib/toast-store';
import { spring } from '../motion/presets';

/** 极简悬浮玻璃轻提示：同一时间最多显示一条，不打断当前阅读与操作。 */
export function ToastViewport() {
  const current = useToastStore((s) => s.current);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-50 flex justify-center px-4 xl:inset-x-auto xl:bottom-8 xl:right-8"
    >
      <AnimatePresence>
        {current && (
          <motion.button
            key={current.id}
            type="button"
            onClick={dismiss}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={spring.snappy}
            className="glass-thick pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-full! px-4 py-2.5 text-sm font-medium text-fg shadow-xl"
          >
            <span
              className={`size-2 shrink-0 rounded-full ${
                current.tone === 'error' ? 'bg-danger' : 'bg-accent'
              }`}
              aria-hidden="true"
            />
            <span className="truncate">{current.message}</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
