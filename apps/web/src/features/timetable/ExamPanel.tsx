import {
  examCountdownText,
  examStatus,
  matchCampusBuilding,
  nextUpcomingExam,
  parseDate,
  sortExams,
  type Exam,
} from '@gduthelp/shared';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { NavigationIcon, PinIcon } from '../../components/icons';
import { CardSkeleton } from '../../components/Skeleton';
import { isNative } from '../../lib/platform';
import { pressable } from '../../motion/presets';
import { WEEKDAY_LABEL } from './weekday';

interface ExamPanelProps {
  exams: Exam[];
  isLoading: boolean;
  now: Date;
  onAdd: () => void;
  onImport: () => void;
  onEdit: (exam: Exam) => void;
}

export function ExamPanel({ exams, isLoading, now, onAdd, onImport, onEdit }: ExamPanelProps) {
  const navigate = useNavigate();

  const { activeExams, finishedExams, nextExam } = useMemo(() => {
    const sorted = sortExams(exams, now);
    const active: Exam[] = [];
    const finished: Exam[] = [];
    for (const e of sorted) {
      if (examStatus(e, now) === 'finished') finished.push(e);
      else active.push(e);
    }
    return { activeExams: active, finishedExams: finished, nextExam: nextUpcomingExam(exams, now) };
  }, [exams, now]);

  if (isLoading && exams.length === 0) {
    return <CardSkeleton rows={3} />;
  }

  if (exams.length === 0) {
    return (
      <GlassCard className="p-6 text-center">
        <p className="text-base font-semibold">还没有考试安排</p>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
          支持从广工教务系统一键同步期末考试时间、考场和座位号，也可手动录入四六级、期中测验。
          {isNative ? '导入后会自动排好考前一天与考前 1 小时提醒。' : ''}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2.5">
          <Button className="h-10 px-4 text-sm" onClick={onImport}>
            {isNative ? '从教务系统同步' : '导入考试安排'}
          </Button>
          <Button variant="ghost" className="h-10 px-4 text-sm" onClick={onAdd}>
            手动添加考试
          </Button>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* 顶部概览条 */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-fg-muted">
              待考 {activeExams.length} 场 · 已结束 {finishedExams.length} 场
            </p>
            <p className="mt-1 truncate text-base font-semibold">
              {nextExam
                ? `下一场：${nextExam.courseName}（${examCountdownText(nextExam, now)}）`
                : '本学期已记录的考试都考完啦 🎉'}
            </p>
          </div>
          <Button variant="ghost" className="h-9 shrink-0 px-3 text-xs" onClick={onImport}>
            {isNative ? '教务同步' : '导入'}
          </Button>
        </div>
      </GlassCard>

      {/* 待考 / 进行中 */}
      {activeExams.length > 0 && (
        <div className="space-y-2.5">
          {activeExams.map((exam) => (
            <ExamCard
              key={exam.id}
              exam={exam}
              now={now}
              onEdit={() => onEdit(exam)}
              onNavigate={(loc) => navigate(`/map?q=${encodeURIComponent(loc)}`)}
            />
          ))}
        </div>
      )}

      {/* 已结束 */}
      {finishedExams.length > 0 && (
        <div className="space-y-2.5">
          <p className="px-1 text-xs font-medium text-fg-muted">已结束（{finishedExams.length}）</p>
          {finishedExams.map((exam) => (
            <ExamCard
              key={exam.id}
              exam={exam}
              now={now}
              onEdit={() => onEdit(exam)}
              onNavigate={(loc) => navigate(`/map?q=${encodeURIComponent(loc)}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExamCard({
  exam,
  now,
  onEdit,
  onNavigate,
}: {
  exam: Exam;
  now: Date;
  onEdit: () => void;
  onNavigate: (location: string) => void;
}) {
  const status = examStatus(exam, now);
  const countdown = examCountdownText(exam, now);
  const parsed = parseDate(exam.examDate);
  const weekdayLabel = WEEKDAY_LABEL[parsed.weekday - 1] ?? '';
  const canNavigate = Boolean(exam.location && matchCampusBuilding(exam.location));

  const badgeClass =
    status === 'ongoing'
      ? 'bg-emerald-500 text-white'
      : status === 'today'
        ? 'bg-danger text-white'
        : status === 'finished'
          ? 'bg-current/10 text-fg-muted'
          : 'bg-accent/15 text-accent';

  return (
    <motion.div {...pressable}>
      <GlassCard
        interactive
        onClick={onEdit}
        className={`p-4 ${status === 'finished' ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="truncate text-[15px] font-semibold">{exam.courseName}</h3>
              {exam.examType && (
                <span className="rounded-full bg-current/8 px-2 py-0.5 text-[11px] text-fg-muted">
                  {exam.examType}
                </span>
              )}
              {exam.source === 'import' && (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                  教务同步
                </span>
              )}
            </div>

            <p className="mt-1.5 text-sm font-medium tabular-nums">
              {parsed.month}月{parsed.day}日 周{weekdayLabel} · {exam.startTime}–{exam.endTime}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
              {exam.location && (
                <span className="inline-flex items-center gap-1">
                  <PinIcon size={13} className="shrink-0" />
                  <span>{exam.location}</span>
                </span>
              )}
              {exam.seatNo && (
                <span className="rounded-full bg-current/8 px-2 py-0.5 font-medium text-fg tabular-nums">
                  座位 {exam.seatNo}
                </span>
              )}
              {exam.campus && <span>{exam.campus}</span>}
            </div>

            {exam.note && <p className="mt-1.5 text-xs text-fg-muted">备注：{exam.note}</p>}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${badgeClass}`}>
              {countdown}
            </span>

            {canNavigate && status !== 'finished' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(exam.location!);
                }}
                className="inline-flex items-center gap-1 rounded-full bg-accent/12 px-2.5 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20"
              >
                <NavigationIcon size={12} />
                <span>去考场</span>
              </button>
            )}
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}
