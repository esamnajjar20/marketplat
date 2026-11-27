'use client';

/**
 * Shared admin list filter chrome: search + status/segment tabs, always
 * synced to the URL so deep links from the ops queue work and refresh
 * keeps the same view.
 */

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/shared/ui/Input';
import { cn } from '@/lib/utils';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
import type { FilterProfile } from '../../../shared/filters';

export type AdminFilterTab = {
  value: string;
  label: string;
};

type Props = {
  /** Query param for the free-text search (default `q`). */
  searchParam?: string;
  searchPlaceholder?: string;
  /** Query param for the active tab (default `status`). */
  tabParam?: string;
  /** Canonical shared filter contract for this admin list. */
  profile?: FilterProfile;
  tabs: AdminFilterTab[];
  /** When URL has no tab value, use this. */
  defaultTab: string;
  className?: string;
};

export function AdminFilterBar({
  searchParam = 'q',
  searchPlaceholder = 'بحث…',
  tabParam = 'status',
  profile,
  tabs,
  defaultTab,
  className,
}: Props) {
  const filters = useUnifiedFilters({
    mode: 'replace',
    ...(profile
      ? { profile }
      : { count: { keys: [searchParam, tabParam], ignoredValues: { [tabParam]: [defaultTab] } } }),
  });
  const urlSearch = filters.get(searchParam) ?? '';
  const urlTab = filters.get(tabParam) ?? defaultTab;

  const [search, setSearch] = useState(urlSearch);

  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);

  function replaceParams(patch: Record<string, string | null>) {
    filters.updateMany(patch, { mode: 'replace' });
  }

  // Debounce search → URL
  useEffect(() => {
    if (search === urlSearch) return;
    filters.updateDebounced(searchParam, search.trim() || null, 300, { mode: 'replace' });
    return () => filters.cancelPending(searchParam);
  }, [search, urlSearch, filters.updateDebounced, filters.cancelPending, searchParam]);

  const hasFilters = filters.activeCount > 0;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="relative w-full sm:w-auto sm:min-w-[220px] sm:max-w-xs">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 rounded-[10px] border-[var(--color-border-strong)] bg-card ps-8 text-sm-tight"
          aria-label={searchPlaceholder}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tabs.map((tab) => {
          const active = urlTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => replaceParams({
                [tabParam]: tab.value === defaultTab ? null : tab.value,
              })}
              className={cn(
                'inline-flex h-8 items-center rounded-full border px-3 text-xs font-bold transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-[var(--color-border)] bg-card text-[var(--color-text-primary)] hover:bg-muted/50',
              )}
            >
              {tab.label}
            </button>
          );
        })}
        {hasFilters ? (
          <button
            type="button"
            onClick={() => replaceParams({ [searchParam]: null, [tabParam]: null })}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-[var(--color-border)] bg-card px-3 text-xs font-bold text-[var(--color-text-muted)] hover:bg-muted/50"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            مسح الفلتر
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Horizontal scroll wrapper for wide admin tables on small screens. */
export function AdminTableScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('w-full overflow-x-auto overscroll-x-contain rounded-card border border-[var(--color-border)]', className)}>
      <div className="min-w-[640px]">{children}</div>
    </div>
  );
}
