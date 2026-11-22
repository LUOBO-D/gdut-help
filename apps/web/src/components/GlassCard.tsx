import { motion, type HTMLMotionProps } from 'motion/react';
import type { PointerEvent } from 'react';
import { pressable } from '../motion/presets';

type Variant = 'thin' | 'default' | 'thick';

interface GlassCardProps extends HTMLMotionProps<'div'> {
  variant?: Variant;
  /** 可点击的卡片：按压缩放 + 跟随指针的高光 */
  interactive?: boolean;
}

const VARIANT_CLASS: Record<Variant, string> = {
  thin: 'glass-thin',
  default: 'glass',
  thick: 'glass-thick',
};

/** 指针位置写入 CSS 变量，由 .glass-sheen::after 渲染高光（仅鼠标悬停触发，避免触屏滑动强触发布局重算）。 */
function trackSheen(e: PointerEvent<HTMLDivElement>) {
  if (e.pointerType !== 'mouse') return;
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
  el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  el.style.setProperty('--sheen', '1');
}

function hideSheen(e: PointerEvent<HTMLDivElement>) {
  e.currentTarget.style.setProperty('--sheen', '0');
}

export function GlassCard({ variant = 'default', interactive = false, className = '', ...rest }: GlassCardProps) {
  const interactiveProps = interactive
    ? { ...pressable, onPointerMove: trackSheen, onPointerLeave: hideSheen, onPointerCancel: hideSheen }
    : {};
  return (
    <motion.div
      className={`${VARIANT_CLASS[variant]} glass-sheen ${interactive ? 'glass-hover cursor-pointer select-none' : ''} ${className}`}
      {...interactiveProps}
      {...rest}
    />
  );
}
