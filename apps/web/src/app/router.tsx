import { createBrowserRouter, Navigate } from 'react-router';
import { TodayPage } from '../features/today/TodayPage';
import { AppShell } from './AppShell';
import { RequireAuth } from './RequireAuth';
import { RootLayout } from './RootLayout';

// 只有首页随主包加载；其他页面（包括登录页）按需加载，控制首屏 JS 体积
export const router = createBrowserRouter([
  {
    Component: RootLayout,
    // 首次打开的是按需加载的页面时，加载完成前先不渲染内容（只有页面底色，通常不到 100 毫秒）
    HydrateFallback: () => null,
    children: [
      { path: '/login', lazy: () => import('../features/auth/LoginPage').then((m) => ({ Component: m.LoginPage })) },
      {
        Component: RequireAuth,
        children: [
          {
            Component: AppShell,
            children: [
              { index: true, Component: TodayPage },
              { path: 'timetable', lazy: () => import('../features/timetable/TimetablePage').then((m) => ({ Component: m.TimetablePage })) },
              { path: 'food', lazy: () => import('../features/food/FoodPage').then((m) => ({ Component: m.FoodPage })) },
              { path: 'todo', lazy: () => import('../features/todo/TodoPage').then((m) => ({ Component: m.TodoPage })) },
              { path: 'ranking', lazy: () => import('../features/ranking/RankingPage').then((m) => ({ Component: m.RankingPage })) },
              { path: 'me', lazy: () => import('../features/me/MePage').then((m) => ({ Component: m.MePage })) },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
