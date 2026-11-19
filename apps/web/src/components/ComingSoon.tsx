import { motion } from 'motion/react';
import { stagger } from '../motion/presets';
import { GlassCard } from './GlassCard';

interface ComingSoonProps {
  stage: string;
  items: string[];
}

/** 尚未开发的功能页占位：说明会在哪个阶段做哪些功能。 */
export function ComingSoon({ stage, items }: ComingSoonProps) {
  return (
    <GlassCard className="p-5">
      <span className="inline-block rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-fg">
        {stage} 开发中
      </span>
      <motion.ul className="mt-4 space-y-3" variants={stagger.container} initial="hidden" animate="show">
        {items.map((text) => (
          <motion.li key={text} variants={stagger.item} className="flex items-start gap-3 text-[15px]">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
            {text}
          </motion.li>
        ))}
      </motion.ul>
    </GlassCard>
  );
}
