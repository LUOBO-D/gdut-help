import type { ReactNode } from 'react';

/** 表单项：标签 + 控件 + 可选的说明 */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-fg-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-fg-muted">{hint}</span>}
    </label>
  );
}

/** 一组可单选/多选的小圆角按钮 */
export function Chip({
  active,
  onClick,
  children,
  className = '',
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active ? 'border-transparent bg-accent text-accent-fg' : 'border-current/20 text-fg'
      } ${className}`}
    >
      {children}
    </button>
  );
}
