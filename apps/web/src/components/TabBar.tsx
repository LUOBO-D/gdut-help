import { dayOffset } from '@gduthelp/shared';
import { motion } from 'motion/react';
import { Link, useLocation } from 'react-router';
import { isNavItemActive, TABS } from '../app/nav';
import { useTodos } from '../lib/queries';
import { useNow } from '../lib/use-now';
import { spring } from '../motion/presets';

/** 手机端底部标签栏：5 大简洁主分类 + 厚玻璃悬浮胶囊 + 滑动液态指示块。 */
export function TabBar() {
  const { pathname } = useLocation();
  const { data: todos = [] } = useTodos();
  const now = useNow(60_000);
  const hasUrgentTodo = todos.some((t) => !t.completedAt && t.dueAt && dayOffset(new Date(t.dueAt), now) <= 0);

  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),10px)] xl:hidden"
    >
      <ul className="glass-thick mx-auto flex max-w-md items-stretch justify-between p-1.5">
        {TABS.map((item) => {
          const { to, label, icon: Icon } = item;
          const isActive = isNavItemActive(item, pathname);
          return (
            <li key={to} className="min-w-0 flex-1">
              <Link
                to={to}
                aria-current={isActive ? 'page' : undefined}
                className="relative flex flex-col items-center gap-0.5 rounded-[18px] py-2"
              >
                {isActive && (
                  <motion.span
                    layoutId="tab-indicator"
                    className="absolute inset-0 rounded-[18px] bg-white/30 shadow-[inset_0_1px_0_rgb(255_255_255/0.5)]"
                    transition={spring.snappy}
                  />
                )}
                <motion.span
                  className={`relative ${isActive ? 'text-accent' : 'text-fg-muted'}`}
                  animate={{ scale: isActive ? 1.06 : 1, y: isActive ? -1 : 0 }}
                  transition={spring.bouncy}
                >
                  <Icon size={22} />
                  {to === '/todo' && hasUrgentTodo && (
                    <span
                      className="absolute -right-1 -top-0.5 size-2 rounded-full bg-accent ring-2 ring-white/40"
                      aria-label="有今日截止或逾期待办"
                    />
                  )}
                </motion.span>
                <span
                  className={`relative whitespace-nowrap text-[11px] leading-tight ${
                    isActive ? 'font-semibold text-fg' : 'text-fg-muted'
                  }`}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
