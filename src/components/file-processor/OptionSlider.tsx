import React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

interface OptionSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: 'sm' | 'md';
}

const OptionSlider: React.FC<OptionSliderProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  size = 'md',
}) => {
  return (
    <div className="flex items-center space-x-3">
      <SliderPrimitive.Root
        className={`relative flex w-full touch-none select-none items-center`}
        value={[value]}
        max={max}
        min={min}
        step={step}
        onValueChange={(values) => onChange(values[0])}
      >
        <SliderPrimitive.Track
          className={`relative h-${size === 'sm' ? '1' : '2'} w-full grow overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700`}
        >
          <SliderPrimitive.Range className="absolute h-full bg-primary-600 dark:bg-primary-500" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className={`block h-${size === 'sm' ? '3' : '4'} w-${size === 'sm' ? '3' : '4'} rounded-full border-2 border-primary-600 dark:border-primary-500 bg-white ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50`}
        />
      </SliderPrimitive.Root>
      <span className={`w-9 text-center ${size === 'sm' ? 'text-xs' : 'text-sm'} font-medium text-slate-900 dark:text-slate-100`}>
        {value}%
      </span>
    </div>
  );
};

export default OptionSlider;