import { dayOffset } from '@gduthelp/shared';
import { motion } from 'motion/react';
import { NavLink } from 'react-router';
import { ME, TABS, type NavItem } from '../app/nav';
import { useTodos } from '../lib/queries';
import { useNow } from '../lib/use-now';
import { spring } from '../motion/presets';

/** 电脑端（≥1280px）左侧玻璃侧边栏。 */
export function SideNav() {
  const { data: todos = [] } = useTodos();
  const now = useNow(60_000);
  const urgentCount = todos.filter((t) => !t.completedAt && t.dueAt && dayOffset(new Date(t.dueAt), now) <= 0).length;

  return (
    <nav aria-label="主导航" className="fixed inset-y-4 left-4 z-40 hidden w-56 xl:block">
      <div className="glass-thick flex h-full flex-col p-3">
        <div className="px-3 pb-6 pt-3">
          <p className="text-lg font-bold tracking-tight">GDUT Help</p>
          <p className="mt-0.5 text-xs text-fg-muted">广工校园生活助手</p>
        </div>
        <ul className="flex flex-1 flex-col gap-1">
          {TABS.map((item, idx) => (
            <SideNavLink
              key={item.to}
              item={item}
              shortcut={String(idx + 1)}
              badge={item.to === '/todo' && urgentCount > 0 ? urgentCount : undefined}
            />
          ))}
        </ul>
        <div className="border-t border-current/10 pt-2">
          <ul>
            <SideNavLink item={ME} shortcut="0" />
          </ul>
          <p className="mt-2 px-3 text-[11px] text-fg-muted opacity-75">快捷键：1–5 切页 · N 新建待办</p>
        </div>
      </div>
    </nav>
  );
}

function SideNavLink({ item: { to, label, icon: Icon }, shortcut, badge }: { item: NavItem; shortcut: string; badge?: number }) {
  return (
    <li>
      <NavLink
        to={to}
        end={to === '/'}
        className="surface-subtle-hover group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors"
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <motion.span
                layoutId="side-indicator"
                className="absolute inset-0 rounded-2xl bg-white/25 shadow-[inset_0_1px_0_rgb(255_255_255/0.45)]"
                transition={spring.snappy}
              />
            )}
            <span className={`relative ${isActive ? 'text-accent' : 'text-fg-muted group-hover:text-fg'}`}>
              <Icon size={20} />
            </span>
            <span className={`relative flex-1 text-sm ${isActive ? 'font-semibold text-fg' : 'text-fg-muted group-hover:text-fg'}`}>
              {label}
            </span>
            {badge !== undefined ? (
              <span className="relative rounded-full bg-accent px-1.5 py-0.5 font-num text-[11px] font-semibold leading-none text-accent-fg tabular-nums">
                {badge}
              </span>
            ) : (
              <kbd className="relative font-num text-[11px] text-fg-muted opacity-0 transition-opacity group-hover:opacity-60">
                {shortcut}
              </kbd>
            )}
          </>
        )}
      </NavLink>
    </li>
  );
}
