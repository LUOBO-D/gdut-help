import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { pushSheet } from '../lib/sheet-stack';
import { spring } from '../motion/presets';
import { XIcon } from './icons';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** 底部固定的操作区（保存、删除按钮） */
  footer?: ReactNode;
}

/**
 * 弹层：手机上从底部滑出，可以按住顶部把手下拉关闭；电脑上居中显示。
 * Esc 关闭，打开时锁定页面滚动。
 */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const drag = useDragControls();

  useEffect(() => {
    if (!open) return;
    const pop = pushSheet(onClose);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      pop();
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center xl:items-center">
          <motion.div
            className="absolute inset-0 bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="glass-thick relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-b-none! xl:rounded-b-[var(--radius-card)]!"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={spring.page}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => (info.offset.y > 120 || info.velocity.y > 600) && onClose()}
          >
            <div
              className="flex shrink-0 cursor-grab touch-none items-center justify-between px-5 pb-2 pt-3"
              onPointerDown={(e) => drag.start(e)}
            >
              <span className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-current opacity-25 xl:hidden" />
              <h2 className="pt-2 text-lg font-semibold">{title}</h2>
              <button type="button" onClick={onClose} className="-mr-2 mt-1 rounded-full p-2 text-fg-muted" aria-label="关闭">
                <XIcon size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
            {footer && <div className="shrink-0 border-t border-current/10 px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
