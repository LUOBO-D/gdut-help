import { MOOD_META, MOODS, type MoodType } from '@gduthelp/shared';
import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { Sheet } from '../../components/Sheet';
import { ChevronRightIcon } from '../../components/icons';
import { ApiError } from '../../lib/api';
import { useTodayMood } from '../../lib/queries';
import { toast } from '../../lib/toast-store';
import { pressable, spring, stagger } from '../../motion/presets';
import { MoodOrb } from '../food/MoodOrb';
import { useSaveMood } from '../food/mutations';

/** 首页轻盈横条心情卡：宽敞单行布局替代窄半栏挤压，点击弹出选心情浮层 */
export function TodayMoodCard() {
  const moodQuery = useTodayMood();
  const [open, setOpen] = useState(false);
  const current = moodQuery.data?.mood ?? null;
  const meta = current ? MOOD_META[current] : null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        <GlassCard interactive variants={stagger.item} className="flex items-center gap-3.5 px-4 py-3.5 sm:px-5">
          <MoodOrb mood={current} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-fg-muted">今日心情</span>
              <span className="text-xs text-fg-muted" aria-hidden>
                ·
              </span>
              <span className="truncate text-sm font-semibold">{meta ? meta.label : '尚未记录'}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-fg-muted">
              {moodQuery.data?.note || (meta ? meta.desc : '记录一下心情，同步给今日餐食推荐')}
            </p>
          </div>
          <span className="surface-subtle inline-flex shrink-0 items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-medium text-fg-muted">
            {meta ? '切换' : '记录'}
            <ChevronRightIcon size={13} />
          </span>
        </GlassCard>
      </button>

      {open && (
        <QuickMoodSheet
          initialMood={current}
          initialNote={moodQuery.data?.note ?? ''}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function QuickMoodSheet({
  initialMood,
  initialNote,
  onClose,
}: {
  initialMood: MoodType | null;
  initialNote: string;
  onClose: () => void;
}) {
  const save = useSaveMood();
  const [selected, setSelected] = useState<MoodType>(initialMood ?? 'calm');
  const [note, setNote] = useState(initialNote);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    save.mutate(
      { mood: selected, note: note.trim() || null },
      {
        onSuccess: () => {
          toast.success(`今日心情：${MOOD_META[selected].label}`);
          onClose();
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : '保存失败'),
      },
    );
  };

  const meta = MOOD_META[selected];

  return (
    <Sheet
      open
      onClose={onClose}
      title="记录今日心情"
      footer={
        <div className="space-y-2">
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" form="quick-mood-form" className="w-full" loading={save.isPending}>
            保存并更新推荐
          </Button>
        </div>
      }
    >
      <form id="quick-mood-form" onSubmit={submit} className="space-y-5">
        <div className="flex items-center gap-4">
          <MoodOrb mood={selected} size="lg" />
          <div className="min-w-0">
            <p className="text-lg font-semibold">{meta.label}</p>
            <p className="mt-0.5 text-sm text-fg-muted">{meta.desc}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {MOODS.map((m) => {
            const active = selected === m;
            return (
              <motion.button
                key={m}
                type="button"
                {...pressable}
                onClick={() => setSelected(m)}
                aria-pressed={active}
                className={`relative rounded-2xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'border-transparent text-accent-fg' : 'border-current/15 text-fg'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="quick-mood-pill"
                    transition={spring.snappy}
                    className="absolute inset-0 rounded-2xl"
                    style={{ background: MOOD_META[m].color }}
                  />
                )}
                <span className="relative">{MOOD_META[m].label}</span>
              </motion.button>
            );
          })}
        </div>

        <input
          className="field text-sm"
          placeholder="写一句今天的感受（选填，最多 80 字）"
          maxLength={80}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </form>
    </Sheet>
  );
}
