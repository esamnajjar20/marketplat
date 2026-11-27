'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FilterChipOption {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

interface FilterChipGroupProps {
  label: string;
  value: string;
  options: readonly FilterChipOption[];
  onChange: (value: string) => void;
  className?: string;
  optionClassName?: string;
  variant?: 'pills' | 'underline';
  role?: 'group';
}

const VARIANTS = {
  pills: {
    list: 'flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-1',
    option: 'inline-flex min-h-[var(--touch-target)] shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
    active: 'border-primary bg-primary text-primary-foreground',
    inactive: 'border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground',
  },
  underline: {
    list: 'flex min-w-0 gap-1 overflow-x-auto overscroll-x-contain border-b border-border',
    option: 'relative inline-flex min-h-[var(--touch-target)] shrink-0 items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors',
    active: 'border-primary font-extrabold text-primary',
    inactive: 'border-transparent text-muted-foreground hover:text-foreground',
  },
} as const;

/** One accessible, horizontally-scrollable selection-chip implementation for list filters. */
export function FilterChipGroup({
  label,
  value,
  options,
  onChange,
  className,
  optionClassName,
  variant = 'pills',
  role = 'group',
}: FilterChipGroupProps) {
  const styles = VARIANTS[variant];

  return (
    <div
      className={cn(styles.list, className)}
      role={role}
      aria-label={label}
      data-filter-chip-variant={variant}
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
              styles.option,
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              active ? styles.active : styles.inactive,
              option.disabled && 'cursor-not-allowed opacity-50',
              optionClassName,
            )}
          >
            {option.icon ? <span className="inline-flex shrink-0" aria-hidden="true">{option.icon}</span> : null}
            <span className="whitespace-nowrap">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
