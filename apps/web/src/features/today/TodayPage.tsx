import { today, weekOf } from '@gduthelp/shared';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { GlassCard } from '../../components/GlassCard';
import { useAuth } from '../../lib/auth-store';
import { useTimetable } from '../../lib/queries';
import { useNow } from '../../lib/use-now';
import { stagger } from '../../motion/presets';
import { NextClassCard } from './NextClassCard';
import { NotificationsButton } from './NotificationsButton';
import { TimelineCard } from './TimelineCard';
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

  return (
    <>
      <header className="flex items-start justify-between gap-3 pt-2">
        <div className="min-w-0">
          <p className="text-sm text-fg-muted">
            {dateFormat.format(now)}
            {week !== null && ` · 第 ${week} 周`}
          </p>
          <h1 className="mt-1 break-all text-[28px] font-bold leading-tight">
            {greeting(now.getHours())}，{user?.nickname}
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
        <NextClassCard />
        <Tile title="今日心情" stage="S3">
          <div className="mx-auto mt-1 size-14 rounded-full bg-[radial-gradient(circle_at_35%_30%,white,var(--accent))] opacity-80" />
        </Tile>
        <Tile title="午饭推荐" stage="S3" className="col-span-2">
          <p className="text-sm text-fg-muted">S3 接入商家与推荐</p>
        </Tile>
        <TodoSummaryCard />
      </motion.div>
    </>
  );
}

function Tile({ title, stage, className = '', children }: { title: string; stage: string; className?: string; children: ReactNode }) {
  return (
    <GlassCard variants={stagger.item} className={`min-h-32 p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <span className="rounded-full border border-current px-2 text-[11px] text-fg-muted">{stage}</span>
      </div>
      {children}
    </GlassCard>
  );
}
