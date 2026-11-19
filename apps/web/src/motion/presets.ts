import type { Transition, Variants } from 'motion/react';

/** 统一动效参数，组件只引用这里的预设（见 docs/04-frontend.md 第 4 节）。 */
export const spring = {
  /** 卡片展开、指示器滑动 */
  snappy: { type: 'spring', stiffness: 300, damping: 30 },
  /** 按压回弹 */
  bouncy: { type: 'spring', stiffness: 500, damping: 22 },
  /** 页面切换 */
  page: { type: 'spring', stiffness: 260, damping: 32, mass: 0.9 },
} satisfies Record<string, Transition>;

export const SCENE_FADE: Transition = { duration: 1.2, ease: 'easeInOut' };

export const pressable = {
  whileTap: { scale: 0.96 },
  transition: spring.bouncy,
} as const;

/** 列表依次进入：父级用 container，子项用 item */
export const stagger = {
  container: {
    hidden: {},
    show: { transition: { staggerChildren: 0.04 } },
  } satisfies Variants,
  item: {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: spring.snappy },
  } satisfies Variants,
};

/** 页面切换：direction 为 1 表示前往右侧的标签，-1 表示左侧 */
export const pageVariants: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 40, scale: 0.98 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -40, scale: 0.98 }),
};
