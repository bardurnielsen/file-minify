import React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';

interface ProgressProps {
  value?: number;
  max?: number;
  className?: string;
}

export const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ value = 0, max = 100, className, ...props }, ref) => {
  const percentage = (value / max) * 100;

  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={`relative h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 ${className}`}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 bg-primary-600 dark:bg-primary-500 transition-all"
        style={{ transform: `translateX(-${100 - percentage}%)` }}
      />
    </ProgressPrimitive.Root>
  );
});

Progress.displayName = 'Progress';