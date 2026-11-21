import { MOOD_META, type MoodType } from '@gduthelp/shared';
import { motion } from 'motion/react';
import { spring } from '../../motion/presets';

const SHAPES: Record<MoodType, string> = {
  happy: '54% 46% 48% 52% / 50% 56% 44% 50%',
  calm: '50% 50% 50% 50% / 50% 50% 50% 50%',
  tired: '60% 40% 55% 45% / 44% 54% 46% 56%',
  anxious: '42% 58% 44% 56% / 58% 42% 56% 44%',
  down: '48% 52% 62% 38% / 55% 48% 52% 45%',
  treat: '56% 44% 46% 54% / 46% 58% 42% 54%',
};

interface MoodOrbProps {
  mood: MoodType | null;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: 'size-11',
  md: 'size-14',
  lg: 'size-16',
};

/** 随情绪平滑变换色彩与有机形态的心情光球 */
export function MoodOrb({ mood, size = 'md' }: MoodOrbProps) {
  const meta = mood ? MOOD_META[mood] : null;
  const radius = mood ? SHAPES[mood] : '50%';
  const background = meta ? meta.gradient : 'radial-gradient(circle at 35% 30%, white, var(--accent))';
  const glow = meta ? `0 8px 24px ${meta.color}66` : '0 8px 20px rgb(0 0 0 / 0.16)';

  return (
    <motion.div
      aria-hidden="true"
      className={`${SIZE_CLASSES[size]} shrink-0 border border-white/50`}
      animate={{ borderRadius: radius, scale: mood ? 1 : 0.94 }}
      transition={spring.bouncy}
      style={{
        background,
        boxShadow: `inset 0 2px 6px rgb(255 255 255 / 0.65), ${glow}`,
      }}
    />
  );
}
