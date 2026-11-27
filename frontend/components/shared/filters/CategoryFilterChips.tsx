'use client';

import { cn } from '@/lib/utils';

export interface CategoryChipOption {
  id: string;
  nameAr?: string | null;
  name?: string | null;
}

interface CategoryFilterChipsProps {
  categories: readonly CategoryChipOption[];
  activeId: string;
  onSelect: (categoryId: string) => void;
  ariaLabel: string;
}

/** Shared horizontal category quick-filter UI for ads, services, and products. */
export function CategoryFilterChips({
  categories,
  activeId,
  onSelect,
  ariaLabel,
}: CategoryFilterChipsProps) {
  return (
    <div
      className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="toolbar"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        aria-pressed={!activeId}
        onClick={() => onSelect('')}
        className={cn(
          'inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-bold transition-colors',
          !activeId
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-[var(--color-border)] bg-card text-[var(--color-text-primary)] hover:border-primary/40 dark:border-border dark:bg-card dark:text-foreground',
        )}
      >
        الكل
      </button>
      {categories.map((category) => {
        const selected = activeId === category.id;
        return (
          <button
            key={category.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(category.id)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-bold transition-colors',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-[var(--color-border)] bg-card text-[var(--color-text-primary)] hover:border-primary/40 dark:border-border dark:bg-card dark:text-foreground',
            )}
          >
            {category.nameAr || category.name}
          </button>
        );
      })}
    </div>
  );
}
