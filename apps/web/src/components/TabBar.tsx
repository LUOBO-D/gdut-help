import { motion } from 'motion/react';
import { NavLink } from 'react-router';
import { TABS } from '../app/nav';
import { spring } from '../motion/presets';

/** 手机端底部标签栏：厚玻璃 + 跟随选中项滑动的液态指示块。 */
export function TabBar() {
  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),12px)] xl:hidden"
    >
      <ul className="glass-thick mx-auto flex max-w-md items-stretch justify-between p-1.5">
        {TABS.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink to={to} end={to === '/'} className="relative flex flex-col items-center gap-0.5 rounded-[18px] py-2">
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="tab-indicator"
                      className="absolute inset-0 rounded-[18px] bg-white/30 shadow-[inset_0_1px_0_rgb(255_255_255/0.5)]"
                      transition={spring.snappy}
                    />
                  )}
                  <motion.span
                    className={`relative ${isActive ? 'text-accent' : 'text-fg-muted'}`}
                    animate={{ scale: isActive ? 1.08 : 1, y: isActive ? -1 : 0 }}
                    transition={spring.bouncy}
                  >
                    <Icon size={22} />
                  </motion.span>
                  <span className={`relative text-[11px] ${isActive ? 'font-semibold text-fg' : 'text-fg-muted'}`}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
