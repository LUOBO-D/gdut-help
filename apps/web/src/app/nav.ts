import type { ComponentType } from 'react';
import { BookOpenIcon, BowlIcon, CheckIcon, CompassIcon, SunIcon, UserIcon } from '../components/icons';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** 除主路径外也归属该导航支柱的子路由前缀（用于高亮当前主分类） */
  aliases?: readonly string[];
}

/**
 * 底部标签栏（手机）/ 侧边栏（电脑）五大简洁核心支柱：
 * - 今天：每日总览（天气、提醒、今日课程、待办、餐食推荐、心情）
 * - 学业：课表 · 考试 · 成绩（绩点与体测）· 校历
 * - 校园：3D 校园地图导航 · 空教室自习 · 广工百宝箱
 * - 吃什么：每日随机餐食推荐 · 口碑榜 · 共享商家库
 * - 待办：快捷录入 · 截止提醒 · 历史归档
 */
export const TABS: NavItem[] = [
  { to: '/', label: '今天', icon: SunIcon },
  { to: '/study', label: '学业', icon: BookOpenIcon, aliases: ['/timetable', '/scores', '/fitness'] },
  { to: '/campus', label: '校园', icon: CompassIcon, aliases: ['/map'] },
  { to: '/food', label: '吃什么', icon: BowlIcon, aliases: ['/ranking'] },
  { to: '/todo', label: '待办', icon: CheckIcon },
];

export const ME: NavItem = { to: '/me', label: '我的', icon: UserIcon, aliases: ['/admin'] };

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/';
  if (pathname === item.to || pathname.startsWith(`${item.to}/`)) return true;
  if (item.aliases?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  return false;
}

/** 当前路径在导航中的序号，「我的」排在最后 */
export function navIndex(pathname: string): number {
  const all = [...TABS, ME];
  const i = all.findIndex((item) => isNavItemActive(item, pathname));
  return i === -1 ? 0 : i;
}
