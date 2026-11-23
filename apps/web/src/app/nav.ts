import type { ComponentType } from 'react';
import { BowlIcon, CalendarIcon, CheckIcon, MapIcon, ScoreIcon, SunIcon, UserIcon } from '../components/icons';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
}

/**
 * 底部标签栏（手机）/ 侧边栏（电脑）六大核心支柱：
 * 今天 · 课表（含考试）· 成绩（绩点与当前学年体测）· 地图 · 吃什么（推荐/榜单/商家）· 待办
 */
export const TABS: NavItem[] = [
  { to: '/', label: '今天', icon: SunIcon },
  { to: '/timetable', label: '课表', icon: CalendarIcon },
  { to: '/scores', label: '成绩', icon: ScoreIcon },
  { to: '/map', label: '地图', icon: MapIcon },
  { to: '/food', label: '吃什么', icon: BowlIcon },
  { to: '/todo', label: '待办', icon: CheckIcon },
];

export const ME: NavItem = { to: '/me', label: '我的', icon: UserIcon };

/** 当前路径在导航中的序号，「我的」排在最后 */
export function navIndex(pathname: string): number {
  if (pathname.startsWith('/fitness')) return TABS.findIndex((t) => t.to === '/scores');
  const all = [...TABS, ME];
  const i = all.findIndex((t) => (t.to === '/' ? pathname === '/' : pathname.startsWith(t.to)));
  return i === -1 ? 0 : i;
}
