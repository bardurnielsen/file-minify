import React from 'react';
import { motion } from 'framer-motion';
import { Tier } from '../../types';
import { TIERS } from '../../processing';
import { cn } from '../../lib/format';

interface TierControlProps {
  value: Tier;
  onChange: (tier: Tier) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Distinguishes the sliding highlight when several controls are on screen. */
  id: string;
}

const TierControl: React.FC<TierControlProps> = ({
  value,
  onChange,
  size = 'md',
  disabled,
  id,
}) => (
  <div
    role="radiogroup"
    aria-label="Quality"
    className={cn(
      'relative inline-flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/80',
      disabled && 'opacity-50 pointer-events-none'
    )}
  >
    {TIERS.map((tier) => {
      const active = tier.value === value;
      return (
        <button
          key={tier.value}
          type="button"
          role="radio"
          aria-checked={active}
          title={tier.hint}
          disabled={disabled}
          onClick={() => onChange(tier.value)}
          className={cn(
            'relative z-10 rounded-lg font-medium transition-colors focus-ring',
            size === 'sm' ? 'px-2.5 h-7 text-xs' : 'px-3.5 h-8 text-[13px]',
            active
              ? 'text-zinc-900 dark:text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
          )}
        >
          {active && (
            <motion.span
              layoutId={`tier-pill-${id}`}
              className="absolute inset-0 -z-10 rounded-lg bg-white shadow-sm dark:bg-zinc-100"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            />
          )}
          {tier.label}
        </button>
      );
    })}
  </div>
);

export default TierControl;
