'use client';

import { cn } from '@/lib/utils';
import { useId } from 'react';
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
  const tabListId = useId();
  const activeIndex = TABS.findIndex((tab) => tab.value === value);

  function move(delta: number) {
    const nextIndex = (activeIndex + delta + TABS.length) % TABS.length;
    const next = TABS[nextIndex];
    if (next) onChange(next.value);
  }

  return (
    <div
      role="tablist"
      aria-label="نوع النتائج"
      id={tabListId}
      className={cn('flex gap-1 overflow-x-auto border-b', className)}
    >
      {TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          id={`${tabListId}-${tab.value}`}
          aria-selected={value === tab.value}
          aria-controls="search-results-panel"
          tabIndex={value === tab.value ? 0 : -1}
          onClick={() => onChange(tab.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              event.preventDefault();
              move(1);
            } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              event.preventDefault();
              move(-1);
            } else if (event.key === 'Home') {
              event.preventDefault();
              const first = TABS.at(0);
              if (first) onChange(first.value);
            } else if (event.key === 'End') {
              event.preventDefault();
              const last = TABS.at(-1);
              if (last) onChange(last.value);
            }
          }}
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
