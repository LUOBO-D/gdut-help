import { dayOffset, examCountdownText, formatWhen, nextUpcomingExam, today, weekOf } from '@gduthelp/shared';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { GlassCard } from '../../components/GlassCard';
import { ChevronRightIcon } from '../../components/icons';
import { useAuth } from '../../lib/auth-store';
import { useExams, useTimetable, useTodos } from '../../lib/queries';
import { useNow } from '../../lib/use-now';
import { stagger } from '../../motion/presets';
import { NotificationsButton } from './NotificationsButton';
import { TodayMealCard } from './TodayMealCard';
import { TodayMoodCard } from './TodayMoodCard';
import { TodayScheduleCard } from './TodayScheduleCard';
import { TodoSummaryCard } from './TodoSummaryCard';
import { WeatherHero } from './WeatherHero';

function greeting(h: number): string {
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
  timeZone: 'Asia/Shanghai',
});

export function TodayPage() {
  const user = useAuth((s) => s.user);
  const now = useNow();
  const semester = useTimetable().data?.semester;
  const exams = useExams().data?.exams;
  const todos = useTodos().data;
  const week = semester ? weekOf(semester, today(now)) : null;
  const nextExam = exams ? nextUpcomingExam(exams, now) : null;
  const hour = now.getHours();
  // 饭点时段（11:00–13:00 / 17:00–19:00）在餐食卡片打上轻盈「饭点」提示，不再打乱页面排版顺序
  const mealPriority = (hour >= 11 && hour < 13) || (hour >= 17 && hour < 19);

  // 7 天内截止的 P1 紧急待办
  const urgentDdl = todos
    ?.filter((t) => !t.completedAt && t.priority === 1 && t.dueAt)
    .map((t) => ({ todo: t, due: new Date(t.dueAt!) }))
    .filter(({ due }) => due.getTime() - now.getTime() <= 7 * 24 * 3600_000)
    .sort((a, b) => a.due.getTime() - b.due.getTime())[0];

  const ddlBadge = urgentDdl
    ? (() => {
        const diffMs = urgentDdl.due.getTime() - now.getTime();
        if (diffMs < 0) return '已逾期';
        const days = dayOffset(urgentDdl.due, now);
        if (days === 0) return `今天 ${formatWhen(urgentDdl.due, now).replace(/^今天\s*/, '')} 截止`;
        if (days === 1) return '还剩 1 天';
        return `还剩 ${days} 天`;
      })()
    : null;

  const hasAlerts = Boolean((urgentDdl && ddlBadge) || nextExam);

  return (
    <div className="space-y-4">
      {/* 顶部问候区：左对齐日期+称呼，右侧居中配对通知与个人入口 */}
      <header className="flex items-center justify-between gap-3 pt-1">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-fg-muted">
            {dateFormat.format(now)}
            {week !== null && ` · 第 ${week} 周`}
          </p>
          <h1 className="mt-1 truncate text-[26px] font-bold leading-tight tracking-tight sm:text-[28px]">
            {greeting(hour)}，{user?.nickname}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <NotificationsButton />
          <Link
            to="/me"
            className="glass-thin grid size-10 place-items-center rounded-full! text-sm font-semibold xl:hidden"
            aria-label="我的"
          >
            {user?.nickname.slice(0, 1)}
          </Link>
        </div>
      </header>

      {/* 轻盈状态栏：单行校区天气 + 仅在有紧急 DDL / 考试时出现的整齐提醒条 */}
      <div className="space-y-2.5">
        <WeatherHero />

        {hasAlerts && (
          <GlassCard variant="thin" className="divide-y divide-current/8 overflow-hidden rounded-2xl!">
            {urgentDdl && ddlBadge && (
              <Link
                to="/todo"
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs transition-opacity hover:opacity-85"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
                  <span className="truncate font-medium">{urgentDdl.todo.title}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-0.5 font-num font-medium text-danger tabular-nums">
                  {ddlBadge}
                  <ChevronRightIcon size={13} />
                </span>
              </Link>
            )}
            {nextExam && (
              <Link
                to="/study?tab=exam"
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs transition-opacity hover:opacity-85"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  <span className="truncate font-medium">考试：{nextExam.courseName}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-0.5 font-num font-medium text-accent tabular-nums">
                  {examCountdownText(nextExam, now)}
                  <ChevronRightIcon size={13} />
                </span>
              </Link>
            )}
          </GlassCard>
        )}
      </div>

      {/*
        主内容区：
        - 手机端：单列全宽呼吸流（今日课程焦点 → 待办 → 餐食推荐 → 心情横条），零窄半栏挤压；
        - 桌面端：7:5 对称双栏（左栏「学习与任务」、右栏「生活与状态」），零空缺孤洞。
      */}
      <motion.div
        className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-start xl:gap-5"
        variants={stagger.container}
        initial="hidden"
        animate="show"
      >
        <motion.div className="space-y-4 xl:col-span-7" variants={stagger.container}>
          <TodayScheduleCard />
          <TodoSummaryCard />
        </motion.div>

        <motion.div className="space-y-4 xl:col-span-5" variants={stagger.container}>
          <TodayMealCard mealPriority={mealPriority} />
          <TodayMoodCard />
        </motion.div>
      </motion.div>
    </div>
  );
}
