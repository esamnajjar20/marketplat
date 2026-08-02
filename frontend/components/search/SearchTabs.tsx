'use client';

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
  return (
    <div
      role="tablist"
      aria-label="نوع النتائج"
      className={cn('flex gap-1 overflow-x-auto border-b', className)}
    >
      {TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            'shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
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
