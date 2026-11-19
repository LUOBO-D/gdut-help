import { motion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';
import { pressable } from '../motion/presets';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children?: ReactNode;
  variant?: 'primary' | 'ghost';
  loading?: boolean;
}

export function Button({ variant = 'primary', loading = false, disabled, className = '', children, ...rest }: ButtonProps) {
  const base =
    'inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-medium transition-[opacity,background-color] disabled:cursor-not-allowed disabled:opacity-50';
  const look =
    variant === 'primary'
      ? 'bg-accent text-accent-fg shadow-[0_6px_20px_-6px_var(--accent)]'
      : 'glass-thin text-fg';
  return (
    <motion.button
      type="button"
      className={`${base} ${look} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...(disabled || loading ? {} : pressable)}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </motion.button>
  );
}

function Spinner() {
  return (
    <span
      className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden="true"
    />
  );
}
