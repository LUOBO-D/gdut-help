import { motion } from 'motion/react';
import { NavLink } from 'react-router';
import { ME, TABS, type NavItem } from '../app/nav';
import { spring } from '../motion/presets';

/** 电脑端（≥1280px）左侧玻璃侧边栏。 */
export function SideNav() {
  return (
    <nav aria-label="主导航" className="fixed inset-y-4 left-4 z-40 hidden w-56 xl:block">
      <div className="glass-thick flex h-full flex-col p-3">
        <div className="px-3 pb-6 pt-3">
          <p className="text-lg font-bold tracking-wide">GDUT Help</p>
          <p className="text-xs text-fg-muted">广工校园生活助手</p>
        </div>
        <ul className="flex flex-1 flex-col gap-1">
          {TABS.map((item) => (
            <SideNavLink key={item.to} item={item} />
          ))}
        </ul>
        <ul>
          <SideNavLink item={ME} />
        </ul>
      </div>
    </nav>
  );
}

function SideNavLink({ item: { to, label, icon: Icon } }: { item: NavItem }) {
  return (
    <li>
      <NavLink to={to} end={to === '/'} className="relative flex items-center gap-3 rounded-2xl px-3 py-2.5">
        {({ isActive }) => (
          <>
            {isActive && (
              <motion.span
                layoutId="side-indicator"
                className="absolute inset-0 rounded-2xl bg-white/25 shadow-[inset_0_1px_0_rgb(255_255_255/0.45)]"
                transition={spring.snappy}
              />
            )}
            <span className={`relative ${isActive ? 'text-accent' : 'text-fg-muted'}`}>
              <Icon size={20} />
            </span>
            <span className={`relative text-sm ${isActive ? 'font-semibold' : 'text-fg-muted'}`}>{label}</span>
          </>
        )}
      </NavLink>
    </li>
  );
}
