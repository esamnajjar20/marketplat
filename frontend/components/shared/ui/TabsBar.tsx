'use client';

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type TabsBarVariant = 'underline' | 'pills' | 'segmented';

export interface TabsBarOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  panelId?: string;
}

export interface TabsBarProps<T extends string> {
  value: T;
  options: readonly TabsBarOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  variant?: TabsBarVariant;
  idPrefix?: string;
  className?: string;
  listClassName?: string;
  itemClassName?: string;
  activeItemClassName?: string;
  inactiveItemClassName?: string;
}

const VARIANT_CLASSES: Record<TabsBarVariant, {
  list: string;
  item: string;
  active: string;
  inactive: string;
}> = {
  underline: {
    list: 'flex min-w-0 gap-1 overflow-x-auto overscroll-x-contain border-b border-border',
    item: 'relative inline-flex min-h-[var(--touch-target)] shrink-0 snap-start items-center justify-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    active: 'border-primary font-extrabold text-primary',
    inactive: 'border-transparent text-muted-foreground hover:text-foreground',
  },
  pills: {
    list: 'flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-1',
    item: 'inline-flex min-h-[var(--touch-target)] shrink-0 items-center justify-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    active: 'border-primary/20 bg-primary-soft text-primary',
    inactive: 'border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground',
  },
  segmented: {
    list: 'flex min-w-0 gap-1 overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-muted/60 p-1',
    item: 'inline-flex min-h-[var(--touch-target)] shrink-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    active: 'bg-card text-foreground shadow-sm',
    inactive: 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
  },
};

/**
 * Shared controlled tab strip for content tabs. It owns the visual variants,
 * roving tabIndex, RTL-aware arrow navigation and focus behavior. URL or local
 * state remains owned by the consuming feature.
 */
export function TabsBar<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  variant = 'underline',
  idPrefix,
  className,
  listClassName,
  itemClassName,
  activeItemClassName,
  inactiveItemClassName,
}: TabsBarProps<T>) {
  const generatedId = useId().replace(/:/g, '');
  const prefix = idPrefix ?? `tabs-${generatedId}`;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const styles = VARIANT_CLASSES[variant];

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const direction = event.currentTarget.closest('[dir]')?.getAttribute('dir') ?? 'rtl';
    const available = options
      .map((option, optionIndex) => ({ option, optionIndex }))
      .filter(({ option }) => !option.disabled);
    const position = available.findIndex(({ optionIndex }) => optionIndex === index);
    if (position < 0 || available.length < 2) return;

    let nextPosition = position;
    if (event.key === 'ArrowLeft') nextPosition = position + (direction === 'rtl' ? 1 : -1);
    else if (event.key === 'ArrowRight') nextPosition = position + (direction === 'rtl' ? -1 : 1);
    else if (event.key === 'Home') nextPosition = 0;
    else if (event.key === 'End') nextPosition = available.length - 1;
    else return;

    event.preventDefault();
    const next = available[(nextPosition + available.length) % available.length];
    if (!next) return;
    onChange(next.option.value);
    refs.current[next.optionIndex]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      data-tabs-variant={variant}
      className={cn(styles.list, className, listClassName)}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const id = `${prefix}-tab-${option.value}`;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            id={id}
            aria-selected={selected}
            aria-controls={option.panelId}
            aria-disabled={option.disabled || undefined}
            disabled={option.disabled}
            tabIndex={selected && !option.disabled ? 0 : -1}
            ref={(node) => { refs.current[index] = node; }}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onClick={() => onChange(option.value)}
            className={cn(
              styles.item,
              selected ? styles.active : styles.inactive,
              itemClassName,
              selected ? activeItemClassName : inactiveItemClassName,
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
