import React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { FormatOption } from '../../formats';

interface FormatSelectorProps {
  value: string;
  onChange: (value: string) => void;
  options: FormatOption[];
  id?: string;
}

const FormatSelector: React.FC<FormatSelectorProps> = ({ value, onChange, options, id }) => (
  <SelectPrimitive.Root value={value} onValueChange={onChange}>
    <SelectPrimitive.Trigger
      id={id}
      className="inline-flex h-9 min-w-[9rem] items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 transition-colors hover:border-zinc-300 focus-ring dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600"
    >
      <SelectPrimitive.Value />
      <SelectPrimitive.Icon>
        <ChevronDown className="h-4 w-4 text-zinc-400" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={6}
        className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 text-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <SelectPrimitive.Viewport>
          {options.map((option) => (
            <SelectPrimitive.Item
              key={option.value}
              value={option.value}
              className="relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-zinc-100 dark:data-[highlighted]:bg-zinc-800"
            >
              <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                <SelectPrimitive.ItemIndicator>
                  <Check className="h-3.5 w-3.5" />
                </SelectPrimitive.ItemIndicator>
              </span>
              <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
            </SelectPrimitive.Item>
          ))}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>
);

export default FormatSelector;
