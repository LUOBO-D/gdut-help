import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 pb-4 pt-1">
      <div className="min-w-0">
        <h1 className="truncate text-[24px] font-bold leading-tight tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 truncate text-xs text-fg-muted sm:text-sm">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
