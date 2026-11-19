import { addDays, formatDuration, formatHm, sessionsOn, today, type ClassSession } from '@gduthelp/shared';
import { Link } from 'react-router';
import { GlassCard } from '../../components/GlassCard';
import { PinIcon } from '../../components/icons';
import { useAuth } from '../../lib/auth-store';
import { useTimetable } from '../../lib/queries';
import { useNow } from '../../lib/use-now';
import { stagger } from '../../motion/presets';

interface Next {
  session: ClassSession;
  label: string;
}

function findNext(sessionsToday: ClassSession[], sessionsTomorrow: ClassSession[], now: Date): Next | null {
  for (const s of sessionsToday) {
    const start = new Date(s.start);
    const end = new Date(s.end);
    if (end <= now) continue;
    if (start <= now) return { session: s, label: `正在上课 · 还剩 ${formatDuration((end.getTime() - now.getTime()) / 60_000)}` };
    return { session: s, label: `${formatDuration((start.getTime() - now.getTime()) / 60_000)}后上课` };
  }
  const first = sessionsTomorrow[0];
  return first ? { session: first, label: `明天 ${formatHm(first.start)}` } : null;
}

export function NextClassCard() {
  const { data, isPending } = useTimetable();
  const campusId = useAuth((s) => s.user?.campusId);
  const now = useNow(30_000);

  let content;
  if (isPending && !data) content = <p className="text-sm text-fg-muted">加载中…</p>;
  else if (!data?.semester) content = <p className="text-sm text-fg-muted">管理员还没有设置当前学期</p>;
  else {
    const d = today(now);
    const next = findNext(sessionsOn(data, d, campusId), sessionsOn(data, addDays(d, 1), campusId), now);
    content = next ? (
      <>
        <p className="text-xs text-accent">{next.label}</p>
        <p className="mt-1 truncate text-lg font-semibold">{next.session.name}</p>
        <p className="mt-1 text-xs text-fg-muted">
          {formatHm(next.session.start)}–{formatHm(next.session.end)} · 第 {next.session.periodStart}–{next.session.periodEnd} 节
        </p>
        {next.session.location && (
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-fg-muted">
            <PinIcon size={12} />
            {next.session.location}
          </p>
        )}
      </>
    ) : (
      <p className="text-sm text-fg-muted">{data.courses.length ? '今明两天没有课' : '还没有添加课程'}</p>
    );
  }

  return (
    <Link to="/timetable" className="block">
      <GlassCard interactive variants={stagger.item} className="h-full min-h-32 p-4">
        <h2 className="mb-2 text-[15px] font-semibold">下一节课</h2>
        {content}
      </GlassCard>
    </Link>
  );
}
