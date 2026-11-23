import { dayOffset } from '@gduthelp/shared';
import { motion } from 'motion/react';
import { NavLink } from 'react-router';
import { TABS } from '../app/nav';
import { useTodos } from '../lib/queries';
import { useNow } from '../lib/use-now';
import { spring } from '../motion/presets';

/** 手机端底部标签栏：厚玻璃 + 跟随选中项滑动的液态指示块 + 轻提示圆点。 */
export function TabBar() {
  const { data: todos = [] } = useTodos();
  const now = useNow(60_000);
  const hasUrgentTodo = todos.some((t) => !t.completedAt && t.dueAt && dayOffset(new Date(t.dueAt), now) <= 0);

  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-40 px-2 pb-[max(env(safe-area-inset-bottom),10px)] xl:hidden"
    >
      <ul className="glass-thick mx-auto flex max-w-lg items-stretch justify-between p-1">
        {TABS.map(({ to, label, icon: Icon }) => (
          <li key={to} className="min-w-0 flex-1">
            <NavLink to={to} end={to === '/'} className="relative flex flex-col items-center gap-0.5 rounded-[16px] py-2">
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="tab-indicator"
                      className="absolute inset-0 rounded-[16px] bg-white/30 shadow-[inset_0_1px_0_rgb(255_255_255/0.5)]"
                      transition={spring.snappy}
                    />
                  )}
                  <motion.span
                    className={`relative ${isActive ? 'text-accent' : 'text-fg-muted'}`}
                    animate={{ scale: isActive ? 1.06 : 1, y: isActive ? -1 : 0 }}
                    transition={spring.bouncy}
                  >
                    <Icon size={20} />
                    {to === '/todo' && hasUrgentTodo && (
                      <span
                        className="absolute -right-1 -top-0.5 size-2 rounded-full bg-accent ring-2 ring-white/40"
                        aria-label="有今日截止或逾期待办"
                      />
                    )}
                  </motion.span>
                  <span
                    className={`relative whitespace-nowrap text-[10px] leading-tight ${
                      isActive ? 'font-semibold text-fg' : 'text-fg-muted'
                    }`}
                  >
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
