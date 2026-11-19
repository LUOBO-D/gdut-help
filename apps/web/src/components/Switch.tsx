import { motion } from 'motion/react';
import { spring } from '../motion/presets';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

export function Switch({ checked, onChange, label, description }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-2 text-left"
    >
      <span>
        <span className="block text-[15px]">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-fg-muted">{description}</span>}
      </span>
      <span
        className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? 'justify-end bg-accent' : 'justify-start bg-black/15'
        }`}
      >
        <motion.span layout transition={spring.bouncy} className="size-6 rounded-full bg-white shadow" />
      </span>
    </button>
  );
}
