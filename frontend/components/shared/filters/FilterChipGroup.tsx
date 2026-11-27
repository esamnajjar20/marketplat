'use client';

import { cn } from '@/lib/utils';

export interface FilterChipOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface FilterChipGroupProps {
  label: string;
  value: string;
  options: readonly FilterChipOption[];
  onChange: (value: string) => void;
  className?: string;
  optionClassName?: string;
  role?: 'group' | 'tablist';
}

/** One accessible, horizontally-scrollable chip implementation for list filters. */
export function FilterChipGroup({
  label,
  value,
  options,
  onChange,
  className,
  optionClassName,
  role = 'group',
}: FilterChipGroupProps) {
  return (
    <div
      className={cn('flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-1', className)}
      role={role}
      aria-label={label}
      style={{ scrollbarWidth: 'thin' }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value || '__all'}
            type="button"
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex min-h-9 shrink-0 items-center justify-center rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-[var(--color-border)] bg-card text-[var(--color-text-primary)] hover:bg-muted/60',
              option.disabled && 'cursor-not-allowed opacity-50',
              optionClassName,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
