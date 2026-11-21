import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useLocation, useOutlet } from 'react-router';
import { ErrorBoundary, PageErrorFallback } from '../components/ErrorBoundary';
import { SideNav } from '../components/SideNav';
import { TabBar } from '../components/TabBar';
import { useAppShortcuts } from '../lib/use-shortcuts';
import { pageVariants, spring } from '../motion/presets';
import { navIndex } from './nav';

/** 登录后的主框架：手机底部标签栏 / 电脑侧边栏，页面按标签顺序左右滑动切换。 */
export function AppShell() {
  useAppShortcuts();
  const { pathname } = useLocation();
  const index = navIndex(pathname);
  // 记住上一个标签的序号以决定滑动方向（渲染期间调整 state 是 React 推荐的派生写法）
  const [nav, setNav] = useState({ index, direction: 0 });
  if (nav.index !== index) setNav({ index, direction: Math.sign(index - nav.index) });
  const direction = nav.index !== index ? Math.sign(index - nav.index) : nav.direction;

  return (
    <div className="min-h-dvh xl:pl-64">
      <SideNav />
      <div className="relative mx-auto max-w-5xl overflow-x-clip px-4 pb-32 pt-[max(env(safe-area-inset-top),16px)] xl:px-8 xl:pb-12 xl:pt-8">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.main
            key={pathname}
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={spring.page}
          >
            <ErrorBoundary key={pathname} fallback={<PageErrorFallback />}>
              <FrozenOutlet />
            </ErrorBoundary>
          </motion.main>
        </AnimatePresence>
      </div>
      <TabBar />
    </div>
  );
}

/** 退场动画期间保持旧页面内容不变，否则会提前渲染成新页面。 */
function FrozenOutlet() {
  const outlet = useOutlet();
  const [frozen] = useState(outlet);
  return frozen;
}
