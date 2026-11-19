import { EMAIL_CODE_LENGTH } from '@gduthelp/shared';
import { motion } from 'motion/react';
import { useId } from 'react';
import { spring } from '../../motion/presets';

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}

/**
 * 验证码输入：视觉上是 6 个格子，实际是一个透明覆盖的原生输入框，
 * 这样系统的「从邮件/短信自动填充验证码」、粘贴和读屏都能正常工作。
 */
export function CodeInput({ value, onChange, disabled, invalid }: CodeInputProps) {
  const id = useId();
  const digits = Array.from({ length: EMAIL_CODE_LENGTH }, (_, i) => value[i] ?? '');
  const activeIndex = Math.min(value.length, EMAIL_CODE_LENGTH - 1);

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {EMAIL_CODE_LENGTH} 位验证码
      </label>
      <motion.div
        className="grid grid-cols-6 gap-2"
        animate={invalid ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        aria-hidden="true"
      >
        {digits.map((d, i) => {
          const active = !disabled && i === activeIndex;
          return (
            <div
              key={i}
              className={`field grid h-14 place-items-center p-0 text-2xl font-semibold tabular-nums ${
                active ? 'border-accent!' : ''
              } ${invalid ? 'border-danger!' : ''}`}
            >
              {d ? (
                <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.bouncy}>
                  {d}
                </motion.span>
              ) : active ? (
                <span className="h-6 w-0.5 animate-pulse rounded bg-accent" />
              ) : null}
            </div>
          );
        })}
      </motion.div>
      <input
        id={id}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d*"
        maxLength={EMAIL_CODE_LENGTH}
        value={value}
        disabled={disabled}
        autoFocus
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH))}
      />
    </div>
  );
}
