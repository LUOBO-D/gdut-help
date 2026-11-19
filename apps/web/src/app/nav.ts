import type { ComponentType } from 'react';
import { BowlIcon, CalendarIcon, CheckIcon, SunIcon, TrophyIcon, UserIcon } from '../components/icons';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
}

/** 底部标签栏（手机）/ 侧边栏（电脑）的导航项，顺序也决定页面切换方向。 */
export const TABS: NavItem[] = [
  { to: '/', label: '今天', icon: SunIcon },
  { to: '/timetable', label: '课表', icon: CalendarIcon },
  { to: '/food', label: '吃什么', icon: BowlIcon },
  { to: '/todo', label: '待办', icon: CheckIcon },
  { to: '/ranking', label: '榜单', icon: TrophyIcon },
];

export const ME: NavItem = { to: '/me', label: '我的', icon: UserIcon };

/** 当前路径在导航中的序号，「我的」排在最后 */
export function navIndex(pathname: string): number {
  const all = [...TABS, ME];
  const i = all.findIndex((t) => (t.to === '/' ? pathname === '/' : pathname.startsWith(t.to)));
  return i === -1 ? 0 : i;
}
