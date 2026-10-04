'use client';

import { useId, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import type { SearchType } from '@/types/search.types';

interface Props {
  value: SearchType;
  onChange: (value: SearchType) => void;
  className?: string;
}

const TABS: { value: SearchType; label: string }[] = [
  { value: 'all',      label: 'الكل' },
  { value: 'products', label: 'المنتجات' },
  { value: 'stores',   label: 'المحلات' },
  { value: 'ads',      label: 'الإعلانات' },
  { value: 'services', label: 'الخدمات' },
];

/**
 * Lightweight tab strip — no shadcn Tabs primitive is installed in
 * this project (components/ui/ has no tabs.tsx, and no other page uses
 * one), so this follows the same custom-button-group pattern
 * SearchResults.tsx's own grid/list view toggle already established
 * rather than introducing a new UI primitive for one feature.
 */
export function SearchTabs({ value, onChange, className }: Props) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabListId = useId();

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowLeft') next = index + 1;
    else if (event.key === 'ArrowRight') next = index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    const bounded = (next + TABS.length) % TABS.length;
    const nextTab = TABS[bounded];
    if (!nextTab) return;
    onChange(nextTab.value);
    refs.current[bounded]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="نوع النتائج"
      id={tabListId}
      className={cn('flex gap-1 overflow-x-auto border-b', className)}
    >
      {TABS.map((tab, index) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          id={`${tabListId}-${tab.value}`}
          aria-selected={value === tab.value}
          aria-controls="search-results-panel"
          tabIndex={value === tab.value ? 0 : -1}
          ref={(el) => { refs.current[index] = el; }}
          onKeyDown={(event) => onKeyDown(event, index)}
          onClick={() => onChange(tab.value)}
          className={cn(
            'min-h-11 shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            value === tab.value
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
