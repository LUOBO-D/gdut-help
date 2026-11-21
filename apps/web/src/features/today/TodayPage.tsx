import { today, weekOf } from '@gduthelp/shared';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { useAuth } from '../../lib/auth-store';
import { useTimetable } from '../../lib/queries';
import { useNow } from '../../lib/use-now';
import { stagger } from '../../motion/presets';
import { NextClassCard } from './NextClassCard';
import { NotificationsButton } from './NotificationsButton';
import { TimelineCard } from './TimelineCard';
import { TodayMealCard } from './TodayMealCard';
import { TodayMoodCard } from './TodayMoodCard';
import { TodoSummaryCard } from './TodoSummaryCard';
import { WeatherHero } from './WeatherHero';

function greeting(h: number): string {
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Shanghai' });

export function TodayPage() {
  const user = useAuth((s) => s.user);
  const now = useNow();
  const semester = useTimetable().data?.semester;
  const week = semester ? weekOf(semester, today(now)) : null;
  const hour = now.getHours();
  // 饭点时段（11:00–13:00 / 17:00–19:00）把餐食推荐上移到时间线下方
  const mealPriority = (hour >= 11 && hour < 13) || (hour >= 17 && hour < 19);

  return (
    <>
      <header className="flex items-start justify-between gap-3 pt-2">
        <div className="min-w-0">
          <p className="text-sm text-fg-muted">
            {dateFormat.format(now)}
            {week !== null && ` · 第 ${week} 周`}
          </p>
          <h1 className="mt-1 break-all text-[28px] font-bold leading-tight">
            {greeting(hour)}，{user?.nickname}
          </h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <NotificationsButton />
          <Link to="/me" className="glass-thin grid size-11 place-items-center rounded-full! text-base font-semibold xl:hidden" aria-label="我的">
            {user?.nickname.slice(0, 1)}
          </Link>
        </div>
      </header>

      <WeatherHero />

      <motion.div className="grid grid-cols-2 gap-3 xl:grid-cols-4" variants={stagger.container} initial="hidden" animate="show">
        <TimelineCard />
        {mealPriority ? (
          <>
            <TodayMealCard />
            <NextClassCard />
            <TodayMoodCard />
          </>
        ) : (
          <>
            <NextClassCard />
            <TodayMoodCard />
            <TodayMealCard />
          </>
        )}
        <TodoSummaryCard />
      </motion.div>
    </>
  );
}
