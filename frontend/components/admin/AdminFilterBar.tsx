'use client';

/**
 * Shared admin list filter chrome: search + status/segment tabs, always
 * synced to the URL so deep links from the ops queue work and refresh
 * keeps the same view.
 */

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/shared/ui/Input';
import { cn } from '@/lib/utils';

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
  tabs: AdminFilterTab[];
  /** When URL has no tab value, use this. */
  defaultTab: string;
  className?: string;
};

export function AdminFilterBar({
  searchParam = 'q',
  searchPlaceholder = 'بحث…',
  tabParam = 'status',
  tabs,
  defaultTab,
  className,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const urlSearch = sp.get(searchParam) ?? '';
  const urlTab = sp.get(tabParam) ?? defaultTab;

  const [search, setSearch] = useState(urlSearch);

  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);

  const replaceParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      // Reset page when filters change
      // FIX FILTER-BAR-DEFAULT-TAB-01 (part 2): `'page' in patch === false`
      // worked (relational `in` binds tighter than equality `===`) but
      // read as if it were `'page' in (patch === false)`. Same logic,
      // clearer form.
      if (!('page' in patch)) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, sp],
  );

  // Debounce search → URL
  useEffect(() => {
    const t = setTimeout(() => {
      if (search === urlSearch) return;
      replaceParams({ [searchParam]: search.trim() || null });
    }, 300);
    return () => clearTimeout(t);
  }, [search, urlSearch, replaceParams, searchParam]);

  const hasFilters = Boolean(urlSearch) || urlTab !== defaultTab;

  return (
    <div className={cn('flex flex-col gap-3 rounded-xl border bg-card p-3 sm:p-4', className)}>
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="ps-9"
          aria-label={searchPlaceholder}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
        {tabs.map((tab) => {
          const active = urlTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => replaceParams({
                // FIX FILTER-BAR-DEFAULT-TAB-01: both ternary branches
                // returned tab.value, so clicking the tab that happens
                // to be the default still wrote the param into the URL
                // (e.g. /admin/reports?status=PENDING when PENDING is
                // already the default). Returning null here lets
                // replaceParams delete the key instead, keeping the
                // URL minimal and letting shared deep links reload
                // with the same view.
                [tabParam]: tab.value === defaultTab ? null : tab.value,
              })}
              className={cn(
                'min-h-9 rounded-md px-3 py-2 text-xs font-medium transition-colors sm:text-sm',
                active
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          );
        })}
        </div>
        {hasFilters ? (
          <button
            type="button"
            onClick={() => replaceParams({ [searchParam]: null, [tabParam]: null })}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            مسح الفلاتر
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Horizontal scroll wrapper for wide admin tables on small screens. */
export function AdminTableScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('w-full overflow-x-auto rounded-lg border', className)}>
      <div className="min-w-[640px]">{children}</div>
    </div>
  );
}
