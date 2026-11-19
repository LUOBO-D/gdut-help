import { motion } from 'motion/react';
import { spring } from '../../motion/presets';

/** 圆形勾选框：完成时弹一下并画出对勾 */
export function TodoCheck({ done, onToggle, label }: { done: boolean; onToggle: () => void; label: string }) {
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `取消完成：${label}` : `完成：${label}`}
      onClick={(e) => {
        e.stopPropagation();
        navigator.vibrate?.(10);
        onToggle();
      }}
      whileTap={{ scale: 0.85 }}
      animate={{ scale: done ? [1, 1.25, 1] : 1 }}
      transition={spring.bouncy}
      className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${done ? 'border-accent bg-accent text-accent-fg' : 'border-current/40'}`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <motion.path d="m6 12 4 4 8-9" initial={false} animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }} transition={{ duration: 0.25 }} />
      </svg>
    </motion.button>
  );
}
