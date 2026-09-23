import React from 'react';
import { cn } from '../../lib/format';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-zinc-900 text-white hover:bg-zinc-800 active:bg-zinc-950 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white shadow-sm',
  secondary:
    'bg-white text-zinc-800 border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800',
  ghost:
    'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2 rounded-xl',
  icon: 'h-8 w-8 rounded-lg',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors focus-ring disabled:opacity-50 disabled:pointer-events-none',
        VARIANT[variant],
        SIZE[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = 'Button';
