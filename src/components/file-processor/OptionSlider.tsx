import React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

interface OptionSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Rendered after the number, e.g. "MB". */
  unit?: string;
  'aria-label'?: string;
}

const OptionSlider: React.FC<OptionSliderProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit,
  ...rest
}) => (
  <div className="flex items-center gap-3">
    <SliderPrimitive.Root
      className="relative flex h-5 w-full touch-none select-none items-center"
      value={[value]}
      max={max}
      min={min}
      step={step}
      onValueChange={(values) => onChange(values[0])}
      aria-label={rest['aria-label']}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <SliderPrimitive.Range className="absolute h-full bg-zinc-900 dark:bg-zinc-100" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-zinc-900 bg-white shadow transition-transform hover:scale-110 focus-ring dark:border-zinc-100 dark:bg-zinc-900" />
    </SliderPrimitive.Root>
    <span className="tnum w-14 shrink-0 text-right text-sm font-medium text-zinc-800 dark:text-zinc-100">
      {value}
      {unit ? ` ${unit}` : ''}
    </span>
  </div>
);

export default OptionSlider;
