import React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';

interface FormatSelectorProps {
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
}

const FormatSelector: React.FC<FormatSelectorProps> = ({ 
  value, 
  onChange,
  size = 'md'
}) => {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange}>
      <SelectPrimitive.Trigger
        className={`flex w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 ${
          size === 'sm' ? 'py-1 text-xs' : 'py-2 text-sm'
        } text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-600`}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown className={`h-${size === 'sm' ? '3' : '4'} w-${size === 'sm' ? '3' : '4'} opacity-50`} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="relative z-50 min-w-[8rem] overflow-hidden rounded-md border border-slate-200 bg-white text-slate-900 shadow-md dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <SelectPrimitive.Viewport className="p-1">
            <SelectPrimitive.Group>
              <SelectItem value="original">Keep Original</SelectItem>
              <SelectItem value="jpg">JPG</SelectItem>
              <SelectItem value="png">PNG</SelectItem>
              <SelectItem value="webp">WebP</SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="mp4">MP4</SelectItem>
            </SelectPrimitive.Group>
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
};

const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ children, className, ...props }, ref) => {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={`relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-slate-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 dark:focus:bg-slate-700 ${className}`}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z"
              fill="currentColor"
              fillRule="evenodd"
              clipRule="evenodd"
            />
          </svg>
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});

SelectItem.displayName = SelectPrimitive.Item.displayName;

export default FormatSelector;