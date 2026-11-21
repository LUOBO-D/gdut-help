import { MOOD_META, MOODS, type MoodLog, type MoodType } from '@gduthelp/shared';
import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { ApiError } from '../../lib/api';
import { toast } from '../../lib/toast-store';
import { pressable, spring } from '../../motion/presets';
import { MoodOrb } from './MoodOrb';
import { useSaveMood } from './mutations';

export function MoodCard({ moodLog }: { moodLog: MoodLog | null | undefined }) {
  const save = useSaveMood();
  const [pendingMood, setPendingMood] = useState<MoodType | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = pendingMood ?? moodLog?.mood ?? null;
  const savedNote = moodLog?.note ?? '';

  const pickMood = (mood: MoodType) => {
    setPendingMood(mood);
    setError(null);
    save.mutate(
      { mood, note: (editingNote ? noteDraft : savedNote).trim() || null },
      {
        onSuccess: () => {
          setPendingMood(null);
          toast.success(`已记录心情：${MOOD_META[mood].label}`);
        },
        onError: (err) => {
          setPendingMood(null);
          setError(err instanceof ApiError ? err.message : '保存心情失败');
        },
      },
    );
  };

  const openNoteEditor = () => {
    setNoteDraft(savedNote);
    setEditingNote(true);
    setError(null);
  };

  const saveNote = (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    save.mutate(
      { mood: selected, note: noteDraft.trim() || null },
      {
        onSuccess: () => setEditingNote(false),
        onError: (err) => setError(err instanceof ApiError ? err.message : '保存失败'),
      },
    );
  };

  const activeMeta = selected ? MOOD_META[selected] : null;

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-4">
        <MoodOrb mood={selected} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold">今日心情</h2>
            {selected && !editingNote && (
              <button
                type="button"
                className="text-xs text-fg-muted underline-offset-2 hover:underline"
                onClick={openNoteEditor}
              >
                {savedNote ? '改备注' : '+ 写一句'}
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {activeMeta ? `${activeMeta.label} · ${activeMeta.desc}` : '选一个今天的状态，推荐会跟着调整'}
          </p>
          {savedNote && !editingNote && <p className="mt-1 truncate text-xs text-fg-muted">「{savedNote}」</p>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {MOODS.map((m) => {
          const active = selected === m;
          const meta = MOOD_META[m];
          return (
            <motion.button
              key={m}
              type="button"
              {...pressable}
              onClick={() => pickMood(m)}
              aria-pressed={active}
              className={`relative rounded-2xl border px-2 py-2 text-center text-xs font-medium transition-colors ${
                active ? 'border-transparent text-accent-fg' : 'border-current/15 text-fg'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="mood-active-pill"
                  transition={spring.snappy}
                  className="absolute inset-0 rounded-2xl"
                  style={{ background: meta.color }}
                />
              )}
              <span className="relative">{meta.label}</span>
            </motion.button>
          );
        })}
      </div>

      {editingNote && selected && (
        <form onSubmit={saveNote} className="mt-3 flex gap-2">
          <input
            className="field h-10 py-0 text-sm"
            placeholder="记一句今天的心情（选填，最多 80 字）"
            maxLength={80}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            autoFocus
          />
          <Button type="submit" className="h-10 shrink-0 px-4 text-sm" loading={save.isPending}>
            保存
          </Button>
        </form>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </GlassCard>
  );
}
