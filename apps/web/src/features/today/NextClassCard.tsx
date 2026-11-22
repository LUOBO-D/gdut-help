import {
  addDays,
  formatDuration,
  formatHm,
  matchCampusBuilding,
  sessionsOn,
  today,
  type ClassSession,
} from '@gduthelp/shared';
import { Link } from 'react-router';
import { GlassCard } from '../../components/GlassCard';
import { NavigationIcon, PinIcon } from '../../components/icons';
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

  let next: Next | null = null;
  let emptyText: string | null = null;
  if (isPending && !data) emptyText = '加载中…';
  else if (!data?.semester) emptyText = '正在初始化学期…';
  else {
    const d = today(now);
    next = findNext(sessionsOn(data, d, campusId), sessionsOn(data, addDays(d, 1), campusId), now);
    if (!next) emptyText = data.courses.length ? '今明两天没有课' : '还没有课表，点此一键导入 →';
  }

  const mappedBuilding = next?.session.location ? matchCampusBuilding(next.session.location) : null;

  return (
    <GlassCard interactive variants={stagger.item} className="flex h-full min-h-32 flex-col justify-between p-4">
      <Link to="/timetable" className="block flex-1">
        <h2 className="mb-2 text-[15px] font-semibold">下一节课</h2>
        {next ? (
          <>
            <p className="text-xs text-accent">{next.label}</p>
            <p className="mt-1 truncate text-lg font-semibold">{next.session.name}</p>
            <p className="mt-1 text-xs text-fg-muted">
              {formatHm(next.session.start)}–{formatHm(next.session.end)} · 第 {next.session.periodStart}–{next.session.periodEnd} 节
            </p>
          </>
        ) : (
          <p className="text-sm text-fg-muted">{emptyText}</p>
        )}
      </Link>

      {next?.session.location &&
        (mappedBuilding ? (
          <Link
            to={`/map?q=${encodeURIComponent(next.session.location)}`}
            className="mt-2 inline-flex max-w-full items-center gap-1 self-start rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent transition-opacity hover:opacity-85"
          >
            <PinIcon size={12} className="shrink-0" />
            <span className="truncate">{next.session.location}</span>
            <NavigationIcon size={11} className="shrink-0" />
          </Link>
        ) : (
          <p className="mt-1.5 flex items-center gap-1 truncate text-xs text-fg-muted">
            <PinIcon size={12} className="shrink-0" />
            <span className="truncate">{next.session.location}</span>
          </p>
        ))}
    </GlassCard>
  );
}
